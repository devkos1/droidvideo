'use strict';
const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('node:path');
const { startServer } = require('./server.cjs');
const {Components}=require('./lib/components.cjs');
let backend, quitting = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(async () => {
    app.setAppUserModelId('hu.droidvideo.desktop');
    try {
      const resourceRoot=app.isPackaged?process.resourcesPath:path.resolve(__dirname,'../.build-deps/bundle');
      const components=new Components(path.join(resourceRoot,'native'),{chooseObsRoot:async()=>{
        const choice=await dialog.showOpenDialog({title:'Choose the OBS Studio folder',properties:['openDirectory']});
        return choice.canceled?null:choice.filePaths[0];
      }});
      await components.refresh();
      backend = await startServer({components,openLicenses:()=>shell.openPath(path.join(resourceRoot,'licenses')),
        adbPath:path.join(resourceRoot,'platform-tools','adb.exe'),
        nativePath:path.join(resourceRoot,'native'),
        apkPath:app.isPackaged?path.join(resourceRoot,'DroidVideo.apk'):undefined});
      const window = new BrowserWindow({ width: 1380, height: 900, minWidth: 1050, minHeight: 720, backgroundColor: '#101418',
        title: 'DroidVideo', icon: path.join(__dirname,'public','icon.ico'), autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => { if (url !== backend.url + '/') event.preventDefault(); });
      await window.loadURL(backend.url);
      app.on('second-instance', () => { if (window.isMinimized()) window.restore(); window.focus(); });
    } catch (e) { dialog.showErrorBox('DroidVideo – startup error', e.message); app.quit(); }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (backend && !quitting) { event.preventDefault(); quitting = true; backend.close().finally(() => app.quit()); }
  });
}
