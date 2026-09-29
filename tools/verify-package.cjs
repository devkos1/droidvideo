// Verify the packaged application's exact source, APK and native helper.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const asar=require('../desktop/node_modules/@electron/asar');
const root=path.resolve(__dirname,'..'),resources=path.join(root,'dist/windows/win-unpacked/resources');
const archive=path.join(resources,'app.asar');
const files=['main.cjs','server.cjs'];
for(const directory of ['lib','public'])for(const file of fs.readdirSync(path.join(root,'desktop',directory)))files.push(directory+'/'+file);
for(const file of files)assert.ok(asar.extractFile(archive,file).equals(fs.readFileSync(path.join(root,'desktop',file))),file+' does not match source');
// electron-builder removes build/dev metadata from the packaged package.json.
const metadata=JSON.parse(asar.extractFile(archive,'package.json')),original=require('../desktop/package.json');
for(const key of ['name','version','main','dependencies'])assert.deepEqual(metadata[key],original[key]);
assert.deepEqual(fs.readFileSync(path.join(resources,'DroidVideo.apk')),fs.readFileSync(path.join(root,'dist/DroidVideo-0.2.0-Android.apk')));
assert.deepEqual(fs.readFileSync(path.join(resources,'native/droidvideo-vcam-writer.exe')),fs.readFileSync(path.join(root,'native/build/droidvideo-vcam-writer.exe')));
const names=asar.listPackage(archive);assert.ok(!names.some(n=>n.endsWith('/obs.js')||n.endsWith('/obs.html')));
console.log(`PASS packaged source (${files.length} files), embedded APK, native helper and removed legacy OBS UI`);
