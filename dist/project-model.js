// Shared project format. Content is persisted by the Node server under Project/.
const uid=()=>crypto.randomUUID();
const today=()=>new Date().toLocaleDateString('sv-SE');
function dateOffset(n){const d=new Date();d.setDate(d.getDate()+n);return d.toLocaleDateString('sv-SE');}
const diagramTemplates={mindmap:`mindmap
  root((林间来信))
    核心体验
      探索与发现
      情感联结
    游戏系统
      信件投递
      物品收集
      昼夜变化
    世界与叙事
      森林小镇
      居民故事
    美术与声音
      手绘风格
      环境音景`,flowchart:`flowchart TD
  A([开始新的一天]) --> B[在邮局领取信件]
  B --> C[探索森林小径]
  C --> D{找到收信人?}
  D -->|是| E[交付信件并展开对话]
  D -->|否| F[寻找线索]
  F --> C
  E --> G[获得新的故事与委托]
  G --> H([返回小屋 记录见闻])`};
function makeProject(name,genre,engine,desc,sample=false){const p={id:uid(),name,genre,engine,desc,platform:'PC / Steam',stage:'垂直切片',created:today(),tasks:[],docs:[],world:[],characters:[],assets:[],bugs:[],logs:[],milestones:[],activity:[]};if(!sample)return p;
 p.tasks=[['完成森林场景的光照与氛围','美术','progress','高',2,'小林','完善晨雾、林间光束和黄昏色调，为首个可玩区域建立视觉基调。'],['信件投递核心交互原型','程序','progress','高',1,'阿远','实现信箱交互、信件拾取与交付，支持键盘和手柄操作。'],['第一章主线剧情与对白','策划','review','中',3,'小林','完成邮差初到森林小镇的剧情，校对三位居民的分支对白。'],['整理环境音效与背景音乐','音频','todo','中',5,'阿远','收集鸟鸣、风声与脚步声素材，记录授权来源。'],['背包系统 UI 设计','美术','todo','低',6,'小林','设计物品分类、信件详情与手柄焦点样式。'],['邮局场景碰撞体修正','程序','progress','中',2,'阿远','检查门口碰撞体与角色胶囊体，确保通过流畅。'],['新手引导设计','策划','todo','中',7,'小林','用场景线索引导玩家完成第一封信。'],['手柄输入适配','程序','todo','中',8,'阿远','为移动、交互与背包添加手柄映射。'],['确定核心玩法与项目愿景','策划','done','高',-6,'小林','确认游戏体验目标与开发范围。'],['主角移动与相机跟随','程序','done','高',-4,'阿远','支持八向移动、镜头缓动与场景边界。'],['森林小镇灰盒搭建','美术','done','中',-3,'小林','完成邮局、小屋和森林小径的基础布局。'],['搭建项目仓库与开发规范','程序','done','中',-1,'阿远','完成目录结构、命名与提交规范。']].map((t,i)=>({id:uid(),title:t[0],category:t[1],status:t[2],priority:t[3],due:dateOffset(t[4]),owner:t[5],description:t[6],updated:today(),number:i+1}));
 p.docs=[{id:uid(),title:'游戏设计文档 · GDD',category:'核心设计',version:'V0.1',updated:today(),content:'# 林间来信 · 游戏设计文档\n\n## 游戏愿景\n一款关于倾听、探索与联结的治愈系冒险游戏。玩家扮演森林小镇的新任邮差，在投递信件的过程中发现居民的故事。\n\n## 核心体验\n- 在安静的森林中自由探索\n- 让每一封信带来真实的情感回响\n- 用细小的行动改变小镇的日常\n\n## 目标平台与玩家\nPC / Steam，面向喜爱慢节奏探索与叙事体验的玩家。\n\n## 制作范围\n首个可玩版本包含 1 个小镇、3 位居民、5 封信与约 20 分钟流程。',diagrams:[{id:uid(),type:'mindmap',title:'游戏设计结构',source:diagramTemplates.mindmap},{id:uid(),type:'flowchart',title:'信件投递流程',source:diagramTemplates.flowchart}]},{id:uid(),title:'核心玩法与循环设计',category:'玩法系统',version:'V0.1',updated:dateOffset(-1),content:'# 核心玩法与循环\n\n## 一封信，一段故事\n领取信件 → 探索道路 → 结识居民 → 投递信件 → 解锁新的故事。\n\n## 设计原则\n- 不设置失败惩罚，鼓励自然探索\n- 引导来自环境、地标和对白\n- 每次投递都给予新的叙事线索\n\n## 完成条件\n玩家能不依赖教程独立完成第一次投递，并理解下一个行动目标。',diagrams:[{id:uid(),type:'flowchart',title:'信件投递流程',source:diagramTemplates.flowchart}]},{id:uid(),title:'美术风格与视觉规范',category:'美术规范',version:'V0.1',updated:dateOffset(-2),content:'# 森林的颜色\n\n## 视觉关键词\n温暖、自然、手绘、留白。\n\n## 色彩\n- 森林绿：主要场景与植物\n- 暖米白：纸张、信件与界面\n- 夕阳金：关键交互与温暖的光源\n\n## 界面原则\n减少画面中的常驻信息，让玩家专注于风景与人物。',diagrams:[]}];
 p.world=[{id:uid(),title:'雾松森林',category:'地点',description:'森林环抱着小镇，晨雾在松木与溪流间缓慢游走。旧路牌指向一座无人提起的山间邮局。',updated:today()},{id:uid(),title:'信件与回声',category:'世界规则',description:'每封认真写下的信，都会留下只有邮差能够看见的微光。微光指向收信人真正牵挂的地方。',updated:today()},{id:uid(),title:'小镇邮差协会',category:'组织',description:'连接森林与远方的古老协会。每个邮差都有一本手写的路线册，以及一枚代代相传的铜制徽章。',updated:today()}];
 p.characters=[{id:uid(),title:'小栖',category:'主角 · 邮差',description:'刚来到雾松镇的年轻邮差，随身背着比自己还大的邮包。喜欢收集邮票，擅长倾听别人的故事。',updated:today()},{id:uid(),title:'松爷爷',category:'居民 · 木匠',description:'住在森林入口的老木匠，每周都会给远方写一封信。他似乎记得小镇每一棵树的名字。',updated:today()},{id:uid(),title:'阿苔',category:'居民 · 花匠',description:'经营着温室与花店，喜欢在信封里夹一朵干花。她正在等待一封已经寄出很久的回信。',updated:today()}];
 p.assets=[{id:uid(),title:'Unity 开发文档',category:'开发工具',description:'引擎使用、脚本 API 与制作流程参考。',url:'https://docs.unity3d.com/Manual/index.html',updated:today()},{id:uid(),title:'Kenney 免费游戏素材',category:'美术素材',description:'原型开发可用的模型、UI 与音效素材。使用前核对具体资源许可。',url:'https://kenney.nl/assets',updated:today()},{id:uid(),title:'Mermaid 图表工具',category:'策划工具',description:'文档内置的思维导图与流程图引擎，支持文本编辑与 SVG 导出。',url:'https://github.com/mermaid-js/mermaid',updated:today()}];
 p.bugs=[{id:uid(),title:'切换场景后主角偶尔卡在门口',category:'程序',priority:'高',status:'progress',owner:'阿远',description:'复现：从森林进入邮局后立即向右移动。预期可以自由行走，实际可能被门框碰撞体卡住。',due:dateOffset(1),updated:today()},{id:uid(),title:'背包关闭后交互提示未恢复',category:'UI',priority:'中',status:'todo',owner:'小林',description:'打开背包查看信件，再关闭背包，附近信箱的交互提示不会重新显示。',due:dateOffset(4),updated:today()}];
 p.milestones=[{id:uid(),title:'概念验证',date:dateOffset(-14),status:'done',description:'明确游戏愿景、核心玩法与视觉方向，完成移动和投递原型。'},{id:uid(),title:'垂直切片 · 第一封来信',date:dateOffset(18),status:'progress',description:'让玩家完整体验从领取信件、探索小镇到投递信件的第一天。完成森林场景、3 位居民与核心交互。'},{id:uid(),title:'Alpha · 森林的故事',date:dateOffset(48),status:'todo',description:'完成所有核心系统与第一章内容，组织小范围试玩。'},{id:uid(),title:'Demo · 公开试玩',date:dateOffset(78),status:'todo',description:'打磨美术与音频、修复关键问题，准备公开演示版本。'}];
 p.logs=[{id:uid(),title:'第一封信，终于送到了',category:'开发周记',date:dateOffset(-1),description:'本周打通了邮局到森林小屋的流程。\n\n做了什么\n完成主角移动、相机跟随与信箱交互。森林灰盒也有了初步的氛围。\n\n发现的问题\n玩家不容易注意到岔路口的路牌，需要用灯光和小动物引导视线。\n\n下周计划\n完成核心投递交互，开始第一章对白与场景光照。',updated:today()}];
 p.activity=[{title:'更新了「游戏设计文档 · GDD」',type:'docs',id:p.docs[0].id,time:'最近更新'},{title:'完成了「主角移动与相机跟随」',type:'tasks',id:p.tasks[9].id,time:'最近完成'},{title:'记录了第一篇开发周记',type:'logs',id:p.logs[0].id,time:'最近记录'}];return p;}
function validCoreBackup(s){if(!s||s.schema!==1||!Array.isArray(s.projects)||s.projects.length>100)return false;const text=(v,max=200000)=>typeof v==='string'&&v.length<=max;return s.projects.every(p=>p&&text(p.id,200)&&text(p.name,180)&&p.name.trim()&&['genre','engine','desc','platform','stage'].every(k=>text(p[k]))&&['tasks','docs','world','characters','assets','bugs','logs','milestones','activity'].every(k=>Array.isArray(p[k])&&p[k].length<=10000)&&['tasks','docs','world','characters','assets','bugs','logs','milestones'].every(k=>p[k].every(r=>r&&text(r.id,200)&&text(r.title,500)))&&p.tasks.every(t=>text(t.description)&&text(t.category)&&text(t.owner)&&text(t.due,30)&&['todo','progress','review','done'].includes(t.status)&&['高','中','低'].includes(t.priority))&&p.docs.every(d=>text(d.content)&&text(d.category)&&text(d.updated,30)&&Array.isArray(d.diagrams)&&d.diagrams.length<=100&&d.diagrams.every(g=>g&&text(g.id,200)&&['mindmap','flowchart'].includes(g.type)&&text(g.title,500)&&text(g.source,50000)))&&['world','characters','assets'].every(k=>p[k].every(r=>text(r.description)&&text(r.category)&&(k!=='assets'||text(r.url))))&&p.logs.every(r=>text(r.description)&&text(r.category)&&text(r.date,30))&&p.milestones.every(r=>text(r.description)&&text(r.date,30)&&['todo','progress','done'].includes(r.status))&&p.bugs.every(r=>text(r.description)&&text(r.category)&&text(r.owner)&&text(r.due,30)&&['todo','progress','review','done'].includes(r.status)&&['高','中','低'].includes(r.priority))&&p.activity.every(a=>a&&text(a.title,1000)&&text(a.type,100)&&text(a.id,200)&&text(a.time,100)));}
function validBackup(s){if(!validCoreBackup(s))return false;const types=['tasks','docs','world','characters','assets','bugs','logs','milestones'];return s.projects.every(p=>p.trash===undefined||(Array.isArray(p.trash)&&p.trash.length<=10000&&p.trash.every(t=>t&&typeof t.id==='string'&&typeof t.date==='string'&&Number.isInteger(t.index)&&t.index>=0&&types.includes(t.type)&&validCoreBackup({schema:1,projects:[{...p,trash:[],activity:[],[t.type]:[t.record]}]}))));}

export const collectionNames=['tasks','docs','world','characters','assets','bugs','logs','milestones'];
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
function safeProjectIds(state){
  if(!state||!Array.isArray(state.projects))return false;
  const unique=items=>new Set(items.map(r=>r.id)).size===items.length;
  return unique(state.projects)&&state.projects.every(p=>safeId(p.id)&&collectionNames.every(k=>unique(p[k])&&p[k].every(r=>safeId(r.id)))&&p.docs.every(d=>unique(d.diagrams)&&d.diagrams.every(g=>safeId(g.id)))&&(!p.trash||(unique(p.trash)&&p.trash.every(t=>safeId(t.id)&&safeId(t.record.id)))));
}
export function validateWorkspace(state){try{return validBackup(state)&&safeProjectIds(state)&&state.projects.every(p=>p.deletedAt===undefined||(typeof p.deletedAt==='string'&&Number.isFinite(Date.parse(p.deletedAt))));}catch{return false;}}
export function listProjects(state,{deleted=false,query=''}={}){const term=query.trim().toLocaleLowerCase();return state.projects.filter(p=>Boolean(p.deletedAt)===deleted&&(!term||[p.name,p.genre,p.engine,p.desc].join(' ').toLocaleLowerCase().includes(term)));}
export function markProjectDeleted(state,id,when=new Date().toISOString()){const p=state.projects.find(p=>p.id===id&&!p.deletedAt);if(!p)throw new Error('项目不存在或已被删除。');p.deletedAt=when;if(state.active===id)state.active=null;return p;}
export function restoreProject(state,id){const p=state.projects.find(p=>p.id===id&&p.deletedAt);if(!p)throw new Error('回收站中没有此项目。');delete p.deletedAt;return p;}
// 只有回收站里的项目能被彻底清理，避免误删正在使用的项目。
export function purgeProjects(state,ids=state.projects.filter(p=>p.deletedAt).map(p=>p.id)){
 if(!Array.isArray(ids))throw new Error('要清理的项目无效。');
 if(ids.some(id=>typeof id!=='string'||!safeId(id)))throw new Error('项目 ID 无效。');
 const targets=new Set(ids);
 if(!targets.size)return [];
 for(const id of targets){const p=state.projects.find(p=>p.id===id);if(!p)throw new Error('项目不存在。');if(!p.deletedAt)throw new Error('只能清理回收站中的项目。');}
 const removed=state.projects.filter(p=>targets.has(p.id));
 state.projects=state.projects.filter(p=>!targets.has(p.id));
 if(state.active&&targets.has(state.active))state.active=null;
 return removed;
}
export function defaultWorkspace(){const p=makeProject('林间来信','治愈系探索冒险','Unity','在森林与小镇之间，送出一封封信，也连接一个个故事。',true);return {schema:1,active:p.id,projects:[p]};}
export {makeProject,validBackup,diagramTemplates};
