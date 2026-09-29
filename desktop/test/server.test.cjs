const {test}=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
const {once}=require('node:events');
const {WebSocket}=require('ws');
const {startServer}=require('../server.cjs');
function packet(flags, timestamp, payload) { const out=Buffer.alloc(13+payload.length); out[0]=flags; out.writeBigUInt64BE(BigInt(timestamp),1); out.writeUInt32BE(payload.length,9); payload.copy(out,13); return out; }
test('authenticated USB lifecycle, WebSocket framing, OBS TS, and cleanup',async t=>{
  let phoneSocket,disconnected=0,phase='idle';
  const source=net.createServer(socket=>{phoneSocket=socket;});
  source.listen(0,'127.0.0.1'); await once(source,'listening');
  const camera={id:'0',label:'Rear',modes:[{id:'1920x1080@60'}]};
  const adb={devices:async()=>[{serial:'USB123',state:'device',model:'Test phone'}],
    forward:async serial=>{assert.equal(serial,'USB123');return [42,source.address().port];},disconnect:async()=>{disconnected++;}};
  const rpc=async(port,endpoint)=>{ assert.equal(port,42); if(endpoint==='/cameras') return {cameras:[camera]}; if(endpoint==='/start') phase='streaming'; if(endpoint==='/stop') phase='idle'; return {phase}; };
  const server=await startServer({port:0,pipePath:process.platform==='win32'?'\\\\.\\pipe\\DroidVideo.Test-'+process.pid:'/tmp/dv-test-'+process.pid,adb,phoneRequest:rpc});
  t.after(async()=>{await server.close(); if(phoneSocket)phoneSocket.destroy(); await new Promise(r=>source.close(r));});
  const boot=await fetch(server.url+'/api/bootstrap').then(r=>r.json());
  const post=(route,body={},extra={})=>fetch(server.url+'/api/'+route,{method:'POST',headers:{'X-DroidVideo-Token':boot.token,...extra},body:JSON.stringify(body)});
  assert.equal((await fetch(server.url+'/api/connect',{method:'POST',body:'{}'})).status,403);
  assert.equal((await post('connect',{}, {Origin:'https://attacker.invalid'})).status,403);
  assert.equal((await post('devices')).status,200);
  assert.equal((await post('connect',{serial:'USB123'})).status,200);
  assert.equal((await post('start',{cameraId:'0',mode:'1920x1080@60'})).status,200);
  const ws=new WebSocket(server.url.replace('http:','ws:')+'/video?token='+boot.token); t.after(()=>ws.terminate()); await once(ws,'open');
  const raw=net.connect(server.pipePath); t.after(()=>raw.destroy()); await once(raw,'connect');
  const wsData=[],rawData=[]; ws.on('message',(data,binary)=>{if(binary)wsData.push(Buffer.from(data));}); raw.on('data',data=>rawData.push(data));
  const config=packet(2,0,Buffer.from([0,0,0,1,0x67,0x64,0,0x28,0,0,0,1,0x68,0x12]));
  const delta=packet(0,1000,Buffer.from([0,0,0,1,0x41,1]));
  const key=packet(1,2000,Buffer.from([0,0,0,1,0x65,2]));
  phoneSocket.write(Buffer.concat([config,delta,key]));
  await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(new Error('Video output timed out')),2000); const check=()=>{if(wsData.length>=2 && rawData.length){clearTimeout(deadline);resolve();}else setTimeout(check,10);};check();});
  assert.deepEqual(wsData,[config,key]);
  const ts=Buffer.concat(rawData);assert.equal(ts.length%188,0);assert.equal(ts[0],0x47);assert.equal(ts[188],0x47);assert.ok(ts.includes(Buffer.from([0,0,1,0xe0])));
  await post('disconnect'); assert.equal((await post('status').then(r=>r.json())).connected,false); assert.ok(disconnected>=2);
});
