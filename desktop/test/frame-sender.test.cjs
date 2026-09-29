const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
test('virtual frames wait for consumption and discard an old session during copy',async()=>{
  const sockets=[];
  class Socket{static OPEN=1;constructor(){this.readyState=1;this.bufferedAmount=0;this.sent=[];sockets.push(this);}send(b){this.sent.push(new Uint8Array(b).slice());}close(){this.readyState=3;}}
  const code=fs.readFileSync(require.resolve('../public/virtual-camera.js'),'utf8').replace('export class','class')+'\nglobalThis.Sender=VirtualCameraSender;';
  const context={WebSocket:Socket,location:{host:'127.0.0.1'},ArrayBuffer,DataView,Uint8Array};vm.createContext(context);vm.runInContext(code,context);
  const sender=new context.Sender('token',e=>{throw new Error(e);});
  const state={virtualCamera:{enabled:true},status:{targetFps:30,rotation:90}};
  const frame={format:'NV12',visibleRect:{width:4,height:2},clone(){return this;},copyTo:async()=>{},close(){}};
  sender.update(state);await sender.send(frame);assert.equal(sockets[0].sent.length,1);
  await sender.send(frame);assert.equal(sockets[0].sent.length,1);
  sockets[0].onmessage();await sender.send(frame);assert.equal(sockets[0].sent.length,2);
  sockets[0].onmessage();let finish;frame.copyTo=()=>new Promise(r=>{finish=r;});const copying=sender.send(frame);
  sender.update({virtualCamera:{enabled:false}});sender.update(state);finish();await copying;
  assert.equal(sockets[1].sent.length,0);assert.equal(sender.busy,false);sender.close();
  sender.update({...state,virtualCamera:{enabled:true,mode:'native-h264'}});assert.equal(sender.enabled,false);assert.equal(sockets.length,2);
});
