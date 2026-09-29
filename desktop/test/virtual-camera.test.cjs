const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateFrame,VirtualCamera}=require('../lib/virtual-camera.cjs');
test('native frame boundary validates pixel layout and allocation before forwarding',()=>{
  const packet=Buffer.alloc(32+1920*1080*3/2);
  [0x43565644,1920,1080,60,1,1920,1920,90].forEach((v,i)=>packet.writeUInt32LE(v,i*4));
  assert.equal(validateFrame(packet)[3],60);
  assert.throws(()=>validateFrame(packet.subarray(0,100)));
  for(const [index,value]of [[0,1],[1,99999],[2,1081],[3,120],[4,4],[6,960],[7,45]]){const copy=Buffer.from(packet);copy.writeUInt32LE(value,index*4);assert.throws(()=>validateFrame(copy));}
});
test('missing virtual camera helper reports an actionable error',async()=>{
  const camera=new VirtualCamera('nonexistent-native-folder');assert.equal(camera.status().available,false);await assert.rejects(camera.start(),/native components/);camera.stop();
});
