// Development-only synthetic camera. Never included in the packaged application.
// Usage: node tools/preview-fixture.cjs <directory printed by verify-media.cjs>
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {startServer}=require('../desktop/server.cjs');
function split(bytes) {
  const items=[];
  for(let i=0;i<bytes.length-4;i++) {
    const n=bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===0&&bytes[i+3]===1?4:bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===1?3:0;
    if(n){items.push({at:i,type:bytes[i+n]&31});i+=n-1;}
  }
  const units=[];let current=[];
  items.forEach((n,i)=>{if(n.type===9&&current.length){units.push(current);current=[];}current.push({type:n.type,data:bytes.subarray(n.at,items[i+1]?.at??bytes.length)});});
  if(current.length)units.push(current);
  return units.map(u=>({config:Buffer.concat(u.filter(n=>[7,8].includes(n.type)).map(n=>n.data)),key:u.some(n=>n.type===5),data:Buffer.concat(u.filter(n=>![7,8,9].includes(n.type)).map(n=>n.data))}));
}
const root=process.argv[2];if(!root)throw new Error('Provide the verification video directory.');
const samples={ '1920x1080@60':split(fs.readFileSync(path.join(root,'1080p60.h264'))), '3840x2160@30':split(fs.readFileSync(path.join(root,'2160p30.h264'))) };
let socket,timer,index=0,total=0,mode='1920x1080@60',phase='idle',started=Date.now();
function write(flags,ts,data){if(!socket||socket.destroyed)return;const b=Buffer.alloc(13+data.length);b[0]=flags;b.writeBigUInt64BE(BigInt(ts),1);b.writeUInt32BE(data.length,9);data.copy(b,13);socket.write(b);}
function frame(){const fps=mode.endsWith('60')?60:30;const f=samples[mode][index];if(f.config.length)write(2,0,f.config);write(f.key?1:0,Math.round(total++*1e6/fps),f.data);index=(index+1)%samples[mode].length;}
const source=net.createServer(s=>{socket=s;s.on('error',()=>{});});
source.listen(0,'127.0.0.1',async()=>{
  const camera={id:'test',label:'SZINTETIKUS TESZT · nem valódi telefon',minZoom:1,maxZoom:4,exposureMin:-3,exposureMax:3,focus:true,torch:false,
    modes:[{id:'1920x1080@60',label:'1080p / 60 fps'},{id:'3840x2160@30',label:'4K / 30 fps'}]};
  const status=()=>({phase,mode,width:mode.startsWith('3840')?3840:1920,height:mode.startsWith('3840')?2160:1080,targetFps:mode.endsWith('60')?60:30,rotation:0,measuredFps:total/Math.max(.001,(Date.now()-started)/1000),mbps:16,error:'',cameraId:'test'});
  const server=await startServer({port:28186,obsPort:28187,adb:{devices:async()=>[{serial:'TEST-ONLY',state:'device',model:'Szintetikus tesztkamera'}],forward:async()=>[1,source.address().port],disconnect:async()=>{}},
    phoneRequest:async(_,route,body)=>{
      if(route==='/audio-inputs')return {devices:[{id:'off',label:'Off'},{id:'default',label:'Test microphone'}]};
      if(route==='/cameras')return {cameras:[camera]};
      if(route==='/start'){clearInterval(timer);mode=body.mode;index=0;total=0;started=Date.now();phase='streaming';frame();timer=setInterval(frame,1000/(mode.endsWith('60')?60:30));}
      if(route==='/stop'){clearInterval(timer);phase='idle';}
      if(route==='/keyframe'&&phase==='streaming')index=0;
      return status();
    }});
  console.log(`TEST ONLY: ${server.url}`);
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(timer);await server.close();socket?.destroy();source.close();process.exit();});
});
