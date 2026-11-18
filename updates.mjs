import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const appRoot=path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY='sily10086/GameDesignerWorkSpace';
export function versionParts(value){const match=String(value).match(/^v?(\d+)\.(\d+)\.(\d+)$/);if(!match)throw new Error('版本号无效。');return match.slice(1).map(Number);}
export function compareVersions(a,b){const left=versionParts(a),right=versionParts(b);for(let i=0;i<3;i++)if(left[i]!==right[i])return left[i]>right[i]?1:-1;return 0;}
export function parseRelease(release,currentVersion){
 if(!release||release.draft||release.prerelease)throw new Error('不是可用的正式版本。');
 const version=String(release.tag_name||'').replace(/^v/,'');versionParts(version);
 const prefix=`https://github.com/${REPOSITORY}/releases/`,url=String(release.html_url||'');
 if(!url.startsWith(prefix+'tag/'))throw new Error('更新地址不属于工作台官方仓库。');
 const manifest=release.assets?.find(asset=>asset.name==='update-manifest.json');
 if(!manifest||!String(manifest.browser_download_url).startsWith(prefix+'download/'))throw new Error('此版本尚未提供完整的更新包。');
 return {repository:REPOSITORY,currentVersion,latestVersion:version,available:compareVersions(version,currentVersion)>0,releaseURL:url,notes:String(release.body||'').slice(0,12000),publishedAt:release.published_at,manifestURL:manifest.browser_download_url,protectedDirectories:['Project','Projects','Data','Logs','.workbench'],managedDirectories:['App','Runtime','Documents']};
}
export async function currentVersion(){for(const file of ['version.json','package.json'])try{return JSON.parse(await fs.readFile(path.join(appRoot,file),'utf8')).version;}catch{}throw new Error('无法读取工作台版本。');}
export async function checkForUpdates({fetcher=fetch,version}={}){
 const current=version||await currentVersion();
 const response=await fetcher(`https://api.github.com/repos/${REPOSITORY}/releases/latest`,{headers:{Accept:'application/vnd.github+json','User-Agent':'GameDesignerWorkerSpace-Updater'},signal:AbortSignal.timeout(15000)});
 const canInstall=Boolean(process.env.GDWS_HOME&&await fs.stat(path.join(process.env.GDWS_HOME,'App','Tools','Updater.exe')).then(()=>true,()=>false));
 if(response.status===404)return {repository:REPOSITORY,currentVersion:current,available:false,unpublished:true,canInstall,releaseURL:`https://github.com/${REPOSITORY}/releases`,message:'仓库尚未发布正式安装包。'};
 if(!response.ok)throw new Error(response.status===403||response.status===429?'GitHub 检查请求受到限制，请稍后重试。':'无法连接 GitHub 更新服务（'+response.status+'）。');
 return {...parseRelease(await response.json(),current),canInstall};
}
export async function openUpdater(){
 const root=process.env.GDWS_HOME;if(!root)throw new Error('源码预览模式请从 GitHub 下载新版安装包；安装版支持内置更新程序。');
 const executable=path.join(root,'App','Tools','Updater.exe');await fs.access(executable);
 await new Promise((resolve,reject)=>{const child=spawn(executable,['--root',root],{detached:true,stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
 return {opened:true};
}
