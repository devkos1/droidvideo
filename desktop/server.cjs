'use strict';
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { VirtualCamera } = require('./lib/virtual-camera.cjs');
const { Adb } = require('./lib/adb.cjs');
const { PacketParser } = require('./lib/protocol.cjs');
const { MpegTsMuxer } = require('./lib/mpegts.cjs');
const { parsePairing,pinnedSocket,wifiRequest,measureWifi } = require('./lib/wifi.cjs');

function phoneRequest(port, endpoint, body = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const request = http.request({ host: '127.0.0.1', port, path: endpoint, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 10000 }, response => {
      let content = '';
      response.on('data', chunk => { content += chunk; if (content.length > 1024 * 1024) request.destroy(new Error('Response too large')); });
      response.on('end', () => { try { const value = JSON.parse(content); if (response.statusCode !== 200) reject(new Error(value.error || 'Phone error')); else resolve(value); } catch (e) { reject(e); } });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Phone did not respond. Open the DroidVideo application.')));
    request.on('error', reject); request.end(data);
  });
}

async function startServer(options = {}) {
  const adb = options.adb || new Adb(options.adbPath);
  const usbRpc = options.phoneRequest || phoneRequest;
  let pair = null, transport = 'usb', networkTest = null, cameraCatalog = [];
  const rpc = (port,endpoint,body) => pair ? (options.wifiRequest || wifiRequest)(pair,endpoint,body) : usbRpc(port,endpoint,body);
  const token = crypto.randomBytes(24).toString('hex');
  let controlPort = null, videoPort = null, upstream = null, connected = false, serial = null;
  let codecConfig = null, lastStatus = null, closing = false, connecting = false, commandBusy = false;
  let reconnectTimer = null, streamError = '', monitor = null, missed = 0;
  const tcpClients = new Set();
  const ws = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const keyFrame = () => { if (controlPort) rpc(controlPort, '/keyframe').catch(() => {}); };
  const virtual = new VirtualCamera(options.nativePath || path.resolve(__dirname,'../native/build'),()=>sendState(),keyFrame);
  const frameWs = new WebSocketServer({noServer:true,maxPayload:24*1024*1024,perMessageDeflate:false});
  const state = () => ({components:options.components?.status()||{available:false},virtualCamera:virtual.status(),type:'status',connected,status:lastStatus,error:streamError,transport,networkTest});
  const sendState = () => { for (const client of ws.clients) if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(state())); };

  function packetReceived({ flags, timestamp, data, packet }) {
    virtual.encoded(flags,data,lastStatus);
    if (flags === 2) {
      codecConfig = Buffer.from(packet);
      for (const client of [...ws.clients, ...tcpClients]) client.waitingKey = true;
    }
    for (const client of ws.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (client.bufferedAmount > 2 * 1024 * 1024) { client.terminate(); continue; }
      if (flags === 2) { client.send(packet); continue; }
      if (client.waitingKey && flags !== 1) continue;
      client.waitingKey = false; client.send(packet);
    }
    for (const client of tcpClients) {
      if (client.writableLength > 2 * 1024 * 1024) { client.destroy(); continue; }
      if (flags === 2) continue;
      if (client.waitingKey) {
        if (flags !== 1 || !codecConfig) continue;
        client.waitingKey = false;
      }
      client.write(flags===3?client.muxer.audio(data,timestamp):client.muxer.frame(data,timestamp,flags===1,codecConfig?.subarray(13)));
    }
  }
  function connectVideo() {
    if (!connected || closing || upstream) return;
    const parser = new PacketParser();
    const socket = pair ? pinnedSocket(pair,27189,s=>{s.setTimeout(0);s.write(pair.key+'\n');streamError='';keyFrame();}) : net.connect({ host: '127.0.0.1', port: videoPort });
    upstream = socket; socket.setNoDelay(true);
    parser.on('packet', packetReceived);
    if(!pair) socket.on('connect', () => { streamError = ''; keyFrame(); });
    socket.on('data', chunk => { try { parser.push(chunk); } catch (e) { socket.destroy(e); } });
    socket.on('error', e => { streamError = `Video connection: ${e.message}`; });
    socket.on('close', () => {
      if (upstream !== socket) return;
      upstream = null; codecConfig = null;virtual.reset();
      for (const client of ws.clients) client.waitingKey = true;
      for (const client of tcpClients) client.destroy();
      sendState();
      if (connected && !closing) reconnectTimer = setTimeout(connectVideo, 1500);
    });
  }
  async function disconnect() {
    virtual.stop();virtual.reset();
    connected = false; clearTimeout(reconnectTimer); clearInterval(monitor); monitor = null;
    const port = controlPort; controlPort = null; videoPort = null; serial = null;
    if (upstream) { const old = upstream; upstream = null; old.destroy(); }
    for (const client of tcpClients) client.destroy();
    for (const client of ws.clients) client.waitingKey = true;
    codecConfig = null; lastStatus = null;
    if (port) await rpc(port, '/stop').catch(() => {});
    pair=null;networkTest=null;cameraCatalog=[];
    await adb.disconnect(); sendState();
  }
  async function refreshStatus() {
    if (!connected) return;
    const port = controlPort;
    try {
      const status = await rpc(port, '/status');
      if (port !== controlPort) return;
      lastStatus = status; missed = 0;
      if (status.phase !== 'streaming' && status.phase !== 'starting') {
        if(virtual.status().enabled)virtual.stop();
        codecConfig = null;
        for (const client of tcpClients) client.destroy();
      }
      sendState();
    } catch (e) {
      if (port !== controlPort) return;
      streamError = 'Phone connection lost: ' + e.message;
      if (++missed >= 2) await disconnect();
      else sendState();
    }
  }
  const tcp = net.createServer(client => {
    if(!connected||!['streaming','starting'].includes(lastStatus?.phase)){client.destroy();return;}
    client.setNoDelay(true); client.waitingKey = true; client.muxer = new MpegTsMuxer(); tcpClients.add(client);
    client.on('error', () => {}); client.on('close', () => tcpClients.delete(client)); keyFrame();
  });
  const pipePath=options.pipePath || (process.platform==='win32' ? '\\\\.\\pipe\\DroidVideo.OBS' : '/tmp/droidvideo-obs-'+process.pid+'.sock');
  await new Promise((resolve,reject)=>{tcp.once('error',reject);tcp.listen(pipePath,resolve);});

  const server = http.createServer(async (req, res) => {
    const base = `http://127.0.0.1:${server.address().port}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws://127.0.0.1:*; img-src 'self' data:; frame-ancestors 'none'");
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    if (req.headers.host !== new URL(base).host) return json(403, { error: 'Invalid host' });
    let url;
    try { url = new URL(req.url, base); } catch { return json(400, { error: 'Invalid URL' }); }
    if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
      return json(200, { token, obsSource:'DroidVideo Camera + Audio', version: '0.3.0' });
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'POST' || req.headers['x-droidvideo-token'] !== token || (req.headers.origin && req.headers.origin !== base)) return json(403, { error: 'Invalid session' });
      let body;
      try { body = await readJson(req); } catch (e) { return json(400, { error: e.message }); }
      const route = url.pathname.slice(4);
      const mutation = !['/status','/devices'].includes(route);
      if (mutation && commandBusy) return json(409, { error: 'Another operation is still in progress.' });
      if (mutation) commandBusy = true;
      try {
        let value;
        switch (route) {
          case '/devices': value = { devices: await adb.devices() }; break;
          case '/adb':
            if (connected) throw new Error('Disconnect before changing the ADB path.');
            if (typeof body.path !== 'string' || !path.isAbsolute(body.path) || path.basename(body.path).toLowerCase() !== 'adb.exe' || !fs.existsSync(body.path)) throw new Error('Enter the full path to an existing adb.exe file.');
            adb.customPath = body.path; value = { devices: await adb.devices() }; break;
          case '/install':
            value = { result: await adb.install(body.serial, options.apkPath || path.resolve(__dirname, '../android/app/build/outputs/apk/debug/app-debug.apk')) }; break;
          case '/connect': {
            if (connecting) throw new Error('Connection is already in progress.');
            connecting = true;
            try {
              await disconnect(); streamError = '';
              transport=body.transport==='wifi'?'wifi':'usb';
              if(transport==='wifi') { pair=parsePairing(body.pairingUrl);controlPort=27188;videoPort=27189; }
              else { const ports = await adb.forward(body.serial); controlPort = ports[0]; videoPort = ports[1]; }
              let cameras;
              for (let i = 0; i < 6; i++) {
                try { cameras = await rpc(controlPort, '/cameras'); break; }
                catch (e) { if (i === 5) throw new Error('Open DroidVideo on the phone and allow camera access. ' + e.message); await new Promise(r => setTimeout(r, 500)); }
              }
              serial = pair ? pair.host : body.serial; connected = true; missed = 0;cameraCatalog=cameras.cameras;
              connectVideo(); await refreshStatus();
              // Self-scheduling avoids overlapping requests during cable removal.
              const tick = async () => { await refreshStatus(); if (connected && !closing) monitor = setTimeout(tick, 1000); };
              monitor = setTimeout(tick, 1000);
              value = { ...cameras, connected: true, serial,transport };
            } catch (e) { await disconnect(); throw e; }
            finally { connecting = false; }
            break;
          }
          case '/disconnect': await disconnect(); value = { connected: false }; break;
          case '/status': value = { ...state(),serial }; break;
          case '/virtual-camera':
            if(body.enabled) {
              if(!connected||lastStatus?.phase!=='streaming')throw new Error('Start the video first.');
              if(options.components){await options.components.refresh();if(!options.components.status().cameraInstalled)await options.components.install('Camera');}
              await virtual.start();
            }else virtual.stop();
            value=virtual.status();break;
          case '/setup-obs':
            if(!options.components)throw new Error('Open the DroidVideo Windows app to install the OBS plug-in.');
            value=await options.components.install('OBS');sendState();break;
          case '/licenses':
            if(!options.openLicenses)throw new Error('See the source repository for licenses.');
            {const error=await options.openLicenses();if(error)throw new Error(error);value={opened:true};}break;
          case '/network':
            if(!connected)throw new Error('Connect the phone first.');
            value=await rpc(controlPort,'/network');break;
          case '/measure':
            if(!connected||!pair)throw new Error('Connect over Wi-Fi first.');
            if(['streaming','starting'].includes(lastStatus?.phase))throw new Error('Stop the video before measuring Wi-Fi.');
            networkTest=await measureWifi(pair,cameraCatalog,options.wifiRequest || wifiRequest);
            value=networkTest;sendState();break;
          case '/cameras':
            if (!connected) throw new Error('Connect the phone first.');
            value = await rpc(controlPort, '/cameras'); break;
          case '/audio-inputs':
            if(!connected)throw new Error('Connect the phone first.');
            value=await rpc(controlPort,'/audio-inputs',body);break;
          case '/audio': case '/start': case '/stop': case '/control': case '/keyframe':
            if (!connected) throw new Error('Connect the phone first.');
            if (route === '/start' || route === '/stop') {
              // A new encoder session may restart its clock and SPS. OBS must
              // receive a fresh transport stream, not a discontinuous old PES.
              for (const client of tcpClients) client.destroy();
              codecConfig = null;virtual.reset();
              for (const client of ws.clients) client.waitingKey = true;
            }
            value = await rpc(controlPort, route, body);lastStatus = await rpc(controlPort,'/status');if(route==='/stop')virtual.stop();sendState();break;
          default: return json(404, { error: 'Unknown endpoint' });
        }
        json(200, value);
      } catch (e) { json(400, { error: e.message }); }
      finally { if (mutation) commandBusy = false; }
      return;
    }
    if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });
    const files = { '/': 'index.html', '/style.css': 'style.css', '/app.js': 'app.js', '/player.js': 'player.js', '/icon.svg':'icon.svg', '/icon.ico':'icon.ico', '/i18n.js':'i18n.js', '/virtual-camera.js':'virtual-camera.js' };
    const filename = files[url.pathname];
    if (!filename) return json(404, { error: 'Not found' });
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg':'image/svg+xml', '.ico':'image/x-icon' }[path.extname(filename)];
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    fs.createReadStream(path.join(__dirname, 'public', filename)).pipe(res);
  });
  server.on('upgrade', (req, socket, head) => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const url = new URL(req.url, base);
    if (!['/video','/virtual-frames'].includes(url.pathname) || url.searchParams.get('token') !== token || req.headers.host !== new URL(base).host || (req.headers.origin && req.headers.origin !== base)) return socket.destroy();
    if(url.pathname==='/virtual-frames')return frameWs.handleUpgrade(req,socket,head,client=>{
      if(frameWs.clients.size>1){client.close(1008,'Only one virtual-camera producer is supported');return;}
      client.on('error',()=>{});
      let pending=false;
      client.on('message',async(data,binary)=>{try{
        if(!binary||pending)throw new Error('One binary frame at a time required');
        pending=true;await virtual.frame(data);pending=false;
        if(client.readyState===WebSocket.OPEN)client.send('ack');
      }catch(e){client.close(1008,'Invalid frame');}});
    });
    ws.handleUpgrade(req, socket, head, client => {
      client.waitingKey = true;
      if (codecConfig) client.send(codecConfig);
      client.send(JSON.stringify(state()));
      client.on('error', () => {}); keyFrame();
    });
  });
  try { await listen(server, options.port ?? 27186); }
  catch (e) { tcp.close(); throw e; }
  return {
    url: `http://127.0.0.1:${server.address().port}`, pipePath,
    async close() {
      closing = true; await disconnect();
      for (const client of ws.clients) client.terminate();
      for(const client of frameWs.clients)client.terminate();frameWs.close();
      ws.close(); server.closeAllConnections();
      await Promise.all([new Promise(r => server.close(r)), new Promise(r => tcp.close(r))]);
    }
  };
}
function listen(server, port) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); }); }
async function readJson(req) {
  const parts = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new Error('Request too large'); parts.push(chunk); }
  return JSON.parse(Buffer.concat(parts).toString() || '{}');
}
if (require.main === module) startServer().then(server => {
  console.log(`DroidVideo: ${server.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close().then(() => process.exit()));
}).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { startServer, phoneRequest };
