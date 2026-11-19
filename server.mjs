import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {randomUUID} from 'node:crypto';
import {ProjectStore,StorageError,MAX_IMAGE_BYTES} from './storage.mjs';
import {RepositoryManager} from './vcs.mjs';
import {toolStatus} from './runtime-tools.mjs';
import {checkForUpdates,openUpdater} from './updates.mjs';
const appRoot=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function readBody(req){if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new StorageError('请求必须使用 JSON。',415);const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>50*1024*1024)throw new StorageError('请求内容超过 50 MB。',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new StorageError('请求 JSON 无效。');}}
async function acquireLock(root){
 const folder=path.join(path.resolve(root),'.workbench');await fs.mkdir(folder,{recursive:true});if((await fs.lstat(folder)).isSymbolicLink())throw new StorageError('.workbench 不支持符号链接。',409);
 const file=path.join(folder,'server.lock'),token=randomUUID();
 for(let attempt=0;attempt<2;attempt++)try{await fs.writeFile(file,JSON.stringify({pid:process.pid,token}),{flag:'wx'});let releasing;return ()=>releasing??=(async()=>{try{const owner=JSON.parse(await fs.readFile(file,'utf8'));if(owner.token===token)await fs.unlink(file);}catch(e){if(e.code!=='ENOENT')throw e;}})();}catch(e){if(e.code!=='EEXIST')throw e;let owner;try{owner=JSON.parse(await fs.readFile(file,'utf8'));}catch{throw new StorageError('工作台锁文件无效，请确认没有其他服务后检查 '+file,409);}let running=true;try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')running=false;else throw error;}if(running)throw new StorageError('已有工作台服务正在使用此 Project。请关闭旧服务后再启动。',409);await fs.unlink(file);}
 throw new StorageError('无法获取工作台文件锁。',409);
}
export async function createServer({root=appRoot,dataDirectory=process.env.GDWS_DATA_DIR,externalRoot=process.env.GDWS_PROJECTS_DIR}={}){
 const release=await acquireLock(root);const store=new ProjectStore(root,{dataDirectory,externalRoot});try{await store.init();}catch(e){await release();throw e;}const repositories=new RepositoryManager(store);const staticRoot=path.join(appRoot,'dist');
 const server=http.createServer(async(req,res)=>{try{
  const host=req.headers.host||'';if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))throw new StorageError('仅允许本机访问。',403);
  if(req.headers.origin&&req.headers.origin!==`http://${host}`)throw new StorageError('不允许跨站写入项目文件。',403);
  const pathname=decodeURIComponent(new URL(req.url,'http://'+host).pathname);
  if(pathname.startsWith('/api/')){
   const documentImageRoute=pathname.match(/^\/api\/projects\/([A-Za-z0-9_-]+)\/docs\/([A-Za-z0-9_-]+)\/images(?:\/([^/]+))?$/);
   if(documentImageRoute){const [,id,docId,name]=documentImageRoute;
    try{
     if(req.method==='POST'&&!name){
      if(!/^image\/(png|jpeg|gif|webp|avif)(?:;|$)/i.test(req.headers['content-type']||''))throw new StorageError('请选择支持的图片文件。',415);
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_IMAGE_BYTES)throw new StorageError('图片超过 20 MB。',413);chunks.push(chunk);}
      return send(res,201,await store.serialize(()=>store.writeDocumentImage(id,docId,Buffer.concat(chunks))));
     }
     if(name&&(req.method==='GET'||req.method==='HEAD')){
      const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif'}[path.extname(name).toLowerCase()];if(!mime)throw new StorageError('不支持此图片类型。',415);
      const image=await store.serialize(()=>store.readDocumentImage(id,docId,name));res.writeHead(200,{'Content-Type':mime,'Content-Length':image.data.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});return res.end(req.method==='HEAD'?undefined:image.data);
     }
     return send(res,405,{error:'不支持此图片请求。'});
    }catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')throw new StorageError('项目、文档或图片不存在。',404);throw error;}
   }
   const attachmentRoute=pathname.match(/^\/api\/projects\/([A-Za-z0-9_-]+)\/attachments\/(.+)$/);
   if(attachmentRoute&&(req.method==='GET'||req.method==='HEAD')){
    const imageTypes={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif'};
    const mime=imageTypes[path.extname(attachmentRoute[2]).toLowerCase()];if(!mime)throw new StorageError('不支持此附件类型。',415);
    try{const attachment=await store.serialize(()=>store.attachment(attachmentRoute[1],attachmentRoute[2]));res.writeHead(200,{'Content-Type':mime,'Content-Length':attachment.data.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});return res.end(req.method==='HEAD'?undefined:attachment.data);}catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')throw new StorageError('附件不存在。',404);throw error;}
   }
   if(pathname==='/api/app-update'&&req.method==='GET'){try{return send(res,200,await checkForUpdates());}catch(error){throw new StorageError(error.message,502);}}
   if(pathname==='/api/app-update/open'&&req.method==='POST'){await readBody(req);try{return send(res,200,await openUpdater());}catch(error){throw new StorageError(error.message,409);}}
   if(pathname==='/api/health'&&req.method==='GET')return send(res,200,{app:'GameDesignerWorkerSpace',directory:store.directory,root:path.resolve(root),pid:process.pid});
   if(pathname==='/api/workspace'&&req.method==='GET')return send(res,200,await store.serialize(async()=>({state:await store.load(),directory:store.externalRoot||store.directory,projectInfo:await repositories.projectInfo(),issues:store.mountIssues})));
   if(pathname==='/api/tools'&&req.method==='GET')return send(res,200,await toolStatus());
   if(pathname==='/api/projects/link'&&req.method==='POST'){const body=await readBody(req);return send(res,200,await store.serialize(()=>repositories.importLink(body)));}
   if(pathname==='/api/projects/attach'&&req.method==='POST'){const body=await readBody(req);return send(res,200,await store.serialize(()=>repositories.attach(body.directory,Boolean(body.replace))));}
   const projectRoute=pathname.match(/^\/api\/projects\/([A-Za-z0-9_-]+)\/(status|bind|upload|update|separate|detach)$/);
   if(projectRoute){const [,id,action]=projectRoute;if(req.method==='GET'&&action==='status')return send(res,200,await store.serialize(()=>repositories.status(id)));if(req.method==='POST'){const body=await readBody(req);return send(res,200,await store.serialize(()=>action==='status'?repositories.status(id,body.credentials):action==='bind'?repositories.bind(id,body):action==='upload'?repositories.upload(id,body):action==='update'?repositories.update(id,body.credentials):action==='detach'?store.detach(id):store.separate(id).then(directory=>({directory}))));}}
   if(pathname==='/api/trash/purge'&&req.method==='POST'){const body=await readBody(req);if(!Array.isArray(body.ids)||!body.ids.length)throw new StorageError('需要指定要清理的项目。');return send(res,200,await store.save(body.base,body.state,{purge:body.ids}));}
   if(pathname==='/api/workspace'&&req.method==='PUT'){const body=await readBody(req);return send(res,200,await store.save(body.base,body.state));}
   if(pathname==='/api/migrate-browser'&&req.method==='POST'){const body=await readBody(req);return send(res,200,await store.importLegacy(body.state));}
   if(pathname==='/api/recovery'&&req.method==='POST'){const body=await readBody(req);return send(res,200,{file:await store.recovery(body.state)});}
   return send(res,404,{error:'接口不存在。'});
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'不支持此请求方式。'});
  const file=path.resolve(staticRoot,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(staticRoot+path.sep))throw new StorageError('路径无效。',403);
  let data;try{data=await fs.readFile(file);}catch(e){if(e.code==='ENOENT'||e.code==='EISDIR')return send(res,404,{error:'文件不存在。'});throw e;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){console.error(e.message);send(res,e.status||500,{error:e instanceof StorageError?e.message:'无法读写 Project 文件夹，请检查权限或磁盘状态。',conflicts:e.details||[]});}});
 server.on('close',()=>void release().catch(console.error));
 async function close(){if(server.listening)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await release();}
 return {server,store,repositories,close};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const {server,store,close}=await createServer();server.on('error',async e=>{console.error(e.code==='EADDRINUSE'?'端口 4173 已被占用。请先关闭旧的工作台服务。':e.message);await close();process.exitCode=1;});for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void close());server.listen(4173,'127.0.0.1',()=>{console.log('Local: http://127.0.0.1:4173');console.log('Project files: '+store.directory);});}catch(e){console.error('工作台启动失败：'+e.message);process.exitCode=1;}
}
