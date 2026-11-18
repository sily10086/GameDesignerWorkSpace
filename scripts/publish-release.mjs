import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const run=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repository='sily10086/GameDesignerWorkSpace',api='https://api.github.com/repos/'+repository;
let token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
if(!token){const credential=await new Promise((resolve,reject)=>{const child=execFile('git',['-c','credential.interactive=never','credential','fill'],{env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'},windowsHide:true,timeout:20000},(error,stdout)=>error?reject(new Error('没有可用的 GitHub 发布凭据。请登录 Git Credential Manager 或设置 GH_TOKEN。')):resolve(stdout));child.stdin.end('protocol=https\nhost=github.com\n\n');});token=credential.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);}
if(!token)throw new Error('GitHub credential unavailable.');
async function request(url,{method='GET',json,body,type='application/json'}={}){
 if(!url.startsWith(api)&&!url.startsWith('https://uploads.github.com/repos/'+repository+'/'))throw new Error('Unexpected GitHub publishing destination.');
 const response=await fetch(url,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'GameDesignerWorkerSpace-Publisher','Content-Type':type},body:json?JSON.stringify(json):body,signal:AbortSignal.timeout(300000)});
 const data=await response.json().catch(()=>({}));if(!response.ok){if(response.status===404&&method==='GET')return {notFound:true};throw new Error('GitHub '+method+' failed ('+response.status+'): '+(data.message||''));}return data;
}
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')),version=pkg.version,tag='v'+version,artifacts=path.resolve(root,'..','..','releases');
const manifest=JSON.parse(await fs.readFile(path.join(artifacts,'update-manifest.json'),'utf8'));
if(manifest.version!==version||manifest.repository!==repository)throw new Error('Release manifest does not match source version.');
for(const asset of [manifest.installer,manifest.portable]){const data=await fs.readFile(path.join(artifacts,asset.name));if(data.length!==asset.size||createHash('sha256').update(data).digest('hex')!==asset.sha256)throw new Error('Release asset changed after validation.');}
const repo=await request(api);if(!repo.permissions?.push)throw new Error('Authenticated GitHub account cannot write to the release repository.');
const commit=(await run('git',['rev-parse','HEAD'],{cwd:root,windowsHide:true})).stdout.trim();
let release=await request(api+'/releases/tags/'+tag);
if(!release.notFound&&!release.draft){if(process.env.GITHUB_ACTIONS==='true'){console.log('Version already published; keeping existing immutable release: '+release.html_url);process.exit(0);}throw new Error('此版本已经发布，请提升版本号后再发布。');}
if(release.notFound){release=await request(api+'/releases',{method:'POST',json:{tag_name:tag,target_commitish:commit,name:'GameDesignerWorkerSpace '+tag,body:await fs.readFile(path.join(root,'RELEASE_NOTES.md'),'utf8'),draft:true,prerelease:false}});}
for(const name of [manifest.installer.name,manifest.portable.name,'update-manifest.json','SHA256SUMS.txt']){
 const data=await fs.readFile(path.join(artifacts,name)),hash='sha256:'+createHash('sha256').update(data).digest('hex');
 const existing=release.assets?.find(asset=>asset.name===name);if(existing){if(existing.digest!==hash)throw new Error('Existing draft asset differs: '+name);continue;}
 const uploaded=await request(release.upload_url.replace(/\{.*$/,'')+'?name='+encodeURIComponent(name),{method:'POST',body:data,type:name.endsWith('.json')?'application/json':'application/octet-stream'});
 if(uploaded.size!==data.length||uploaded.digest&&uploaded.digest!==hash)throw new Error('Uploaded release checksum mismatch: '+name);
 console.log('Uploaded '+name);
}
release=await request(api+'/releases/'+release.id,{method:'PATCH',json:{draft:false,make_latest:'true'}});
console.log('Published '+release.html_url);
