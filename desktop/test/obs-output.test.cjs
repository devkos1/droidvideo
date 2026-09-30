const {test}=require('node:test');const assert=require('node:assert/strict');
const dgram=require('node:dgram');const {once}=require('node:events');
const {ObsOutput}=require('../lib/obs-output.cjs');
test('OBS loopback transport starts on a keyframe and emits bounded TS datagrams',async t=>{
 const receiver=dgram.createSocket('udp4');receiver.bind(0,'127.0.0.1');await once(receiver,'listening');
 const output=new ObsOutput(receiver.address().port);t.after(()=>{output.close();receiver.close();});
 const received=[];receiver.on('message',(bytes,peer)=>{assert.equal(peer.address,'127.0.0.1');received.push(bytes);});
 const sps=Buffer.from([0,0,0,1,0x67,0x64,0,0x28]);
 output.packet(2,sps,0n);output.packet(0,Buffer.alloc(100),0n);assert.equal(output.waitingKey,true);
 output.packet(1,Buffer.alloc(4096),1000000n);
 await new Promise((resolve,reject)=>{const limit=setTimeout(()=>reject(new Error('UDP output timed out')),2000);const check=()=>{if(received.reduce((n,b)=>n+b.length,0)>=4096){clearTimeout(limit);resolve();}else setTimeout(check,10);};check();});
 for(const bytes of received){assert.ok(bytes.length<=1316);assert.equal(bytes.length%188,0);for(let i=0;i<bytes.length;i+=188)assert.equal(bytes[i],0x47);}
 output.reset();assert.equal(output.waitingKey,true);assert.equal(output.config,null);
});
