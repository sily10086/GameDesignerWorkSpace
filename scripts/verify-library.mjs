import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {defaultWorkspace,makeProject,diagramTemplates,listProjects,markProjectDeleted,restoreProject,purgeProjects,validateWorkspace} from '../dist/project-model.js';
import {BRAND,brandMarkup,libraryMarkup} from '../dist/library-view.js';
import {DiskStorage} from '../dist/disk-store.js';
import {ProjectStore,workspaceFiles} from '../storage.mjs';

const extras=[];
const tmp=async prefix=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),prefix));extras.push(dir);return dir;};
const exists=file=>fs.access(file).then(()=>true,()=>false);
const clone=structuredClone;
const empty={schema:1,active:null,projects:[]};

try{
 // ---------- 基础项目库行为 ----------
 const root=await tmp('gamedesigner-library-test-');
 const store=new ProjectStore(root);await store.init();
 const state=defaultWorkspace(),original=clone(state),p=state.projects[0];
 assert.equal(listProjects(state).length,1);assert.equal(listProjects(state,{query:'林间'}).length,1);
 await store.save(empty,state);
 const deleted=clone(state);markProjectDeleted(deleted,p.id);assert.equal(listProjects(deleted).length,0);assert.equal(listProjects(deleted,{deleted:true}).length,1);assert.equal(deleted.active,null);
 assert.equal((await store.save(state,deleted)).changedFiles,1,'deleting a project should change only metadata');
 const reloaded=await new ProjectStore(root).load();assert.equal(listProjects(reloaded).length,0);assert.deepEqual(reloaded.projects[0].docs.map(d=>d.id).sort(),p.docs.map(d=>d.id).sort());assert.ok([...workspaceFiles(reloaded).keys()].some(name=>name.endsWith('.mmd')));
 const stale=clone(state);stale.projects[0].tasks[0].description+=' stale task edit';await assert.rejects(store.save(state,stale),e=>e.status===409);
 restoreProject(deleted,p.id);await store.save(reloaded,deleted);assert.deepEqual(workspaceFiles(await store.load()),workspaceFiles(original));

 // ---------- 清空回收站：正常清理内部项目 ----------
 const purgeRoot=await tmp('gamedesigner-purge-test-');
 const purgeStore=new ProjectStore(purgeRoot);await purgeStore.init();
 const start=defaultWorkspace();
 const keeper=makeProject('保留项目','测试','Godot','保留');
 const doomed=makeProject('待清理项目','测试','Unity','连目录一起删除');
 start.projects.push(keeper,doomed);
 await purgeStore.save(empty,start);
 // 构造 attachments、文档 Image 和不在 workspaceFiles 里的目录，验证整目录删除。
 const doomedDir=path.join(purgeRoot,'Project',doomed.id);
 await fs.mkdir(path.join(doomedDir,'attachments'),{recursive:true});
 await fs.writeFile(path.join(doomedDir,'attachments','note.png'),'png');
 await fs.mkdir(path.join(doomedDir,'docs','doc-image-1','Image'),{recursive:true});
 await fs.writeFile(path.join(doomedDir,'docs','doc-image-1','Image','x.png'),'png');
 await fs.mkdir(path.join(doomedDir,'build'),{recursive:true});
 await fs.writeFile(path.join(doomedDir,'build','cache.bin'),'bin');
 const deletedBase=clone(start);markProjectDeleted(deletedBase,doomed.id);
 await purgeStore.save(start,deletedBase);
 const purged=clone(deletedBase);assert.equal(purgeProjects(purged,[doomed.id]).length,1);
 purged.projects.find(q=>q.id===keeper.id).name='保留项目（改名）';
 const result=await purgeStore.save(await purgeStore.load(),purged,{purge:[doomed.id]});
 assert.equal(result.purged,1);assert.equal(result.detached,0);assert.equal(result.changedFiles,1);
 assert.equal(await exists(doomedDir),false,'内部项目必须删除整个文件夹');
 const afterPurge=await purgeStore.load();
 assert.equal(afterPurge.projects.some(q=>q.id===doomed.id),false);
 assert.equal(afterPurge.projects.find(q=>q.id===keeper.id).name,'保留项目（改名）','同一请求中的普通修改必须保存');
 assert.equal((await new ProjectStore(purgeRoot).load()).projects.some(q=>q.id===doomed.id),false,'重新载入不能复现已清理项目');
 assert.equal((await fs.readdir(path.join(purgeRoot,'Project'))).some(name=>name.startsWith('.purge-')),false,'清理临时目录不能残留');

 // ---------- 单项目清理：只删目标，其它项目完整保留且不复现 ----------
 const singleRoot=await tmp('gamedesigner-single-purge-test-');
 const singleStore=new ProjectStore(singleRoot);await singleStore.init();
 const singleStart=defaultWorkspace();
 const singleKeep=makeProject('回收站保留项目','测试','Godot','内容完整保留');
 const singleGone=makeProject('回收站清理项目','测试','Unity','只删这个项目');
 singleStart.projects.push(singleKeep,singleGone);
 await singleStore.save(empty,singleStart);
 const singleDeleted=clone(singleStart);markProjectDeleted(singleDeleted,singleKeep.id);markProjectDeleted(singleDeleted,singleGone.id);
 await singleStore.save(singleStart,singleDeleted);
 const singleGoneDir=path.join(singleRoot,'Project',singleGone.id);
 await fs.mkdir(path.join(singleGoneDir,'attachments'),{recursive:true});
 await fs.writeFile(path.join(singleGoneDir,'attachments','note.png'),'png');
 const singleFinal=clone(singleDeleted);assert.equal(purgeProjects(singleFinal,[singleGone.id]).length,1);
 const singleResult=await singleStore.save(await singleStore.load(),singleFinal,{purge:[singleGone.id]});
 assert.equal(singleResult.purged,1);assert.equal(singleResult.detached,0);
 assert.equal(await exists(singleGoneDir),false,'单项目清理必须删除目标目录');
 const singleAfter=await singleStore.load();
 assert.equal(singleAfter.projects.some(q=>q.id===singleGone.id),false,'已清理项目不能通过 load 复现');
 const kept=singleAfter.projects.find(q=>q.id===singleKeep.id);
 assert.ok(kept,'其它回收站项目必须完整保留');
 assert.equal(kept.deletedAt,singleDeleted.projects.find(q=>q.id===singleKeep.id).deletedAt,'其它项目的删除状态不能被改动');
 const singleExpected=clone(singleDeleted);singleExpected.projects=singleExpected.projects.filter(q=>q.id!==singleGone.id);singleExpected.active=null;
 const singleActual=clone(singleAfter);singleActual.active=null;
 assert.deepEqual(workspaceFiles(singleActual),workspaceFiles(singleExpected),'其它项目内容必须完整保留');
 assert.equal((await new ProjectStore(singleRoot).load()).projects.some(q=>q.id===singleGone.id),false,'全新 ProjectStore 不能复现已清理项目');

 // ---------- 非回收站项目即使前端传了 id 也要被拒绝（409），磁盘不动 ----------
 const activeTarget=makeProject('仍在使用不能清理','测试','Unity','');
 let withActive=await singleStore.load();withActive.projects.push(activeTarget);await singleStore.save(await singleStore.load(),withActive);
 const activeDir=path.join(singleRoot,'Project',activeTarget.id);
 await fs.mkdir(path.join(activeDir,'attachments'),{recursive:true});
 await fs.writeFile(path.join(activeDir,'attachments','keep.png'),'png');
 // base 如实说明项目仍在使用：服务端直接拒绝。
 const honestState=clone(withActive);honestState.projects=honestState.projects.filter(q=>q.id!==activeTarget.id);
 await assert.rejects(singleStore.save(withActive,honestState,{purge:[activeTarget.id]}),e=>e.status===409&&/回收站/.test(e.message));
 // base 谎称已删除：磁盘 project.json 没有 deletedAt，仍然拒绝。
 const activeLieBase=clone(withActive);activeLieBase.projects.find(q=>q.id===activeTarget.id).deletedAt=new Date().toISOString();
 const activeLieState=clone(activeLieBase);activeLieState.projects=activeLieState.projects.filter(q=>q.id!==activeTarget.id);
 await assert.rejects(singleStore.save(activeLieBase,activeLieState,{purge:[activeTarget.id]}),e=>e.status===409&&/回收站/.test(e.message));
 assert.equal(await exists(activeDir),true,'非回收站项目磁盘不能被删除');
 assert.equal(await fs.readFile(path.join(activeDir,'attachments','keep.png'),'utf8'),'png','非回收站项目内容不能被改动');
 assert.ok((await singleStore.load()).projects.some(q=>q.id===activeTarget.id),'非回收站项目必须仍在项目库');

 // ---------- 非回收站项目必须被拒绝，且不能产生半完成删除 ----------
 const second=makeProject('第二个回收站项目','测试','Unity','');
 let withSecond=await purgeStore.load();withSecond.projects.push(second);await purgeStore.save(await purgeStore.load(),withSecond);
 const secondDeleted=clone(withSecond);markProjectDeleted(secondDeleted,second.id);await purgeStore.save(withSecond,secondDeleted);
 const secondDir=path.join(purgeRoot,'Project',second.id);
 await fs.mkdir(path.join(secondDir,'attachments'),{recursive:true});
 await fs.writeFile(path.join(secondDir,'attachments','keep.png'),'png');
 // base 谎称正在使用的 keeper 已删除；磁盘 project.json 没有 deletedAt，服务端必须拒绝。
 const lieBase=clone(secondDeleted);lieBase.projects.find(q=>q.id===keeper.id).deletedAt=new Date().toISOString();
 const lieState=clone(lieBase);lieState.projects=lieState.projects.filter(q=>q.id!==second.id&&q.id!==keeper.id);
 await assert.rejects(purgeStore.save(lieBase,lieState,{purge:[second.id,keeper.id]}),e=>e.status===409&&/回收站/.test(e.message));
 assert.equal(await exists(secondDir),true,'校验失败时不能提前删除排在前面的项目');
 assert.equal(await exists(path.join(purgeRoot,'Project',keeper.id)),true);
 assert.throws(()=>purgeProjects(clone(state),[p.id]),/回收站/,'前端模型也必须拒绝清理未删除项目');
 // 校验通过后才真正删除。
 const secondFinal=clone(secondDeleted);purgeProjects(secondFinal,[second.id]);
 assert.equal((await purgeStore.save(await purgeStore.load(),secondFinal,{purge:[second.id]})).purged,1);
 assert.equal(await exists(secondDir),false);

 // ---------- 无效 id / 重复 id / 空列表 ----------
 const third=makeProject('第三个回收站项目','测试','Unity','');
 let withThird=await purgeStore.load();withThird.projects.push(third);await purgeStore.save(await purgeStore.load(),withThird);
 const thirdDeleted=clone(withThird);markProjectDeleted(thirdDeleted,third.id);await purgeStore.save(withThird,thirdDeleted);
 const thirdFinal=clone(thirdDeleted);purgeProjects(thirdFinal,[third.id]);
 const thirdDir=path.join(purgeRoot,'Project',third.id);
 await assert.rejects(purgeStore.save(thirdDeleted,thirdFinal,{purge:[third.id,'../evil']}),e=>e.status===400);
 assert.equal(await exists(thirdDir),true,'无效 id 不能让其它项目被提前删除');
 const duplicate=await purgeStore.save(thirdDeleted,thirdFinal,{purge:[third.id,third.id]});
 assert.equal(duplicate.purged,1,'重复 id 只清理一次');
 assert.equal(await exists(thirdDir),false);
 assert.deepEqual(purgeProjects(clone(thirdFinal),[]),[]);
 const noPurge=await purgeStore.save(await purgeStore.load(),await purgeStore.load(),{purge:[]});
 assert.equal(noPurge.purged,0);

 // ---------- 项目文件夹已被手工删除：幂等成功，不报错也不复现 ----------
 const ghost=makeProject('磁盘上已不存在','测试','Unity','');
 let withGhost=await purgeStore.load();withGhost.projects.push(ghost);await purgeStore.save(await purgeStore.load(),withGhost);
 const ghostDeleted=clone(withGhost);markProjectDeleted(ghostDeleted,ghost.id);await purgeStore.save(withGhost,ghostDeleted);
 await fs.rm(path.join(purgeRoot,'Project',ghost.id),{recursive:true,force:true});
 const ghostBase=await purgeStore.load(),ghostFinal=clone(ghostBase);
 const ghostResult=await purgeStore.save(ghostBase,ghostFinal,{purge:[ghost.id]});
 assert.equal(ghostResult.purged,0);assert.equal(ghostResult.skipped,1);
 assert.equal((await purgeStore.load()).projects.some(q=>q.id===ghost.id),false);

 // ---------- 元数据损坏的项目目录不能被删除 ----------
 const broken=makeProject('元数据损坏','测试','Unity','');
 let withBroken=await purgeStore.load();withBroken.projects.push(broken);await purgeStore.save(await purgeStore.load(),withBroken);
 const brokenDeleted=clone(withBroken);markProjectDeleted(brokenDeleted,broken.id);await purgeStore.save(withBroken,brokenDeleted);
 const brokenDir=path.join(purgeRoot,'Project',broken.id);
 await fs.rm(path.join(brokenDir,'project.json'));
 await assert.rejects(purgeStore.purgeProjects([broken.id]),e=>e.status===409&&/元数据缺失/.test(e.message));
 assert.equal(await exists(brokenDir),true,'无法证明 deletedAt 时不能删除目录');
 await fs.rm(brokenDir,{recursive:true,force:true});

 // ---------- 外部关联项目：连它关联的文件夹一起删除 ----------
 const outside=await tmp('gamedesigner-outside-test-');
 const outerRoot=await tmp('gamedesigner-outer-test-');
 const externalStore=new ProjectStore(outerRoot,{externalRoot:outside});await externalStore.init();
 const externalState=defaultWorkspace(),externalId=externalState.projects[0].id;
 await externalStore.save(empty,externalState);
 const externalDir=path.join(outside,externalId);
 await fs.writeFile(path.join(externalDir,'user-notes.txt'),'keep');
 // 磁盘上未删除的外部项目：即使 base 谎称已删除也必须拒绝。
 const extLieBase=clone(externalState);extLieBase.projects[0].deletedAt=new Date().toISOString();
 await assert.rejects(externalStore.save(extLieBase,empty,{purge:[externalId]}),e=>e.status===409);
 assert.equal(await exists(externalDir),true);
 // 危险目标兜底：不能把工作台自己的目录当成项目文件夹删掉。
 externalStore.mounts.set(externalId,outerRoot);
 await assert.rejects(externalStore.purgeProjects([externalId]),e=>e.status===409&&/拒绝删除工作台自己的目录/.test(e.message));
 assert.equal(await exists(outerRoot),true);
 externalStore.mounts.set(externalId,externalDir);
 const externalDeleted=clone(externalState);markProjectDeleted(externalDeleted,externalId);await externalStore.save(externalState,externalDeleted);
 const externalFinal=clone(externalDeleted);purgeProjects(externalFinal,[externalId]);
 const externalResult=await externalStore.save(await externalStore.load(),externalFinal,{purge:[externalId]});
 assert.equal(externalResult.purged,1);assert.equal(externalResult.detached,0);
 assert.equal(await exists(externalDir),false,'外部关联项目的文件夹要一起删掉');
 assert.equal((await externalStore.load()).projects.length,0);
 const registry=JSON.parse(await fs.readFile(path.join(outerRoot,'.workbench','library.json'),'utf8'));
 assert.equal(registry.projects.some(item=>item.id===externalId),false,'library.json 不能残留外部关联');
 const freshExternal=new ProjectStore(outerRoot,{externalRoot:outside});await freshExternal.init();
 assert.equal((await freshExternal.load()).projects.some(q=>q.id===externalId),false,'重新载入不能从 registry 复现');
 // 文件夹已经被用户自己删掉：不要再报错，只清掉索引里的关联。
 const ghostId='ghostproject001';externalStore.mounts.set(ghostId,path.join(outside,ghostId));
 const ghostDetach=await externalStore.purgeProjects([ghostId]);
 assert.deepEqual(ghostDetach.detached,[ghostId]);assert.equal(externalStore.mounts.has(ghostId),false);

 // ---------- 自定义项目名与安全渲染（原有覆盖） ----------
 const custom=makeProject('自定义游戏：星港计划','模拟经营','Godot','名字由用户决定');state.projects.push(custom);assert.equal(validateWorkspace(state),true);await store.save(original,state);assert.ok((await store.load()).projects.some(q=>q.name==='自定义游戏：星港计划'));
 custom.name='改名后的星港';await store.save(await store.load(),state);assert.ok((await store.load()).projects.some(q=>q.name==='改名后的星港'&&q.id===custom.id));
 const html=libraryMarkup({state,query:'星港',status:'已保存到 Project',icon:()=>''});assert.ok(html.includes(BRAND));assert.ok(html.includes('改名后的星港'));assert.ok(!html.includes('林间来信'));assert.ok(html.includes('data-delete-project'));assert.ok(html.includes('data-rename-project'));
 const escaped=clone(state);escaped.projects[0].name='<img src=x onerror=alert(1)>';assert.ok(!libraryMarkup({state:escaped,status:'saved',icon:()=>''}).includes('<img src=x'));
 const invalid=clone(state);invalid.projects[0].deletedAt={invalid:true};assert.equal(validateWorkspace(invalid),false);
 const purgeView=clone(original);markProjectDeleted(purgeView,p.id);
 const trashHtml=libraryMarkup({state:purgeView,deleted:true,status:'saved',icon:()=>''});
 assert.ok(trashHtml.includes('data-action="purge-trash"'),'回收站要有清空按钮');
 assert.ok(trashHtml.includes('data-purge-project'),'回收站卡片要有单项目彻底删除按钮');
 assert.ok(!libraryMarkup({state:original,status:'saved',icon:()=>''}).includes('data-action="purge-trash"'),'项目库不显示清空按钮');
 assert.ok(!libraryMarkup({state:original,status:'saved',icon:()=>''}).includes('data-purge-project'),'项目库不显示单项目彻底删除按钮');

 // ---------- DiskStorage.purge：只带 ids，成功后同步 base，失败不改 base ----------
 const calls=[],originalFetch=globalThis.fetch;
 const purgeState=defaultWorkspace(),purgeId=purgeState.projects[0].id;markProjectDeleted(purgeState,purgeId);
 const diskOk=new DiskStorage(()=>purgeState,()=>{});
 diskOk.ready=true;diskOk.base=clone(purgeState);
 globalThis.fetch=async(url,options)=>{calls.push({url,method:options?.method,body:options?.body});return {ok:true,status:200,json:async()=>({purged:1,detached:0,skipped:0,warnings:[]})};};
 try{
  const {state:purgedState}=await diskOk.purge([purgeId]);
  assert.equal(purgedState.projects.length,0);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/trash/purge');assert.equal(calls[0].method,'POST');
  assert.deepEqual(JSON.parse(calls[0].body).ids,[purgeId]);
  assert.equal(diskOk.base.projects.length,0,'成功后 base 要同步');
  assert.notStrictEqual(diskOk.base,purgedState,'base 必须与页面 state 分开，不能共用对象');
  // 页面接收清理后的 state 再继续编辑时，必须重新标脏，不能被误判为已保存。
  let uiState=defaultWorkspace(),uiId=uiState.projects[0].id;markProjectDeleted(uiState,uiId);
  const diskUi=new DiskStorage(()=>uiState,()=>{});diskUi.ready=true;diskUi.base=clone(uiState);
  const uiOut=await diskUi.purge([uiId]);
  uiState=uiOut.state;uiState.projects.push(makeProject('清理后新建的项目','测试','Unity',''));
  diskUi.markDirty();assert.equal(diskUi.dirty,true,'清理后继续编辑必须重新标脏');
  diskUi.ready=false;clearTimeout(diskUi.timer);
  // 有未保存修改且保存失败时，不能发起删除请求。
  const dirtyState=defaultWorkspace(),dirtyId=dirtyState.projects[0].id;markProjectDeleted(dirtyState,dirtyId);
  const diskDirty=new DiskStorage(()=>dirtyState,()=>{});
  diskDirty.ready=true;diskDirty.base=clone(dirtyState);diskDirty.base.projects[0].name='磁盘上的旧名称';diskDirty.version=1;
  globalThis.fetch=async(url,options)=>{calls.push({url,method:options?.method});return {ok:false,status:409,json:async()=>({error:'存在未保存的冲突'})};};
  const beforeCalls=calls.length;
  await assert.rejects(diskDirty.purge([dirtyId]),/存在未保存的冲突/);
  assert.equal(calls.length,beforeCalls+1);assert.ok(!calls.slice(beforeCalls).some(call=>call.url==='/api/trash/purge'),'保存失败后不能继续删除');
  assert.equal(diskDirty.base.projects.length,1,'失败时 base 必须保持不变');
  // 服务端失败时页面状态/base 也不能变。
  const failState=defaultWorkspace(),failId=failState.projects[0].id;markProjectDeleted(failState,failId);
  const diskFail=new DiskStorage(()=>failState,()=>{});
  diskFail.ready=true;diskFail.base=clone(failState);
  globalThis.fetch=async()=>({ok:false,status:500,json:async()=>({error:'磁盘删除失败'})});
  await assert.rejects(diskFail.purge([failId]),/磁盘删除失败/);
  assert.deepEqual(diskFail.base,failState,'失败时 base 不能被替换');
 }finally{globalThis.fetch=originalFetch;}

 // ---------- 真实 UI 函数（小 DOM 环境） ----------
 const elements=new Map(),element=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',children:[],disabled:false,classList:{add(){},remove(){}},querySelector(){return null;}});return elements.get(selector);};
 const context={document:{title:'',querySelector:element,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){},scrollTo(){}},sessionStorage:{setItem(){},getItem(){return null;}},crypto:webcrypto,structuredClone,TextEncoder,URL,Blob,console,setTimeout:()=>0,clearTimeout(){},makeProject,diagramTemplates,listProjects,markProjectDeleted,restoreProject,purgeProjects,validBackup:validateWorkspace,BRAND,brandMarkup,libraryMarkup,DiskStorage,setupRepositoryUI:()=>{},setupUpdateUI:()=>{},api:async()=>{throw new Error('Unexpected API call');}};
 let source=await fs.readFile(new URL('../dist/app.js',import.meta.url),'utf8');source=source.replace(/^import .*;\r?\n/gm,'').replace('void initializeWorkspace();','');
 vm.runInNewContext(source+'\n;globalThis.qa={setState:value=>{state=value;},getState:()=>state,getPage:()=>page,getActive:()=>state.active,getDisk:()=>disk,enterProject,navigate,render,purgeTrash,confirmPurgeTrash,confirmPurgeProject,purgeProject};',context);
 context.qa.setState(clone(original));assert.equal(context.qa.getPage(),'library');context.qa.render();assert.ok(element('#app').innerHTML.includes('library-projects'));context.qa.enterProject(p.id);assert.equal(context.qa.getPage(),'overview');assert.ok(element('#app').innerHTML.includes('返回项目库'));context.qa.navigate('library');assert.equal(context.qa.getActive(),null);assert.equal(context.qa.getPage(),'library');
 const allDeleted=clone(original);markProjectDeleted(allDeleted,p.id);context.qa.setState(allDeleted);context.qa.enterProject(p.id);assert.equal(context.qa.getPage(),'library');context.qa.render();assert.ok(element('#app').innerHTML.includes('library-new-card'));
 // 二次确认必须写明不可恢复并列出项目名。
 context.qa.setState(clone(allDeleted));context.qa.confirmPurgeTrash();
 const modalHtml=element('#modal-root').innerHTML;
 assert.ok(modalHtml.includes('不可恢复'),'确认弹窗要写明不可恢复');
 assert.ok(modalHtml.includes(p.name),'确认弹窗要列出项目名');
 assert.ok(modalHtml.includes('confirm-purge-trash'));
 assert.ok(modalHtml.includes('会连同它关联的那个文件夹一起删掉'));
 // 成功后切换到清理后的状态，失败时保留原项目。
 let askedIds=null;
 context.qa.getDisk().purge=async ids=>{askedIds=ids;const next=clone(allDeleted);next.projects=next.projects.filter(q=>!ids.includes(q.id));next.active=null;return {state:next,result:{purged:ids.length,detached:0,skipped:0,warnings:[]}};};
 await context.qa.purgeTrash();
 assert.deepEqual(askedIds,[p.id]);assert.equal(context.qa.getState().projects.length,0);assert.equal(context.qa.getPage(),'library');assert.ok(element('#toast').textContent.includes('已彻底删除'));
 context.qa.setState(clone(allDeleted));
 context.qa.getDisk().purge=async()=>{throw new Error('磁盘删除失败');};
 await context.qa.purgeTrash();
 assert.equal(context.qa.getState().projects.length,1,'失败后页面必须保留项目');assert.ok(element('#toast').textContent.includes('未完成'));
 // 空回收站不弹确认、也不发删除请求。
 let emptyPurgeCalled=false;
 context.qa.setState(clone(original));
 context.qa.getDisk().purge=async()=>{emptyPurgeCalled=true;return {state:clone(original),result:{purged:0,detached:0,skipped:0,warnings:[]}};};
 context.qa.confirmPurgeTrash();assert.ok(element('#toast').textContent.includes('回收站已经是空的'));
 await context.qa.purgeTrash();assert.equal(emptyPurgeCalled,false,'空回收站不能发删除请求');
 // 单项目彻底删除：卡片按钮、确认文案与成功/失败行为。
 assert.ok(trashHtml.includes('data-purge-project="'+p.id+'"'),'回收站卡片要有对应项目的彻底删除按钮');
 context.qa.setState(clone(allDeleted));
 context.qa.confirmPurgeProject(p.id);
 const singleModal=element('#modal-root').innerHTML;
 assert.ok(singleModal.includes('彻底删除项目'),'单项目弹窗标题');
 assert.ok(singleModal.includes('不可恢复'),'单项目确认弹窗要写明不可恢复');
 assert.ok(singleModal.includes(p.name),'单项目确认弹窗要列出项目名');
 assert.ok(singleModal.includes('整个项目文件夹'),'内部项目要说明删除整个文件夹');
 assert.ok(singleModal.includes('data-action="confirm-purge-project"')&&singleModal.includes('data-id="'+p.id+'"'));
 context.qa.getDisk().projectInfo[p.id]={external:true,directory:'D:\\Outside\\Demo'};
 context.qa.confirmPurgeProject(p.id);
 const externalModal=element('#modal-root').innerHTML;
 assert.ok(externalModal.includes('会从磁盘删除它关联的项目文件夹'),'外部项目要说明连文件夹一起删');
 assert.ok(externalModal.includes('D:\\Outside\\Demo'),'外部项目要写明将被删除的文件夹路径');
 delete context.qa.getDisk().projectInfo[p.id];
 context.qa.setState(clone(allDeleted));
 let singleIds=null;
 context.qa.getDisk().purge=async ids=>{singleIds=ids;const next=clone(allDeleted);next.projects=next.projects.filter(q=>!ids.includes(q.id));next.active=null;return {state:next,result:{purged:ids.length,detached:0,skipped:0,warnings:[]}};};
 await context.qa.purgeProject(p.id);
 assert.equal(singleIds.length,1);assert.equal(singleIds[0],p.id);assert.equal(context.qa.getState().projects.length,0);
 assert.ok(element('#toast').textContent.includes('已彻底删除项目「'+p.name+'」'));
 context.qa.setState(clone(allDeleted));
 context.qa.getDisk().purge=async()=>{throw new Error('磁盘删除失败');};
 await context.qa.purgeProject(p.id);
 assert.equal(context.qa.getState().projects.length,1,'单项目清理失败后必须保留项目');
 assert.ok(element('#toast').textContent.includes('未完成'));
 console.log('PASS: library landing, custom names, enter/return, delete/restore, purge (internal/external/reject/atomic/idempotent/single), reload persistence, safe rendering, DiskStorage failure handling, and UI confirmation.');
}finally{
 for(const dir of extras){const clean=path.resolve(dir);assert.equal(path.dirname(clean),path.resolve(os.tmpdir()));assert.ok(path.basename(clean).startsWith('gamedesigner-'),'测试目录必须在系统临时目录内');await fs.rm(clean,{recursive:true,force:true});}
}
