const {test}=require('node:test'),assert=require('node:assert/strict');
const {Adb}=require('../lib/adb.cjs');
test('insufficient phone storage is actionable and does not expose a Java stack',async()=>{
 const adb=new Adb('',async()=>{throw {stderr:'adb.exe: failed to install /private/path.apk: java.io.IOException: Requested internal only, but not enough space at android.util.ExceptionUtils.wrap'};});
 await assert.rejects(adb.run(['install']),error=>/free internal storage/.test(error.message)&&!/java|private/.test(error.message));
});
test('ADB activity errors are rejected even when the process exits successfully',async()=>{
 for(const field of ['stdout','stderr']){const adb=new Adb('',async()=>({stdout:'',[field]:'Error type 3\nActivity class {hu.droidvideo/hu.droidvideo.MainActivity} does not exist.'}));await assert.rejects(adb.run(['shell']),/not installed/);}
});
test('missing Android package prevents forwarding and launching',async()=>{
 const commands=[];const adb=new Adb('',async(exe,args)=>{commands.push(args);return {stdout:args[0]==='devices'?'List of devices attached\nPHONE\tdevice model:Test':''};});
 await assert.rejects(adb.forward('PHONE'),/Install Android app first/);
 assert.ok(!commands.some(a=>a.includes('forward')||a.includes('am')));
});
