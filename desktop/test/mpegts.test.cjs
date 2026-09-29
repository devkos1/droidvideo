const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MpegTsMuxer,crc32 }=require('../lib/mpegts.cjs');
function packets(buffer) { const out=[]; for(let i=0;i<buffer.length;i+=188) out.push(buffer.subarray(i,i+188)); return out; }
function payload(packet) { return packet.subarray((packet[3]&0x20)?5+packet[4]:4); }
function pts(pes) { return (BigInt((pes[9]>>1)&7)<<30n)|(BigInt(pes[10])<<22n)|(BigInt(pes[11]>>1)<<15n)|(BigInt(pes[12])<<7n)|BigInt(pes[13]>>1); }
test('valid PAT/PMT CRC and 60 fps PTS survive MPEG-TS packetization', () => {
  const mux=new MpegTsMuxer(), config=Buffer.from([0,0,0,1,0x67,0x64,0,0x28]);
  const first=packets(mux.frame(Buffer.alloc(777,0x65),10000000n,true,config));
  assert.equal(first[0][0],0x47); assert.equal(first[0][1]&31,0);
  for(const packet of first.slice(0,2)) {
    const section=payload(packet).subarray(1), length=((section[1]&15)<<8)|section[2];
    assert.equal(crc32(section.subarray(0,length+3)),0);
  }
  const pes=Buffer.concat(first.slice(2).map(payload));
  assert.equal(pts(pes),90000n);
  assert.deepEqual(pes.subarray(20,28),config);
  assert.equal(pes.length,14+6+config.length+777);
  const second=packets(mux.frame(Buffer.alloc(333,0x41),10016667n,false,config));
  assert.equal(pts(Buffer.concat(second.map(payload))),91500n);
  assert.equal(second[0][3]&15,first.at(-1)[3]%16+1);
  for(const packet of [...first,...second]) { assert.equal(packet.length,188); assert.equal(packet[0],0x47); }
});
test('PES payload round-trips around adaptation and TS boundaries', () => {
  for(const size of [1,150,156,157,163,164,176,184,350,351,352,360,10000]) {
    const data=Buffer.alloc(size,0x81),mux=new MpegTsMuxer();
    const result=packets(mux.frame(data,0n,true,null)).slice(2);
    const pes=Buffer.concat(result.map(payload));
    assert.deepEqual(pes.subarray(20),data,`payload size ${size}`);
  }
});
