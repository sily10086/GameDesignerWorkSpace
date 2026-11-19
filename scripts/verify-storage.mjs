import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {ProjectStore,workspaceFiles,json} from '../storage.mjs';
import {defaultWorkspace,validateWorkspace} from '../dist/project-model.js';
import {createServer} from '../server.mjs';
import {DiskStorage} from '../dist/disk-store.js';
import {launchWorkbench,probeWorkbench} from '../launcher.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'gameforge-storage-test-'));
const empty={schema:1,active:null,projects:[]};
const copy=value=>structuredClone(value);
let app;
const nativeFetch=globalThis.fetch;
try{
 const store=new ProjectStore(root);await store.init();
 assert.equal(validateWorkspace(defaultWorkspace()),true);
 assert.deepEqual((await store.load()).projects,[]);
 const original=defaultWorkspace();await store.save(empty,original);
 const p=original.projects[0],d=p.docs[0],g=d.diagrams[0];
 const docPath=path.join(store.directory,p.id,'docs',d.id);
 assert.equal(await fs.readFile(path.join(docPath,'content.md'),'utf8'),d.content);
 assert.equal(await fs.readFile(path.join(docPath,'diagrams',g.id+'.mmd'),'utf8'),g.source);
 assert.deepEqual(workspaceFiles(await store.load()),workspaceFiles(original));
 const restarted=new ProjectStore(root);await restarted.init();assert.deepEqual(workspaceFiles(await restarted.load()),workspaceFiles(original));
 assert.equal((await store.save(original,original)).changedFiles,0);
 // 文档版本编号必须跟着 document.json 一起落盘和读回。
 assert.equal(JSON.parse(await fs.readFile(path.join(docPath,'document.json'),'utf8')).version,d.version||'', 'document.json 要写入版本编号');
 const versionBase=await store.load(),versioned=copy(versionBase);versioned.projects[0].docs[0].version='V0.2';
 await store.save(versionBase,versioned);
 assert.equal((await store.load()).projects[0].docs[0].version,'V0.2','文档版本编号必须能往返保存');
 console.log('PASS: Project files, Markdown/Mermaid round trip, restart persistence, unchanged files not rewritten.');

 const base=await store.load(),a=copy(base),b=copy(base);
 a.projects[0].tasks[0].description+='\nAlice edit';b.projects[0].tasks[1].description+='\nBob edit';
 await store.save(base,a);await store.save(base,b);
 let latest=await store.load();assert.equal(latest.projects[0].tasks[0].description,a.projects[0].tasks[0].description);assert.equal(latest.projects[0].tasks[1].description,b.projects[0].tasks[1].description);
 const conflict=copy(base);conflict.projects[0].tasks[0].description='Stale edit';conflict.projects[0].tasks[2].description='Must not be partially written';
 const unchanged=workspaceFiles(latest);await assert.rejects(store.save(base,conflict),e=>e.status===409&&e.details.some(x=>x.endsWith(base.projects[0].tasks[0].id+'.json')));assert.deepEqual(workspaceFiles(await store.load()),unchanged);
 console.log('PASS: independent edits merge; stale same-file edits are rejected without partial writes.');

 const docBase=await store.load(),docA=copy(docBase),docB=copy(docBase);
 docA.projects[0].docs[0].content+='\nNew document text';docB.projects[0].docs[0].diagrams.push({id:randomUUID(),type:'flowchart',title:'Independent diagram',source:'flowchart LR\n A --> B'});
 await store.save(docBase,docA);await store.save(docBase,docB);latest=await store.load();assert.ok(latest.projects[0].docs[0].content.includes('New document text'));assert.ok(latest.projects[0].docs[0].diagrams.some(g=>g.title==='Independent diagram'));
 const recycleBase=await store.load(),recycled=copy(recycleBase),removed=recycled.projects[0].docs.shift();recycled.projects[0].trash=[{id:randomUUID(),type:'docs',record:removed,index:0,date:'2026-11-17'}];await store.save(recycleBase,recycled);assert.equal((await store.load()).projects[0].docs.length,recycleBase.projects[0].docs.length-1);
 const restored=copy(recycled);restored.projects[0].docs.push(restored.projects[0].trash.pop().record);await store.save(recycled,restored);assert.deepEqual(workspaceFiles(await store.load()),workspaceFiles(recycleBase));
 console.log('PASS: document and diagram edits merge independently; document recycle/restore removes orphan directories.');

 const rollbackBase=await store.load(),failed=copy(rollbackBase);failed.projects.push(defaultWorkspace().projects[0]);
 const realApply=store.apply.bind(store);let count=0;store.apply=async(...args)=>{if(++count===3)throw new Error('Simulated disk failure');return realApply(...args);};
 await assert.rejects(store.save(rollbackBase,failed),/Simulated disk failure/);store.apply=realApply;assert.deepEqual(workspaceFiles(await store.load()),workspaceFiles(rollbackBase));
 const existingFile=workspaceFiles(rollbackBase).keys().next().value,oldText=await store.raw(existingFile),interrupted=oldText+' ';
 await store.apply(existingFile,interrupted);const journalDir=path.join(root,'.workbench','transactions');await fs.mkdir(journalDir,{recursive:true});await fs.writeFile(path.join(journalDir,'interrupted.json'),json([{path:existingFile,before:oldText,after:interrupted}]));
 await new ProjectStore(root).init();assert.equal(await store.raw(existingFile),oldText);
 console.log('PASS: failed transactions roll back; interrupted writes recover on startup.');

 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','--quiet');git('add','Project');git('-c','user.name=Gameforge Test','-c','user.email=test@example.invalid','commit','--quiet','-m','Fixture');
 const gitBase=await store.load(),gitEdit=copy(gitBase);gitEdit.projects[0].tasks[0].description+='\nSingle-file change';await store.save(gitBase,gitEdit);
 assert.deepEqual(git('diff','--name-only','--','Project').split(/\r?\n/),['Project/'+p.id+'/tasks/'+gitBase.projects[0].tasks[0].id+'.json']);
 const cloneRoot=path.join(root,'portable-copy');await fs.mkdir(cloneRoot);await fs.cp(store.directory,path.join(cloneRoot,'Project'),{recursive:true});const cloned=new ProjectStore(cloneRoot);await cloned.init();assert.deepEqual(workspaceFiles(await cloned.load()),workspaceFiles(await store.load()));
 console.log('PASS: Git diff changes one record only; copying Project loads all content on another workspace.');

 const taskFile=path.join(store.directory,p.id,'tasks',gitBase.projects[0].tasks[0].id+'.json'),validText=await fs.readFile(taskFile,'utf8');
 await fs.writeFile(taskFile,'<<<<<<< mine\n'+validText+'=======\n>>>>>>> theirs\n');await assert.rejects(store.load(),e=>e.status===409);await fs.writeFile(taskFile,validText);
 const invalid=copy(original);invalid.projects[0].id='../outside';await assert.rejects(store.save(empty,invalid),e=>e.status===400);
 console.log('PASS: unresolved Git/SVN conflict markers and unsafe IDs are rejected.');

 const apiRoot=path.join(root,'api');app=await createServer({root:apiRoot});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port;
 await assert.rejects(createServer({root:apiRoot}),/已有工作台服务/);
 const request=async(url,method='GET',body,headers={})=>nativeFetch(origin+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
 const initialResponse=await request('/api/workspace');assert.equal(initialResponse.status,200);assert.equal((await initialResponse.json()).state.projects.length,0);
 const legacy=defaultWorkspace();let response=await request('/api/migrate-browser','POST',{state:legacy});assert.equal(response.status,200);response=await request('/api/migrate-browser','POST',{state:legacy});assert.equal((await response.json()).alreadyMigrated,true);assert.equal((await app.store.load()).projects.length,1);
 assert.equal((await request('/api/workspace','PUT',{base:empty,state:legacy},{Origin:'https://unrelated.invalid'})).status,403);
 assert.equal((await request('/api/workspace','PUT',{base:empty,state:{bad:true}})).status,400);
 assert.equal((await request('/Project/'+p.id+'/project.json')).status,404);
 const statuses=[];let clientState;globalThis.fetch=(url,options)=>nativeFetch(new URL(url,origin),options);const client=new DiskStorage(()=>clientState,phase=>statuses.push(phase));clientState=await client.load();clientState.projects[0].docs[0].content+='\nClient save';client.markDirty();assert.equal(await client.flush(),true);assert.ok((await app.store.load()).projects[0].docs[0].content.includes('Client save'));assert.equal(client.dirty,false);
 clientState.projects[0].docs[0].content+='\nOffline save';client.markDirty();globalThis.fetch=async()=>{throw new Error('Offline');};assert.equal(await client.flush(),false);assert.equal(client.dirty,true);assert.equal(statuses.at(-1),'error');globalThis.fetch=(url,options)=>nativeFetch(new URL(url,origin),options);assert.equal(await client.flush(),true);assert.equal(client.dirty,false);
 console.log('PASS: API, idempotent browser migration, duplicate-server guard, origin protection, client disk-save status and reconnect retry.');
 globalThis.fetch=nativeFetch;
 let opened=[];
 const probe=await probeWorkbench({root:apiRoot,port:app.server.address().port});assert.equal(probe.matching,true);
 const reused=await launchWorkbench({root:apiRoot,port:app.server.address().port,open:async url=>opened.push(url),log:()=>{}});assert.equal(reused.reused,true);assert.deepEqual(opened,[origin]);assert.equal(app.server.listening,true);
 await assert.rejects(launchWorkbench({root:path.join(root,'another-project'),port:app.server.address().port,open:async()=>{},log:()=>{}}),/另一个/);
 const logs=[];const noBrowser=await launchWorkbench({root:apiRoot,port:app.server.address().port,open:async()=>{throw new Error('No browser');},log:text=>logs.push(text)});assert.equal(noBrowser.reused,true);assert.ok(logs.some(text=>text.includes('手动访问')));
 const launched=await launchWorkbench({root:path.join(root,'launcher-new'),port:0,open:async url=>opened.push(url),log:()=>{}});try{assert.equal(launched.reused,false);assert.equal(launched.server.listening,true);const duplicate=await launchWorkbench({root:path.join(root,'launcher-new'),port:launched.server.address().port,open:async url=>opened.push(url),log:()=>{}});assert.equal(duplicate.reused,true);}finally{await launched.close();}
 console.log('PASS: launcher opens an existing matching workbench, starts fresh, handles missing browser, and refuses a different project on the port.');
 await app.close();app=null;const reopened=await createServer({root:apiRoot});await reopened.close();
 console.log('All file-storage checks passed.');
}finally{
 globalThis.fetch=nativeFetch;if(app)await app.close();
 const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('gameforge-storage-test-'));await fs.rm(resolved,{recursive:true,force:true});
}
