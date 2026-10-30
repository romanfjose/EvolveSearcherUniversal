import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CUSTOMIZATION_FILES = [
  'NorthStar.md', 'RecallCharter.md', 'CommanderKnowledge.md',
  'pipeline/0-profile/PROFILE.md', 'SearchLocationsList.md',
];

export function checkPersonalization(root) {
  const errors = [];
  for (const file of CUSTOMIZATION_FILES) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) { errors.push(`${file}: missing customization document`); continue; }
    const text = fs.readFileSync(full, 'utf8');
    if (!text.trim()) errors.push(`${file}: empty customization document`);
    const fields = [...new Set(text.match(/\{\{[^{}]+\}\}/g) || [])];
    if (fields.length) errors.push(`${file}: ${fields.join(', ')}`);
  }
  const sectors = path.join(root, 'SearchLocationsList.md');
  if (fs.existsSync(sectors) && !/^\|[^\n]+\|\s*Active(?:\s*\([^\n|]*\))?\s*\|/m.test(fs.readFileSync(sectors, 'utf8'))) {
    errors.push('SearchLocationsList.md: configure at least one Active sector; spare scout slots become Map Recon');
  }
  return { ok: errors.length === 0, errors };
}

export function assertPersonalized(root) {
  const result = checkPersonalization(root);
  if (!result.ok) throw new Error('Personalize this template before discovery:\n' + result.errors.join('\n'));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = checkPersonalization(root);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
