import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const run=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),tool=path.join(root,'build','tools','Utf8Runtime.exe');
await fs.mkdir(path.dirname(tool),{recursive:true});
const originals=['svn.exe','svnadmin.exe'].map(name=>path.join(root,'runtime','svn','bin',name)),hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex'),before=await Promise.all(originals.map(hash));
await run(path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe'),['/nologo','/target:exe','/platform:x64','/out:'+tool,'/r:System.Xml.Linq.dll',path.join(root,'desktop','Utf8Runtime.cs')],{windowsHide:true});
await run(tool,[path.join(root,'runtime','svn','bin')],{windowsHide:true});if((await Promise.all(originals.map(hash))).some((value,index)=>value!==before[index]))throw new Error('Upstream SVN binaries must remain unchanged.');console.log('App-local UTF-8 SVN copies prepared; original vendor binaries are unchanged.');
