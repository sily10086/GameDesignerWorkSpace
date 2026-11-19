import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const appRoot=path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY='sily10086/GameDesignerWorkSpace';
export const GITEE_REPOSITORY='YuAStudio/game-designer-work-space';
export const UPDATE_SOURCES=[{id:'github',name:'GitHub',manifestURL:`https://github.com/${REPOSITORY}/releases/latest/download/update-manifest.json`,releaseURL:`https://github.com/${REPOSITORY}/releases`},{id:'gitee',name:'Gitee',manifestURL:`https://gitee.com/${GITEE_REPOSITORY}/raw/updates/update-manifest.json`,releaseURL:`https://gitee.com/${GITEE_REPOSITORY}/releases`}];
export function installerURLs(asset,version){const name=`GameDesignerWorkerSpace-Setup-${version}-x64.exe`,github=`https://github.com/${REPOSITORY}/releases/download/v${version}/${name}`,giteePrefix=`https://gitee.com/${GITEE_REPOSITORY}/releases/download/v${version}/`;const urls=[github];for(const url of asset?.mirrors||[]){if(typeof url!=='string'||!url.startsWith(giteePrefix)||decodeURIComponent(url.slice(giteePrefix.length))!==name)throw new Error('镜像安装包地址无效。');if(!urls.includes(url))urls.push(url);}return urls;}
export function versionParts(value){const match=String(value).match(/^v?(\d+)\.(\d+)\.(\d+)$/);if(!match)throw new Error('版本号无效。');return match.slice(1).map(Number);}
export function compareVersions(a,b){const left=versionParts(a),right=versionParts(b);for(let i=0;i<3;i++)if(left[i]!==right[i])return left[i]>right[i]?1:-1;return 0;}
export function parseUpdateManifest(manifest,currentVersion){
 if(!manifest||manifest.schema!==1||manifest.application!=='GameDesignerWorkerSpace'||manifest.repository!==REPOSITORY||manifest.platform!=='win32-x64')throw new Error('此更新包不适用于当前工作台。');
 const version=manifest.version;versionParts(version);const prefix=`https://github.com/${REPOSITORY}/releases/`,name=`GameDesignerWorkerSpace-Setup-${version}-x64.exe`,installer=manifest.installer;
 if(installer?.name!==name||installer.url!==prefix+`download/v${version}/${name}`||!(/^[a-f0-9]{64}$/i).test(installer.sha256)||!Number.isSafeInteger(installer.size)||installer.size<1||installer.size>1024**3)throw new Error('安装包地址或校验信息无效。');
 installerURLs(installer,version);
 const managed=['GameDesignerWorkerSpace.exe','App','Runtime','Documents'],protectedRoots=['Project','Projects','Data','Logs','.workbench','.git','.svn','.gdws'];
 for(const [key,required] of [['managedRoots',managed],['protectedRoots',protectedRoots]])if(!Array.isArray(manifest[key])||manifest[key].length!==required.length||!required.every(value=>manifest[key].includes(value)))throw new Error('更新范围不符合项目保护规则。');
 return {repository:REPOSITORY,currentVersion,latestVersion:version,available:compareVersions(version,currentVersion)>0,releaseURL:prefix+`tag/v${version}`,notes:String(manifest.notes||'').slice(0,12000),manifestURL:prefix+'latest/download/update-manifest.json',protectedDirectories:protectedRoots,managedDirectories:['App','Runtime','Documents']};
}
export async function currentVersion(){for(const file of ['version.json','package.json'])try{return JSON.parse(await fs.readFile(path.join(appRoot,file),'utf8')).version;}catch{}throw new Error('无法读取工作台版本。');}
export async function checkForUpdates({fetcher=fetch,version}={}){
 const current=version||await currentVersion();
 const canInstall=Boolean(process.env.GDWS_HOME&&await fs.stat(path.join(process.env.GDWS_HOME,'App','Tools','Updater.exe')).then(()=>true,()=>false));
 return new Promise((resolve,reject)=>{let pending=UPDATE_SOURCES.length,finished=false;const results=[],failures=[],controllers=UPDATE_SOURCES.map(()=>new AbortController());
  const finish=info=>{if(finished)return;finished=true;controllers.forEach(c=>c.abort());resolve(info);};
  UPDATE_SOURCES.forEach(async(source,index)=>{const timer=setTimeout(()=>controllers[index].abort(),10000);try{
   const response=await fetcher(source.manifestURL,{headers:{Accept:'application/json','User-Agent':'GameDesignerWorkerSpace-Updater'},signal:controllers[index].signal});
   if(!response.ok)throw new Error(String(response.status));
   const manifest=await response.json(),info={...parseUpdateManifest(manifest,current),canInstall,source:source.id,sourceName:source.name,manifestURL:source.manifestURL,releaseURL:source.releaseURL+'/tag/v'+manifest.version};
   if(source.id==='gitee')info.releaseURL=source.releaseURL+'/v'+manifest.version;
   results.push(info);if(info.available)finish(info);
  }catch(error){failures.push({source:source.name,status:error.message});}finally{clearTimeout(timer);if(--pending===0&&!finished){if(results.length)finish(results.sort((a,b)=>compareVersions(b.latestVersion,a.latestVersion))[0]);else if(failures.every(f=>f.status==='404'))finish({repository:REPOSITORY,currentVersion:current,available:false,unpublished:true,canInstall,releaseURL:UPDATE_SOURCES[1].releaseURL,message:'尚未发布正式安装包。'});else reject(new Error('GitHub 和 Gitee 均暂时无法读取更新，请稍后重试。'));}}
  });
 });
}
export async function openUpdater(){
 const root=process.env.GDWS_HOME;if(!root)throw new Error('源码预览模式请从 GitHub 下载新版安装包；安装版支持内置更新程序。');
 const executable=path.join(root,'App','Tools','Updater.exe');await fs.access(executable);
 await new Promise((resolve,reject)=>{const child=spawn(executable,['--root',root],{detached:true,stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
 return {opened:true};
}
