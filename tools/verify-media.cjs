// Optional integration check using local FFmpeg/ffprobe. No phone is simulated in production.
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const {MpegTsMuxer}=require('../desktop/lib/mpegts.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'droidvideo-media-'));
function nals(bytes) {
  const starts=[];
  for(let i=0;i<bytes.length-4;i++) {
    let prefix=0;
    if(bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===0&&bytes[i+3]===1)prefix=4;
    else if(bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===1)prefix=3;
    if(prefix){starts.push({at:i,type:bytes[i+prefix]&31});i+=prefix-1;}
  }
  return starts.map((n,i)=>({...n,bytes:bytes.subarray(n.at,starts[i+1]?.at??bytes.length)}));
}
for(const [width,height,fps] of [[1920,1080,60],[3840,2160,30]]) {
  const file=path.join(dir,`${height}p${fps}.h264`);
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`testsrc2=size=${width}x${height}:rate=${fps}`,'-frames:v',String(fps),'-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-x264-params',`aud=1:repeat-headers=1:keyint=${fps}:bframes=0`,'-f','h264',file],{windowsHide:true,timeout:60000});
  const units=[];let current=[];
  for(const nal of nals(fs.readFileSync(file))) {if(nal.type===9&&current.length){units.push(current);current=[];} current.push(nal);}
  if(current.length) units.push(current);
  const aac=path.join(dir,`${height}p${fps}.aac`);
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=1000:sample_rate=48000','-t','1','-ac','2','-c:a','aac','-b:a','160k','-f','adts',aac],{windowsHide:true,timeout:60000});
  const audioBytes=fs.readFileSync(aac),audio=[];
  for(let at=0;at<audioBytes.length;){const length=((audioBytes[at+3]&3)<<11)|(audioBytes[at+4]<<3)|(audioBytes[at+5]>>5);assert.ok(length>=7);audio.push(audioBytes.subarray(at,at+length));at+=length;}
  const mux=new MpegTsMuxer(),output=[]; let config=null,audioIndex=0;
  for(let i=0;i<units.length;i++) {
    const csd=units[i].filter(n=>[7,8].includes(n.type));if(csd.length)config=Buffer.concat(csd.map(n=>n.bytes));
    const data=Buffer.concat(units[i].filter(n=>![7,8,9].includes(n.type)).map(n=>n.bytes));
    output.push(mux.frame(data,BigInt(Math.round(i*1e6/fps)),units[i].some(n=>n.type===5),config));
    while(audioIndex<audio.length&&audioIndex*1024/48000<(i+1)/fps){output.push(mux.audio(audio[audioIndex],BigInt(Math.round(audioIndex*1024*1e6/48000))));audioIndex++;}
  }
  const ts=path.join(dir,`${height}p${fps}.ts`);fs.writeFileSync(ts,Buffer.concat(output));
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=codec_name,width,height,nb_read_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',ts],{windowsHide:true,timeout:60000,encoding:'utf8'}));
  assert.equal(probe.streams[0].width,width);assert.equal(probe.streams[0].height,height);assert.equal(Number(probe.streams[0].nb_read_frames),fps);
  assert.equal(probe.frames.length,fps);
  const times=probe.frames.map(f=>Number(f.best_effort_timestamp_time));
  for(let i=1;i<times.length;i++)assert.ok(Math.abs(times[i]-times[i-1]-1/fps)<0.00003);
  execFileSync('ffmpeg',['-v','error','-i',ts,'-f','null','-'],{windowsHide:true,timeout:60000});
  const audioProbe=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_name,sample_rate,channels','-show_entries','packet=pts_time','-of','json',ts],{windowsHide:true,timeout:60000,encoding:'utf8'}));
  assert.equal(audioProbe.streams[0].codec_name,'aac');assert.equal(audioProbe.streams[0].sample_rate,'48000');assert.equal(audioProbe.streams[0].channels,2);
  const atimes=audioProbe.packets.map(p=>Number(p.pts_time));assert.ok(atimes.length>=46);assert.ok(Math.abs(atimes[0]-times[0])<.001);
  for(let i=1;i<atimes.length;i++)assert.ok(Math.abs(atimes[i]-atimes[i-1]-1024/48000)<.00003);
  console.log(`PASS ${width}x${height} @ ${fps}: ${probe.frames.length} video frames + ${atimes.length} AAC packets decoded; shared-clock A/V timestamps verified`);
}
console.log(`Verification files: ${dir}`);
