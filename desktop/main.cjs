'use strict';
const { app, BrowserWindow, dialog, shell, Tray, Menu } = require('electron');
const path = require('node:path');
const { startServer } = require('./server.cjs');
const {Components}=require('./lib/components.cjs');
let backend, window, tray, quitting = false;
function showWindow(){if(!window)return;window.show();if(window.isMinimized())window.restore();window.focus();backend?.setPreview(true);}
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
      backend = await startServer({components,openCableWebsite:()=>shell.openExternal('https://vb-audio.com/Cable/'),enterBackground:()=>window?.hide(),openLicenses:()=>shell.openPath(path.join(resourceRoot,'licenses')),
        adbPath:path.join(resourceRoot,'platform-tools','adb.exe'),
        nativePath:path.join(resourceRoot,'native'),
        apkPath:app.isPackaged?path.join(resourceRoot,'DroidVideo.apk'):undefined});
      window = new BrowserWindow({ width: 1380, height: 900, minWidth: 1050, minHeight: 720, backgroundColor: '#101418',
        title: 'DroidVideo', icon: path.join(__dirname,'public','icon.ico'), autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => { if (url !== backend.url + '/') event.preventDefault(); });
      await window.loadURL(backend.url);
      tray=new Tray(path.join(__dirname,'public','icon.ico'));tray.setToolTip('DroidVideo — streaming continues in the background');
      tray.setContextMenu(Menu.buildFromTemplate([{label:'Show DroidVideo',click:showWindow},{label:'Quit DroidVideo',click:()=>app.quit()}]));
      tray.on('double-click',showWindow);
      app.on('second-instance',showWindow);
    } catch (e) { dialog.showErrorBox('DroidVideo – startup error', e.message); app.quit(); }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (backend && !quitting) { event.preventDefault(); quitting = true; backend.close().finally(() => app.quit()); }
  });
}
