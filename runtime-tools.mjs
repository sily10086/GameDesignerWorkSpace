import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
const here=path.dirname(fileURLToPath(import.meta.url));
export const home=process.env.GDWS_HOME||([here,path.dirname(here)].find(p=>fs.existsSync(path.join(p,'Runtime')))||here);
export const runtime=fs.existsSync(path.join(home,'Runtime'))?path.join(home,'Runtime'):path.join(home,'runtime');
export function toolPath(name){const candidates=name==='git'?['git/cmd/git.exe']:name==='svn'?['svn/bin/svn.exe']:name==='svnadmin'?['svn/bin/svnadmin.exe']:['node/node.exe'];return candidates.map(p=>path.join(runtime,p)).find(p=>fs.existsSync(p))||(name==='node'?process.execPath:name);}
export const toolEnv=()=>({...process.env,PATH:[path.join(runtime,'node'),path.join(runtime,'git','cmd'),path.join(runtime,'git','usr','bin'),path.join(runtime,'git','ucrt64','bin'),path.join(runtime,'svn','bin'),process.env.PATH||'',path.join(process.env.SystemRoot||'C:\\Windows','System32')].join(path.delimiter),GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',GIT_CONFIG_NOSYSTEM:'1',SVN_ASP_DOT_NET_HACK:undefined});
export function runTool(name,args,{cwd,input='',env={},timeout=180000,allowFailure=false}={}){return new Promise((resolve,reject)=>{
 const child=spawn(toolPath(name),args,{cwd,env:{...toolEnv(),...env},windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='',settled=false;const outDecoder=new StringDecoder('utf8'),errDecoder=new StringDecoder('utf8');
 const timer=setTimeout(()=>{child.kill();finish(new Error('版本控制操作超时，请检查网络和仓库地址。'));},timeout);
 const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve({code:child.exitCode,stdout:out,stderr:err});};
 child.stdout.on('data',b=>{out+=outDecoder.write(b);if(out.length>16*1024*1024){child.kill();finish(new Error('仓库输出过大，请先缩小待处理范围。'));}});child.stderr.on('data',b=>{if(err.length<1024*1024)err+=errDecoder.write(b);});child.on('error',e=>finish(new Error('无法启动 '+name+'，请检查 Runtime 内置依赖。'+e.message)));child.on('close',code=>{out+=outDecoder.end();err+=errDecoder.end();if(code&&!allowFailure)finish(new Error((err||out||name+' 操作失败').trim().slice(-3000)));else finish();});child.stdin.on('error',()=>{});child.stdin.end(input);
});}
export async function toolStatus(){const result={};for(const name of ['node','git','svn']){try{const version=await runTool(name,name==='svn'?['--version','--quiet']:['--version'],{timeout:10000});result[name]={available:true,bundled:path.isAbsolute(toolPath(name))&&toolPath(name).startsWith(runtime),version:version.stdout.trim()};}catch(error){result[name]={available:false,error:error.message};}}return result;}
