'use strict';
const { EventEmitter } = require('node:events');
const MAX_PACKET = 8 * 1024 * 1024;

class PacketParser extends EventEmitter {
  constructor() { super(); this.buffer = Buffer.alloc(0); }
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 13) {
      const length = this.buffer.readUInt32BE(9);
      const flags = this.buffer[0];
      if (!length || length > MAX_PACKET || flags > 3) throw new Error('Invalid video packet');
      if (this.buffer.length < length + 13) break;
      const packet = this.buffer.subarray(0, length + 13);
      this.buffer = this.buffer.subarray(length + 13);
      this.emit('packet', { flags, timestamp: packet.readBigUInt64BE(1), data: packet.subarray(13), packet });
    }
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
