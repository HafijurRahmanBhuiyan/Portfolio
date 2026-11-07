import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const FILE_PAIRS = [
  ['js/script.js', 'public/js/script.js'],
  ['js/admin.js', 'public/js/admin.js'],
  ['js/projects.js', 'public/js/projects.js'],
  ['css/style.css', 'public/css/style.css'],
];

function digest(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}

function walk(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  const entries = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory())
      entries.push(...walk(path.join(directory, entry.name), relative));
    else entries.push(relative);
  }
  return entries;
}

/**
 * Security-sensitive files that exist in both source and public copies must
 * not drift. Returns a list of human-readable drift findings.
 */
export function compareDuplicates(root = process.cwd()) {
  const findings = [];
  for (const [source, target] of FILE_PAIRS) {
    const sourcePath = path.join(root, source);
    const targetPath = path.join(root, target);
    if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) {
      findings.push(`missing copy: ${source} or ${target}`);
      continue;
    }
    if (digest(sourcePath) !== digest(targetPath))
      findings.push(`drifted copy: ${source} != ${target}`);
  }

  const sourceAssets = path.join(root, 'assets');
  const publicAssets = path.join(root, 'public/assets');
  const sourceFiles = walk(sourceAssets).sort();
  const publicFiles = walk(publicAssets).sort();
  const all = new Set([...sourceFiles, ...publicFiles]);
  for (const relative of all) {
    const a = path.join(sourceAssets, relative);
    const b = path.join(publicAssets, relative);
    if (!fs.existsSync(a) || !fs.existsSync(b))
      findings.push(`missing asset copy: assets/${relative}`);
    else if (digest(a) !== digest(b))
      findings.push(`drifted asset copy: assets/${relative}`);
  }
  return findings;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const findings = compareDuplicates();
  if (findings.length) {
    console.error('Duplicate security-sensitive sources have drifted:');
    for (const finding of findings) console.error(`- ${finding}`);
    process.exit(1);
  }
  console.log('Duplicate source/public copies are identical.');
}
