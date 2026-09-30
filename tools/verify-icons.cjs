// Read-only validation of actual Windows PE icon resources, not just build config.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const edit=require('../desktop/node_modules/resedit');
const root=path.resolve(__dirname,'..');
const ico=fs.readFileSync(path.join(root,'desktop/public/icon.ico'));
const count=ico.readUInt16LE(4),images=[];
for(let i=0;i<count;i++){const at=6+i*16,n=ico.readUInt32LE(at+8),offset=ico.readUInt32LE(at+12);images.push(ico.subarray(offset,offset+n));}
for(const name of ['dist/windows/win-unpacked/DroidVideo.exe','dist/windows/DroidVideo-0.3.1-Windows.exe']){
 const pe=edit.NtExecutable.from(fs.readFileSync(path.join(root,name)),{ignoreCert:true});
 const entries=edit.NtExecutableResource.from(pe).entries;
 const embedded=entries.filter(e=>e.type===3).map(e=>Buffer.from(e.bin));
 assert.ok(entries.some(e=>e.type===14),'Missing Windows icon group: '+name);
 assert.ok(images.every(image=>embedded.some(entry=>entry.equals(image))),'DroidVideo icon image missing: '+name);
 console.log(`PASS ${name}: all ${count} custom icon sizes embedded`);
}
