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
test('compressed path bounds outstanding frames and resynchronizes at a keyframe',()=>{
  let requests=0;const writes=[];const camera=new VirtualCamera('unused',()=>{},()=>requests++);
  camera.process={stdin:{writableLength:0,write:packet=>{writes.push(packet);}}};
  const status={width:3840,height:2160,targetFps:30,rotation:90},config=Buffer.from([0,0,0,1,0x67]);
  camera.encoded(2,config,status);camera.encoded(0,Buffer.from([1]),status);assert.equal(writes.length,0);
  camera.encoded(1,Buffer.from([2]),status);assert.equal(writes[0].readUInt32LE(20),257);assert.ok(writes[0].subarray(32).subarray(0,5).equals(config));
  for(let i=0;i<8;i++)camera.encoded(0,Buffer.from([3]),status);
  assert.equal(writes.length,4);assert.equal(requests,1);
  camera.encoded(1,Buffer.from([4]),status);assert.equal(writes.length,5);assert.equal(writes[4].readUInt32LE(20),257);
  camera.reset();camera.encoded(1,Buffer.from([5]),status);assert.equal(writes.length,5);
});
