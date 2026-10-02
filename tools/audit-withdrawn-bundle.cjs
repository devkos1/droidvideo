// Read-only inventory of the withdrawn release. Never runs bundled applications.
// Hash equality establishes identity, not a malware verdict.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const asar=require('../desktop/node_modules/@electron/asar');
const root=path.resolve(__dirname,'..');
const release='b32d85e05eb88faef000ad157465c031376c23f3';
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const report={releaseCommit:release,verdict:'unclassified; hashes are not antivirus clearance',files:[],source:[]};
function inventory(relative,reference,expected){
  const filename=path.join(root,relative);
  const item={path:relative};
  if(!fs.existsSync(filename)){item.status='missing';report.files.push(item);return;}
  item.size=fs.statSync(filename).size;item.sha256=hash(fs.readFileSync(filename));
  if(expected)item.matchesRecordedRelease=item.sha256===expected;
  if(reference&&fs.existsSync(path.join(root,reference))){
    item.reference=reference;item.matchesReference=item.sha256===hash(fs.readFileSync(path.join(root,reference)));
  }
  report.files.push(item);
}
for(const directory of ['windows033','windows']){
  inventory(`dist/${directory}/DroidVideo-0.3.3-Windows.exe`,null,'e4a5ecac3a25163807cc5067ec9dbac4ffc3c40e5dc98381bf269cd56371fb00');
  const prefix=`dist/${directory}/win-unpacked`;
  inventory(`${prefix}/DroidVideo.exe`);
  for(const name of ['droidvideo-audio-bridge.exe','droidvideo-vcam-writer.exe','droidvideo-camera.dll','droidvideo-obs.dll'])inventory(`${prefix}/resources/native/${name}`,`native/build/${name}`);
  for(const name of ['adb.exe','AdbWinApi.dll','AdbWinUsbApi.dll'])inventory(`${prefix}/resources/platform-tools/${name}`,`.build-deps/adb-download/platform-tools/${name}`);
  const script=`${prefix}/resources/native/Install-Components.ps1`;
  inventory(script);
  if(fs.existsSync(path.join(root,script))){
    const original=execFileSync('git',['show',`${release}:native/Install-Components.ps1`],{cwd:root,windowsHide:true});
    const normalize=data=>data.toString('utf8').replaceAll('\r\n','\n');
    report.source.push({path:script,matchesReleaseSource:normalize(fs.readFileSync(path.join(root,script)))===normalize(original)});
  }
  const archive=path.join(root,prefix,'resources/app.asar');
  if(fs.existsSync(archive)){
    inventory(`${prefix}/resources/app.asar`);
    const names=execFileSync('git',['ls-tree','-r','--name-only',release,'desktop'],{cwd:root,windowsHide:true}).toString('utf8').trim().split('\n');
    for(const filename of names.filter(n=>/desktop\/(main\.cjs|server\.cjs|lib\/|public\/)/.test(n))){
      const entry=filename.slice('desktop/'.length);
      try{
        const packed=asar.extractFile(archive,entry);
        const original=execFileSync('git',['show',`${release}:${filename}`],{cwd:root,windowsHide:true});
        report.source.push({path:`${prefix}/resources/app.asar:${entry}`,sha256:hash(packed),matchesReleaseSource:packed.equals(original)||packed.toString('utf8').replaceAll('\r\n','\n')===original.toString('utf8').replaceAll('\r\n','\n')});
      }catch(error){report.source.push({path:`${prefix}/resources/app.asar:${entry}`,error:error.message.slice(0,200)});}
    }
  }
}
const output=path.join(root,'.build-deps/investigation');fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'withdrawn-0.3.3-inventory.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({report:'.build-deps/investigation/withdrawn-0.3.3-inventory.json',files:report.files.length,sourceEntries:report.source.length,missing:report.files.filter(f=>f.status==='missing').length,identityMismatches:report.files.filter(f=>f.matchesReference===false||f.matchesRecordedRelease===false).length,sourceMismatches:report.source.filter(f=>f.matchesReleaseSource===false||f.error).length,verdict:report.verdict}));
