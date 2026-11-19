import {parseMindmap,serializeMindmap} from './dist/mindmap-model.js';
const button=(name,label)=>{const el=document.createElement('button');el.type='button';el.dataset.mindAction=name;el.textContent=label;return el;};
export function mountVisualMindmap(root,{source,onChange=()=>{},onError=console.error,editable=false}={}){
 const toolbar=document.createElement('div'),canvas=document.createElement('div'),hint=document.createElement('div');toolbar.className='mindmap-tools';canvas.className='visual-mindmap';canvas.tabIndex=0;canvas.setAttribute('role','application');canvas.setAttribute('aria-label','可视化思维导图');hint.className='mindmap-hint';hint.textContent='双击节点编辑 · Tab 子节点 · Enter 同级节点 · 拖动空白处移动画布';
 for(const [action,label] of [['child','子节点'],['sibling','同级节点'],['edit','改文字'],['remove','删除节点'],['fold','展开 / 折叠'],['undo','撤销'],['redo','重做'],['out','−'],['fit','适应画布'],['in','＋']])toolbar.append(button(action,label));
 const layout=document.createElement('select');layout.setAttribute('aria-label','思维导图布局');for(const [value,label]of [[1,'向右树状'],[2,'双向导图'],[3,'向下树状']]){const option=document.createElement('option');option.value=value;option.textContent=label;layout.append(option);}toolbar.append(layout);root.replaceChildren(toolbar,canvas,hint);
 let mind,destroyed=false,enabled=editable,ready=false;const abort=new AbortController();const data=parseMindmap(source);layout.value=data.direction;let last=serializeMindmap(data);
 function status(){toolbar.hidden=!enabled;hint.hidden=!enabled;root.dataset.editable=String(enabled);}
 const report=()=>{if(!mind||!ready||destroyed)return;try{const next=serializeMindmap(mind.getData());if(next!==last){onChange(next);last=next;}}catch(error){onError(error);}};
 // 内嵌导图容器高度跟随内容自然高度；由 scaleFit 把整张图完整缩放进容器（根节点不会被推到中央导致裁切）。
 const MIN_H=220,MAX_H=760,PAD=24;
 function fitCanvas(){
  if(!mind||!ready||destroyed)return;
  const block=canvas.closest('.document-diagram-block');
  if(!block){mind.scaleFit();return;}
  if(block.classList.contains('is-expanded')){canvas.style.height='';mind.scaleFit();return;}
  const nodes=canvas.querySelector('.me-nodes');if(!nodes)return;
  // 容器高度按内容自然高度撑开（不乘缩放），scaleFit 会同时按宽高把整图缩进容器，
  // 保证所有分支完整可见；超出上限时自动缩小而不是裁切。
  const natH=nodes.offsetHeight||1;
  const target=Math.max(MIN_H,Math.min(MAX_H,Math.ceil(natH)+PAD*2));
  if(Math.abs(canvas.clientHeight-target)>2)canvas.style.height=target+'px';
  mind.scaleFit();
 }
 const initialized=(async()=>{const [{default:MindElixir},{zh_CN}]=await Promise.all([import('mind-elixir'),import('mind-elixir/i18n')]);if(destroyed)return;
  mind=new MindElixir({el:canvas,direction:data.direction,editable:enabled,allowUndo:true,toolBar:false,contextMenu:{locale:zh_CN,focus:false,link:false},keypress:true,newTopicName:'新主题',overflowHidden:true,scaleMin:.15,scaleMax:2.5,theme:{name:'Document Tree',type:'light',palette:['#74b7eb','#ac98e8','#60c8ba','#e5b36d'],cssVar:{'--root-color':'#fff','--root-bgcolor':'#17242c','--root-border-color':'#17242c','--root-radius':'7px','--main-radius':'5px','--main-color':'#233243','--main-bgcolor':'#edf4fb','--main-border':'1px solid #a7b4c0','--color':'#25313d','--bgcolor':'#fff','--main-gap-x':'44px','--main-gap-y':'24px','--node-gap-x':'32px','--node-gap-y':'12px','--topic-padding':'7px 12px','--map-padding':'30px'}},before:{createArrow:()=>false,createSummary:()=>false,reshapeNode:(_topic,patch)=>!patch?.image}});
  const error=await mind.init(data);if(error)throw error;if(destroyed){mind.destroy();return;}ready=true;mind.bus.addListener('operation',operation=>{if(operation.name!=='beginEdit'){report();fitCanvas();}});mind.bus.addListener('changeDirection',()=>{report();fitCanvas();});fitCanvas();status();
 })().catch(error=>{if(!destroyed){canvas.textContent='暂时无法打开导图：'+error.message;onError(error);}});
 toolbar.addEventListener('pointerdown',event=>event.preventDefault(),{signal:abort.signal});
 // A click also selects the topic for keyboard and assistive-input paths.
 canvas.addEventListener('click',event=>{const topic=event.target.closest('.me-tpc');if(mind&&enabled&&topic&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey){mind.selectNode(topic);if(!mind.currentNodes.includes(topic)){mind.currentNodes=[topic];topic.classList.add('selected');}}},{signal:abort.signal});
 canvas.addEventListener('dblclick',event=>{const topic=event.target.closest('.me-tpc');if(mind&&enabled&&topic&&!canvas.querySelector('#input-box'))void mind.beginEdit(topic);},{signal:abort.signal});
 canvas.addEventListener('keyup',event=>{if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase()))report();},{signal:abort.signal});
 toolbar.addEventListener('click',async event=>{const action=event.target.closest('[data-mind-action]')?.dataset.mindAction;if(!action||!mind)return;try{const current=mind.currentNode||mind.findEle(mind.nodeData.id);if(action==='child')await mind.addChild(current);else if(action==='sibling'&&!current.nodeObj.root)await mind.insertSibling('after',current);else if(action==='edit')await mind.beginEdit(current);else if(action==='remove'&&!current.nodeObj.root)await mind.removeNodes([current]);else if(action==='fold')mind.expandNode(current);else if(action==='undo')mind.undo();else if(action==='redo')mind.redo();else if(action==='fit')mind.scaleFit();else if(action==='in')mind.scale(Math.min(2.5,mind.scaleVal*1.2));else if(action==='out')mind.scale(Math.max(.15,mind.scaleVal/1.2));if(['undo','redo'].includes(action))report();}catch(error){onError(error);}},{signal:abort.signal});
 layout.addEventListener('change',()=>{if(!mind)return;const direction=Number(layout.value);if(direction===1)mind.initRight();else if(direction===2)mind.initSide();else mind.initDown();report();mind.scaleFit();},{signal:abort.signal});
 const observer=new ResizeObserver(()=>{if(mind&&ready&&!destroyed)fitCanvas();});observer.observe(canvas);status();
 return {ready:initialized,setEditable(value){enabled=value;if(mind)value?mind.enableEdit():mind.disableEdit();status();},fit(){fitCanvas();},flush(){const active=document.activeElement;if(canvas.contains(active)&&active?.isContentEditable)active.blur();report();fitCanvas();},destroy(){destroyed=true;observer.disconnect();abort.abort();mind?.destroy();}};
}
