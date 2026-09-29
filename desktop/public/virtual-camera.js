export class VirtualCameraSender {
  constructor(token,onError){this.token=token;this.onError=onError;this.enabled=false;this.busy=false;this.socket=null;this.fps=30;this.rotation=0;this.generation=0;}
  update(state){
    this.fps=state.status?.targetFps||30;this.rotation=state.status?.rotation||0;
    const enabled=!!state.virtualCamera?.enabled&&state.virtualCamera?.mode!=='native-h264';
    if(enabled===this.enabled&&(!enabled||this.socket))return;
    this.generation++;this.socket?.close();this.socket=null;this.buffer=null;this.busy=false;this.enabled=enabled;
    if(!enabled)return;
    const socket=new WebSocket(`ws://${location.host}/virtual-frames?token=${this.token}`);this.socket=socket;
    socket.onmessage=()=>{if(this.socket===socket)this.busy=false;};
    socket.onclose=()=>{if(this.socket===socket){this.busy=false;this.socket=null;}};
  }
  async send(source){
    const socket=this.socket,generation=this.generation;
    if(!this.enabled||this.busy||socket?.readyState!==WebSocket.OPEN||socket.bufferedAmount)return;
    const format=source.format;
    if(!['NV12','I420'].includes(format)){if(!this.warned){this.warned=true;this.onError('Virtual camera needs NV12/I420 decoding. This decoder returned '+format);}return;}
    const frame=source.clone();this.busy=true;let sent=false;
    try{
      const w=frame.visibleRect.width,h=frame.visibleRect.height;
      if((w&1)||(h&1))throw new Error('Virtual camera requires even frame dimensions');
      const size=32+w*h*3/2;
      if(this.buffer?.byteLength!==size)this.buffer=new ArrayBuffer(size);
      const buffer=this.buffer,view=new DataView(buffer);
      [0x43565644,w,h,this.fps,format==='NV12'?1:2,w,format==='NV12'?w:w/2,this.rotation].forEach((n,i)=>view.setUint32(i*4,n,true));
      const layout=format==='NV12'?[{offset:0,stride:w},{offset:w*h,stride:w}]:[{offset:0,stride:w},{offset:w*h,stride:w/2},{offset:w*h*5/4,stride:w/2}];
      await frame.copyTo(new Uint8Array(buffer,32),{rect:frame.visibleRect,layout});
      if(this.enabled&&this.socket===socket&&generation===this.generation&&socket.readyState===WebSocket.OPEN){socket.send(buffer);sent=true;}
    }catch(e){this.onError(e.message);}finally{frame.close();if(!sent&&generation===this.generation)this.busy=false;}
  }
  close(){this.update({virtualCamera:{enabled:false}});}
}
