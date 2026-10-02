const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {AudioOutput}=require('../lib/audio-output.cjs');

function fixture(t,exists=()=>true){
  const children=[];
  const output=new AudioOutput('fixture',()=>{},{exists,launch:()=>{
    const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
    child.stdin=new EventEmitter();child.stdin.writableLength=0;child.writes=[];
    child.stdin.write=data=>child.writes.push(data);child.stdin.end=()=>{};child.kill=()=>{};
    children.push(child);return child;
  }});
  t.after(()=>{output.stop();for(const child of children)child.emit('close',0);});
  const packet=()=>output.packet(Buffer.from([1,2,3]),1000);
  return {output,children,packet};
}

test('audio helper failure stops retries across incoming packets until an explicit reset',t=>{
  const {output,children,packet}=fixture(t);
  packet();assert.equal(children.length,1);
  children[0].stderr.emit('data',Buffer.from('Audio decoder failed'));
  children[0].emit('close',1);
  for(let i=0;i<1000;i++)packet();
  assert.equal(children.length,1);assert.equal(output.status().error,'Audio decoder failed');
  output.reset();packet();assert.equal(children.length,2);
});

test('a launch error or unexpected successful exit also prevents restart loops',t=>{
  const {output,children,packet}=fixture(t);
  packet();children[0].emit('error',new Error('Access denied'));children[0].emit('close',-1);
  packet();assert.equal(children.length,1);assert.equal(output.status().error,'Access denied');
  output.reset();packet();children[1].emit('close',0);
  packet();assert.equal(children.length,2);assert.match(output.status().error,/stopped/);
});

test('missing helper is reported once rather than retried for every audio packet',t=>{
  let checks=0;const {output,children,packet}=fixture(t,()=>{checks++;return false;});
  for(let i=0;i<1000;i++)packet();
  assert.equal(checks,1);assert.equal(children.length,0);assert.match(output.status().error,/missing/);
});

test('audio is bounded and only resumes after a requested stop has completed',t=>{
  const {output,children,packet}=fixture(t);
  packet();children[0].stdout.emit('data',Buffer.from('R'));
  for(let i=0;i<100;i++)packet();assert.equal(children[0].writes.length,8);
  children[0].stdout.emit('data',Buffer.from('A'));packet();assert.equal(children[0].writes.length,9);
  output.reset();packet();assert.equal(children.length,1);
  children[0].emit('close',0);packet();assert.equal(children.length,2);assert.equal(output.failed,false);
});
