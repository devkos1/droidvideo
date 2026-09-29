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
  constructor(directory,onChange=()=>{}) {this.directory=directory;this.onChange=onChange;this.process=null;this.error='';this.blocked=false;this.frames=0;}
  status(){return {enabled:!!this.process,available:fs.existsSync(path.join(this.directory,'droidvideo-vcam-writer.exe')),error:this.error,frames:this.frames};}
  async start(){
    if(this.process)return;
    const executable=path.join(this.directory,'droidvideo-vcam-writer.exe');
    if(!fs.existsSync(executable))throw new Error('Build or install the Windows native components first.');
    this.error='';this.frames=0;this.blocked=false;
    const child=spawn(executable,[],{stdio:['pipe','ignore','pipe'],windowsHide:true});this.process=child;
    child.stdin.on('error',e=>{this.error=e.message;this.onChange();});
    child.stdin.on('drain',()=>{this.blocked=false;});
    child.stderr.on('data',data=>{this.error=data.toString().slice(0,500);this.onChange();});
    child.on('close',code=>{if(this.process===child){this.process=null;if(code)this.error||=`Virtual camera exited (${code})`;this.onChange();}});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',e=>{this.process=null;this.error=e.message;reject(e);this.onChange();});});
    this.onChange();
  }
  frame(data){validateFrame(data);if(!this.process||this.blocked)return false;this.blocked=!this.process.stdin.write(data);this.frames++;return true;}
  stop(){const child=this.process;this.process=null;if(child){child.stdin.end();const timeout=setTimeout(()=>child.kill(),2000);timeout.unref();child.once('close',()=>clearTimeout(timeout));}this.blocked=false;this.onChange();}
}
module.exports={VirtualCamera,validateFrame};
