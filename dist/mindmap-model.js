const unescapeText=value=>value.replace(/<br\s*\/?\s*>/gi,'\n').replace(/&(?:amp|lt|gt|quot|#39);/g,v=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[v]));
const escapeText=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\r?\n/g,'<br/>');
export function parseMindmap(source){
 if(typeof source!=='string'||source.length>50000)throw new Error('思维导图内容过大。');
 const lines=source.replace(/^\uFEFF/,'').split(/\r?\n/);let root,stack=[],sequence=0,seenHeader=false,view={direction:1,folded:[]};const ids=new Set();
 for(const line of lines){const text=line.trim();if(!text)continue;
  if(text.startsWith('%% gdws-view ')){try{const value=JSON.parse(text.slice(13));if([0,1,2,3].includes(value.direction)&&Array.isArray(value.folded))view=value;}catch{}continue;}
  if(text.startsWith('%%'))continue;if(!seenHeader){if(text!=='mindmap')throw new Error('此内容不是思维导图。');seenHeader=true;continue;}
  if(/^(::|classDef |click |---)/.test(text))throw new Error('这张导图包含特殊语法，请使用图表源码编辑，原内容已保留。');
  const indent=line.match(/^\s*/)[0].replaceAll('\t','  ').length;
  const shaped=text.match(/^([A-Za-z_][\w-]*)\s*(\(\(|\[\[|\{\{|\[|\(|\{)([\s\S]*?)(\)\)|\]\]|\}\}|\]|\)|\})$/);
  let id='node_'+sequence++,topic=text;
  if(shaped){const pairs={'((':'))','[[':']]','{{':'}}','[':']','(':')','{':'}'};if(pairs[shaped[2]]!==shaped[4])throw new Error('导图节点括号不匹配，请检查源码。');id=shaped[1];topic=shaped[3].replace(/^"([\s\S]*)"$/,'$1');}
  while(ids.has(id))id='node_'+sequence++;ids.add(id);if(ids.size>2000)throw new Error('一张导图最多支持 2000 个节点。');
  const node={id,topic:unescapeText(topic),expanded:!view.folded.includes(id),children:[]};
  while(stack.length&&indent<=stack.at(-1).indent)stack.pop();if(!stack.length){if(root)throw new Error('思维导图只能有一个根节点。');root=node;node.root=true;}else stack.at(-1).node.children.push(node);
  stack.push({indent,node});if(stack.length>100)throw new Error('思维导图层级过深。');
 }
 if(!root)throw new Error('请先填写中心主题。');return {nodeData:root,direction:view.direction};
}
export function serializeMindmap(data){
 const lines=['mindmap'],folded=[],ids=new Set();let count=0;
 function walk(node,depth){if(!node||depth>100||++count>2000||typeof node.topic!=='string')throw new Error('思维导图节点无效或过多。');let id=String(node.id||'node_'+count).replace(/[^A-Za-z0-9_-]/g,'_');if(!/^[A-Za-z_]/.test(id))id='node_'+id;if(ids.has(id))throw new Error('思维导图包含重复节点。');ids.add(id);if(node.expanded===false)folded.push(id);lines.push('  '.repeat(depth+1)+id+'["'+escapeText(node.topic)+'"]');for(const child of node.children||[])walk(child,depth+1);}
 walk(data.nodeData,0);lines.splice(1,0,'  %% gdws-view '+JSON.stringify({direction:[0,1,2,3].includes(data.direction)?data.direction:1,folded}));const source=lines.join('\n');if(source.length>50000)throw new Error('导图内容超过保存上限，请拆分为多张导图。');return source;
}
export const diagramBlock=id=>':::gdws-diagram '+id+'\n:::';
