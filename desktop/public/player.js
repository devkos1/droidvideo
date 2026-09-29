import { t } from './i18n.js';
export class CameraPlayer {
  constructor(canvas, { token, onState = () => {}, onFrame = () => {}, onVideoFrame = () => {}, onError = () => {} }) {
    this.canvas = canvas; this.context = canvas.getContext('2d', { alpha: false });
    this.token = token; this.onState = onState; this.onFrame = onFrame; this.onError = onError;
    this.onVideoFrame = onVideoFrame; this.rotation = 0; this.waitingKey = true; this.closed = false; this.config = null;
    if (!('VideoDecoder' in window)) { onError(t("This browser does not support WebCodecs preview. Use the Windows application.","Ez a böngésző nem támogatja a WebCodecs előnézetet. Használd a Windows alkalmazást vagy az OBS Médiaforrást.")); return; }
    this.connect();
  }
  connect() {
    if (this.closed) return;
    const socket = new WebSocket(`ws://${location.host}/video?token=${this.token}`);
    this.socket = socket; socket.binaryType = 'arraybuffer';
    socket.onmessage = event => {
      if (typeof event.data === 'string') {
        const state = JSON.parse(event.data); this.rotation = state.status?.rotation || 0;
        if (!state.connected || !['streaming', 'starting'].includes(state.status?.phase)) {
          this.clear(); this.waitingKey = true;
        }
        this.onState(state); return;
      }
      try { this.packet(new Uint8Array(event.data)); } catch (e) { this.onError(e.message); }
    };
    socket.onclose = () => {
      this.clear(); this.closeDecoder(); this.waitingKey = true;
      this.onState({ connected: false, status: null });
      if (!this.closed) this.retry = setTimeout(() => this.connect(), 1500);
    };
  }
  closeDecoder() { if (this.decoder && this.decoder.state !== 'closed') this.decoder.close(); this.decoder = null; }
  configure(bytes) {
    let codec;
    for (let i = 0; i + 7 < bytes.length; i++) {
      const start = bytes[i] === 0 && bytes[i+1] === 0 && bytes[i+2] === 1 ? i+3
        : bytes[i] === 0 && bytes[i+1] === 0 && bytes[i+2] === 0 && bytes[i+3] === 1 ? i+4 : -1;
      if (start >= 0 && (bytes[start] & 31) === 7) {
        codec = 'avc1.' + Array.from(bytes.subarray(start+1,start+4), n => n.toString(16).padStart(2,'0')).join(''); break;
      }
    }
    if (!codec) throw new Error(t("H.264 encoder did not send a valid SPS header.","A H.264-kódoló nem küldött érvényes SPS-fejlécet."));
    this.closeDecoder(); this.config = bytes.slice(); this.codec = codec; this.waitingKey = true;
    this.makeDecoder();
  }
  makeDecoder() {
    this.closeDecoder();
    this.decoder = new VideoDecoder({ output: frame => {
      try {
        const turn = this.rotation % 180 !== 0;
        const w = turn ? frame.displayHeight : frame.displayWidth, h = turn ? frame.displayWidth : frame.displayHeight;
        if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
        this.context.save(); this.context.translate(w/2,h/2); this.context.rotate(this.rotation*Math.PI/180);
        this.context.drawImage(frame,-frame.displayWidth/2,-frame.displayHeight/2,frame.displayWidth,frame.displayHeight); this.context.restore();
        this.onVideoFrame(frame); this.onFrame();
      } finally { frame.close(); }
    }, error: error => { this.waitingKey = true; this.onError(t("Preview decoding error: ","Előnézeti dekódolási hiba: ")+error.message); } });
    this.decoder.configure({ codec: this.codec, optimizeForLatency: true });
  }
  packet(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 13 || bytes.length !== view.getUint32(9)+13) throw new Error(t("Invalid video packet","Hibás videócsomag"));
    const flags = bytes[0], payload = bytes.subarray(13);
    if(flags === 3) return; // AAC is delivered to the OBS plug-in; preview is muted.
    if (flags === 2) { this.configure(payload); return; }
    if (!this.config) return;
    const key = flags === 1;
    if (this.decoder?.state !== 'configured' || this.decoder.decodeQueueSize > 4) { this.waitingKey = true; this.makeDecoder(); }
    if (this.waitingKey && !key) return;
    this.waitingKey = false;
    let data = payload;
    if (key) { data = new Uint8Array(this.config.length+payload.length); data.set(this.config); data.set(payload,this.config.length); }
    this.decoder.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: Number(view.getBigUint64(1)), data }));
  }
  clear() { this.context.fillStyle = '#0b0f12'; this.context.fillRect(0,0,this.canvas.width,this.canvas.height); }
  close() { this.closed = true; clearTimeout(this.retry); this.socket?.close(); this.closeDecoder(); }
}
