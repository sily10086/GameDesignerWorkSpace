import {Node} from '@tiptap/core';
import {diagramBlock} from './dist/mindmap-model.js';
import {mountVisualMindmap} from './mindmap-entry.js';
import {mountVisualFlowchart} from './flowchart-entry.js';
export function documentDiagramExtension(options={}){return Node.create({
 name:'designDiagram',group:'block',atom:true,draggable:true,
 addAttributes(){return {id:{default:''}};},
 parseHTML(){return [{tag:'figure[data-diagram-id]',getAttrs:el=>({id:el.dataset.diagramId})}];},
 renderHTML({node}){return ['figure',{'data-diagram-id':node.attrs.id},'设计图表'];},
 markdownTokenName:'designDiagram',
 markdownTokenizer:{name:'designDiagram',level:'block',start:':::gdws-diagram ',tokenize(src){const match=src.match(/^:::gdws-diagram ([A-Za-z0-9_-]+)\s*\n:::(?:\n|$)/);if(match)return {type:'designDiagram',raw:match[0],id:match[1]};}},
 parseMarkdown(token,h){return h.createNode('designDiagram',{id:token.id});},
 renderMarkdown(node){return diagramBlock(node.attrs.id);},
 addNodeView(){return ({node,editor,getPos})=>{
  const dom=document.createElement('figure');dom.className='document-diagram-block';dom.contentEditable='false';dom.dataset.diagramId=node.attrs.id;
  const header=document.createElement('figcaption'),title=document.createElement('span'),controls=document.createElement('div'),body=document.createElement('div');header.className='document-diagram-caption';body.className='document-diagram-canvas';body.id='diagram-block-'+crypto.randomUUID();
  const g=options.resolveDiagram?.(node.attrs.id);title.textContent=g?.title||'未找到图表';header.append(title,controls);dom.append(header,body);let map,editing=false;
  function control(label,action){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',action);controls.append(button);return button;}
  const edit=control('编辑',()=>{if(!editor.isEditable)return;editing=!editing;map?.setEditable(editing);edit.textContent=editing?'完成编辑':'编辑';});
  const expand=control('展开',()=>{const full=dom.classList.toggle('is-expanded');expand.textContent=full?'收起':'展开';map?.fit();});
  const advanced=control('图表源码',()=>options.onOpenDiagram?.(g?.id,true));advanced.className='diagram-advanced';
  control('移除',()=>{if(!editor.isEditable)return;const position=getPos();if(typeof position==='number')editor.commands.deleteRange({from:position,to:position+node.nodeSize});});
  if(g)try{map=(g.type==='mindmap'?mountVisualMindmap:mountVisualFlowchart)(body,{source:g.source,onChange:source=>options.onDiagramChange?.(g.id,source),onError:options.onError});}catch(error){body.textContent=error.message;options.onRenderFlow?.(g,body.id);}
  else body.textContent='图表数据未找到，请从思维导图或流程图页签中重新插入。';
  dom.addEventListener('keydown',event=>{if(event.key==='Escape'&&dom.classList.contains('is-expanded')){event.preventDefault();event.stopPropagation();dom.classList.remove('is-expanded');expand.textContent='展开';map?.fit();}},true);
  const view={setReadOnly(value){if(value){editing=false;map?.setEditable(false);edit.textContent='编辑';}edit.disabled=value;},flush(){map?.flush();},destroy(){map?.destroy();options.onBlockView?.(view,false);}};options.onBlockView?.(view,true);
  return {dom,stopEvent:()=>true,ignoreMutation:()=>true,update(next){return next.type.name==='designDiagram'&&next.attrs.id===node.attrs.id;},destroy:view.destroy};
 }},
});}
