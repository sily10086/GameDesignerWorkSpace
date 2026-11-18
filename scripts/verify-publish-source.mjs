import fs from 'node:fs/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const {stdout}=await promisify(execFile)('git',['ls-files','-z'],{maxBuffer:8*1024*1024,windowsHide:true});const files=stdout.split('\0').filter(Boolean);
if(!files.length)throw new Error('No source files staged.');
const excluded=/^(?:Project|Projects|Data|Logs|runtime|build|node_modules|artifacts|\.workbench|\.svn|\.gdws)(?:\/|$)/i;
let size=0;for(const file of files){if(excluded.test(file))throw new Error('Private or generated data included: '+file);const data=await fs.readFile(file);size+=data.length;const text=data.toString('utf8');if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,})\b/.test(text))throw new Error('Possible private credential in '+file);}
console.log(JSON.stringify({files:files.length,bytes:size,projectAndCredentialsExcluded:true}));
