import {Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {Markdown} from '@tiptap/markdown';
import {TableKit,Table} from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';

const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const insertions=[
  ['paragraph','正文','普通文字段落','T','text zw'],
  ['h1','一级标题','章节与文档大纲','H1','heading bt'],
  ['h2','二级标题','划分设计细节','H2','heading bt'],
  ['h3','三级标题','补充更细的层级','H3','heading bt'],
  ['bulletList','无序列表','罗列想法与规则','•','list lb'],
  ['orderedList','有序列表','流程步骤与优先顺序','1.','list lb'],
  ['taskList','待办清单','可勾选的验收事项','☑','todo db'],
  ['table','表格','属性、数值与规则对照','▦','table bg'],
  ['blockquote','提示引用','设计结论与注意事项','❝','quote yy'],
  ['codeBlock','代码块','配置、伪代码与示例','</>','code dm'],
  ['horizontalRule','分割线','分隔不同内容','—','divider fgx'],
  ['image','图片链接','插入可访问的图片地址','▧','image tp'],
  ['mindmap','思维导图','梳理系统与玩法结构','◇','mind swdt'],
  ['flowchart','流程图','描述玩法与判断分支','⑂','flow lct'],
];
const tool=(command,label,content=label)=>`<button type="button" data-rich-command="${command}" title="${label}" aria-label="${label}">${content}</button>`;

// GFM uses <br> for line breaks inside a cell. Restore those as soft breaks,
// rather than exposing the literal tag after a save/reopen cycle.
const MarkdownTable=Table.extend({
  parseMarkdown(token,h){
    const cell=(value,index,header)=>{
      const align=token.align?.[index]||value.align;
      const tokens=(value.tokens||[]).map(part=>part.type==='html'&&/^<br\s*\/?\s*>$/i.test(part.raw||part.text||'')?{type:'br',raw:'  \n'}:part);
      return h.createNode(header?'tableHeader':'tableCell',align?{align}:{},[{type:'paragraph',content:h.parseInline(tokens)}]);
    };
    const rows=[];if(token.header)rows.push(h.createNode('tableRow',{},token.header.map((value,index)=>cell(value,index,true))));
    for(const row of token.rows||[])rows.push(h.createNode('tableRow',{},row.map((value,index)=>cell(value,index,false))));
    return h.createNode('table',undefined,rows);
  },
});

export function composerMarkup(){return `
  <div class="rich-toolbar" role="toolbar" aria-label="文档格式工具栏">
    ${tool('undo','撤销','↶')}${tool('redo','重做','↷')}<i></i>
    <select aria-label="段落样式" id="rich-heading"><option value="paragraph">正文</option><option value="h1">一级标题</option><option value="h2">二级标题</option><option value="h3">三级标题</option></select><i></i>
    ${tool('bold','加粗（Ctrl+B）','<b>B</b>')}${tool('italic','斜体（Ctrl+I）','<em>I</em>')}${tool('strike','删除线','<s>S</s>')}${tool('code','行内代码','&lt;/&gt;')}${tool('link','插入链接','↗')}<i></i>
    ${tool('bulletList','无序列表','≡')}${tool('taskList','待办清单','☑')}${tool('insert','插入内容块','＋ 插入')}
    <span class="rich-toolbar-spacer"></span>${tool('find','查找正文','⌕')}${tool('outline','文档大纲','☷')}${tool('source','Markdown 源码','MD')}${tool('read','阅读模式','◉')}
  </div>
  <div class="rich-find" hidden><input id="rich-find-input" aria-label="查找正文内容" placeholder="查找正文内容"><span id="rich-find-count"></span>${tool('findNext','下一个匹配','↓')}${tool('closeFind','关闭查找','×')}</div>
  <div class="rich-workspace"><aside class="rich-outline" aria-label="文档大纲" hidden><div>文档大纲</div><nav id="rich-outline-items"></nav></aside>
    <div class="rich-document"><div id="rich-editor" class="rich-editor"></div><textarea id="doc-content" class="rich-source" aria-label="Markdown 正文源码" spellcheck="false" hidden></textarea></div>
  </div>
  <div class="rich-insert-menu" role="menu" aria-label="插入内容块" hidden><div class="rich-menu-title">插入内容 <kbd>↑ ↓ 选择 · Enter 确认</kbd></div><div id="rich-insert-options"></div></div>
  <div class="rich-bubble" role="toolbar" aria-label="选中文字格式" hidden>${tool('bold','选中文字加粗','<b>B</b>')}${tool('italic','选中文字斜体','<em>I</em>')}${tool('strike','选中文字删除线','<s>S</s>')}${tool('link','选中文字插入链接','↗')}</div>
  <form class="rich-link-form" hidden><label for="rich-link-url">链接地址</label><div><input id="rich-link-url" type="url" placeholder="https://" required><button class="btn primary" type="submit">应用</button>${tool('unlink','移除链接','移除')}</div></form>
  <div class="rich-table-tools" hidden><span>表格</span>${tool('addRowAfter','下方加一行','＋ 行')}${tool('addColumnAfter','右侧加一列','＋ 列')}${tool('deleteRow','删除当前行','− 行')}${tool('deleteColumn','删除当前列','− 列')}${tool('deleteTable','删除整个表格','删除表格')}</div>
  <div class="rich-writing-hint"><span id="rich-mode-hint">输入 / 快速插入 · 选中文字设置格式</span><span id="rich-word-count"></span></div>`;}

export function editorExtensions(){return [StarterKit.configure({link:{openOnClick:false,autolink:true,protocols:['http','https','mailto']}}),TableKit.configure({table:false}),MarkdownTable.configure({resizable:false}),TaskList,TaskItem.configure({nested:true}),Image.configure({allowBase64:false}),Markdown.configure({markedOptions:{gfm:true}}),Placeholder.configure({placeholder:'写下你的设计，或输入 / 插入内容…'})];}

export function mountComposer(root,{content,onChange,onDiagram,onError=console.error}){
  const controller=new AbortController(),listen=(node,event,callback)=>node.addEventListener(event,callback,{signal:controller.signal});
  const $=selector=>root.querySelector(selector),menu=$('.rich-insert-menu'),bubble=$('.rich-bubble'),source=$('#doc-content');
  let sourceMode=false,readOnly=false,slash=null,menuIndex=0,menuItems=insertions,findIndex=-1,findMatches=[],frame=0,original=content,linkKind='link';
  const rich=new Editor({
    element:$('#rich-editor'),
    extensions:editorExtensions(),
    content,contentType:'markdown',
    editorProps:{attributes:{role:'textbox','aria-label':'文档正文','aria-multiline':'true',spellcheck:'false'},handleKeyDown:(_view,event)=>handleKey(event)},
    onUpdate:()=>{try{original=rich.getMarkdown();onChange(original);update();updateSlash();}catch(error){onError(error);}},
    onSelectionUpdate:()=>{update();updateSlash();},
  });
  source.value=content;
  function hideMenu(){menu.hidden=true;slash=null;}
  function positionMenu(coords){menu.style.left=Math.min(window.innerWidth-302,Math.max(root.getBoundingClientRect().left+12,coords.left))+'px';menu.style.top=Math.max(70,Math.min(window.innerHeight-345,coords.bottom+8))+'px';}
  function showMenu(query=''){
    menuItems=insertions.filter(item=>(item[0]+item[1]+item[2]+item[4]).toLowerCase().includes(query.toLowerCase()));menuIndex=0;
    $('#rich-insert-options').innerHTML=menuItems.length?menuItems.map((item,index)=>`<button type="button" role="menuitem" data-rich-insert="${item[0]}" class="${index===0?'selected':''}"><b>${item[3]}</b><span>${item[1]}<small>${item[2]}</small></span></button>`).join(''):'<p class="rich-menu-empty">没有找到内容，按 Esc 继续写作。</p>';
    menu.hidden=false;bubble.hidden=true;
  }
  function updateSlash(){
    if(sourceMode||readOnly)return;
    const {$from,empty}=rich.state.selection;
    if(!empty||$from.parent.type.name==='codeBlock'){if(slash)hideMenu();return;}
    const before=$from.parent.textBetween(0,$from.parentOffset,'','\ufffc'),match=before.match(/(?:^|\s)\/([^/\n]{0,24})$/);
    if(!match){if(slash)hideMenu();return;}
    slash={from:$from.pos-match[1].length-1,to:$from.pos};showMenu(match[1]);positionMenu(rich.view.coordsAtPos($from.pos));
  }
  function handleKey(event){
    if(event.isComposing)return false;
    if(!menu.hidden){
      if(event.key==='Escape'){event.preventDefault();hideMenu();return true;}
      if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();if(menuItems.length){menuIndex=(menuIndex+(event.key==='ArrowDown'?1:-1)+menuItems.length)%menuItems.length;[...$('#rich-insert-options').children].forEach((el,i)=>el.classList.toggle('selected',i===menuIndex));$('#rich-insert-options').children[menuIndex]?.scrollIntoView({block:'nearest'});}return true;}
      if(event.key==='Enter'){event.preventDefault();if(menuItems[menuIndex])insert(menuItems[menuIndex][0]);return true;}
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();command('link');return true;}
    return false;
  }
  function insert(kind){
    const range=slash;hideMenu();let chain=rich.chain().focus();if(range)chain=chain.deleteRange(range);chain.run();
    if(kind==='mindmap'||kind==='flowchart'){onDiagram(kind);return;}
    if(kind==='image'){command('image');return;}
    const c=rich.chain().focus();
    if(/^h[123]$/.test(kind))c.setHeading({level:Number(kind[1])}).run();
    else if(kind==='paragraph')c.setParagraph().run();
    else if(kind==='table')c.insertTable({rows:3,cols:3,withHeaderRow:true}).run();
    else if(kind==='horizontalRule')c.setHorizontalRule().run();
    else c['toggle'+kind[0].toUpperCase()+kind.slice(1)]().run();
    update();
  }
  function command(name){
    if(name==='source'){
      sourceMode=!sourceMode;hideMenu();bubble.hidden=true;$('.rich-link-form').hidden=true;
      if(sourceMode){source.value=original;}else{rich.commands.setContent(source.value,{contentType:'markdown',emitUpdate:false});}
      $('#rich-editor').hidden=sourceMode;source.hidden=!sourceMode;$('.rich-outline').hidden=true;$('.rich-table-tools').hidden=true;
      source.readOnly=readOnly;$('#rich-mode-hint').textContent=sourceMode?'Markdown 源码 · 自动保存到项目':'输入 / 快速插入 · 选中文字设置格式';update();return;
    }
    if(name==='read'){readOnly=!readOnly;rich.setEditable(!readOnly);source.readOnly=readOnly;root.classList.toggle('is-reading',readOnly);hideMenu();bubble.hidden=true;update();return;}
    if(name==='outline'){$('.rich-outline').hidden=!$('.rich-outline').hidden;updateOutline();return;}
    if(name==='find'){$('.rich-find').hidden=false;$('#rich-find-input').focus();return;}
    if(name==='closeFind'){$('.rich-find').hidden=true;return;}
    if(name==='findNext'){findNext();return;}
    if(sourceMode||readOnly)return;
    if(name==='insert'){slash=null;showMenu();positionMenu(rich.view.coordsAtPos(rich.state.selection.from));return;}
    if(name==='link'||name==='image'){linkKind=name;$('.rich-link-form').hidden=false;$('.rich-link-form label').textContent=name==='image'?'图片地址（http / https）':'链接地址';root.querySelector('[data-rich-command=unlink]').hidden=name==='image';$('#rich-link-url').value=name==='image'?'':rich.getAttributes('link').href||'';$('#rich-link-url').focus();bubble.hidden=true;return;}
    if(name==='unlink'){rich.chain().focus().extendMarkRange('link').unsetLink().run();$('.rich-link-form').hidden=true;return;}
    const c=rich.chain().focus();
    const toggles={bold:'toggleBold',italic:'toggleItalic',strike:'toggleStrike',code:'toggleCode',bulletList:'toggleBulletList',taskList:'toggleTaskList'};
      if(toggles[name])c[toggles[name]]().run();else if(typeof c[name]==='function')c[name]().run();update();
  }
  function updateOutline(){
    if($('.rich-outline').hidden)return;
    const headings=[];rich.state.doc.descendants((node,pos)=>{if(node.type.name==='heading')headings.push({text:node.textContent||'无标题章节',level:node.attrs.level,pos});});
    $('#rich-outline-items').innerHTML=headings.length?headings.map(h=>`<button data-rich-heading="${h.pos}" style="padding-left:${8+(h.level-1)*12}px">${escapeHTML(h.text)}</button>`).join(''):'<p>添加标题后，目录会显示在这里。</p>';
  }
  function update(){
    cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      $('#rich-word-count').textContent=(sourceMode?source.value:rich.getText()).replace(/\s/g,'').length+' 字';
      for(const button of root.querySelectorAll('[data-rich-command]')){const key=button.dataset.richCommand;button.setAttribute('aria-pressed',String(key==='source'?sourceMode:key==='read'?readOnly:rich.isActive(key)));if(!['source','read','outline','find','findNext','closeFind'].includes(key))button.disabled=sourceMode||readOnly;}
      $('#rich-heading').disabled=sourceMode||readOnly;$('#rich-heading').value=rich.isActive('heading')?'h'+rich.getAttributes('heading').level:'paragraph';
      $('.rich-table-tools').hidden=sourceMode||readOnly||!rich.isActive('table');updateOutline();
      const {from,to,empty}=rich.state.selection;
      if(!sourceMode&&!readOnly&&!empty&&rich.isFocused&&menu.hidden){const a=rich.view.coordsAtPos(from),b=rich.view.coordsAtPos(to);bubble.hidden=false;bubble.style.top=Math.max(68,Math.min(a.top,b.top)-44)+'px';bubble.style.left=Math.max(root.getBoundingClientRect().left+12,Math.min(window.innerWidth-180,(a.left+b.left)/2-75))+'px';}else bubble.hidden=true;
    });
  }
  function findNext(){
    const query=$('#rich-find-input').value.toLocaleLowerCase();findMatches=[];
    if(query){if(sourceMode){let pos=source.value.toLocaleLowerCase().indexOf(query);while(pos>=0){findMatches.push({from:pos,to:pos+query.length});pos=source.value.toLocaleLowerCase().indexOf(query,pos+query.length);}}else rich.state.doc.descendants((node,pos)=>{if(node.isText){let index=node.text.toLocaleLowerCase().indexOf(query);while(index>=0){findMatches.push({from:pos+index,to:pos+index+query.length});index=node.text.toLocaleLowerCase().indexOf(query,index+query.length);}}});}
    findIndex=findMatches.length?(findIndex+1)%findMatches.length:-1;$('#rich-find-count').textContent=findMatches.length?`${findIndex+1} / ${findMatches.length}`:'0 项';
    const hit=findMatches[findIndex];if(hit){if(sourceMode){source.focus();source.setSelectionRange(hit.from,hit.to);}else rich.chain().focus().setTextSelection(hit).scrollIntoView().run();}
  }
  listen(root,'pointerdown',event=>{if(event.target.closest('[data-rich-command],[data-rich-insert],[data-rich-heading]'))event.preventDefault();});
  listen(root,'click',event=>{
    const button=event.target.closest('[data-rich-command],[data-rich-insert],[data-rich-heading]');if(!button)return;
    try{if(button.dataset.richCommand)command(button.dataset.richCommand);else if(button.dataset.richInsert)insert(button.dataset.richInsert);else{rich.commands.setTextSelection(Number(button.dataset.richHeading)+1);rich.view.nodeDOM(Number(button.dataset.richHeading))?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}}catch(error){onError(error);}
  });
  listen($('#rich-heading'),'change',event=>insert(event.target.value));
  listen(source,'input',()=>{original=source.value;onChange(original);update();});
  listen($('#rich-find-input'),'input',()=>{findIndex=-1;findNext();$('#rich-find-input').focus();});
  listen($('.rich-link-form'),'submit',event=>{event.preventDefault();const url=$('#rich-link-url').value.trim();if(!(linkKind==='image'?/^https?:\/\//i:/^(https?:\/\/|mailto:)/i).test(url)){onError(new Error('请输入有效的 http / https 地址。'));return;}if(linkKind==='image')rich.chain().focus().setImage({src:url,alt:'设计参考图'}).run();else{const c=rich.chain().focus().extendMarkRange('link');if(rich.state.selection.empty&&!rich.isActive('link'))c.insertContent({type:'text',text:url,marks:[{type:'link',attrs:{href:url}}]}).run();else c.setLink({href:url}).run();}$('.rich-link-form').hidden=true;});
  listen(document,'pointerdown',event=>{if(!root.contains(event.target)){hideMenu();bubble.hidden=true;}});
  listen(root,'keydown',event=>{if(event.key==='Escape'&&(!menu.hidden||!$('.rich-link-form').hidden||!$('.rich-find').hidden)){hideMenu();$('.rich-link-form').hidden=true;$('.rich-find').hidden=true;event.stopPropagation();event.preventDefault();}});
  // Keep uncommon raw HTML and comments available verbatim in the source view.
  if(/<!--|<(?:details|summary|iframe|script|style|div|span|table)\b/i.test(content)){command('source');$('#rich-mode-hint').textContent='此文档包含 HTML，已保留源码编辑，避免格式丢失。';}
  update();
  return {destroy(){cancelAnimationFrame(frame);controller.abort();rich.destroy();},getMarkdown:()=>original,focus:()=>sourceMode?source.focus():rich.commands.focus()};
}
