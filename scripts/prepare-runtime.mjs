import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),run=promisify(execFile);
if(process.platform!=='win32'||process.arch!=='x64')throw new Error('Windows x64 is required to build the bundled desktop runtime.');
const cache=path.join(root,'build','downloads');await fs.mkdir(cache,{recursive:true});
const config=JSON.parse(await fs.readFile(path.join(root,'release-config.json'),'utf8'));
const sha=data=>createHash('sha256').update(data).digest('hex');
async function download(url,name,expected){const file=path.join(cache,name);let data;try{data=await fs.readFile(file);}catch{}if(!data||expected&&sha(data)!==expected.toLowerCase()){const response=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw new Error('Dependency download failed: '+url+' ('+response.status+')');data=Buffer.from(await response.arrayBuffer());if(expected&&sha(data)!==expected.toLowerCase())throw new Error('Dependency checksum mismatch: '+name);await fs.writeFile(file,data);}return file;}
const quote=value=>"'"+value.replaceAll("'","''")+"'";
async function expand(file,target){await fs.mkdir(target,{recursive:true});await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Expand-Archive -LiteralPath ${quote(file)} -DestinationPath ${quote(target)} -Force`],{windowsHide:true,maxBuffer:1024*1024});}
const nodeTarget=path.join(root,'runtime','node');
if(!await fs.stat(path.join(nodeTarget,'node.exe')).then(()=>true,()=>false)){
 const name=`node-v${config.nodeVersion}-win-x64.zip`,base=`https://nodejs.org/dist/v${config.nodeVersion}/`;
 const sums=await fetch(base+'SHASUMS256.txt').then(response=>{if(!response.ok)throw new Error('Cannot fetch official Node checksums.');return response.text();});const expected=sums.split(/\r?\n/).find(line=>line.endsWith('  '+name))?.split(/\s+/)[0];if(!expected)throw new Error('Official Node checksum missing.');
 const archive=await download(base+name,name,expected),stage=path.join(root,'build','node-extracted');await expand(archive,stage);await fs.mkdir(nodeTarget,{recursive:true});const extracted=path.join(stage,`node-v${config.nodeVersion}-win-x64`);await fs.copyFile(path.join(extracted,'node.exe'),path.join(nodeTarget,'node.exe'));await fs.copyFile(path.join(extracted,'LICENSE'),path.join(nodeTarget,'LICENSE.txt'));
}
const dependencies=[
 {target:'git',executable:'cmd/git.exe',name:'MinGit-2.56.1-64-bit.zip',url:'https://github.com/git-for-windows/git/releases/download/v2.56.1.windows.1/MinGit-2.56.1-64-bit.zip',sha:'4a92850b6e917da4fd010669b614b55dccf5b0ec333a534cc4be4700dfefdafd'},
 {target:'svn',executable:'bin/svn.exe',name:'Apache-Subversion-1.15.0-x64.zip',url:'https://www.visualsvn.com/files/Apache-Subversion-1.15.0-x64.zip',sha:'98bb798dd6c70cc875b9bdacd600594351cf88f0a39a831a5055df061c871bb5'},
];
for(const dependency of dependencies){const target=path.join(root,'runtime',dependency.target);if(await fs.stat(path.join(target,dependency.executable)).then(()=>true,()=>false))continue;const archive=await download(dependency.url,dependency.name,dependency.sha);await expand(archive,target);}
console.log('Bundled Windows runtime is ready. Official archives and license files are preserved.');
