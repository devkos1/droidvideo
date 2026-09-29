'use strict';
const https = require('node:https');
const tls = require('node:tls');
const crypto = require('node:crypto');
const net = require('node:net');
const { performance } = require('node:perf_hooks');

function parsePairing(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid pairing link. Copy it from the phone.'); }
  const host = url.hostname, key = url.searchParams.get('key'), fingerprint = url.searchParams.get('fp');
  if (url.protocol !== 'droidvideo:' || net.isIP(host) !== 4 || url.port || url.username || url.password || !/^[a-f0-9]{32}$/.test(key || '') || !/^[a-f0-9]{64}$/.test(fingerprint || '')) throw new Error('Invalid DroidVideo pairing link.');
  // LAN connections only; no hostnames, redirects, or cloud endpoints.
  const octets=host.split('.').map(Number);
  if (!(octets[0]===10 || (octets[0]===192&&octets[1]===168) || (octets[0]===172&&octets[1]>=16&&octets[1]<=31))) throw new Error('Use a private IPv4 Wi-Fi address.');
  return { host, key, fingerprint };
}
function verifyPeer(socket, fingerprint) {
  const raw=socket.getPeerCertificate().raw;
  const actual=raw&&crypto.createHash('sha256').update(raw).digest('hex');
  if (!actual || actual.length!==fingerprint.length || !crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(fingerprint))) throw new Error('Phone certificate mismatch. Pair again using the link shown on the phone.');
}
function pinnedSocket(pair, port, ready) {
  const socket=tls.connect({host:pair.host,port,rejectUnauthorized:false,minVersion:'TLSv1.2',maxVersion:'TLSv1.2'});
  // CA verification is replaced by an exact out-of-band certificate pin.
  // No credential or request bytes are sent until the pin has been verified.
  socket.setTimeout(10000,()=>socket.destroy(new Error('Wi-Fi connection timed out.')));
  socket.once('secureConnect',()=>{try {verifyPeer(socket,pair.fingerprint);ready(socket);}catch(e){socket.destroy(e);}});
  return socket;
}
class PinnedAgent extends https.Agent {
  constructor(pair) { super({keepAlive:false}); this.pair=pair; }
  createConnection(options,callback) {
    let finished=false;
    const done=(e,s)=>{if(!finished){finished=true;callback(e,s);}};
    const socket=pinnedSocket(this.pair,27188,s=>done(null,s));
    socket.once('error',e=>done(e));
  }
}
function wifiRequest(pair, endpoint, body={}, binary=false) {
  return new Promise((resolve,reject)=>{
    const agent=new PinnedAgent(pair), payload=JSON.stringify(body), started=performance.now();
    const request=https.request({host:pair.host,port:27188,path:endpoint,method:'POST',agent,
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),Authorization:'Bearer '+pair.key}},response=>{
      let count=0;const parts=[];
      response.on('data',chunk=>{count+=chunk.length;if(count>3*1024*1024)request.destroy(new Error('Response too large'));if(!binary)parts.push(chunk);});
      response.on('error',reject);
      response.on('end',()=>{
        agent.destroy();
        if(response.statusCode===401)return reject(new Error('Pairing expired. Copy a new link from the phone.'));
        if(binary) {
          if(response.statusCode!==200||count!==body.bytes)return reject(new Error('Incomplete network measurement.'));
          return resolve({bytes:count,ms:performance.now()-started});
        }
        try {const value=JSON.parse(Buffer.concat(parts));if(response.statusCode!==200)throw new Error(value.error||'Phone error');resolve(value);}catch(e){reject(e);}
      });
    });
    request.setTimeout(12000,()=>request.destroy(new Error('Wi-Fi request timed out.')));
    request.on('error',e=>{agent.destroy();reject(e);});request.end(payload);
  });
}
function modeBitrate(id) {
  const match=/^(\d+)x(\d+)@(\d+)$/.exec(id);if(!match)return Infinity;
  const width=Number(match[1]),fps=Number(match[3]);
  return width>=3840?32:width>=1920?(fps>=60?20:12):(fps>=60?8:6);
}
function recommend(samples,rtts,cameras) {
  if(samples.length<3||samples.some(s=>!(s.bytes>0&&s.ms>0))||rtts.length<3||rtts.some(n=>!Number.isFinite(n)||n<0))throw new Error('Insufficient network samples.');
  const speeds=samples.map(s=>s.bytes*8/s.ms/1000), minimumMbps=Math.min(...speeds), jitterMs=Math.max(...rtts)-Math.min(...rtts);
  const usableMbps=minimumMbps*0.6*(jitterMs>30?0.75:1);
  const preference=['3840x2160@30','1920x1080@60','1920x1080@30','1280x720@60','1280x720@30'];
  const recommendedModes=Object.fromEntries(cameras.map(c=>[c.id,preference.find(id=>c.modes.some(m=>m.id===id)&&modeBitrate(id)<=usableMbps)||null]));
  return {minimumMbps,averageMbps:speeds.reduce((a,b)=>a+b,0)/speeds.length,usableMbps,latencyMs:rtts.reduce((a,b)=>a+b,0)/rtts.length,jitterMs,recommendedModes,measuredAt:new Date().toISOString(),samples:speeds};
}
async function measureWifi(pair,cameras,request=wifiRequest) {
  const rtts=[];
  for(let i=0;i<3;i++){const start=performance.now();await request(pair,'/status');rtts.push(performance.now()-start);}
  await request(pair,'/probe',{bytes:262144},true);
  const samples=[];
  for(let i=0;i<3;i++)samples.push(await request(pair,'/probe',{bytes:2097152},true));
  return recommend(samples,rtts,cameras);
}
module.exports={parsePairing,verifyPeer,pinnedSocket,wifiRequest,modeBitrate,recommend,measureWifi};
