'use strict';
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
class AudioOutput {
  constructor(directory,onChange=()=>{},{launch=spawn,exists=fs.existsSync}={}){this.executable=path.join(directory,'droidvideo-audio-bridge.exe');this.onChange=onChange;this.launch=launch;this.exists=exists;this.child=null;this.enabled=false;this.error='';this.failed=false;this.pending=0;this.ready=false;}
  status(){return {enabled:this.enabled,error:this.error};}
  reset(){this.stop();this.failed=false;this.error='';this.onChange();}
  setEnabled(enabled){this.enabled=!!enabled;this.reset();}
  fail(message){this.failed=true;this.ready=false;this.enabled=false;this.error=message;this.onChange();}
  start(){
    if(this.child||this.failed)return;
    if(!this.exists(this.executable)){this.fail('Phone audio helper is missing. Audio has stopped.');return;}
    this.stopping=false;this.ready=false;this.pending=0;
    let child;try{child=this.launch(this.executable,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});}catch(e){this.fail(e.message);return;}this.child=child;
    const startup=setTimeout(()=>{if(this.child===child&&!this.stopping&&!this.ready){this.fail('Phone audio helper did not start. Audio has stopped.');child.kill();}},10000);startup.unref();
    child.stdout.on('data',data=>{if(this.child!==child||this.stopping||this.failed)return;for(const b of data){if(b===82){this.ready=true;clearTimeout(startup);}if(b===65)this.pending=Math.max(0,this.pending-1);}});
    child.stderr.on('data',data=>{if(this.child===child&&!this.stopping){this.error=data.toString().trim().slice(0,500);this.onChange();}});
    child.on('error',e=>{if(this.child===child&&!this.stopping)this.fail(e.message);});child.stdin.on('error',()=>{});
    child.on('close',()=>{clearTimeout(startup);if(this.child===child){this.child=null;this.ready=false;if(!this.stopping)this.fail(this.error||'Phone audio helper stopped. Check the error before starting a new stream.');else this.onChange();}});
  }
  packet(data,timestamp){
    if(!this.child)this.start();
    if(this.failed||this.stopping||!this.child||!this.ready||this.pending>=8||this.child.stdin.writableLength>65536)return;
    const header=Buffer.alloc(16);header.writeUInt32LE(0x41415644);header.writeUInt32LE(data.length,4);header.writeBigUInt64LE(BigInt(timestamp),8);this.pending++;
    this.child.stdin.write(Buffer.concat([header,data]));
  }
  stop(){if(this.stopping)return;this.stopping=true;const child=this.child;this.ready=false;if(!child)return;child.stdin.end();const timer=setTimeout(()=>child.kill(),1500);timer.unref();child.once('close',()=>clearTimeout(timer));}
}
module.exports={AudioOutput};
