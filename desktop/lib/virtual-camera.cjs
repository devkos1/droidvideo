'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
function validateFrame(data) {
  if(data.length<32)throw new Error('Incomplete camera frame');
  const h=Array.from({length:8},(_,i)=>data.readUInt32LE(i*4));
  const [magic,w,height,fps,format,sy,suv,rotation]=h;
  if(magic!==0x43565644||w<2||height<2||w>3840||height>3840||(w&1)||(height&1)||fps<1||fps>60||![1,2].includes(format)||sy!==w||suv!==(format===1?w:w/2)||![0,90,180,270].includes(rotation)||data.length!==32+w*height*3/2)throw new Error('Invalid camera frame');
  return h;
}
class VirtualCamera {
  constructor(directory,onChange=()=>{},requestKey=()=>{}) {this.directory=directory;this.onChange=onChange;this.requestKey=requestKey;this.process=null;this.error='';this.pending=null;this.frames=0;this.config=null;this.mode='native-h264';this.waitingKey=true;this.inFlight=0;}
  status(){return {enabled:!!this.process,available:fs.existsSync(path.join(this.directory,'droidvideo-vcam-writer.exe')),mode:this.mode,decoder:this.decoder||'starting',error:this.error,frames:this.frames};}
  async start({raw=false}={}){
    if(this.process)return;
    const executable=path.join(this.directory,'droidvideo-vcam-writer.exe');
    if(!fs.existsSync(executable))throw new Error('Build or install the Windows native components first.');
    this.error='';this.frames=0;this.inFlight=0;this.waitingKey=true;this.mode=raw?'raw':'native-h264';this.signature='';
    const child=spawn(executable,[raw?'--ack':'--h264'],{stdio:['pipe','pipe','pipe'],windowsHide:true});this.process=child;
    child.stdin.on('error',e=>{if(this.process===child){this.error=e.message;this.onChange();}});
    child.stdout.on('data',data=>{if(this.process!==child)return;
      if(raw&&this.pending){if(data[0])this.frames++;this.finish(!!data[0]);}
      else if(!raw){for(const byte of data){if(byte===1){this.frames++;this.inFlight=Math.max(0,this.inFlight-1);}else if(byte===72||byte===83){this.decoder=byte===72?'D3D11':'software';this.onChange();}}}
    });
    child.stderr.on('data',data=>{if(this.process===child){this.error=data.toString().slice(0,500);this.onChange();}});
    child.on('close',code=>{if(this.process===child){this.process=null;this.finish(false);if(code)this.error||=`Virtual camera exited (${code})`;this.onChange();}});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',e=>{this.process=null;this.error=e.message;reject(e);this.onChange();});});
    this.onChange();
    if(!raw)this.requestKey();
  }
  reset(){this.waitingKey=true;this.signature='';this.config=null;this.inFlight=0;}
  encoded(flags,data,status){
    if(flags===2){if(!this.config?.equals(data)){this.config=Buffer.from(data);this.waitingKey=true;}return;}
    const child=this.process;
    if(!child||this.mode!=='native-h264'||flags===3||!this.config)return;
    const {width:w,height:h,targetFps:fps,rotation=0}=status||{};
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<48||h<48||w>3840||h>3840||(w&1)||(h&1)||!Number.isInteger(fps)||fps<1||fps>60||![0,90,180,270].includes(rotation))return;
    const signature=`${w}/${h}/${fps}`;
    if(signature!==this.signature)this.waitingKey=true;
    if(child.stdin.writableLength>512*1024||(!this.waitingKey&&this.inFlight>=4)){
      if(!this.waitingKey){this.waitingKey=true;this.requestKey();}return;
    }
    if(this.waitingKey&&(flags!==1||child.stdin.writableLength))return;
    const reset=this.waitingKey;this.waitingKey=false;this.signature=signature;
    if(reset)this.inFlight=0;
    const payload=flags===1?Buffer.concat([this.config,data]):data;
    const header=Buffer.allocUnsafe(32);
    [0x43485644,w,h,fps,rotation,(flags===1?1:0)|(reset?256:0),payload.length,0].forEach((n,i)=>header.writeUInt32LE(n,i*4));
    this.inFlight++;
    child.stdin.write(Buffer.concat([header,payload]),error=>{if(error&&this.process===child){this.error=error.message;this.stop();}});
  }
  finish(value){const pending=this.pending;this.pending=null;if(pending){clearTimeout(pending.timer);pending.resolve(value);}}
  frame(data){
    validateFrame(data);if(!this.process||this.mode!=='raw'||this.pending)return Promise.resolve(false);
    return new Promise(resolve=>{
      const child=this.process;
      this.pending={resolve,timer:setTimeout(()=>{this.error='Camera output timed out. Enable it again.';this.stop();},3000)};
      child.stdin.write(data,error=>{if(error&&this.process===child){this.error=error.message;this.stop();}});
    });
  }
  stop(){const child=this.process;this.process=null;this.finish(false);if(child){child.stdin.end();const timeout=setTimeout(()=>child.kill(),2000);timeout.unref();child.once('close',()=>clearTimeout(timeout));}this.onChange();}
}
module.exports={VirtualCamera,validateFrame};
