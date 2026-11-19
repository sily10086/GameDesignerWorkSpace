// 图表是否“存在”，只认正文里的 :::gdws-diagram <id> 引用。
// 正文块被删掉，即使 diagrams 数组里还留着记录，也算已删除。
export function diagramIdsInContent(content){
  return new Set([...String(content||'').matchAll(/:::gdws-diagram\s+([A-Za-z0-9_-]+)/g)].map(m=>m[1]));
}

// 只返回正文仍在引用的图表记录。
export function liveDiagrams(doc){
  const ids=diagramIdsInContent(doc.content);
  return (doc.diagrams||[]).filter(g=>ids.has(g.id));
}

// 按正文引用原地清理 doc.diagrams，返回被删掉的图表记录数组。
export function pruneDiagrams(doc){
  const live=liveDiagrams(doc),removed=(doc.diagrams||[]).filter(g=>!live.includes(g));
  if(removed.length)doc.diagrams=live;
  return removed;
}
