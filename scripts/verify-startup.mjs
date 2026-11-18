import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const entry=path.join(root,'启动工作台.cmd');
const bytes=await fs.readFile(entry),text=bytes.toString('ascii');
assert.ok(bytes.every(byte=>byte<128),'batch commands must stay ASCII to avoid codepage parsing errors');
assert.ok(!text.replaceAll('\r\n','').includes('\n'),'Windows startup requires CRLF line endings');
assert.match(text,/node "%~dp0launcher\.mjs"/);
assert.match(await fs.readFile(path.join(root,'.gitattributes'),'utf8'),/^\*\.cmd text eol=crlf$/m);
if(process.platform==='win32'){
 const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'gameforge-batch-test-'));
 try{
  // Exercise the real .cmd parser without opening another browser during tests.
  await fs.writeFile(path.join(fixture,'node.cmd'),'@echo off\r\necho GAMEFORGE_BATCH_LAUNCH_OK\r\nexit /b 0\r\n','ascii');
  const result=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',`""${entry}""`],{cwd:root,env:{...process.env,PATH:fixture+';'+process.env.PATH},encoding:'utf8',windowsHide:true,windowsVerbatimArguments:true,timeout:10000});
  assert.ifError(result.error);assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/GAMEFORGE_BATCH_LAUNCH_OK/);assert.doesNotMatch(result.stderr,/not recognized|不是内部或外部命令/);
 }finally{const resolved=path.resolve(fixture);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('gameforge-batch-test-'));await fs.rm(resolved,{recursive:true,force:true});}
}
console.log('PASS: real Windows .cmd startup, ASCII commands, CRLF preservation and Git attributes.');
