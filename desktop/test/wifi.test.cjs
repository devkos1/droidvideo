const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {parsePairing,verifyPeer,recommend,measureWifi}=require('../lib/wifi.cjs');
const credentials='?key='+'a'.repeat(32)+'&fp='+'b'.repeat(64);
test('pairing accepts LAN IPv4 only, exact token and certificate pin',()=>{
  assert.equal(parsePairing('droidvideo://192.168.1.5'+credentials).host,'192.168.1.5');
  for(const host of ['example.com','127.0.0.1','8.8.8.8','192.168.1.5:80','user@192.168.1.5','[::1]'])assert.throws(()=>parsePairing('droidvideo://'+host+credentials));
  assert.throws(()=>parsePairing('https://192.168.1.5'+credentials));
  const raw=Buffer.from('certificate'),socket={getPeerCertificate:()=>({raw})};
  verifyPeer(socket,crypto.createHash('sha256').update(raw).digest('hex'));
  assert.throws(()=>verifyPeer(socket,'f'.repeat(64)));
  assert.throws(()=>verifyPeer({getPeerCertificate:()=>({})},'f'.repeat(64)));
});
test('recommendations use slowest sample, headroom, jitter and actual camera modes',()=>{
  const cameras=[{id:'rear',modes:['3840x2160@30','1920x1080@60','1920x1080@30'].map(id=>({id}))},{id:'front',modes:[{id:'1280x720@30'}]}];
  const samples=[{bytes:1e6,ms:100},{bytes:1e6,ms:200},{bytes:1e6,ms:100}];
  assert.equal(recommend(samples,[5,6,7],cameras).recommendedModes.rear,'1920x1080@60');
  assert.equal(recommend(samples,[5,60,7],cameras).recommendedModes.rear,'1920x1080@30');
  assert.equal(recommend(samples.map(s=>({...s,ms:3000})),[5,6,7],cameras).recommendedModes.front,null);
  assert.throws(()=>recommend([],[],cameras));
});
test('measurement warms up and takes three independent throughput samples',async()=>{
  const calls=[];
  const result=await measureWifi({},[],async(pair,endpoint,body,binary)=>{calls.push([endpoint,body?.bytes,binary]);return {bytes:body?.bytes,ms:100};});
  assert.equal(calls.length,7);assert.equal(calls.filter(c=>c[1]===2097152).length,3);assert.equal(result.samples.length,3);
});
