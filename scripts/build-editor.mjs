import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const result=await build({absWorkingDir:root,entryPoints:['editor-entry.js'],bundle:true,format:'esm',minify:true,outfile:'dist/vendor/editor-entry.js',metafile:true,legalComments:'linked'});
await fs.copyFile(path.join(root,'node_modules','mind-elixir','dist','MindElixir.css'),path.join(root,'dist','vendor','mindmap.css'));
await fs.copyFile(path.join(root,'node_modules','@logicflow','core','lib','index.css'),path.join(root,'dist','vendor','flowchart.css'));
const packages=new Set();
for(const input of Object.keys(result.metafile.inputs)){const match=input.replaceAll('\\','/').match(/^node_modules\/(@[^/]+\/[^/]+|[^/]+)/);if(match)packages.add(match[1]);}
const target=path.join(root,'dist','licenses','editor');await fs.mkdir(target,{recursive:true});
const notices=[];
for(const name of [...packages].sort()){
 const folder=path.join(root,'node_modules',name),metadata=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8'));
 let licenseFiles=(await fs.readdir(folder)).filter(file=>/^(licen[cs]e|copying|notice)(\.|$)/i.test(file));
 if(!licenseFiles.length&&name.startsWith('@tiptap/')){await fs.copyFile(path.join(root,'node_modules','@tiptap','core','LICENSE.md'),path.join(target,name.replaceAll('/','__')+'__LICENSE.md'));}
 else for(const file of licenseFiles){const source=path.join(folder,file);if((await fs.stat(source)).isFile())await fs.copyFile(source,path.join(target,name.replaceAll('/','__')+'__'+file));}
 notices.push({name,version:metadata.version,license:metadata.license,repository:metadata.repository});
}
await fs.writeFile(path.join(target,'components.json'),JSON.stringify(notices,null,2));
console.log('Bundled offline document editor and '+notices.length+' component license notices.');
