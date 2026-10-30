#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const field = (text, name) => text.match(new RegExp(`^- \\*\\*${name}:\\*\\*[^\\S\\r\\n]*(.*)$`, 'im'))?.[1]?.trim() || '';
export function lintLeads(dir) {
  const statuses = { Verify: 0, 'Try-worthy': 0, Ready: 0, 'Waiting on Commander': 0, Unknown: 0 }, rows = [];
  const charter = path.resolve(dir, '../RecallCharter.md');
  const charterTime = fs.existsSync(charter) ? fs.statSync(charter).mtimeMs : 0;
  for (const file of fs.readdirSync(dir).filter(n => n.endsWith('.md') && n !== 'screened.md')) {
    const full = path.join(dir, file), text = fs.readFileSync(full, 'utf8');
    const status = field(text, 'Status') || 'Unknown', gl = field(text, 'Gates');
    statuses[status] = (statuses[status] || 0) + 1;
    const values = [1,2,3,4].map(n => gl.match(new RegExp(`(?:^|;)\\s*G${n}\\s*:?\\s*(pass|fail|unknown)\\b`, 'i'))?.[1]?.toLowerCase() || 'unknown');
    const flags = [], open = values.filter(v => v !== 'pass').length;
    if (!gl) flags.push('NO_GATES_LINE');
    const unsourced = values.some((v,i) => v === 'pass' && !text.split('\n').some(l => new RegExp(`\\bG${i+1}\\b`).test(l) && /\[verified:\s*https?:\/\/\S+\s+["“][^"”]+["”]\]/.test(l)));
    if (unsourced || fs.statSync(full).mtimeMs < charterTime) flags.push('STALE_GRADE');
    if (status === 'Verify' && open >= 1 && open <= 2 && !values.includes('fail')) flags.push(/fast.paste|commander paste|waiting on commander/i.test(field(text,'Verification gaps')) ? 'PARKED' : 'CLOSABLE');
    const deadline = field(text, 'Deadline');
    if (/^\d{4}-\d{2}-\d{2}$/.test(deadline) && Date.parse(deadline+'T23:59:59Z') < Date.now()) flags.push('DEADLINE_PAST_REVIEW');
    rows.push({ file, status, gates: open, gates_line: gl || null, flags,
      value: field(text,'Value') || null });
  }
  rows.sort((a,b) => a.gates - b.gates || a.file.localeCompare(b.file));
  const regate = rows.filter(r => r.flags.some(f => ['NO_GATES_LINE','STALE_GRADE','CLOSABLE','DEADLINE_PAST_REVIEW'].includes(f))).map(r => r.file);
  return { today_utc: new Date().toISOString().slice(0,10), leads: rows.length, statuses,
    tiers: { try_worthy: statuses['Try-worthy'] || 0, ready: statuses.Ready || 0 }, regate_needed: regate.length ? regate : 'none', rows };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(lintLeads(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../leads')), null, 2));
