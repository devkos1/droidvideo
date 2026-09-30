'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { parseDevices } = require('./protocol.cjs');
const exec = promisify(execFile);
function friendlyAdbError(message){
  if(/not enough space|INSTALL_FAILED_INSUFFICIENT_STORAGE|insufficient storage/i.test(message))return 'Your phone does not have enough free internal storage to install DroidVideo. Free some space in Android Settings → Storage, then click Install again. Nothing was deleted from your phone.';
  if(/Error type 3|Activity class.*does not exist|Unknown package/i.test(message))return 'DroidVideo is not installed for the current Android user. Click Install Android app first, wait for success, then connect again.';
  if(/INSTALL_FAILED_UPDATE_INCOMPATIBLE/i.test(message))return 'The installed Android app has a different signature. Use an APK from the same publisher, or remove the old app yourself before installing (removing it deletes its settings).';
  return message;
}

class Adb {
  constructor(bundledPath = '', execute=exec) { this.execute=execute;this.bundledPath=bundledPath; this.customPath = ''; this.serial = null; this.ports = []; }
  executable() {
    if (this.customPath) return this.customPath;
    const candidates = [this.bundledPath, process.env.ADB_PATH,
      process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb.exe'),
      process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb.exe'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe')];
    return candidates.find(p => p && fs.existsSync(p)) || 'adb';
  }
  async run(args, timeout = 10000) {
    try {
      const { stdout,stderr='' } = await this.execute(this.executable(), args, { windowsHide: true, timeout, maxBuffer: 1024 * 1024 });
      if(/Error type \d|Error:|Failure \[/i.test(stderr))throw new Error(stderr.trim());
      if(/Error type \d|Error:|Failure \[/i.test(stdout))throw new Error(stdout.trim());
      return stdout.trim();
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('ADB was not found. Install Android Platform-Tools and set the adb.exe path.');
      throw new Error(friendlyAdbError((error.stderr || error.stdout || error.message).trim()));
    }
  }
  async devices() { return parseDevices(await this.run(['devices', '-l'])); }
  async forward(serial) {
    await this.disconnect();
    const device = (await this.devices()).find(d => d.serial === serial);
    if (!device || device.state !== 'device') throw new Error('Phone is not authorized. Unlock it and accept the USB debugging prompt.');
    const installed=await this.run(['-s',serial,'shell','pm','path','hu.droidvideo']);
    if(!installed.startsWith('package:'))throw new Error(friendlyAdbError('Error type 3'));
    this.serial = serial;
    try {
      for (const remote of [27184, 27185]) {
        const value = await this.run(['-s', serial, 'forward', 'tcp:0', `tcp:${remote}`]);
        const port = Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid ADB port');
        this.ports.push(port);
      }
      await this.run(['-s', serial, 'shell', 'am', 'start', '-n', 'hu.droidvideo/.MainActivity']);
      return this.ports;
    } catch (e) { await this.disconnect(); throw e; }
  }
  async disconnect() {
    const serial = this.serial, ports = this.ports;
    this.serial = null; this.ports = [];
    if (serial) await Promise.allSettled(ports.map(port => this.run(['-s', serial, 'forward', '--remove', `tcp:${port}`])));
  }
  async install(serial, apk) {
    if (!fs.existsSync(apk)) throw new Error('APK was not found. Build the Android application first.');
    const device = (await this.devices()).find(d => d.serial === serial && d.state === 'device');
    if (!device) throw new Error('Authorize USB debugging on the phone first.');
    return this.run(['-s', serial, 'install', '-r', apk], 120000);
  }
}
module.exports = { Adb,friendlyAdbError };
