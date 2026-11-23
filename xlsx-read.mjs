// 零依赖读取 .xlsx / .csv 为表格数据，供数值策划预览。仅解析展示所需内容，不做写回。
import zlib from 'node:zlib';

const MAX_ROWS = 400, MAX_COLS = 60;
const decode = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');

function unzip(buffer) {
  const files = new Map();
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 22 - 65536; i--) { if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('不是有效的 .xlsx（zip）文件。');
  const count = buffer.readUInt16LE(eocd + 10); let off = buffer.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(off) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(off + 10);
    const compSize = buffer.readUInt32LE(off + 20);
    const nameLen = buffer.readUInt16LE(off + 28), extraLen = buffer.readUInt16LE(off + 30), commentLen = buffer.readUInt16LE(off + 32);
    const localOff = buffer.readUInt32LE(off + 42);
    const name = buffer.toString('utf8', off + 46, off + 46 + nameLen);
    const lNameLen = buffer.readUInt16LE(localOff + 26), lExtraLen = buffer.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buffer.subarray(dataStart, dataStart + compSize);
    let data;
    try { data = method === 8 ? zlib.inflateRawSync(raw) : raw; } catch { data = Buffer.alloc(0); }
    files.set(name, data);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function sharedStrings(xml) {
  const out = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g; let m;
  while ((m = re.exec(xml))) {
    let text = ''; const t = /<t\b[^>]*>([\s\S]*?)<\/t>/g; let tm;
    while ((tm = t.exec(m[1]))) text += decode(tm[1]);
    out.push(text);
  }
  return out;
}
const colIndex = ref => { let c = 0; for (const ch of ref) { if (/[A-Z]/.test(ch)) c = c * 26 + (ch.charCodeAt(0) - 64); else break; } return c - 1; };

function sheetRows(xml, strings) {
  const rows = []; let truncated = false;
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g; let rm; let rowIndex = 0;
  while ((rm = rowRe.exec(xml))) {
    if (rowIndex >= MAX_ROWS) { truncated = true; break; }
    const cells = []; const cRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g; let cm;
    while ((cm = cRe.exec(rm[1]))) {
      const attrs = cm[1] || ''; const inner = cm[2] || '';
      const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1] || '';
      const type = (attrs.match(/t="([^"]+)"/) || [])[1] || 'n';
      let idx = ref ? colIndex(ref) : cells.length;
      if (idx >= MAX_COLS) { truncated = true; continue; }
      let value = '';
      const v = (inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/) || [])[1];
      if (type === 's') value = strings[+v] ?? '';
      else if (type === 'inlineStr') { const t = /<t\b[^>]*>([\s\S]*?)<\/t>/g; let tm; value = ''; while ((tm = t.exec(inner))) value += decode(tm[1]); }
      else if (type === 'str') value = decode(v ?? '');
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined) { const num = Number(v); value = Number.isFinite(num) ? num : decode(v); }
      while (cells.length < idx) cells.push('');
      cells[idx] = value;
    }
    rows.push(cells); rowIndex++;
  }
  return { rows, truncated };
}

export function readSpreadsheet(buffer, filename) {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.csv')) {
    let text = buffer.toString('utf8').replace(/^﻿/, '');
    const rows = []; let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(c => c !== '')) rows.push(row); row = []; if (rows.length >= MAX_ROWS) break; }
      else cur += ch;
    }
    row.push(cur); if (row.some(c => c !== '')) rows.push(row);
    return { sheets: [{ name: 'CSV', rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS }] };
  }
  if (lower.endsWith('.xls')) return { sheets: [], unsupported: '旧版 .xls 二进制格式不支持在线预览。点击文件名仍可用本地 Excel 打开；如需预览请另存为 .xlsx。' };
  const files = unzip(buffer);
  const wb = files.get('xl/workbook.xml');
  if (!wb) throw new Error('缺少 workbook.xml，不是有效的 .xlsx。');
  const wbXml = wb.toString('utf8');
  const relsXml = (files.get('xl/_rels/workbook.xml.rels') || Buffer.from('')).toString('utf8');
  const rels = new Map(); const relRe = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g; let rel;
  while ((rel = relRe.exec(relsXml))) rels.set(rel[1], rel[2].replace(/^\/?xl\//, '').replace(/^\//, ''));
  const strings = sharedStrings((files.get('xl/sharedStrings.xml') || Buffer.from('')).toString('utf8'));
  const sheets = []; const sRe = /<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g; let sm;
  while ((sm = sRe.exec(wbXml))) {
    const name = decode(sm[1]); const target = rels.get(sm[2]);
    const data = target ? files.get('xl/' + target.replace(/^\/?xl\//, '')) : null;
    if (!data) { sheets.push({ name, rows: [], truncated: false }); continue; }
    const parsed = sheetRows(data.toString('utf8'), strings);
    sheets.push({ name, rows: parsed.rows, truncated: parsed.truncated });
  }
  if (!sheets.length) sheets.push({ name: 'Sheet1', rows: [], truncated: false });
  return { sheets };
}