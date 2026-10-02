'use strict';
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
class AudioOutput {
  constructor(directory,onChange=()=>{}){this.executable=path.join(directory,'droidvideo-audio-bridge.exe');this.onChange=onChange;this.child=null;this.enabled=false;this.error='';this.retryAt=0;this.pending=0;this.ready=false;}
  status(){return {enabled:this.enabled,error:this.error};}
  setEnabled(enabled){this.enabled=!!enabled;this.error='';this.retryAt=0;this.stop();this.onChange();}
  start(){
    if(this.child||Date.now()<this.retryAt||!fs.existsSync(this.executable))return;
    this.stopping=false;this.retryAt=Date.now()+5000;this.ready=false;this.pending=0;
    const child=spawn(this.executable,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;
    child.stdout.on('data',data=>{if(this.child!==child||this.stopping)return;for(const b of data){if(b===82)this.ready=true;if(b===65)this.pending=Math.max(0,this.pending-1);}});
    child.stderr.on('data',data=>{this.error=data.toString().trim().slice(0,500);this.onChange();});
    child.on('error',e=>{this.error=e.message;this.onChange();});child.stdin.on('error',()=>{});
    child.on('close',code=>{if(this.child===child){this.child=null;this.ready=false;if(code){this.error||='Phone audio stopped. Try enabling it again.';if(this.enabled){this.enabled=false;this.retryAt=0;}}this.onChange();}});
  }
  packet(data,timestamp){
    if(!this.child)this.start();
    if(this.stopping||!this.child||!this.ready||this.pending>=8||this.child.stdin.writableLength>65536)return;
    const header=Buffer.alloc(16);header.writeUInt32LE(0x41415644);header.writeUInt32LE(data.length,4);header.writeBigUInt64LE(BigInt(timestamp),8);this.pending++;
    this.child.stdin.write(Buffer.concat([header,data]));
  }
  stop(){if(this.stopping)return;this.stopping=true;const child=this.child;this.ready=false;if(!child)return;child.stdin.end();const timer=setTimeout(()=>child.kill(),1500);timer.unref();child.once('close',()=>clearTimeout(timer));}
}
module.exports={AudioOutput};
