import assert from 'node:assert/strict';
import {MarkdownManager} from '@tiptap/markdown';
import {editorExtensions,attachmentImageURL} from '../editor-entry.js';
import {defaultWorkspace} from '../dist/project-model.js';
const manager=new MarkdownManager({extensions:editorExtensions(),markedOptions:{gfm:true}});
const source='# 游戏规则\n\n## 输入与反馈\n\n**加粗**、*斜体*、~~废弃~~、`speed = 5` 与 [设计参考](https://example.com/design)。\n\n- 探索\n  - 分支事件\n\n1. 领取委托\n2. 完成投递\n\n- [ ] 输入响应\n- [x] 验收完成\n\n| 属性 | 数值 |\n| --- | --- |\n| 移动速度 | 5 |\n\n> 注意：受击时中断冲刺。\n\n```mermaid\nflowchart LR\n A[开始] --> B[结束]\n```\n\n---\n\n![概念图](https://example.com/concept.png)\n';
for(const content of [source,...defaultWorkspace().projects[0].docs.map(doc=>doc.content)]){
 const json=manager.parse(content),serialized=manager.serialize(json),reparsed=manager.parse(serialized);
 assert.deepEqual(reparsed,json,'Rich editing must preserve document structure and text through Markdown save/reload');
}
const roundtrip=manager.serialize(manager.parse(source));
for(const expected of ['**加粗**','*斜体*','~~废弃~~','`speed = 5`','https://example.com/design','- [ ] 输入响应','- [x] 验收完成','移动速度','flowchart LR','A[开始] --> B[结束]','https://example.com/concept.png'])assert.ok(roundtrip.includes(expected),'Missing content after save: '+expected);
const multiline=manager.parse('| 标题 |\n| --- |\n| 第一行<br>第二行 |');
assert.deepEqual(multiline.content[0].content[1].content[0].content[0].content,[{type:'text',text:'第一行'},{type:'hardBreak'},{type:'text',text:'第二行'}]);
assert.deepEqual(manager.parse(manager.serialize(multiline)),multiline,'Multiline table cells must retain actual line breaks');
console.log('PASS: document Markdown round trips preserve legacy text, headings, inline formats, nested lists, checked tasks, tables, links, images and Mermaid code.');
const localImage='![图](attachments/reference/scene%20one.png)';
assert.equal(manager.serialize(manager.parse(localImage)).trim(),localImage);
assert.equal(attachmentImageURL('attachments/reference/scene%20one.png','sample-id'),'/api/projects/sample-id/attachments/reference/scene%20one.png');
assert.equal(attachmentImageURL('attachments/%2e%2e/secret.png','sample-id'),'');
assert.equal(attachmentImageURL('https://example.com/image.png','sample-id'),'https://example.com/image.png');
