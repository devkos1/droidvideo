const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PacketParser, parseDevices, MAX_PACKET } = require('../lib/protocol.cjs');
function packet(flags, timestamp, payload) { const out=Buffer.alloc(13+payload.length); out[0]=flags; out.writeBigUInt64BE(BigInt(timestamp),1); out.writeUInt32BE(payload.length,9); payload.copy(out,13); return out; }
test('framing survives fragmented headers, coalesced frames, and large timestamps', () => {
  const source = [packet(2,0,Buffer.from([0,0,0,1,0x67])),packet(1,9876543210123n,Buffer.alloc(1200,0x65)),packet(0,9876543243456n,Buffer.alloc(301,0x41))];
  const all=Buffer.concat(source), parser=new PacketParser(), actual=[];
  parser.on('packet',p=>actual.push(Buffer.from(p.packet)));
  for(let i=0;i<all.length;i+=7) parser.push(all.subarray(i,i+7));
  assert.deepEqual(actual,source); assert.equal(parser.buffer.length,0);
});
test('rejects corrupt lengths and flags before allocating advertised payloads', () => {
  for(const [flag,length] of [[0,MAX_PACKET+1],[0,0],[9,1]]) {
    const header=Buffer.alloc(13); header[0]=flag; header.writeUInt32BE(length,9);
    assert.throws(()=>new PacketParser().push(header),/Invalid/);
  }
});
test('USB enumeration excludes emulator and network transports but reports unauthorized phones', () => {
  assert.deepEqual(parseDevices('List of devices attached\nABC device product:p model:Pixel_9 device:p transport_id:1\nDEF unauthorized usb:1-1\n192.168.1.1:5555 device\nemulator-5554 device\nadb-foo._adb-tls-connect._tcp device\n'),[
    {serial:'ABC',state:'device',model:'Pixel 9'},{serial:'DEF',state:'unauthorized',model:'DEF'}
  ]);
});
module.exports={packet};
