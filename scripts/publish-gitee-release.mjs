// 用 Gitee 私人令牌（API v5）创建/填补 v1.7.1 发行版并上传安装包。
// 关键：Gitee 清单里的 sha256 对齐的是 GitHub Actions 正式版的附件，
//       所以必须从 GitHub 正式 Release 原样下载附件再上传，不能用本机构建产物。
// 令牌只从环境变量 GITEE_TOKEN 读取，不写入项目、不回显。GitHub token 从 git 凭据读取。
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';

import {createHash as _h} from 'node:crypto';
// 令牌只从环境变量或临时文件读取，绝不写入项目、绝不回显。
let giteeToken=process.env.GITEE_TOKEN;
if(!giteeToken){
  const tokenFile=process.env.GITEE_TOKEN_FILE;
  if(!tokenFile)throw new Error('请设置 GITEE_TOKEN 或 GITEE_TOKEN_FILE。');
  giteeToken=(await fs.readFile(tokenFile,'utf8')).trim();
}
if(!giteeToken)throw new Error('Gitee 令牌为空。');

const owner='YuAStudio',repo='game-designer-work-space',version='1.7.1',tag='v'+version;
const ghApi='https://api.github.com/repos/sily10086/GameDesignerWorkSpace';
const giteeApi='https://gitee.com/api/v5/repos/'+owner+'/'+repo;
const ghReleaseId='451621373'; // GitHub Actions 自动发布的正式版（releases/latest 指向它）
const outDir='D:/releases/gh-official';
const notesFile='D:/WorkerSpace-src/RELEASE_NOTES.md';

// ---- GitHub token（仅内存，不回显） ----
const cred=await new Promise((res,rej)=>{
  const c=execFile('git',['-c','credential.interactive=never','credential','fill'],{env:{...process.env,GIT_TERMINAL_PROMPT:'0'}},(e,so)=>e?rej(e):res(so));
  c.stdin.end('protocol=https\nhost=github.com\n\n');
});
const ghToken=cred.split(/\r?\n/).find(l=>l.startsWith('password='))?.slice(9);

async function retry(fn,times=6){
  let last;
  for(let i=0;i<times;i++){
    try{return await fn();}catch(e){
      // 令牌经 URL 参数传递，网络异常可能把完整 URL 带进错误消息 —— 统一脱敏后再传播。
      if(e&&e.message)e.message=String(e.message).split(giteeToken).join('<token>').split(ghToken||'\0').join('<gh-token>');
      last=e;
      if(/timeout|fetch failed|ECONN|socket|abort/i.test(e.message)){await new Promise(r=>setTimeout(r,1500*(i+1)));continue;}
      throw e;
    }
  }
  throw last;
}
async function ghJson(url){
  return retry(async()=>{
    const r=await fetch(url,{headers:{'User-Agent':'GDWS-Gitee-Publisher','Accept':'application/vnd.github+json',...(ghToken?{Authorization:'Bearer '+ghToken}:{})},signal:AbortSignal.timeout(90000)});
    const t=await r.text();if(!r.ok)throw new Error(r.status+' '+t.slice(0,160));return JSON.parse(t);
  });
}
async function giteeJson(url,{method='GET',params={},form}={}){
  return retry(async()=>{
    const opts={method,headers:{'User-Agent':'GDWS-Gitee-Publisher','Accept':'application/json'},signal:AbortSignal.timeout(3600000)};
    let target=url;
    if(method==='GET'){
      // 读操作是公开的：匿名访问，令牌不放 URL —— 避免网关 414（URI Too Large）。
      const u=new URL(url);
      for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);
      target=u.toString();
    }else{
      // 写操作：把令牌和参数放请求体（含很长的发行说明），同样避免撑爆 URL。
      const fields=new URLSearchParams();
      for(const [k,v] of Object.entries(params))fields.set(k,String(v));
      fields.set('access_token',giteeToken);
      opts.body=fields.toString();
      opts.headers['Content-Type']='application/x-www-form-urlencoded';
    }
    if(form){opts.body=form;target=new URL(url);target.searchParams.set('access_token',giteeToken);target=target.toString();}
    const r=await fetch(target,opts);
    const t=await r.text();let d;try{d=JSON.parse(t);}catch{d={raw:t.slice(0,200)};}
    if(!r.ok)throw new Error(r.status+' '+JSON.stringify(d).slice(0,300));
    if(d&&typeof d.message==='string'&&/invalid token|401|expired/i.test(d.message))throw new Error('令牌无效: '+d.message);
    return d;
  });
}

// ---- 1. 从 GitHub 正式版下载 4 个附件 ----
await fs.mkdir(outDir,{recursive:true});
const rel=await ghJson(ghApi+'/releases/'+ghReleaseId);
console.log('GitHub 正式版:',rel.tag_name,'附件数',rel.assets.length,'draft='+rel.draft);
const wantNames=[
  'GameDesignerWorkerSpace-Setup-'+version+'-x64.exe',
  'GameDesignerWorkerSpace-'+version+'-Windows-x64.zip',
  'update-manifest.json','SHA256SUMS.txt'
];
// 大文件用「断点续传 + 流式写入」：连接中断后从已下载字节继续，不重头来。
async function downloadResume(url,dest,expectedSize,label){
  for(let attempt=0;attempt<40;attempt++){
    let current=0;
    try{current=(await fs.stat(dest)).size;}catch{}
    if(current>=expectedSize)return;
    try{
      const r=await fetch(url,{
        headers:{Range:'bytes='+current+'-','User-Agent':'GDWS-Gitee-Publisher','Accept':'application/octet-stream'},
        redirect:'follow',signal:AbortSignal.timeout(240000)});
      if(r.status!==206&&r.status!==200)throw new Error('HTTP '+r.status);
      if(r.status===200)current=0; // 服务器忽略 Range，从头写
      const handle=await fs.open(dest,current===0?'w':'a');
      try{
        const reader=r.body.getReader();
        for(;;){
          const {done,value}=await reader.read();
          if(done)break;
          if(value&&value.length){await handle.write(value);current+=value.length;}
        }
      }finally{await handle.close();}
      if(current>=expectedSize)return;
      console.log('  续传 '+label+' '+current+'/'+expectedSize);
    }catch(e){
      const msg=String(e.message).split(giteeToken).join('<token>').slice(0,90);
      console.log('  中断，重试 '+(attempt+1)+' '+label+' '+current+'/'+expectedSize+' '+msg);
      await new Promise(res=>setTimeout(res,1200));
    }
  }
  throw new Error('下载失败（重试耗尽）: '+label);
}
for(const asset of rel.assets){
  if(!wantNames.includes(asset.name))continue;
  const dest=path.join(outDir,asset.name);
  let size=0;try{size=(await fs.stat(dest)).size;}catch{}
  if(size===asset.size){console.log('已存在，跳过下载',asset.name,size);continue;}
  console.log('下载',asset.name,asset.size,'字节（断点续传）...');
  await downloadResume(asset.browser_download_url,dest,asset.size,asset.name);
  const finalSize=(await fs.stat(dest)).size;
  if(finalSize!==asset.size)throw new Error('大小不符 '+asset.name+' 得到 '+finalSize+' 期望 '+asset.size);
  console.log('已下载',asset.name,finalSize);
}

// ---- 2. 校验下载包 sha 与清单一致（不一致则中止，绝不上传） ----
const manifest=JSON.parse(await fs.readFile(path.join(outDir,'update-manifest.json'),'utf8'));
if(manifest.version!==version)throw new Error('清单版本不符 '+manifest.version);
for(const item of [manifest.installer,manifest.portable]){
  const buf=await fs.readFile(path.join(outDir,item.name));
  const sha=createHash('sha256').update(buf).digest('hex');
  if(sha!==item.sha256)throw new Error('SHA 不匹配 '+item.name+'\n 得到 '+sha+'\n 期望 '+item.sha256);
  console.log('校验通过',item.name,sha.slice(0,16));
}
console.log(' GitHub 正式版附件与清单一致，开始上传 Gitee');

// ---- 3. 找或建 Gitee 发行版 ----
const releases=await giteeJson(giteeApi+'/releases',{params:{per_page:100}});
let release=releases.find(r=>r.tag_name===tag);
if(!release){
  const notes=await fs.readFile(notesFile,'utf8').catch(()=>'');
  release=await giteeJson(giteeApi+'/releases',{method:'POST',params:{tag_name:tag,name:'GameDesignerWorkerSpace '+tag,body:notes,target_commitish:'master',prerelease:false}});
  console.log('已创建 Gitee 发行版',tag,'id='+release.id);
}else{
  console.log('找到 Gitee 发行版',tag,'id='+release.id);
}

// ---- 4. 上传缺失附件（multipart：URL 带 token，body 只有 file） ----
const have=new Set((release.assets||[]).map(a=>a.name));
for(const name of wantNames){
  if(have.has(name)){console.log('跳过已存在',name);continue;}
  const buf=await fs.readFile(path.join(outDir,name));
  const boundary='----GDWS'+createHash('md5').update(String(Date.now()+name)).digest('hex');
  const head=Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+name+'"\r\nContent-Type: application/octet-stream\r\n\r\n');
  const tail=Buffer.from('\r\n--'+boundary+'--\r\n');
  const body=Buffer.concat([head,buf,tail]);
  const u=new URL(giteeApi+'/releases/'+release.id+'/attach_files');
  u.searchParams.set('access_token',giteeToken);
  await retry(async()=>{
    const r=await fetch(u,{method:'POST',headers:{'User-Agent':'GDWS-Gitee-Publisher','Content-Type':'multipart/form-data; boundary='+boundary},body,signal:AbortSignal.timeout(3600000)});
    const t=await r.text();let o;try{o=JSON.parse(t);}catch{o={raw:t.slice(0,200)};}
    if(!r.ok)throw new Error('上传失败 '+name+' '+r.status+' '+JSON.stringify(o).slice(0,300));
  });
  console.log('已上传',name,buf.length,'sha256='+createHash('sha256').update(buf).digest('hex').slice(0,12));
}

// ---- 5. 校验 Gitee 下载地址 ----
const final=await giteeJson(giteeApi+'/releases/'+release.id);
console.log('Gitee 发行版附件:',(final.assets||[]).map(a=>a.name).join(', '));
const setup=(final.assets||[]).find(a=>a.name===wantNames[0]);
if(!setup)throw new Error('安装包附件缺失');
const dl=setup.browser_download_url||('https://gitee.com/'+owner+'/'+repo+'/releases/download/'+tag+'/'+wantNames[0]);
const probe=await fetch(dl,{headers:{Range:'bytes=0-1023','User-Agent':'GDWS-Gitee-Publisher'},redirect:'follow',signal:AbortSignal.timeout(180000)});
const bytes=(await probe.arrayBuffer()).byteLength;
console.log('安装包下载探测 HTTP',probe.status,'字节',bytes,'地址',dl);
if(probe.status!==206&&probe.status!==200)throw new Error('下载地址不可用: HTTP '+probe.status);
console.log('完成: Gitee '+tag+' 已就绪，两源 sha 一致');
