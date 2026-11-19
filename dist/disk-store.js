const clone=value=>structuredClone(value);
const content=value=>JSON.stringify(value.projects);
export async function api(url,method='GET',body){
 let response;try{response=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});}catch{throw new Error('无法连接工作台服务。请保持启动窗口开启，再重试保存；当前修改仍在页面中。');}
 const result=await response.json();if(!response.ok){const error=new Error(result.error||'Project 读写失败。');error.conflicts=result.conflicts||[];error.status=response.status;throw error;}return result;
}
export class DiskStorage{
 constructor(getState,notify){this.getState=getState;this.notify=notify;this.base={schema:1,active:null,projects:[]};this.version=0;this.savedVersion=0;this.inFlight=null;this.timer=null;this.ready=false;this.purging=false;this.directory='Project';this.projectInfo={};this.issues=[];this.error=null;}
 get dirty(){return this.version>this.savedVersion;}
 async load(){const result=await api('/api/workspace');this.base=clone(result.state);this.directory=result.directory;this.projectInfo=result.projectInfo||{};this.issues=result.issues||[];this.version=this.savedVersion=0;this.ready=true;this.error=null;this.notify('saved');return result.state;}
 markDirty(){if(!this.ready)return;if(!this.inFlight&&content(this.getState())===content(this.base)){this.savedVersion=this.version;this.error=null;this.notify('saved');return;}this.version++;this.notify('pending');clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush(),350);}
 async flush(){clearTimeout(this.timer);if(!this.ready)return false;if(this.inFlight){await this.inFlight;if(this.error)return false;if(this.dirty)return this.flush();return true;}
  this.inFlight=(async()=>{while(this.dirty){const version=this.version,snapshot=clone(this.getState());if(content(snapshot)===content(this.base)){this.savedVersion=version;this.error=null;continue;}this.notify('saving');try{await api('/api/workspace','PUT',{base:this.base,state:snapshot});this.base=snapshot;this.savedVersion=version;this.error=null;}catch(error){this.error=error;this.notify('error',error);return false;}}this.notify('saved');return true;})();
  try{return await this.inFlight;}finally{this.inFlight=null;}
 }
 // 清空回收站：先确保没有未保存的修改，再由服务端删除磁盘文件夹；
 // 成功后才替换 base 和页面状态，失败时保持原状供用户重试。
 async purge(ids){
  clearTimeout(this.timer);
  if(!this.ready)throw new Error('项目库尚未载入完成，请稍后重试。');
  if(!Array.isArray(ids)||!ids.length)throw new Error('回收站已经是空的。');
  if(this.purging)throw new Error('清空回收站正在进行，请稍候。');
  this.purging=true;
  try{
   if(this.inFlight){const ok=await this.inFlight;if(!ok)throw this.error||new Error('当前修改尚未保存。');}
   if(this.dirty&&!await this.flush())throw this.error||new Error('当前修改尚未保存。');
   const snapshot=clone(this.getState()),targets=new Set(ids);
   snapshot.projects=snapshot.projects.filter(p=>!targets.has(p.id));
   if(targets.has(snapshot.active))snapshot.active=null;
   this.notify('saving');
   const result=await api('/api/trash/purge','POST',{base:this.base,state:snapshot,ids});
   // base 必须与页面 state 分开：共用对象会让后续编辑同时改到 base，从而被误判为“未变化”。
   for(const id of targets){delete this.projectInfo[id];}
   this.issues=this.issues.filter(item=>!targets.has(item.id));
   this.base=clone(snapshot);this.version=this.savedVersion=0;this.error=null;this.notify('saved');
   return {state:snapshot,result};
  }catch(error){this.error=error;this.notify('error',error);throw error;}
  finally{this.purging=false;}
 }
}
