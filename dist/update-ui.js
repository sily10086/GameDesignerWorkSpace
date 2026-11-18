const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function setupUpdateUI({api,modal,button,icon,disk,toast}){
 let request=0;
 async function show(){
  const sequence=++request;modal('工作台更新','<p class="notice">正在检查 GitHub 正式版本…</p>');
  try{
   const info=await api('/api/app-update');if(sequence!==request)return;
   const title=info.available?'发现工作台新版本':info.unpublished?'等待首次发布':'当前已是最新正式版本';
   modal('工作台更新',`<div class="update-info"><h3>${title}</h3><p>当前版本 <b>v${escapeHTML(info.currentVersion)}</b>${info.latestVersion?` → 最新版本 <b>v${escapeHTML(info.latestVersion)}</b>`:''}</p><p>更新程序、运行依赖和使用说明。Project、独立项目、Data 本机配置及 Logs 均保留。</p>${info.message?`<p>${escapeHTML(info.message)}</p>`:''}${info.notes?`<pre class="update-notes">${escapeHTML(info.notes)}</pre>`:''}<a class="btn" href="${escapeHTML(info.releaseURL)}" target="_blank" rel="noopener noreferrer">${icon('github')}GitHub 版本页面 ↗</a>${!info.canInstall?'<p>当前为源码预览；可从版本页面下载安装包。</p>':''}</div>`,`<button class="btn" data-action="close-modal">关闭</button>${info.available&&info.canInstall?button('打开更新程序','open-app-updater','download',true):''}`);
  }catch(error){if(error.status===404){modal('请重启工作台服务','<p class="notice">后台仍是旧版本。请先保存项目，退出旧工作台服务，安装并启动 v1.5.0 或更新版本后再检查。刷新网页不会重启后台服务。</p><a class="btn" href="https://github.com/sily10086/GameDesignerWorkSpace/releases/latest" target="_blank" rel="noopener noreferrer">下载新版安装包 ↗</a>','<button class="btn" data-action="close-modal">关闭</button>');return;}modal('工作台更新',`<p class="notice">${escapeHTML(error.message)}</p>`,`<button class="btn" data-action="close-modal">关闭</button>${button('重试检查','check-app-update','download',true)}`);}
 }
 document.addEventListener('click',async event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(action==='check-app-update')void show();if(action==='open-app-updater'){if(disk.dirty&&!await disk.flush()){toast('请先保存项目内容，再启动更新。');return;}try{await api('/api/app-update/open','POST',{});toast('已打开更新程序。安装前请保存并退出托盘中的工作台服务。');}catch(error){toast(error.message);}}});
}
