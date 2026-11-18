import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from './server.mjs';

const appRoot=path.dirname(fileURLToPath(import.meta.url));
const normalize=value=>{const resolved=path.resolve(value);return process.platform==='win32'?resolved.toLowerCase():resolved;};
export async function probeWorkbench({root=appRoot,port=4173}={}){
 const url=`http://127.0.0.1:${port}`;
 if(port===0)return {running:false,matching:false,url};
 try{
  // The fallback also supports a workbench started before the launcher update.
  let response=await fetch(url+'/api/health',{signal:AbortSignal.timeout(2000)});
  if(response.status===404)response=await fetch(url+'/api/workspace',{signal:AbortSignal.timeout(3000)});
  const data=await response.json().catch(()=>null);
  const matching=Boolean(response.ok&&typeof data?.directory==='string'&&normalize(data.directory)===normalize(path.join(root,'Project')));
  return {running:true,matching,url,directory:data?.directory||null};
 }catch(error){if(error.cause?.code==='ECONNREFUSED')return {running:false,matching:false,url};throw new Error('无法确认端口上的服务状态，请打开 '+url+' 检查。');}
}
export function openBrowser(url){return new Promise((resolve,reject)=>{
 const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';
 const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
 const child=spawn(command,args,{windowsHide:true,stdio:'ignore',detached:true});
 child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});
});}
export async function launchWorkbench({root=appRoot,port=4173,open=openBrowser,log=console.log}={}){
 const show=async(url)=>{try{await open(url);}catch{log('浏览器未能自动打开，请手动访问：'+url);}};
 const existing=await probeWorkbench({root,port});
 if(existing.running){if(!existing.matching)throw new Error(`端口 ${port} 正由另一个程序或另一个项目工作台使用，请关闭对应服务后再启动本目录。`);log('工作台已在运行，正在打开现有页面：'+existing.url);await show(existing.url);return {reused:true,url:existing.url,close:async()=>{}};}
 let app;
 try{app=await createServer({root});}catch(error){
  if(error.message.includes('已有工作台服务'))for(let attempt=0;attempt<20;attempt++){
   await new Promise(resolve=>setTimeout(resolve,100));const concurrent=await probeWorkbench({root,port});
   if(concurrent.matching){log('工作台已在运行，正在打开现有页面：'+concurrent.url);await show(concurrent.url);return {reused:true,url:concurrent.url,close:async()=>{}};}
  }
  throw error;
 }
 try{await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(port,'127.0.0.1',resolve);});}catch(error){await app.close();if(error.code==='EADDRINUSE'){const concurrent=await probeWorkbench({root,port});if(concurrent.matching){await show(concurrent.url);return {reused:true,url:concurrent.url,close:async()=>{}};}}throw error;}
 const url='http://127.0.0.1:'+app.server.address().port;
 log('工作台已启动：'+url);log('项目文件：'+app.store.directory);log('请保持此窗口开启。重复双击启动文件会直接打开现有工作台。');
 await show(url);return {...app,reused:false,url};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const app=await launchWorkbench();if(!app.reused)for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void app.close());}catch(error){console.error('工作台启动失败：'+error.message);process.exitCode=1;}
}
