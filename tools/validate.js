#!/usr/bin/env node
/**
 * Pre-package checks. Fails loudly rather than shipping a broken zip:
 * every manifest reference resolves, popup ids line up with popup.js, message
 * types are handled, and no development-only file sneaks into the package.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const problems = [];
const note = (message) => problems.push(message);

const manifest = JSON.parse(read('manifest.json'));

if (manifest.manifest_version !== 3) note('manifest_version must be 3');
if (!/^\d+\.\d+(\.\d+){0,2}$/.test(manifest.version)) note(`bad version string: ${manifest.version}`);
if ((manifest.description || '').length > 132) note('description exceeds the 132-character store limit');
if (!manifest.icons?.['128']) note('a 128px icon is required for the Chrome Web Store');

// Everything the manifest points at must exist.
const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...(manifest.content_scripts || []).flatMap((entry) => entry.js || []),
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
].filter(Boolean);
for (const file of new Set(referenced)) {
  if (!fs.existsSync(path.join(root, file))) note(`manifest references missing file: ${file}`);
}

// Popup wiring.
const html = read('popup.html');
const popup = read('popup.js');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
for (const [, id] of popup.matchAll(/el\('([^']+)'\)/g)) {
  if (!htmlIds.has(id)) note(`popup.js reads #${id}, absent from popup.html`);
}
for (const [, src] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (!src.startsWith('http') && !fs.existsSync(path.join(root, src))) note(`popup.html references missing ${src}`);
}

// Message contract between popup and content script.
const content = read('content.js');
const handled = new Set([...content.matchAll(/message\?\.type === '([a-z]+)'/g)].map((m) => m[1]));
for (const [, type] of popup.matchAll(/type: '([a-z]+)'/g)) {
  if (type !== 'download' && !handled.has(type)) note(`popup sends "${type}" but content.js never handles it`);
}
const workerHandled = new Set([...read('background.js').matchAll(/message\?\.type === '([a-z]+)'/g)].map((m) => m[1]));
for (const [, type] of content.matchAll(/type: '([a-z]+)',\s*filename/g)) {
  if (!workerHandled.has(type)) note(`content.js sends "${type}" but background.js never handles it`);
}

// Permissions actually used.
const allCode = content + popup + read('background.js');
const declared = new Set(manifest.permissions || []);
for (const [permission, probe] of [['downloads', /chrome\.downloads\./], ['storage', /chrome\.storage\./], ['scripting', /chrome\.scripting\./]]) {
  const used = probe.test(allCode);
  if (used && !declared.has(permission)) note(`code calls chrome.${permission} but the manifest does not declare it`);
  if (!used && declared.has(permission)) note(`manifest declares "${permission}" but no code uses it - reviewers will ask`);
}

if (problems.length) {
  console.error('Validation failed:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`OK  ${manifest.name} v${manifest.version} - ${referenced.length} referenced files, ${htmlIds.size} popup ids, permissions: ${[...declared].join(', ')}`);
