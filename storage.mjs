import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {validateWorkspace,collectionNames} from './dist/project-model.js';

const MAX_BYTES=50*1024*1024;
export const MAX_IMAGE_BYTES=20*1024*1024;
export function detectImage(data){
  if(!Buffer.isBuffer(data)||!data.length||data.length>MAX_IMAGE_BYTES)throw new StorageError('请选择 20 MB 以内的图片。',413);
  if(data.length>=24&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {extension:'png',mime:'image/png'};
  if(data.length>=4&&data[0]===255&&data[1]===216&&data[2]===255)return {extension:'jpg',mime:'image/jpeg'};
  if(data.length>=13&&['GIF87a','GIF89a'].includes(data.toString('ascii',0,6)))return {extension:'gif',mime:'image/gif'};
  if(data.length>=16&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')return {extension:'webp',mime:'image/webp'};
  if(data.length>=24&&data.toString('ascii',4,8)==='ftyp'&&['avif','avis'].some(brand=>data.subarray(8,Math.min(data.length,64)).includes(Buffer.from(brand))))return {extension:'avif',mime:'image/avif'};
  throw new StorageError('请选择 PNG、JPG、GIF、WebP 或 AVIF 图片。',415);
}
const safeId=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);
const trashed=project=>typeof project?.deletedAt==='string'&&Number.isFinite(Date.parse(project.deletedAt));
const sortObject=value=>Array.isArray(value)?value.map(sortObject):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sortObject(value[k])])):value;
export const json=value=>JSON.stringify(sortObject(value),null,2)+'\n';
const digest=value=>createHash('sha256').update(value).digest('hex');
export class StorageError extends Error {constructor(message,status=400,details=[]){super(message);this.status=status;this.details=details;}}

// Stable IDs keep renames from moving files. Each editable record is independent.
export function workspaceFiles(state){
  if(!validateWorkspace(state))throw new StorageError('项目数据格式无效，未写入磁盘。');
  const files=new Map();
  for(const p of state.projects){
    const base=p.id+'/';
    files.set(base+'project.json',json(Object.fromEntries(Object.entries(p).filter(([key])=>![...collectionNames,'activity','trash'].includes(key)))));
    for(const type of collectionNames){
      if(type==='docs')for(const d of p.docs){
        const folder=base+'docs/'+d.id+'/';const {content,diagrams,...metadata}=d;
        files.set(folder+'document.json',json(metadata));files.set(folder+'content.md',content);
        for(const g of diagrams){const {source,...info}=g;files.set(folder+'diagrams/'+g.id+'.json',json(info));files.set(folder+'diagrams/'+g.id+'.mmd',source);}
      }else for(const record of p[type])files.set(base+type+'/'+record.id+'.json',json(record));
    }
    for(const entry of p.activity||[])files.set(base+'activity/'+digest(json(entry)).slice(0,24)+'.json',json(entry));
    for(const entry of p.trash||[])files.set(base+'trash/'+entry.id+'.json',json(entry));
  }
  return files;
}
export class ProjectStore {
  constructor(root,{dataDirectory,externalRoot}={}){this.root=path.resolve(root);this.directory=path.join(this.root,'Project');this.privateDirectory=path.resolve(dataDirectory||path.join(this.root,'.workbench'));this.externalRoot=externalRoot?path.resolve(externalRoot):null;this.mounts=new Map();this.registry=[];this.suppressedLegacy=new Set();this.mountIssues=[];this.queue=Promise.resolve();}
  serialize(action){const result=this.queue.then(action);this.queue=result.catch(()=>{});return result;}
  async init(){await fs.mkdir(this.directory,{recursive:true});await fs.mkdir(this.privateDirectory,{recursive:true});await this.assertNoSymlink(this.directory);await this.assertNoSymlink(this.privateDirectory);await this.loadRegistry();await this.recoverTransactions();}
  async assertNoSymlink(file){const info=await fs.lstat(file);if(info.isSymbolicLink())throw new StorageError('Project 中不支持符号链接：'+path.relative(this.root,file),409);return info;}
  async entries(folder){try{const info=await this.assertNoSymlink(folder);if(!info.isDirectory())throw new StorageError('应为文件夹：'+path.relative(this.directory,folder),409);return (await fs.readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  async text(file){await this.assertNoSymlink(file);if((await fs.stat(file)).size>MAX_BYTES)throw new StorageError('项目文件过大：'+path.relative(this.directory,file),413);const data=await fs.readFile(file,'utf8');if(/^<{7} |^>{7} /m.test(data))throw new StorageError('请先解决版本控制冲突：'+path.relative(this.directory,file),409);return data;}
  async object(file){try{return JSON.parse((await this.text(file)).replace(/^\uFEFF/,''));}catch(e){if(e instanceof StorageError)throw e;throw new StorageError('无法读取 JSON，请检查文件或解决 Git/SVN 冲突：'+path.relative(this.directory,file),409);}}
  async records(folder){const result=[];for(const entry of await this.entries(folder)){if(!entry.name.endsWith('.json'))continue;const id=entry.name.slice(0,-5);if(!safeId(id))throw new StorageError('项目文件名无效：'+entry.name,409);const value=await this.object(path.join(folder,entry.name));if(value.id!==id)throw new StorageError('文件名与记录 ID 不一致：'+entry.name,409);result.push(value);}return result;}
  async readProjectAt(folder,expectedId){
    await this.assertNoSymlink(folder);
    try{await fs.access(path.join(folder,'project-format.json'));const format=await this.object(path.join(folder,'project-format.json'));if(format.format!=='GameDesignerWorkerSpace.Project'||format.version!==1)throw new StorageError('项目格式版本不兼容，请升级工作台。',409);}catch(e){if(e.code!=='ENOENT')throw e;}
      const p=await this.object(path.join(folder,'project.json'));
      if(expectedId&&p.id!==expectedId)throw new StorageError('项目目录与 project.json 的 ID 不一致。',409);
      for(const type of collectionNames){
        if(type!=='docs'){p[type]=await this.records(path.join(folder,type));continue;}
        p.docs=[];
        for(const docEntry of await this.entries(path.join(folder,'docs'))){
          if(docEntry.name.startsWith('.'))continue;
          if(!docEntry.isDirectory()||!safeId(docEntry.name))throw new StorageError('文档目录无效：'+docEntry.name,409);
          const docFolder=path.join(folder,'docs',docEntry.name);await this.assertNoSymlink(docFolder);
          const docFiles=await this.entries(docFolder);
          // Recycled documents retain their own images for undo/restore. They are not active documents.
          if(docFiles.length===1&&docFiles[0].name==='Image'&&docFiles[0].isDirectory())continue;
          const doc=await this.object(path.join(docFolder,'document.json'));
          if(doc.id!==docEntry.name)throw new StorageError('文档目录与 ID 不一致。',409);
          doc.content=await this.text(path.join(docFolder,'content.md'));doc.diagrams=[];
          for(const g of await this.records(path.join(docFolder,'diagrams'))){g.source=await this.text(path.join(docFolder,'diagrams',g.id+'.mmd'));doc.diagrams.push(g);}
          p.docs.push(doc);
        }
      }
      p.activity=[];
      for(const item of await this.entries(path.join(folder,'activity')))if(/^[a-f0-9]{24}\.json$/.test(item.name))p.activity.push(await this.object(path.join(folder,'activity',item.name)));
      p.activity.sort((a,b)=>(b.recordedAt||'').localeCompare(a.recordedAt||''));p.activity=p.activity.slice(0,20);
      p.trash=await this.records(path.join(folder,'trash'));
      const order=(a,b)=>(b.updated||b.date||'').localeCompare(a.updated||a.date||'')||a.title.localeCompare(b.title,'zh-CN');
      for(const type of collectionNames)p[type].sort(type==='milestones'?(a,b)=>a.date.localeCompare(b.date):type==='tasks'?(a,b)=>(a.number||0)-(b.number||0):order);
    if(!validateWorkspace({schema:1,active:p.id,projects:[p]}))throw new StorageError('项目内容不完整或格式无效，请检查项目文件。',409);
    return p;
  }
  async load(){
    const projects=[];this.mountIssues=[];
    for(const entry of await this.entries(this.directory)){
      if(entry.name.startsWith('.')||entry.name==='README.md'||this.mounts.has(entry.name)||this.suppressedLegacy.has(entry.name))continue;
      if(!entry.isDirectory()){if(entry.isSymbolicLink())throw new StorageError('Project 中不支持符号链接。',409);continue;}
      if(!safeId(entry.name))throw new StorageError('项目目录 ID 无效：'+entry.name,409);
      projects.push(await this.readProjectAt(path.join(this.directory,entry.name),entry.name));
    }
    for(const item of this.registry){try{projects.push(await this.readProjectAt(item.directory,item.id));}catch(error){this.mountIssues.push({...item,error:error.message});}}
    return {schema:1,active:projects[0]?.id||null,projects};
  }
  async loadRegistry(){const file=path.join(this.privateDirectory,'library.json');try{const data=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));if(!Array.isArray(data.projects))throw Error('format');for(const id of data.hiddenLegacy||[]){if(!safeId(id))throw Error('format');this.suppressedLegacy.add(id);}for(const item of data.projects){if(!safeId(item.id)||typeof item.directory!=='string'||!path.isAbsolute(item.directory))throw Error('format');this.mounts.set(item.id,path.resolve(item.directory));this.registry.push({...item,directory:path.resolve(item.directory)});}}catch(e){if(e.code!=='ENOENT')throw new StorageError('项目库索引无效，请检查 '+file,409);}}
  async saveRegistry(){await this.atomic(path.join(this.privateDirectory,'library.json'),json({version:1,projects:this.registry,hiddenLegacy:[...this.suppressedLegacy]}));}
  async detach(id){if(!safeId(id))throw new StorageError('项目 ID 无效。');this.registry=this.registry.filter(item=>item.id!==id);this.mounts.delete(id);this.suppressedLegacy.add(id);await this.saveRegistry();return {message:'仅移除了本机项目关联，项目文件和仓库保持不动。'};}
  getLocation(id){if(!safeId(id))throw new StorageError('项目 ID 无效。');return this.mounts.get(id)||path.join(this.directory,id);}
  async documentImageFolder(id,docId){
    if(!safeId(id)||!safeId(docId))throw new StorageError('项目或文档 ID 无效。');
    const directory=this.getLocation(id),metadata=path.join(directory,'project.json');await this.checkParents(metadata);
    const project=await this.object(metadata);if(project.id!==id||project.deletedAt)throw new StorageError('项目不存在。',404);
    const document=path.join(directory,'docs',docId,'document.json');await this.checkParents(document);
    const doc=await this.object(document);if(doc.id!==docId)throw new StorageError('文档不存在。',404);
    return path.join(directory,'docs',docId,'Image');
  }
  // 彻底删除一条记录留下的磁盘文件。普通记录是单个 JSON；文档是整个目录（正文、图表源码、图片）。
  // 只按磁盘事实清理，必须校验对象确已不在项目数据中，且路径没有越过安全红线。
  async purgeRecordFile(id,type,recordId){
    if(!safeId(id)||!safeId(recordId)||!collectionNames.includes(type))throw new StorageError('记录参数无效。');
    const directory=this.getLocation(id),metadata=path.join(directory,'project.json');await this.checkParents(metadata);
    const project=await this.object(metadata);if(project.id!==id||project.deletedAt)throw new StorageError('项目不存在。',404);
    // 磁盘上仍存在这条记录时拒绝清理，避免删掉仍在使用的文件。
    const exists=type==='docs'
      ? await this.existsDoc(directory,recordId)
      : await this.existsFile(path.join(directory,type,recordId+'.json'));
    if(exists)throw new StorageError('这条记录还在项目文件中，未执行清理。',409);
    const target=type==='docs'?path.join(directory,'docs',recordId):type==='numerics'?path.join(directory,'numerics',recordId):path.join(directory,type,recordId+'.json');
    await this.checkParents(target);
    const blocked=this.unsafePurgeTarget(target);if(blocked)throw new StorageError(blocked,409);
    if(type==='docs'||type==='numerics')await fs.rm(target,{recursive:true,force:true});
    else await fs.rm(target,{force:true});
    if(type==='numerics')await fs.rm(path.join(directory,'numerics',recordId+'.json'),{force:true});
    // 任务除了 JSON 还可能有参考图目录，一起清掉，别把图片留在项目里。
    if(type==='tasks'){
      const images=path.join(directory,'tasks',recordId);
      const blockedImages=this.unsafePurgeTarget(images);if(blockedImages)throw new StorageError(blockedImages,409);
      await fs.rm(images,{recursive:true,force:true});
    }
    await this.prune(path.dirname(target));
    return {removed:target};
  }
  async existsFile(file){try{await this.assertNoSymlink(file);await fs.access(file);return true;}catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')return false;throw e;}}
  async existsDoc(directory,docId){
    const folder=path.join(directory,'docs',docId);
    try{await this.assertNoSymlink(folder);const entries=await this.entries(folder);return entries.some(entry=>entry.name==='document.json');}catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')return false;throw e;}
  }
  async writeDocumentImage(id,docId,data){
    const {extension,mime}=detectImage(data),folder=await this.documentImageFolder(id,docId);
    const name=createHash('sha256').update(data).digest('hex')+'.'+extension,file=path.join(folder,name);
    await this.checkParents(file);await fs.mkdir(folder,{recursive:true});
    try{await fs.writeFile(file,data,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;const current=await fs.readFile(file);if(!current.equals(data))throw new StorageError('图片文件发生冲突，未覆盖。',409);}
    return {name,source:'Image/'+name,mime,size:data.length};
  }
  async readDocumentImage(id,docId,name){
    if(typeof name!=='string'||!name||name==='.'||name==='..'||/[\\/\x00-\x1f:]/.test(name))throw new StorageError('图片路径无效。');
    const folder=await this.documentImageFolder(id,docId),file=path.join(folder,name);await this.checkParents(file);
    const stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_BYTES)throw new StorageError('图片不存在或过大。',404);
    return {file,data:await fs.readFile(file)};
  }
  // 任务的参考图放在 tasks/<任务 ID>/Image/ 里，命名与文档图片一致（内容哈希，同名同图自然去重）。
  // 只校验项目存在、不要求任务记录已经落盘：新建任务在点「保存」之前也能先放图，取消时再用彻底删除接口清掉目录。
  async taskImageFolder(id,taskId){
    if(!safeId(id)||!safeId(taskId))throw new StorageError('项目或任务 ID 无效。');
    const directory=this.getLocation(id),metadata=path.join(directory,'project.json');await this.checkParents(metadata);
    const project=await this.object(metadata);if(project.id!==id||project.deletedAt)throw new StorageError('项目不存在。',404);
    return path.join(directory,'tasks',taskId,'Image');
  }
  async writeTaskImage(id,taskId,data){
    const {extension,mime}=detectImage(data),folder=await this.taskImageFolder(id,taskId);
    const name=createHash('sha256').update(data).digest('hex').slice(0,32)+'.'+extension,file=path.join(folder,name);
    await this.checkParents(file);await fs.mkdir(folder,{recursive:true});
    try{await fs.writeFile(file,data,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;const current=await fs.readFile(file);if(!current.equals(data))throw new StorageError('图片文件发生冲突，未覆盖。',409);}
    return {name,mime,size:data.length};
  }
  async readTaskImage(id,taskId,name){
    if(typeof name!=='string'||!name||name==='.'||name==='..'||/[\\/\x00-\x1f:]/.test(name))throw new StorageError('图片路径无效。');
    const folder=await this.taskImageFolder(id,taskId),file=path.join(folder,name);await this.checkParents(file);
    const stat=await fs.stat(file).catch(()=>{throw new StorageError('图片不存在或过大。',404);});
    if(!stat.isFile()||stat.size>MAX_BYTES)throw new StorageError('图片不存在或过大。',404);
    return {file,data:await fs.readFile(file)};
  }
  async deleteTaskImage(id,taskId,name){
    if(typeof name!=='string'||!name||name==='.'||name==='..'||/[\\/\x00-\x1f:]/.test(name))throw new StorageError('图片路径无效。');
    const folder=await this.taskImageFolder(id,taskId),file=path.join(folder,name);await this.checkParents(file);
    await fs.rm(file,{force:true});await this.prune(folder);
    return {removed:name};
  }
  async numericFolder(id,recordId){
    if(!safeId(id)||!safeId(recordId))throw new StorageError('数值表参数无效。');
    const folder=path.join(this.getLocation(id),'numerics',recordId);await this.checkParents(path.join(folder,'probe'));return folder;
  }
  async writeNumericFile(id,recordId,filename,data){
    const folder=await this.numericFolder(id,recordId);
    const safe=path.basename(String(filename||'sheet.xlsx')).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_');
    if(!/\.(xlsx|xls|csv)$/i.test(safe))throw new StorageError('只支持 .xlsx / .xls / .csv 文件。',415);
    const file=path.join(folder,safe);await this.checkParents(file);await fs.mkdir(folder,{recursive:true});
    // 一张数值表只保留一个表格文件：换文件时先清掉同目录的旧表格，避免预览读到上一个文件。
    try{for(const old of await fs.readdir(folder))if(old!==safe&&/\.(xlsx|xls|csv)$/i.test(old))await fs.rm(path.join(folder,old),{force:true});}catch{}
    await fs.writeFile(file,data);return {file:safe,size:data.length};
  }
  async readNumericFile(id,recordId){
    const folder=await this.numericFolder(id,recordId);
    const entries=await fs.readdir(folder);const name=entries.find(n=>!n.startsWith('.')&&/\.(xlsx|xls|csv)$/i.test(n));
    if(!name)throw new StorageError('数值表文件不存在。',404);
    const file=path.join(folder,name);await this.checkParents(file);
    const stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_BYTES)throw new StorageError('数值表不存在或过大。',404);
    return {filename:name,data:await fs.readFile(file)};
  }
  async attachment(id,relative){
    if(!safeId(id)||typeof relative!=='string'||relative.split('/').some(part=>!part||part==='.'||part==='..'||/[\\\x00-\x1f:]/.test(part)))throw new StorageError('附件路径无效。',400);
    const directory=this.getLocation(id);const project=await this.object(path.join(directory,'project.json'));
    if(project.id!==id||project.deletedAt)throw new StorageError('项目不存在。',404);
    const root=path.join(directory,'attachments'),file=path.resolve(root,...relative.split('/'));
    if(!file.startsWith(root+path.sep))throw new StorageError('附件路径无效。',403);
    await this.checkParents(file);const stat=await fs.stat(file);
    if(!stat.isFile())throw new StorageError('附件不存在。',404);
    if(stat.size>MAX_BYTES)throw new StorageError('附件超过 50 MB。',413);
    return {file,data:await fs.readFile(file)};
  }
  async register(directory,{replace=false}={}){directory=path.resolve(directory);const p=await this.readProjectAt(directory);const prior=this.registry.find(q=>q.id===p.id);if(prior&&path.resolve(prior.directory)!==directory&&!replace)throw new StorageError('此项目 ID 已关联其他目录，请先移除旧关联。',409);this.mounts.set(p.id,directory);if(!prior)this.registry.push({id:p.id,name:p.name,directory});else{prior.name=p.name;prior.directory=directory;}await this.saveRegistry();return p;}
  async writeFormat(id){const directory=this.getLocation(id);const file=path.join(directory,'project-format.json');try{await fs.access(file);}catch(e){if(e.code!=='ENOENT')throw e;await this.atomic(file,json({format:'GameDesignerWorkerSpace.Project',version:1,projectId:id}));}}
  async separate(id){if(this.mounts.has(id))return this.getLocation(id);if(!this.externalRoot)throw new StorageError('未配置独立项目目录。');const source=this.getLocation(id),p=await this.readProjectAt(source,id),target=path.resolve(this.externalRoot,id);if(!target.startsWith(this.externalRoot+path.sep))throw new StorageError('项目目录无效。');await fs.mkdir(this.externalRoot,{recursive:true});try{await fs.access(target);throw new StorageError('目标项目目录已存在，请关联已有目录。',409);}catch(e){if(e.code!=='ENOENT')throw e;}await fs.cp(source,target,{recursive:true,errorOnExist:true,force:false});await this.register(target);await this.writeFormat(id);return target;}
  resolveFile(relative){if(typeof relative!=='string'||relative.includes('\\')||relative.split('/').some(s=>!s||s==='.'||s==='..'))throw new StorageError('无效的项目文件路径。');const parts=relative.split('/'),root=this.mounts.has(parts[0])?this.mounts.get(parts.shift()):this.directory;const file=path.resolve(root,...parts);if(!file.startsWith(root+path.sep))throw new StorageError('项目路径超出项目目录。');return file;}
  fileRoot(file){return [...this.mounts.values()].sort((a,b)=>b.length-a.length).find(root=>file.startsWith(root+path.sep))||this.directory;}
  async checkParents(file){const root=this.fileRoot(file);let folder=path.dirname(file);while(folder.startsWith(root+path.sep)){try{await this.assertNoSymlink(folder);}catch(e){if(e.code!=='ENOENT')throw e;}folder=path.dirname(folder);}await this.assertNoSymlink(root);try{await this.assertNoSymlink(file);}catch(e){if(e.code!=='ENOENT')throw e;}}
  async raw(relative){const file=this.resolveFile(relative);await this.checkParents(file);try{return await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  async atomic(file,content){await fs.mkdir(path.dirname(file),{recursive:true});const temp=path.join(path.dirname(file),'.'+path.basename(file)+'.'+randomUUID()+'.tmp');try{await fs.writeFile(temp,content,{encoding:'utf8',flag:'wx'});await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
  async apply(relative,content){const file=this.resolveFile(relative);await this.checkParents(file);if(content===null){await fs.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});}else await this.atomic(file,content);}
  async recoverTransactions(){for(const entry of await this.entries(path.join(this.privateDirectory,'transactions'))){if(!entry.name.endsWith('.json'))continue;const file=path.join(this.privateDirectory,'transactions',entry.name),journal=JSON.parse(await fs.readFile(file,'utf8'));for(const c of journal){const current=await this.raw(c.path);if(current!==c.before&&current!==c.after)throw new StorageError('有未完成保存且文件已被外部修改，请检查 '+file,409);}for(const c of journal)await this.apply(c.path,c.before);for(const c of journal)if(c.before===null)await this.prune(path.dirname(this.resolveFile(c.path)));await fs.unlink(file);}}
  async prune(folder){const root=this.fileRoot(path.join(folder,'_'));while(folder.startsWith(root+path.sep)){try{await fs.rmdir(folder);}catch(e){if(['ENOTEMPTY','ENOENT','EEXIST'].includes(e.code))return;throw e;}folder=path.dirname(folder);}}
  async transaction(changes){if(!changes.length)return;const journal=[];for(const c of changes)journal.push({path:c.path,before:await this.raw(c.path),after:c.content});const journalPath=path.join(this.privateDirectory,'transactions',randomUUID()+'.json');await this.atomic(journalPath,json(journal));try{for(const c of changes)await this.apply(c.path,c.content);for(const c of changes)if(c.content===null)await this.prune(path.dirname(this.resolveFile(c.path)));await fs.unlink(journalPath);}catch(e){try{for(const c of journal)await this.apply(c.path,c.before);for(const c of journal)if(c.before===null)await this.prune(path.dirname(this.resolveFile(c.path)));await fs.unlink(journalPath);}catch{throw new StorageError('保存中断。恢复记录位于 '+journalPath+'；请重启服务恢复。',500);}throw e;}}
  // 读取项目元数据并校验归属。清理操作只信任磁盘上的 project.json，不信任前端传来的状态。
  async readProjectMeta(directory,expectedId,{allowMissing=false}={}){
    try{await this.assertNoSymlink(directory);}
    catch(error){if(allowMissing&&error.code==='ENOENT')return null;throw error;}
    const file=path.join(directory,'project.json');await this.checkParents(file);
    let raw;
    try{raw=await fs.readFile(file,'utf8');}
    catch(error){
      if(allowMissing&&error.code==='ENOENT')return null;
      if(error.code==='ENOENT')throw new StorageError('项目元数据缺失，未删除目录：'+path.relative(this.root,directory),409);
      throw error;
    }
    let meta;try{meta=JSON.parse(raw.replace(/^\uFEFF/,''));}
    catch{throw new StorageError('项目元数据无法读取，未删除目录：'+path.relative(this.root,directory),409);}
    if(!meta||meta.id!==expectedId)throw new StorageError('项目目录与 project.json 的 ID 不一致。',409);
    return meta;
  }
  // 把回收站项目从磁盘清掉：内部项目删 Project/<id>，外部关联项目删它关联的那个文件夹。
  // 先完成全部校验，再修改磁盘：任何一个 id 不合法时，不能出现“前面的项目已经删掉、后面的报错”的半完成状态。
  async purgeProjects(ids){
    if(!Array.isArray(ids)||!ids.length||ids.length>500)throw new StorageError('要清理的项目数量无效。');
    const unique=[...new Set(ids)];
    if(unique.some(id=>!safeId(id)))throw new StorageError('项目 ID 无效。');
    const plans=[];
    for(const id of unique){
      if(this.mounts.has(id)){
        // 外部关联项目：目录已经是这个项目的文件夹，就先确认它确实处于回收站，再删掉整个文件夹。
        // 目录已经不在磁盘上（只剩索引残留）时无处可删，退化为解除关联。
        const directory=path.resolve(this.mounts.get(id));
        let info;
        try{info=await fs.lstat(directory);}
        catch(error){
          if(error.code!=='ENOENT')throw error;
          const meta=await this.readProjectMeta(directory,id,{allowMissing:true});
          if(meta&&!trashed(meta))throw new StorageError('只能清理回收站中的项目：'+(meta.name||id),409);
          plans.push({id,type:'detach'});continue;
        }
        if(info.isSymbolicLink())throw new StorageError('不支持删除符号链接指向的目录：'+directory,409);
        if(!info.isDirectory())throw new StorageError('项目目录无效：'+directory,409);
        const blocked=this.unsafePurgeTarget(directory);
        if(blocked)throw new StorageError(blocked,409);
        // 目录存在但读不到 project.json 时宁可报错，也不能删掉一个无法证明是项目的文件夹。
        const meta=await this.readProjectMeta(directory,id);
        if(!trashed(meta))throw new StorageError('只能清理回收站中的项目：'+(meta.name||id),409);
        plans.push({id,type:'remove',directory,external:true});
        continue;
      }
      const expected=path.join(this.directory,id);
      let info;
      try{info=await fs.lstat(expected);}
      catch(error){if(error.code==='ENOENT'){plans.push({id,type:'missing'});continue;}throw error;}
      if(info.isSymbolicLink())throw new StorageError('Project 中不支持符号链接：'+path.relative(this.root,expected),409);
      if(!info.isDirectory())throw new StorageError('项目目录无效：'+path.relative(this.root,expected),409);
      const meta=await this.readProjectMeta(expected,id);
      if(!trashed(meta))throw new StorageError('只能清理回收站中的项目：'+(meta.name||id),409);
      plans.push({id,type:'remove',directory:expected});
    }
    // 执行阶段。先改成隐藏的临时目录，避免删到一半（例如图片被占用）留下缺少 project.json 的损坏项目目录。
    const purged=[],detached=[],skipped=[],warnings=[];let registryChanged=false;
    const registryBefore=this.registry.map(item=>({...item})),mountsBefore=new Map(this.mounts),suppressedBefore=new Set(this.suppressedLegacy);
    try{
      for(const plan of plans){
        if(plan.type==='missing'){skipped.push(plan.id);continue;}
        if(plan.type==='detach'){
          this.dropMount(plan.id);registryChanged=true;detached.push(plan.id);continue;
        }
        const temp=path.join(path.dirname(plan.directory),'.purge-'+plan.id+'-'+randomUUID());
        try{await fs.rename(plan.directory,temp);}
        catch(error){
          if(error.code==='ENOENT'){
            skipped.push(plan.id);
            if(plan.external){this.dropMount(plan.id);registryChanged=true;}
            continue;
          }
          throw new StorageError('无法删除项目文件夹，请检查文件是否被占用：'+(plan.external?plan.directory:path.relative(this.root,plan.directory)),409);
        }
        purged.push(plan.id);
        if(plan.external){this.dropMount(plan.id);registryChanged=true;}
        try{await fs.rm(temp,{recursive:true,force:true});}
        catch{/* 已从项目库移出，保留警告由前端提示，不能让半删的目录重新出现在回收站。 */warnings.push({id:plan.id,message:'项目已移出项目库，但临时目录未能完全删除：'+(plan.external?temp:path.relative(this.root,temp))});}
      }
      if(registryChanged)await this.saveRegistry();
    }catch(error){
      // 文件系统部分无法回滚，但索引必须和磁盘保持一致：失败时恢复内存中的关联，避免 library.json 与实际不同步。
      this.registry=registryBefore;this.mounts=mountsBefore;this.suppressedLegacy=suppressedBefore;throw error;
    }
    return {purged,detached,skipped,warnings};
  }
  // 解除一个外部关联：索引、内存映射、旧版目录回填都一并清掉。
  dropMount(id){this.registry=this.registry.filter(item=>item.id!==id);this.mounts.delete(id);this.suppressedLegacy.add(id);}
  // 删外部文件夹前的红线：磁盘根、用户主目录、工作台自身的目录，以及包含工作台的那些上级目录，一律拒绝。
  unsafePurgeTarget(directory){
    if(directory===path.parse(directory).root)return '拒绝删除磁盘根目录：'+directory;
    if(directory===path.resolve(os.homedir()))return '拒绝删除用户主目录：'+directory;
    const guarded=[this.root,this.privateDirectory,this.externalRoot].filter(Boolean).map(item=>path.resolve(item));
    if(guarded.includes(directory))return '拒绝删除工作台自己的目录：'+directory;
    if(guarded.some(item=>item.startsWith(directory+path.sep)))return '这个文件夹包含工作台自身，拒绝删除：'+directory;
    return '';
  }
  async save(base,state,{purge=[]}={}){return this.serialize(async()=>{
    if(!base||!state||!Array.isArray(base.projects)||!Array.isArray(state.projects))throw new StorageError('项目数据格式无效，未写入磁盘。');
    if(!Array.isArray(purge)||purge.length>500)throw new StorageError('要清理的项目数量无效。');
    const purgeTargets=new Set(purge);
    if([...purgeTargets].some(id=>!safeId(id)))throw new StorageError('项目 ID 无效。');
    for(const id of purgeTargets){
      const remaining=state.projects.find(p=>p.id===id);
      if(remaining)throw new StorageError('要清理的项目仍在项目库中，未执行清理。',409);
      const prior=base.projects?.find(p=>p.id===id);
      // 前端提交的 base 必须已经把这些项目移入回收站；磁盘 project.json 才是最终依据。
      if(prior&&!trashed(prior))throw new StorageError('只能清理回收站中的项目：'+(prior.name||id),409);
    }
    const created=[];if(this.externalRoot){for(const p of state.projects){if(!base.projects.some(q=>q.id===p.id)&&!this.mounts.has(p.id)){const destination=path.join(this.externalRoot,p.id);await fs.mkdir(destination,{recursive:true});this.mounts.set(p.id,destination);this.registry.push({id:p.id,name:p.name,directory:destination});created.push(p.id);}}if(created.length)await this.saveRegistry();}
    try{
    const diskState=await this.load(),before=workspaceFiles(base),after=workspaceFiles(state),current=workspaceFiles(diskState),changes=[],conflicts=[];
    for(const p of state.projects){
      const previous=base.projects.find(q=>q.id===p.id),onDisk=diskState.projects.find(q=>q.id===p.id);
      if(previous&&!previous.deletedAt&&!p.deletedAt&&onDisk?.deletedAt&&[...new Set([...before.keys(),...after.keys()])].some(name=>name.startsWith(p.id+'/')&&before.get(name)!==after.get(name)))conflicts.push(p.id+'/project.json');
    }
    for(const name of new Set([...before.keys(),...after.keys()])){
      // 被清理项目的文件由 purgeProjects 整目录处理，不能让事务再写一遍或回滚回来。
      if(purgeTargets.has(name.split('/')[0]))continue;
      const oldValue=before.get(name),newValue=after.get(name),diskValue=current.get(name);
      if(oldValue===newValue||diskValue===newValue)continue;
      if(name.includes('/activity/')){if(newValue!==undefined&&diskValue===undefined)changes.push({path:name,content:newValue});continue;}
      if(diskValue!==oldValue){conflicts.push(name);continue;}
      changes.push({path:name,content:newValue??null});
    }
    if(conflicts.length)throw new StorageError('这些文件已被其他页面或 Git/SVN 更新，未覆盖磁盘内容。',409,conflicts);
    // 清理必须在事务之前完成：事务失败回滚只恢复 base→state 的普通文件，不会把已清理的项目写回。
    const purgeResult=purgeTargets.size?await this.purgeProjects([...purgeTargets]):{purged:[],detached:[],skipped:[],warnings:[]};
    await this.transaction(changes);for(const id of created)await this.writeFormat(id);
    return {savedAt:new Date().toISOString(),changedFiles:changes.length,purged:purgeResult.purged.length,detached:purgeResult.detached.length,skipped:purgeResult.skipped.length,warnings:purgeResult.warnings};
    }catch(error){if(created.length){this.registry=this.registry.filter(item=>!created.includes(item.id));for(const id of created)this.mounts.delete(id);await this.saveRegistry();}throw error;}
  });}
  async importLegacy(state){if(!validateWorkspace(state)||!state.projects.length)throw new StorageError('旧浏览器项目格式无效。');const marker=path.join(this.privateDirectory,'migrations',digest(json(state))+'.json');try{await fs.access(marker);return {alreadyMigrated:true};}catch(e){if(e.code!=='ENOENT')throw e;}const base=await this.load(),desired=structuredClone(base);for(const original of state.projects){const p=structuredClone(original),existing=desired.projects.find(x=>x.id===p.id);if(existing){if(json(existing)===json(p))continue;p.id=randomUUID();p.name=p.name.slice(0,165)+'（浏览器迁移）';}desired.projects.push(p);}await this.save(base,desired);await this.atomic(marker,json({migratedAt:new Date().toISOString(),projects:state.projects.map(p=>p.id)}));return {alreadyMigrated:false};}
  async recovery(state){if(!validateWorkspace(state))throw new StorageError('恢复副本格式无效。');const file=path.join(this.privateDirectory,'recovery',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID()+'.json');await this.atomic(file,json(state));return path.relative(this.root,file);}
}
