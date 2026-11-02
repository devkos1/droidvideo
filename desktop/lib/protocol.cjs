'use strict';
const { EventEmitter } = require('node:events');
const MAX_PACKET = 8 * 1024 * 1024;

class PacketParser extends EventEmitter {
  constructor() { super(); this.buffer = Buffer.alloc(0); this.chunks = []; this.total = 0; }
  push(chunk) {
    if (!chunk?.length) return;
    this.chunks.push(chunk);
    this.total += chunk.length;
    while (this.total >= 13) {
      while (this.chunks[0].length < 13) {
        const first = this.chunks.shift();
        this.chunks[0] = Buffer.concat([first, this.chunks[0]]);
      }
      const length = this.chunks[0].readUInt32BE(9);
      const flags = this.chunks[0][0];
      if (!length || length > MAX_PACKET || flags > 3) throw new Error('Invalid video packet');
      if (this.total < length + 13) break;
      const merged = this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks, this.total);
      const packet = merged.subarray(0, length + 13);
      const rest = merged.subarray(length + 13);
      this.chunks = rest.length ? [rest] : [];
      this.total = rest.length;
      this.buffer = rest;
      this.emit('packet', { flags, timestamp: packet.readBigUInt64BE(1), data: packet.subarray(13), packet });
    }
    if (this.chunks.length) this.buffer = this.chunks[0];
  }
}

function parseDevices(output) {
  return output.split(/\r?\n/).slice(1).flatMap(line => {
    const [serial, state, ...fields] = line.trim().split(/\s+/);
    if (!serial || !state || serial.startsWith('emulator-') || serial.includes(':') || serial.includes('._adb')) return [];
    const model = fields.find(f => f.startsWith('model:'))?.slice(6).replaceAll('_', ' ') || serial;
    return [{ serial, state, model }];
  });
}
module.exports = { PacketParser, parseDevices, MAX_PACKET };
