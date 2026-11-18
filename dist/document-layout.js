// Pointer capture keeps the separator responsive even across the editor surface.
export function attachDocumentLayout(panel,{onWidth,initialState}={}){
  const controller=new AbortController(),handle=panel.querySelector('.document-resizer');
  let dragging=false,full=initialState?.full||false,width=initialState?.width||50;
  const listen=(target,name,callback)=>target.addEventListener(name,callback,{signal:controller.signal});
  const bounds=()=>{const viewport=window.innerWidth;return {min:Math.min(42,440/viewport*100),max:Math.min(80,(viewport-300)/viewport*100)};};
  function resize(value){
    const {min,max}=bounds();width=Math.min(max,Math.max(min,value));
    document.body.style.setProperty('--doc-panel-width',full?'100%':width+'vw');
    handle.setAttribute('aria-valuenow',String(Math.round(width)));handle.setAttribute('aria-valuemin',String(Math.round(min)));handle.setAttribute('aria-valuemax',String(Math.round(max)));onWidth?.(width);
  }
  listen(handle,'pointerdown',event=>{if(full||event.button!==0)return;dragging=true;handle.setPointerCapture(event.pointerId);document.body.classList.add('document-resizing');event.preventDefault();});
  listen(handle,'pointermove',event=>{if(dragging)resize((window.innerWidth-event.clientX)/window.innerWidth*100);});
  const stop=()=>{dragging=false;document.body.classList.remove('document-resizing');};
  listen(handle,'pointerup',stop);listen(handle,'lostpointercapture',stop);listen(handle,'pointercancel',stop);
  listen(handle,'dblclick',()=>resize(50));
  listen(handle,'keydown',event=>{if(['ArrowLeft','ArrowRight','Home'].includes(event.key)){event.preventDefault();resize(event.key==='Home'?50:width+(event.key==='ArrowLeft'?2:-2));}});
  listen(window,'resize',()=>resize(width));
  resize(width);document.body.classList.add('doc-panel-open');document.body.classList.toggle('document-fullscreen',full);
  return {
    getState:()=>({width,full}),
    toggleFullscreen(){full=!full;document.body.classList.toggle('document-fullscreen',full);resize(width);const button=panel.querySelector('[data-action="document-fullscreen"]');button?.setAttribute('aria-label',full?'退出全屏编辑':'全屏编辑');button?.setAttribute('title',full?'退出全屏编辑':'全屏编辑');},
    destroy(){stop();controller.abort();document.body.classList.remove('doc-panel-open','document-fullscreen');document.body.style.removeProperty('--doc-panel-width');},
  };
}
