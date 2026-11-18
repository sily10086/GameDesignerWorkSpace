const clone=value=>structuredClone(value);
const content=value=>JSON.stringify(value.projects);
export async function api(url,method='GET',body){
 let response;try{response=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});}catch{throw new Error('无法连接工作台服务。请保持启动窗口开启，再重试保存；当前修改仍在页面中。');}
 const result=await response.json();if(!response.ok){const error=new Error(result.error||'Project 读写失败。');error.conflicts=result.conflicts||[];error.status=response.status;throw error;}return result;
}
export class DiskStorage{
 constructor(getState,notify){this.getState=getState;this.notify=notify;this.base={schema:1,active:null,projects:[]};this.version=0;this.savedVersion=0;this.inFlight=null;this.timer=null;this.ready=false;this.directory='Project';this.projectInfo={};this.issues=[];this.error=null;}
 get dirty(){return this.version>this.savedVersion;}
 async load(){const result=await api('/api/workspace');this.base=clone(result.state);this.directory=result.directory;this.projectInfo=result.projectInfo||{};this.issues=result.issues||[];this.version=this.savedVersion=0;this.ready=true;this.error=null;this.notify('saved');return result.state;}
 markDirty(){if(!this.ready)return;if(!this.inFlight&&content(this.getState())===content(this.base)){this.savedVersion=this.version;this.error=null;this.notify('saved');return;}this.version++;this.notify('pending');clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush(),350);}
 async flush(){clearTimeout(this.timer);if(!this.ready)return false;if(this.inFlight){await this.inFlight;if(this.error)return false;if(this.dirty)return this.flush();return true;}
  this.inFlight=(async()=>{while(this.dirty){const version=this.version,snapshot=clone(this.getState());if(content(snapshot)===content(this.base)){this.savedVersion=version;this.error=null;continue;}this.notify('saving');try{await api('/api/workspace','PUT',{base:this.base,state:snapshot});this.base=snapshot;this.savedVersion=version;this.error=null;}catch(error){this.error=error;this.notify('error',error);return false;}}this.notify('saved');return true;})();
  try{return await this.inFlight;}finally{this.inFlight=null;}
 }
}
