'use strict';
// Minimal H.264 + AAC MPEG-TS muxer. Preserve MediaCodec PTS so OBS receives
// real 30/60-fps timing instead of the raw H.264 demuxer's default frame rate.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 0x80000000) ? (crc << 1) ^ 0x04c11db7 : crc << 1;
  }
  return crc >>> 0;
}
function section(bytes) {
  const body = Buffer.from(bytes), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([Buffer.from([0]),body,crc]);
}
class MpegTsMuxer {
  constructor() { this.counters = new Map(); this.origin = null; }
  header(pid, start, adaptation) {
    const counter = this.counters.get(pid) || 0; this.counters.set(pid,(counter+1)&15);
    return Buffer.from([0x47,(start?0x40:0)|((pid>>8)&31),pid&255,(adaptation?0x30:0x10)|counter]);
  }
  tables() {
    const pat = section([0x00,0xb0,0x0d,0x00,0x01,0xc1,0,0,0,1,0xf0,0]);
    const pmt = section([0x02,0xb0,0x17,0,1,0xc1,0,0,0xe1,0,0xf0,0,0x1b,0xe1,0,0xf0,0,0x0f,0xe1,1,0xf0,0]);
    return [ [0,pat], [0x1000,pmt] ].map(([pid,payload]) => {
      const packet=Buffer.alloc(188,0xff); this.header(pid,true,false).copy(packet); payload.copy(packet,4); return packet;
    });
  }
  frame(data, timestampUs, key, config) {
    const timestamp = BigInt(timestampUs);
    if (this.origin === null) this.origin = timestamp;
    const pts = ((timestamp-this.origin)*9n/100n+90000n) & ((1n<<33n)-1n);
    const pcr = (pts-9000n) & ((1n<<33n)-1n);
    const timing=Buffer.from([
      0x21 | Number((pts>>29n)&14n), Number((pts>>22n)&255n), Number((pts>>14n)&254n)|1,
      Number((pts>>7n)&255n), Number((pts<<1n)&254n)|1
    ]);
    const pes = Buffer.concat([Buffer.from([0,0,1,0xe0,0,0,0x80,0x80,5]),timing,
      Buffer.from([0,0,0,1,9,0xf0]),...(key && config ? [config] : []),data]);
    const packets = key ? this.tables() : [];
    for(let offset=0;offset<pes.length;) {
      const first=offset===0, capacity=first?176:184, take=Math.min(capacity,pes.length-offset);
      const adapt=first || take<184;
      const packet=Buffer.alloc(188,0xff); this.header(0x100,first,adapt).copy(packet);
      let payloadAt=4;
      if(adapt) {
        const length=183-take; packet[4]=length; payloadAt=5+length;
        if(length>0) packet[5]=first?(0x10|(key?0x40:0)):0;
        if(first) {
          packet[6]=Number((pcr>>25n)&255n); packet[7]=Number((pcr>>17n)&255n);
          packet[8]=Number((pcr>>9n)&255n); packet[9]=Number((pcr>>1n)&255n);
          packet[10]=Number((pcr&1n)<<7n)|0x7e; packet[11]=0;
        }
      }
      pes.copy(packet,payloadAt,offset,offset+take); offset+=take; packets.push(packet);
    }
    return Buffer.concat(packets);
  }
  audio(data,timestampUs) {
    if(this.origin===null)return Buffer.alloc(0);
    const pts=((BigInt(timestampUs)-this.origin)*9n/100n+90000n)&((1n<<33n)-1n);
    const length=data.length+8;
    if(length>65535)throw new Error('AAC packet too large');
    const pes=Buffer.concat([Buffer.from([0,0,1,0xc0,length>>8,length&255,0x80,0x80,5,
      0x21|Number((pts>>29n)&14n),Number((pts>>22n)&255n),Number((pts>>14n)&254n)|1,Number((pts>>7n)&255n),Number((pts<<1n)&254n)|1]),data]);
    const packets=[];
    for(let at=0;at<pes.length;){const n=Math.min(184,pes.length-at),adapt=n<184,p=Buffer.alloc(188,255);this.header(0x101,at===0,adapt).copy(p);let start=4;if(adapt){p[4]=183-n;if(p[4])p[5]=0;start=5+p[4];}pes.copy(p,start,at,at+n);at+=n;packets.push(p);}
    return Buffer.concat(packets);
  }
}
module.exports={MpegTsMuxer,crc32};
