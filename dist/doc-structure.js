// 文档结构：系统层级（父/子系统）、Obsidian 式 [[链接]] 与反链、文档表格（父系统合并单元格）、蓝图式可拖拽连线图。
// 新增字段 parent / links / pos 随 document.json 持久化，不改动既有存储与校验。
const NODE_W = 190, NODE_H = 62;
let view = 'cards';
let graph = null;

export const getView = () => view;
export const setView = v => { view = v; };

const validParent = (d, docs) => d.parent && docs.some(x => x.id === d.parent) ? d.parent : null;
export function descendants(id, docs) {
  const out = new Set(); const stack = [id];
  while (stack.length) { const cur = stack.pop(); for (const d of docs) if (validParent(d, docs) === cur && !out.has(d.id)) { out.add(d.id); stack.push(d.id); } }
  return out;
}
export function treeOrder(docs) {
  const depth = new Map(); const order = []; const seen = new Set();
  const walk = (id, dep) => { if (seen.has(id)) return; seen.add(id); depth.set(id, dep); order.push(docs.find(d => d.id === id)); for (const d of docs) if (validParent(d, docs) === id) walk(d.id, dep + 1); };
  for (const d of docs) if (!validParent(d, docs)) walk(d.id, 0);
  for (const d of docs) if (!seen.has(d.id)) walk(d.id, 0);
  return { order, depth };
}
export function pathOf(doc, docs) {
  const chain = []; let cur = doc; const guard = new Set();
  while (cur && !guard.has(cur.id)) { guard.add(cur.id); chain.unshift(cur.title); const pa = validParent(cur, docs); cur = pa ? docs.find(d => d.id === pa) : null; }
  return chain.join(' / ');
}
export function wikiTargets(doc, docs) {
  const out = []; const re = /\[\[([^\[\]|]+)(?:\|[^\[\]]*)?\]\]/g; let m;
  while ((m = re.exec(doc.content || ''))) { const name = m[1].trim().toLowerCase(); const hit = docs.find(d => d.id !== doc.id && d.title.trim().toLowerCase() === name); if (hit && !out.includes(hit.id)) out.push(hit.id); }
  return out;
}
export function docEdges(docs) {
  const edges = []; const seen = new Set();
  const push = (from, to, kind) => { if (from === to) return; const key = from + '>' + to; if (seen.has(key)) return; seen.add(key); edges.push({ from, to, kind, id: key + '>' + kind }); };
  for (const d of docs) for (const to of (Array.isArray(d.links) ? d.links : [])) if (docs.some(x => x.id === to)) push(d.id, to, 'manual');
  for (const d of docs) for (const to of wikiTargets(d, docs)) push(d.id, to, 'wiki');
  return edges;
}
export const backlinks = (docs, id) => docEdges(docs).filter(e => e.to === id);

// 表格：父系统列在最前，同一父系统下的多个文档合并单元格（rowspan），类似 Excel 合并表头。
export function tableMarkup(p, ctx) {
  const { esc, tag, dateLabel } = ctx; const docs = p.docs; const edges = docEdges(docs);
  if (!docs.length) return '<div class="empty">这里还没有文档。新建文档后，可以在表格中为它指定父系统、建立层级。</div>';
  const { order, depth } = treeOrder(docs); const idx = new Map(order.map((d, i) => [d.id, i]));
  const groups = new Map();
  for (const d of docs) { const key = validParent(d, docs) || '__top'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(d); }
  const groupKeys = [...groups.keys()].sort((a, b) => (a === '__top' ? -1 : idx.get(a)) - (b === '__top' ? -1 : idx.get(b)));
  let rows = '';
  for (const key of groupKeys) {
    const members = groups.get(key).sort((a, b) => idx.get(a.id) - idx.get(b.id));
    const parentDoc = key === '__top' ? null : docs.find(d => d.id === key);
    members.forEach((d, i) => {
      const dep = depth.get(d.id) || 0;
      const outN = edges.filter(e => e.from === d.id).length, inN = edges.filter(e => e.to === d.id).length;
      const groupCell = i === 0 ? `<td class="doc-group-cell" rowspan="${members.length}"><span class="doc-group-name">${key === '__top' ? '顶层系统' : esc(parentDoc.title)}</span>${key !== '__top' ? `<span class="doc-group-sub">${members.length} 个子文档</span>` : ''}</td>` : '';
      rows += `<tr>${groupCell}
        <td><span class="doc-name"><button class="doc-table-title" data-edit="docs" data-id="${d.id}" title="打开文档">${esc(d.title)}</button>${d.version ? `<span class="doc-version-tag">${esc(d.version)}</span>` : ''}</span></td>
        <td><span class="doc-path" style="padding-left:${dep * 12}px">${dep ? '<i class="doc-path-branch"></i>' : ''}${esc(pathOf(d, docs))}</span></td>
        <td>${tag(d.category)}</td>
        <td><button class="doc-link-count" data-doc-links="${d.id}" title="查看出链">${outN}</button></td>
        <td><button class="doc-link-count" data-doc-links="${d.id}" title="查看入链 / 反链">${inN}</button></td>
        <td class="doc-table-date">${dateLabel(d.updated)}</td>
        <td class="doc-table-actions"><button class="btn" data-edit="docs" data-id="${d.id}">打开</button><button class="btn" data-doc-links="${d.id}">结构</button><button class="btn danger" data-purge="docs" data-id="${d.id}">删除</button></td>
      </tr>`;
    });
  }
  return `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>父系统</th><th>文档</th><th>系统层级</th><th>分类</th><th>出链</th><th>入链</th><th>更新</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function graphMarkup(ctx) {
  const { icon } = ctx;
  return `<div class="doc-graph-toolbar">
    <button class="btn" data-graph-zoom="in" aria-label="放大">${icon('plus')}</button>
    <button class="btn" data-graph-zoom="out" aria-label="缩小">−</button>
    <button class="btn" data-graph-zoom="fit">适应画布</button>
    <button class="btn" data-graph-layout>重排布局</button>
    <button class="btn danger" data-graph-del-edge>删除选中连线</button>
    <label class="doc-graph-mode">拖拽建立<select class="select" data-graph-wire-mode aria-label="拖拽连线建立的关系"><option value="link">链接</option><option value="parent">父子</option></select></label>
    <label class="doc-graph-toggle"><input type="checkbox" data-graph-hier checked>显示父子层级</label>
    <span class="doc-graph-legend"><i class="lg-manual"></i>手动链接<i class="lg-wiki"></i>正文 [[链接]]<i class="lg-hier"></i>父子层级</span>
    <span class="doc-graph-hint">从节点右侧圆点拖到另一节点：按上方模式建立链接或父子 · 拖动节点摆放 · 拖空白平移 · 滚轮缩放 · 点击连线选中后删除 · 双击节点打开文档</span>
  </div><div class="doc-graph" id="doc-graph"></div>`;
}

function defaultPositions(docs) {
  const { order, depth } = treeOrder(docs); const pos = new Map(); let i = 0;
  for (const d of order) { pos.set(d.id, { x: 40 + (depth.get(d.id) || 0) * 260, y: 40 + (i++) * 100 }); }
  return pos;
}

function createGraph(container, ctx) {
  const docs = () => ctx.project().docs;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'doc-graph-svg'); container.appendChild(svg);
  const v = { x: 30, y: 20, k: 1 }; let selected = null, hier = true, drag = null, raf = 0, wireMode = 'link';
  const pos = d => d.pos || defaultPositions(docs()).get(d.id) || { x: 40, y: 40 };
  const world = e => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k }; };
  const schedule = () => { if (document.hidden) { draw(); return; } if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  const edgePath = (a, b) => { const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2, dx = Math.max(40, Math.abs(x2 - x1) / 2); return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`; };
  function draw() {
    const ds = docs(); const def = defaultPositions(ds); const P = d => d.pos || def.get(d.id);
    const parts = [`<defs><marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#a77b68"/></marker></defs><g transform="translate(${v.x},${v.y}) scale(${v.k})">`];
    if (hier) for (const d of ds) { const pa = validParent(d, ds); if (pa) { const a = P(ds.find(x => x.id === pa)), b = P(d); const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x - 12, y2 = b.y + NODE_H / 2, dx = Math.max(40, Math.abs(x2 - x1) / 2); parts.push(`<path class="dg-hier" marker-end="url(#dg-arrow)" d="M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}"/>`); } }
    const edges = docEdges(ds);
    for (const e of edges) { const a = P(ds.find(x => x.id === e.from)), b = P(ds.find(x => x.id === e.to)); parts.push(`<path class="dg-edge ${e.kind} ${selected === e.id ? 'selected' : ''}" data-edge="${e.id}" d="${edgePath(a, b)}"/>`); }
    // 加宽的透明命中层：让细线也容易点中。
    for (const e of edges) { const a = P(ds.find(x => x.id === e.from)), b = P(ds.find(x => x.id === e.to)); parts.push(`<path class="dg-hit" data-edge="${e.id}" d="${edgePath(a, b)}"/>`); }
    if (drag && drag.mode === 'wire') { const a = P(ds.find(x => x.id === drag.from)); parts.push(`<path class="dg-edge temp ${wireMode === 'parent' ? 'parent' : ''}" d="${edgePath(a, drag.point)}"/>`); }
    for (const d of ds) { const p = P(d); const dep = (treeOrder(ds).depth.get(d.id) || 0); const title = d.title.length > 14 ? d.title.slice(0, 14) + '…' : d.title;
      parts.push(`<g class="dg-node" data-node="${d.id}" transform="translate(${p.x},${p.y})">
        <rect class="dg-body" width="${NODE_W}" height="${NODE_H}" rx="9"/>
        <rect class="dg-accent d${dep % 4}" width="4" height="${NODE_H - 16}" x="7" y="8" rx="2"/>
        <text class="dg-title" x="20" y="26">${ctx.esc(title)}</text>
        <text class="dg-sub" x="20" y="45">${ctx.esc(d.category || '文档')}</text>
        <circle class="dg-port in" cx="0" cy="${NODE_H / 2}" r="6"/>
        <circle class="dg-port out" data-port-out="${d.id}" cx="${NODE_W}" cy="${NODE_H / 2}" r="6"/>
      </g>`); }
    parts.push('</g>'); svg.innerHTML = parts.join('');
  }
  function nodeUnder(e) { const el = document.elementFromPoint(e.clientX, e.clientY); const g = el && el.closest ? el.closest('[data-node]') : null; return g ? g.dataset.node : null; }
  function addLink(from, to) { const d = docs().find(x => x.id === from); if (!d) return; d.links = Array.isArray(d.links) ? d.links : []; if (!d.links.includes(to)) { d.links.push(to); ctx.persist(); ctx.toast(`已链接「${d.title}」→「${docs().find(x => x.id === to).title}」`); } }
  function setParent(from, to) { const ds = docs(); const child = ds.find(x => x.id === to); if (!child || from === to) return; if (descendants(to, ds).has(from)) { ctx.toast('不能形成循环：目标已是源的系统上级。'); return; } child.parent = from; ctx.persist(); ctx.toast(`已设父子：「${ds.find(x => x.id === from).title}」→「${child.title}」`); }
  svg.addEventListener('pointerdown', e => {
    e.preventDefault(); try { svg.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件无活动指针时忽略 */ }
    const out = e.target.closest('[data-port-out]'); const node = e.target.closest('[data-node]'); const edge = e.target.closest('[data-edge]');
    if (out) { drag = { mode: 'wire', from: out.dataset.portOut, point: world(e) }; }
    else if (node) { const d = docs().find(x => x.id === node.dataset.node); drag = { mode: 'node', id: d.id, start: world(e), orig: { ...pos(d) } }; selected = null; }
    else if (edge) { selected = edge.dataset.edge; drag = { mode: 'edge' }; }
    else { drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y }; selected = null; }
    schedule();
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.mode === 'wire') drag.point = world(e);
    else if (drag.mode === 'node') { const w = world(e); const d = docs().find(x => x.id === drag.id); d.pos = { x: drag.orig.x + (w.x - drag.start.x), y: drag.orig.y + (w.y - drag.start.y) }; }
    else if (drag.mode === 'pan') { v.x = drag.ox + (e.clientX - drag.sx); v.y = drag.oy + (e.clientY - drag.sy); }
    schedule();
  });
  svg.addEventListener('pointerup', e => {
    if (drag && drag.mode === 'wire') { const to = nodeUnder(e); if (to && to !== drag.from) { if (wireMode === 'parent') setParent(drag.from, to); else addLink(drag.from, to); } }
    if (drag && drag.mode === 'node') ctx.persist();
    drag = null; schedule();
  });
  svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; const f = e.deltaY < 0 ? 1.12 : 0.89; const nk = Math.min(2.5, Math.max(0.3, v.k * f)); v.x = mx - (mx - v.x) * (nk / v.k); v.y = my - (my - v.y) * (nk / v.k); v.k = nk; schedule(); }, { passive: false });
  svg.addEventListener('dblclick', e => { const node = e.target.closest('[data-node]'); if (node) ctx.openDoc(node.dataset.node); });
  draw();
  return {
    zoom(f) { const r = svg.getBoundingClientRect(); const mx = r.width / 2, my = r.height / 2; const nk = Math.min(2.5, Math.max(0.3, v.k * f)); v.x = mx - (mx - v.x) * (nk / v.k); v.y = my - (my - v.y) * (nk / v.k); v.k = nk; draw(); },
    fit() { const ds = docs(); if (!ds.length) return; const def = defaultPositions(ds); const ps = ds.map(d => d.pos || def.get(d.id)); const minX = Math.min(...ps.map(p => p.x)) - 30, minY = Math.min(...ps.map(p => p.y)) - 30, maxX = Math.max(...ps.map(p => p.x + NODE_W)) + 30, maxY = Math.max(...ps.map(p => p.y + NODE_H)) + 30; const r = svg.getBoundingClientRect(); const k = Math.min(2, Math.max(0.3, Math.min(r.width / (maxX - minX), r.height / (maxY - minY)))); v.k = k; v.x = (r.width - (maxX - minX) * k) / 2 - minX * k; v.y = (r.height - (maxY - minY) * k) / 2 - minY * k; draw(); },
    resetLayout() { for (const d of docs()) delete d.pos; ctx.persist(); draw(); },
    setHier(on) { hier = on; draw(); },
    setWireMode(m) { wireMode = m; },
    deleteSelected() { if (!selected) { ctx.toast('先点击一条连线选中它。'); return; } const [from, to, kind] = selected.split('>'); if (kind === 'wiki') { ctx.toast('正文 [[链接]] 由文档内容生成，请在正文中修改。'); return; } const d = docs().find(x => x.id === from); if (d && Array.isArray(d.links)) { d.links = d.links.filter(t => t !== to); ctx.persist(); ctx.toast('已删除连线。'); } selected = null; draw(); },
    redraw: draw
  };
}

export function mount(ctx) { const c = document.querySelector('#doc-graph'); graph = c ? createGraph(c, ctx) : null; }

function linksModal(d, ctx) {
  const docs = ctx.project().docs; const edges = docEdges(docs);
  const outManual = (Array.isArray(d.links) ? d.links : []).map(t => docs.find(x => x.id === t)).filter(Boolean);
  const outWiki = wikiTargets(d, docs).map(t => docs.find(x => x.id === t)).filter(Boolean);
  const inbound = backlinks(docs, d.id).map(e => ({ doc: docs.find(x => x.id === e.from), kind: e.kind })).filter(x => x.doc);
  const banned = descendants(d.id, docs); const pa = validParent(d, docs);
  const parentOptions = ['<option value="">（顶层系统）</option>', ...docs.filter(x => x.id !== d.id && !banned.has(x.id)).map(x => `<option value="${x.id}" ${pa === x.id ? 'selected' : ''}>${ctx.esc(x.title)}</option>`)].join('');
  const row = (x, extra) => `<div class="doc-link-row"><button class="doc-link-open" data-open-doc="${x.id}">${ctx.esc(x.title)}</button>${extra}</div>`;
  const body = `<div class="doc-links-panel">
    <h4>父系统</h4><select class="select doc-parent-select" data-doc-parent="${d.id}" aria-label="设置父系统">${parentOptions}</select>
    <p class="doc-links-path">系统层级：${ctx.esc(pathOf(d, docs))}</p>
    <h4>出链 · 手动</h4>${outManual.map(x => row(x, `<button class="btn danger" data-remove-link="${d.id}" data-target="${x.id}">移除</button>`)).join('') || '<p class="doc-links-empty">暂无手动链接。可在链接图拖拽连线，或在下方添加。</p>'}
    <h4>出链 · 正文 [[链接]]</h4>${outWiki.map(x => row(x, '<span class="tag purple">正文生成</span>')).join('') || '<p class="doc-links-empty">在正文中写 [[文档标题]] 即可自动建立链接。</p>'}
    <h4>入链 · 反链</h4>${inbound.map(x => row(x.doc, `<span class="tag ${x.kind === 'wiki' ? 'purple' : 'green'}">${x.kind === 'wiki' ? '正文' : '手动'}</span>`)).join('') || '<p class="doc-links-empty">还没有其它文档链接到这里。</p>'}
    <h4>添加出链</h4><div class="doc-link-add"><select class="select" id="link-target">${docs.filter(x => x.id !== d.id).map(x => `<option value="${x.id}">${ctx.esc(x.title)}</option>`).join('')}</select><button class="btn primary" data-add-link="${d.id}">添加链接</button></div>
  </div>`;
  ctx.modal('文档结构 · ' + d.title, body, '<button class="btn" data-action="close-modal">关闭</button>');
}

export function setup(ctx) {
  document.addEventListener('click', e => {
    const el = e.target.closest('button,[data-action]'); if (!el) return;
    if (el.dataset.docView) { setView(el.dataset.docView); ctx.render(); return; }
    if (el.dataset.docLinks) { const d = ctx.project().docs.find(x => x.id === el.dataset.docLinks); if (d) linksModal(d, ctx); return; }
    if (el.dataset.addLink) { const d = ctx.project().docs.find(x => x.id === el.dataset.addLink); const sel = document.querySelector('#link-target'); if (d && sel && sel.value) { d.links = Array.isArray(d.links) ? d.links : []; if (!d.links.includes(sel.value)) d.links.push(sel.value); ctx.persist(); ctx.render(); linksModal(d, ctx); } return; }
    if (el.dataset.removeLink) { const d = ctx.project().docs.find(x => x.id === el.dataset.removeLink); if (d && Array.isArray(d.links)) { d.links = d.links.filter(t => t !== el.dataset.target); ctx.persist(); ctx.render(); linksModal(d, ctx); } return; }
    if (el.dataset.openDoc) { ctx.closeModal(); ctx.openDoc(el.dataset.openDoc); return; }
    if (el.dataset.graphZoom && graph) { graph.zoom(el.dataset.graphZoom === 'in' ? 1.2 : 0.83); return; }
    if (el.dataset.graphZoom === 'fit' && graph) { graph.fit(); return; }
    if (el.dataset.graphLayout !== undefined && graph) { graph.resetLayout(); return; }
    if (el.dataset.graphDelEdge !== undefined && graph) { graph.deleteSelected(); return; }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset && el.dataset.docParent) { const docs = ctx.project().docs; const d = docs.find(x => x.id === el.dataset.docParent); if (!d) return; const val = el.value || null; if (val && (val === d.id || descendants(d.id, docs).has(val))) { ctx.toast('不能把文档挂到它自己或它的子系统下。'); ctx.render(); return; } if (val) d.parent = val; else delete d.parent; ctx.persist(); ctx.render(); if (el.closest('.modal')) linksModal(d, ctx); return; }
    if (el.dataset && el.dataset.graphHier !== undefined && graph) { graph.setHier(el.checked); return; }
    if (el.dataset && el.dataset.graphWireMode !== undefined && graph) { graph.setWireMode(el.value); return; }
  });
}