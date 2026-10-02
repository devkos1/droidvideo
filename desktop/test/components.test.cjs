const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Components,elevationCommand}=require('../lib/components.cjs');
const {Adb}=require('../lib/adb.cjs');
test('bundled ADB wins over SDK paths, with an explicit override available',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'dv-adb-test-'));
  t.after(()=>{fs.unlinkSync(path.join(directory,'adb.exe'));fs.rmdirSync(directory);});
  const binary=path.join(directory,'adb.exe');fs.writeFileSync(binary,'fixture');
  const adb=new Adb(binary);assert.equal(adb.executable(),binary);adb.customPath='custom-adb.exe';assert.equal(adb.executable(),'custom-adb.exe');
});
test('setup validates component, verifies installed bytes, and rejects cancelled elevation',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'dv-setup-test-'));
  const names=['Install-Components.ps1','droidvideo-camera.dll','installed/droidvideo-camera.dll'];
  fs.mkdirSync(path.join(directory,'installed'));
  names.forEach(n=>fs.writeFileSync(path.join(directory,n),'fixture'));
  t.after(()=>{names.forEach(n=>fs.unlinkSync(path.join(directory,n)));fs.rmdirSync(path.join(directory,'installed'));fs.rmdirSync(directory);});
  let elevate=0;
  const manager=new Components(directory,{run:async(exe,args)=>{
    if(exe.endsWith('reg.exe'))return {stdout:args[1].includes('InprocServer32')?`(Default) REG_SZ ${path.join(directory,'installed/droidvideo-camera.dll')}`:''};
    elevate++;throw {stderr:'Windows setup permission was cancelled or could not be requested.'};
  }});
  assert.equal((await manager.refresh()).cameraInstalled,true);
  fs.writeFileSync(path.join(directory,'installed/droidvideo-camera.dll'),'older version');
  assert.equal((await manager.refresh()).cameraInstalled,true);assert.equal(manager.status().cameraUpdateAvailable,true);await manager.install('Camera');assert.equal(elevate,0);fs.unlinkSync(path.join(directory,'installed/droidvideo-camera.dll'));names.pop();
  await assert.rejects(manager.install('Camera'),/cancelled/);assert.equal(elevate,1);assert.equal(manager.status().installing,false);
  await assert.rejects(manager.install('arbitrary'),/Unknown component/);assert.equal(elevate,1);
});
test('installer arguments are encoded and quoted, with no system policy changes',()=>{
  const command=Buffer.from(elevationCommand("C:\\O'Brien $stuff",'OBS','C:\\OBS Studio','C:\\result.txt'),'base64').toString('utf16le');
  assert.match(command,/-Verb RunAs/);assert.match(command,/-WindowStyle Hidden/);
  const inner=Buffer.from(command.match(/'-EncodedCommand','([^']+)'/)[1],'base64').toString('utf16le');
  assert.match(inner,/O''Brien \$stuff/);assert.match(inner,/-Component 'OBS'/);assert.ok(!command.includes('Set-ExecutionPolicy'));
  assert.throws(()=>elevationCommand('dir','command','dir','result'),/Unknown component/);
});

test('microphone setup is unavailable and never launches an installer',async()=>{
  let calls=0;
  const manager=new Components(__dirname,{run:async()=>{calls++;return {stdout:''};}});
  await assert.rejects(manager.install('Microphone'),/not available yet/);
  assert.equal(calls,0);
  assert.equal(manager.status().installing,false);
});

test('OBS status distinguishes a missing, outdated and matching plugin',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'dv-obs-version-'));
  const pluginDirectory=path.join(directory,'obs-plugins','64bit');
  fs.mkdirSync(pluginDirectory,{recursive:true});
  const bundled=path.join(directory,'droidvideo-obs.dll');
  const installed=path.join(pluginDirectory,'droidvideo-obs.dll');
  fs.writeFileSync(bundled,'current');
  t.after(()=>{
    fs.unlinkSync(installed);fs.unlinkSync(bundled);
    fs.rmdirSync(pluginDirectory);fs.rmdirSync(path.dirname(pluginDirectory));fs.rmdirSync(directory);
  });
  const manager=new Components(directory,{run:async()=>({stdout:''})});manager.obsRoot=directory;
  let state=await manager.refresh();
  assert.equal(state.obsPresent,false);assert.equal(state.obsUpdateRequired,false);
  fs.writeFileSync(installed,'old');state=await manager.refresh();
  assert.equal(state.obsInstalled,false);assert.equal(state.obsUpdateRequired,true);
  fs.writeFileSync(installed,'current');state=await manager.refresh();
  assert.equal(state.obsInstalled,true);assert.equal(state.obsUpdateRequired,false);
  assert.equal(state.microphoneAvailable,false);
});
