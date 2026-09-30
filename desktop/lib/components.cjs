'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const encode=value=>Buffer.from(value,'utf16le').toString('base64');
function elevationCommand(directory,component,obsRoot,resultFile){
  if(!['Camera','OBS'].includes(component))throw new Error('Unknown component');
  const inner=`$ErrorActionPreference='Stop'; try { & ${quote(path.join(directory,'Install-Components.ps1'))} -Component ${quote(component)} -ObsRoot ${quote(obsRoot)}; exit 0 } catch { [IO.File]::WriteAllText(${quote(resultFile)},$_.Exception.Message); exit 1 }`;
  return encode(`try { $p=Start-Process -FilePath "$PSHOME\\powershell.exe" -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-EncodedCommand',${quote(encode(inner))}) -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode } catch { [Console]::Error.WriteLine('Windows setup permission was cancelled or could not be requested.'); exit 1 }`);
}
function sameFile(a,b){try{return crypto.createHash('sha256').update(fs.readFileSync(a)).digest('hex')===crypto.createHash('sha256').update(fs.readFileSync(b)).digest('hex');}catch{return false;}}
class Components {
  constructor(directory,{chooseObsRoot=async()=>null,run=exec}={}){
    this.directory=directory;this.chooseObsRoot=chooseObsRoot;this.run=run;
    this.obsRoot=path.join(process.env.ProgramFiles||'C:\\Program Files','obs-studio');
    this.current={available:fs.existsSync(path.join(directory,'Install-Components.ps1')),cameraInstalled:false,obsInstalled:false};
    this.installing=false;
  }
  status(){return {...this.current,installing:this.installing};}
  async registry(key,value){
    try { const {stdout}=await this.run(path.join(process.env.SystemRoot||'C:\\Windows','System32','reg.exe'),['query',key,...(value?['/v',value]:['/ve']),'/reg:64'],{windowsHide:true,timeout:5000});return stdout.match(/REG_(?:EXPAND_)?SZ\s+(.+)/)?.[1]?.trim()||''; } catch {return '';}
  }
  async refresh(){
    if(!fs.existsSync(path.join(this.obsRoot,'bin','64bit','obs64.exe'))){
      const registered=await this.registry('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OBS Studio','InstallLocation');
      if(registered&&fs.existsSync(path.join(registered,'bin','64bit','obs64.exe')))this.obsRoot=registered;
    }
    const camera=await this.registry('HKCR\\CLSID\\{7B9F2D13-E481-4EA5-A853-4D706FE1A299}\\InprocServer32');
    // Releases using this CLSID share camera ABI 1. A different PE build hash
    // is not a reason to overwrite a compatible DLL loaded by a camera app.
    this.current.cameraInstalled=!!camera&&path.basename(camera).toLowerCase()==='droidvideo-camera.dll'&&fs.existsSync(camera);
    this.current.cameraUpdateAvailable=this.current.cameraInstalled&&!sameFile(camera,path.join(this.directory,'droidvideo-camera.dll'));
    this.current.obsInstalled=sameFile(path.join(this.obsRoot,'obs-plugins','64bit','droidvideo-obs.dll'),path.join(this.directory,'droidvideo-obs.dll'));
    return this.status();
  }
  async install(component){
    if(!['Camera','OBS'].includes(component))throw new Error('Unknown component');
    if(!this.current.available)throw new Error('Open the bundled DroidVideo Windows app to run setup.');
    if(this.installing)throw new Error('Setup is already running.');
    this.installing=true;
    let temporary;
    try {
      await this.refresh();
      if(component==='Camera'&&this.current.cameraInstalled)return this.status();
      if(component==='OBS'&&!fs.existsSync(path.join(this.obsRoot,'bin','64bit','obs64.exe'))){
        const selected=await this.chooseObsRoot();
        if(!selected)throw new Error('Install OBS Studio first, then try again.');
        if(!fs.existsSync(path.join(selected,'bin','64bit','obs64.exe')))throw new Error('Choose the OBS Studio installation folder.');
        this.obsRoot=selected;
      }
      temporary=fs.mkdtempSync(path.join(os.tmpdir(),'droidvideo-setup-'));
      const result=path.join(temporary,'error.txt');
      try {await this.run(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',elevationCommand(this.directory,component,this.obsRoot,result)],{windowsHide:true,timeout:180000,maxBuffer:65536});}
      catch(error){throw new Error(fs.existsSync(result)?fs.readFileSync(result,'utf8'):(error.stderr?.trim()||'Setup was not completed. Accept the Windows permission prompt to continue.'));}
      await this.refresh();
      if(!this.current[component==='Camera'?'cameraInstalled':'obsInstalled'])throw new Error('Setup finished, but the component could not be verified. Close camera applications and try again.');
      return this.status();
    } finally {this.installing=false;if(temporary){const result=path.join(temporary,'error.txt');try{fs.unlinkSync(result);}catch{}try{fs.rmdirSync(temporary);}catch{}}}
  }
}
module.exports={Components,elevationCommand,sameFile};
