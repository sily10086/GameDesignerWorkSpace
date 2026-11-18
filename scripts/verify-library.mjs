import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {defaultWorkspace,makeProject,diagramTemplates,listProjects,markProjectDeleted,restoreProject,validateWorkspace} from '../dist/project-model.js';
import {BRAND,brandMarkup,libraryMarkup} from '../dist/library-view.js';
import {DiskStorage} from '../dist/disk-store.js';
import {ProjectStore,workspaceFiles} from '../storage.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'gamedesigner-library-test-'));
try{
 const store=new ProjectStore(root);await store.init();
 const state=defaultWorkspace(),original=structuredClone(state),p=state.projects[0];
 assert.equal(listProjects(state).length,1);assert.equal(listProjects(state,{query:'林间'}).length,1);
 await store.save({schema:1,active:null,projects:[]},state);
 const deleted=structuredClone(state);markProjectDeleted(deleted,p.id);assert.equal(listProjects(deleted).length,0);assert.equal(listProjects(deleted,{deleted:true}).length,1);assert.equal(deleted.active,null);
 assert.equal((await store.save(state,deleted)).changedFiles,1,'deleting a project should change only metadata');
 const reloaded=await new ProjectStore(root).load();assert.equal(listProjects(reloaded).length,0);assert.deepEqual(reloaded.projects[0].docs.map(d=>d.id).sort(),p.docs.map(d=>d.id).sort());assert.ok([...workspaceFiles(reloaded).keys()].some(name=>name.endsWith('.mmd')));
 const stale=structuredClone(state);stale.projects[0].tasks[0].description+=' stale task edit';await assert.rejects(store.save(state,stale),e=>e.status===409);
 restoreProject(deleted,p.id);await store.save(reloaded,deleted);assert.deepEqual(workspaceFiles(await store.load()),workspaceFiles(original));
 const custom=makeProject('自定义游戏：星港计划','模拟经营','Godot','名字由用户决定');state.projects.push(custom);assert.equal(validateWorkspace(state),true);await store.save(original,state);assert.ok((await store.load()).projects.some(q=>q.name==='自定义游戏：星港计划'));
 custom.name='改名后的星港';await store.save(await store.load(),state);assert.ok((await store.load()).projects.some(q=>q.name==='改名后的星港'&&q.id===custom.id));
 const html=libraryMarkup({state,query:'星港',status:'已保存到 Project',icon:()=>''});assert.ok(html.includes(BRAND));assert.ok(html.includes('改名后的星港'));assert.ok(!html.includes('林间来信'));assert.ok(html.includes('data-delete-project'));assert.ok(html.includes('data-rename-project'));
 const escaped=structuredClone(state);escaped.projects[0].name='<img src=x onerror=alert(1)>';assert.ok(!libraryMarkup({state:escaped,status:'saved',icon:()=>''}).includes('<img src=x'));
 const invalid=structuredClone(state);invalid.projects[0].deletedAt={invalid:true};assert.equal(validateWorkspace(invalid),false);
 // Run the real UI functions against a small DOM surface, without a browser or disk mutations.
 const elements=new Map(),element=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',children:[],classList:{add(){},remove(){}},querySelector(){return null;}});return elements.get(selector);};
 const context={document:{title:'',querySelector:element,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){},scrollTo(){}},sessionStorage:{setItem(){},getItem(){return null;}},crypto:webcrypto,structuredClone,TextEncoder,URL,Blob,console,setTimeout:()=>0,clearTimeout(){},makeProject,diagramTemplates,listProjects,markProjectDeleted,restoreProject,validBackup:validateWorkspace,BRAND,brandMarkup,libraryMarkup,DiskStorage,setupRepositoryUI:()=>{},setupUpdateUI:()=>{},api:async()=>{throw new Error('Unexpected API call');}};
 let source=await fs.readFile(new URL('../dist/app.js',import.meta.url),'utf8');source=source.replace(/^import .*;\r?\n/gm,'').replace('void initializeWorkspace();','');
 vm.runInNewContext(source+'\n;globalThis.qa={setState:value=>{state=value;},getPage:()=>page,getActive:()=>state.active,enterProject,navigate,render};',context);
 context.qa.setState(structuredClone(original));assert.equal(context.qa.getPage(),'library');context.qa.render();assert.ok(element('#app').innerHTML.includes('library-projects'));context.qa.enterProject(p.id);assert.equal(context.qa.getPage(),'overview');assert.ok(element('#app').innerHTML.includes('返回项目库'));context.qa.navigate('library');assert.equal(context.qa.getActive(),null);assert.equal(context.qa.getPage(),'library');
 const allDeleted=structuredClone(original);markProjectDeleted(allDeleted,p.id);context.qa.setState(allDeleted);context.qa.enterProject(p.id);assert.equal(context.qa.getPage(),'library');context.qa.render();assert.ok(element('#app').innerHTML.includes('library-new-card'));
 console.log('PASS: library landing, custom names, enter/return, delete/restart/restore, stale-edit rejection, search, safe rendering, and empty-library creation.');
}finally{const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('gamedesigner-library-test-'));await fs.rm(resolved,{recursive:true,force:true});}
