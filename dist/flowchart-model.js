const escapeText=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\r?\n/g,'<br/>');
const unescapeText=value=>value.replace(/<br\s*\/?\s*>/gi,'\n').replace(/&(?:amp|lt|gt|quot|#124);/g,v=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#124;':'|'}[v]));
export function parseFlowchart(source){
 if(typeof source!=='string'||source.length>50000)throw new Error('流程图内容过大。');let header=false,direction='TD',view={},nodes=new Map(),edges=[];
 function node(text){const match=text.trim().match(/^([A-Za-z_][\w-]*)(?:\s*(\(\[|\(\(|\[|\{|\()([\s\S]*?)(\]\)|\)\)|\]|\}|\)))?$/);if(!match)throw new Error('这张流程图包含特殊语法，请使用图表源码编辑，原内容已保留。');const id=match[1];if(!nodes.has(id))nodes.set(id,{id,type:'rect',text:id});if(match[2]){const value=nodes.get(id);value.type=match[2]==='{'?'diamond':['([','((','('].includes(match[2])?'ellipse':'rect';value.text=unescapeText(match[3].replace(/^"([\s\S]*)"$/,'$1'));}return id;}
 for(const raw of source.split(/\r?\n/)){const line=raw.trim();if(!line)continue;if(line.startsWith('%% gdws-flow ')){try{view=JSON.parse(line.slice(13));}catch{}continue;}if(line.startsWith('%%'))continue;
  if(!header){const match=line.match(/^(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)$/);if(!match)throw new Error('此内容不是支持的流程图。');direction=match[1];header=true;continue;}
  const parts=line.split(/\s*-->(?:\|([^|]*)\|)?\s*/);if(parts.length===1){node(line.replace(/;$/,''));continue;}let previous=node(parts[0]);for(let i=1;i<parts.length;i+=2){const label=unescapeText(parts[i]||''),target=node(parts[i+1].replace(/;$/,''));edges.push({id:'edge_'+edges.length,type:'polyline',sourceNodeId:previous,targetNodeId:target,...(label?{text:label}:{})});previous=target;}
 }
 if(!header||nodes.size>500||edges.length>1000)throw new Error('流程图无效或节点过多。');
 const levels=new Map(),queue=[];for(const id of nodes.keys())if(!edges.some(e=>e.targetNodeId===id)){levels.set(id,0);queue.push(id);}if(!queue.length){levels.set(nodes.keys().next().value,0);queue.push(nodes.keys().next().value);}
 while(queue.length){const id=queue.shift();for(const edge of edges.filter(e=>e.sourceNodeId===id))if(!levels.has(edge.targetNodeId)){levels.set(edge.targetNodeId,(levels.get(id)||0)+1);queue.push(edge.targetNodeId);}}
 const rows=new Map();let extra=0;for(const n of nodes.values()){const level=levels.get(n.id)??extra++,index=rows.get(level)||0;rows.set(level,index+1);const horizontal=['LR','RL'].includes(direction);n.x=horizontal?100+level*230:150+index*260;n.y=horizontal?100+index*140:100+level*160;
  const position=view.positions?.[n.id];if(position&&Number.isFinite(position.x)&&Number.isFinite(position.y)&&Math.abs(position.x)<100000&&Math.abs(position.y)<100000){n.x=position.x;n.y=position.y;}}
 return {nodes:[...nodes.values()],edges};
}
export function serializeFlowchart(data){
 if(!Array.isArray(data.nodes)||!Array.isArray(data.edges)||data.nodes.length>500||data.edges.length>1000)throw new Error('流程图节点过多。');const ids=new Map();const cleanId=id=>{if(ids.has(id))return ids.get(id);const value=(String(id).startsWith('node_')?'':'node_')+String(id).replace(/[^A-Za-z0-9_-]/g,'_');ids.set(id,value);return value;};
 const positions={},lines=['flowchart TD'];const label=text=>escapeText(typeof text==='string'?text:text?.value||'');
 for(const n of data.nodes){const id=cleanId(n.id);positions[id]={x:n.x,y:n.y};const pair=n.type==='diamond'?['{','}']:n.type==='ellipse'?['([','])']:['[',']'];lines.push('  '+id+pair[0]+'"'+label(n.text)+'"'+pair[1]);}
 for(const e of data.edges){if(!data.nodes.some(n=>n.id===e.sourceNodeId)||!data.nodes.some(n=>n.id===e.targetNodeId))continue;const text=label(e.text).replace(/\|/g,'&#124;');lines.push('  '+cleanId(e.sourceNodeId)+' -->'+(text?'|'+text+'|':'')+' '+cleanId(e.targetNodeId));}
 lines.splice(1,0,'  %% gdws-flow '+JSON.stringify({positions}));const source=lines.join('\n');if(source.length>50000)throw new Error('流程图超过保存上限，请拆分为多张。');return source;
}
