import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile),source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=JSON.parse(await fs.readFile(path.join(source,'package.json'),'utf8')).version;
const setup=path.resolve(source,'..','..','releases',`GameDesignerWorkerSpace-Setup-${version}-x64.exe`);
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'gdws-installer-test-'));
try{
 const target=path.join(temporary,'安装测试 With Spaces');
 const cleanEnv={...process.env,PATH:path.join(process.env.SystemRoot||'C:\\Windows','System32')};
 await run(setup,['/silent','/dir='+target],{env:cleanEnv,windowsHide:true,timeout:120000});
 const names=(await fs.readdir(target)).sort();assert.deepEqual(names,['App','Data','Documents','GameDesignerWorkerSpace.exe','Logs','Runtime'].sort());
 for(const executable of ['Runtime/Node/node.exe','Runtime/Git/cmd/git.exe','Runtime/SVN/bin/svn.exe'])assert.ok((await fs.stat(path.join(target,executable))).size>10000);
 for(const file of ['App/dist/document.css','App/dist/document-layout.js','App/dist/vendor/editor-entry.js','App/dist/licenses/editor/components.json'])assert.ok((await fs.stat(path.join(target,file))).size>100,'Offline document editor assets must ship in the installer');
 assert.equal(JSON.parse(await fs.readFile(path.join(target,'App','version.json'),'utf8')).version,version);
 const binary=await fs.readFile(path.join(target,'GameDesignerWorkerSpace.exe')),pe=binary.readUInt32LE(0x3c);assert.equal(binary.readUInt16LE(pe+4),0x8664);assert.equal(binary.readUInt16LE(pe+24+68),2,'launcher must use Windows GUI subsystem, no CMD window');
 await fs.writeFile(path.join(target,'Data','settings-preserved.txt'),'keep local library settings');const external=path.join(temporary,'independent-project');await fs.mkdir(external);await fs.writeFile(path.join(external,'project.json'),'keep independent project content');
 await run(path.join(target,'App','Tools','Updater.exe'),['--self-test',path.join(target,'Logs','updater-self-test.json')],{env:cleanEnv,windowsHide:true,timeout:30000});assert.equal(JSON.parse(await fs.readFile(path.join(target,'Logs','updater-self-test.json'),'utf8')).projectProtection,true);
 const report=path.join(target,'Logs','self-test.json');await run(path.join(target,'GameDesignerWorkerSpace.exe'),['--self-test',report],{env:cleanEnv,windowsHide:true,timeout:90000});const health=JSON.parse(await fs.readFile(report,'utf8'));assert.equal(health.ok,true,health.error);assert.equal(health.httpStatus,200);assert.equal(health.askpass,true,'bundled credential helper must work in paths containing spaces and Chinese');for(const name of ['node','git','svn'])assert.ok(health.tools[name].available&&health.tools[name].bundled);
 console.log('PASS: installer extracts all dependencies, clean top-level layout, GUI EXE, and installed runtime self-test without global Node/Git/SVN.');
 await fs.mkdir(path.join(target,'Project','.git'),{recursive:true});await fs.writeFile(path.join(target,'Project','project.json'),'project sentinel');await fs.writeFile(path.join(target,'Project','.git','config'),'git sentinel');
 await run(setup,['/silent','/dir='+target],{env:cleanEnv,windowsHide:true,timeout:120000});assert.equal(await fs.readFile(path.join(target,'Project','project.json'),'utf8'),'project sentinel');assert.equal(await fs.readFile(path.join(target,'Project','.git','config'),'utf8'),'git sentinel');assert.equal(await fs.readFile(path.join(target,'Data','settings-preserved.txt'),'utf8'),'keep local library settings');assert.equal(await fs.readFile(path.join(external,'project.json'),'utf8'),'keep independent project content');
 console.log('PASS: reinstall/upgrade preserves Data and independent project folders; Chinese and spaced installation paths work.');
}finally{const resolved=path.resolve(temporary);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('gdws-installer-test-'));await fs.rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
