// Run after verify-media.cjs, passing its fixture directory. Uses an isolated port.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {setTimeout:sleep}=require('node:timers/promises');
const {ObsOutput}=require('../desktop/lib/obs-output.cjs');
function nals(bytes){
 const starts=[];
 for(let i=0;i<bytes.length-4;i++){
  const prefix=bytes[i]===0&&bytes[i+1]===0?(bytes[i+2]===1?3:bytes[i+2]===0&&bytes[i+3]===1?4:0):0;
  if(prefix){starts.push({at:i,type:bytes[i+prefix]&31});i+=prefix-1;}
 }
 return starts.map((n,i)=>({...n,bytes:bytes.subarray(n.at,starts[i+1]?.at??bytes.length)}));
}
(async()=>{
 for(const [height,fps] of [[1080,60],[2160,30]]){
  const units=[];let current=[];
  for(const nal of nals(fs.readFileSync(path.join(process.argv[2],`${height}p${fps}.h264`)))){if(nal.type===9&&current.length){units.push(current);current=[];}current.push(nal);}
  if(current.length)units.push(current);
  const audioBytes=fs.readFileSync(path.join(process.argv[2],`${height}p${fps}.aac`)),audio=[];
  for(let at=0;at<audioBytes.length;){const len=((audioBytes[at+3]&3)<<11)|(audioBytes[at+4]<<3)|(audioBytes[at+5]>>5);audio.push(audioBytes.subarray(at,at+len));at+=len;}
  const plugin=fs.readFileSync(path.join(__dirname,'../native/droidvideo-obs.cpp'),'utf8');
  const input=plugin.match(/udp:\/\/127[^"\n]+/)[0].replace(':27187',':28187');
  const child=spawn('ffmpeg',['-hide_banner','-loglevel','info','-fflags','nobuffer','-probesize','32768','-analyzeduration','100000','-max_delay','0','-f','mpegts','-i',input,'-t','3','-progress','pipe:1','-f','null','-'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='',progress='';child.stderr.on('data',b=>log+=b);child.stdout.on('data',b=>progress+=b);
  const exited=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  const limit=setTimeout(()=>child.kill(),15000);const output=new ObsOutput(28187);
  try{
   await sleep(400);let audioIndex=0;const start=performance.now();
   for(let i=0;i<fps*5;i++){
    const unit=units[i%units.length],config=unit.filter(n=>[7,8].includes(n.type));
    if(config.length)output.packet(2,Buffer.concat(config.map(n=>n.bytes)),0n);
    output.packet(unit.some(n=>n.type===5)?1:0,Buffer.concat(unit.filter(n=>![7,8,9].includes(n.type)).map(n=>n.bytes)),BigInt(Math.round(i*1e6/fps)));
    while(audioIndex*1024/48000<(i+1)/fps){output.packet(3,audio[audioIndex%audio.length],BigInt(Math.round(audioIndex*1024*1e6/48000)));audioIndex++;}
    await sleep(Math.max(0,start+(i+1)*1000/fps-performance.now()));
   }
   assert.equal(await exited,0,log);
   const frames=Number([...progress.matchAll(/frame=(\d+)/g)].at(-1)?.[1]);
   assert.ok(frames>=fps*2,`${frames} frames\n${log}`);
   assert.match(log,/Audio: aac/);assert.doesNotMatch(log,/Circular buffer overrun|corrupt decoded frame|error while decoding/i);
   console.log(`PASS ${height}p${fps}: ${frames} frames decoded over production loopback transport with AAC and low-buffer settings`);
  }finally{clearTimeout(limit);output.close();if(child.exitCode===null)child.kill();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
