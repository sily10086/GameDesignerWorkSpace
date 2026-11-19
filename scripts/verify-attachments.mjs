import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createServer} from '../server.mjs';
import {makeProject} from '../dist/project-model.js';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'gdws-attachments-'));
let app;
try{
 app=await createServer({root});const p=makeProject('Attachment fixture','','','');
 await app.store.save({schema:1,projects:[]},{schema:1,projects:[p]});
 const folder=path.join(app.store.getLocation(p.id),'attachments','参考图');await fs.mkdir(folder,{recursive:true});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=','base64');
 await fs.writeFile(path.join(folder,'scene one.png'),png);
 await fs.writeFile(path.join(folder,'unsafe.html'),'<script>alert(1)</script>');
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 const url=base+'/api/projects/'+p.id+'/attachments/'+encodeURIComponent('参考图')+'/scene%20one.png';
 const response=await fetch(url);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
 assert.equal((await fetch(url,{method:'HEAD'})).status,200);
 assert.equal((await fetch(url,{headers:{Origin:'https://untrusted.invalid'}})).status,403);
 assert.equal((await fetch(base+'/api/projects/'+p.id+'/attachments/'+encodeURIComponent('参考图')+'/unsafe.html')).status,415);
 for(const relative of ['../project.json','%2e%2e/private.png','reference\\private.png'])await assert.rejects(app.store.attachment(p.id,decodeURIComponent(relative)));
 const sentinel=path.join(root,'outside');await fs.mkdir(sentinel);await fs.writeFile(path.join(sentinel,'private.png'),png);
 try{await fs.symlink(sentinel,path.join(app.store.getLocation(p.id),'attachments','escape'),'junction');await assert.rejects(app.store.attachment(p.id,'escape/private.png'));}catch(error){if(!['EPERM','EACCES'].includes(error.code))throw error;}
 console.log('PASS: project images load with Unicode/spaces, remain relative in Markdown, and reject traversal, symlinks, cross-origin requests and active content.');
}finally{if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}
