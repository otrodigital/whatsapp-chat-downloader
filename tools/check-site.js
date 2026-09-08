#!/usr/bin/env node
/**
 * Checks the microsite's SEO markup: structured data parses and matches the
 * visible FAQ, head tags are present and within length limits, headings are
 * well-formed, internal anchors resolve, and referenced assets exist.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'site/index.html'), 'utf8');
const problems = [];
const ok = [];

const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!ld) problems.push('no JSON-LD found');
else {
  const data = JSON.parse(ld[1]);
  ok.push(`JSON-LD parses: ${data['@graph'].map((n) => n['@type']).join(', ')}`);
  const faq = data['@graph'].find((n) => n['@type'] === 'FAQPage');
  const visible = [...html.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) => m[1].trim());
  const schema = faq.mainEntity.map((q) => q.name);
  if (visible.length !== schema.length) problems.push(`FAQ mismatch: ${visible.length} visible vs ${schema.length} in schema`);
  for (const q of schema) if (!visible.includes(q)) problems.push(`FAQ schema question not on the page: "${q}"`);
  ok.push(`FAQ: ${schema.length} questions, schema matches page`);
}

const title = (html.match(/<title>(.*?)<\/title>/) || [])[1] || '';
const desc = (html.match(/<meta name="description" content="(.*?)">/) || [])[1] || '';
if (!title) problems.push('missing <title>');
if (title.length > 62) problems.push(`title is ${title.length} chars, likely truncated in results`);
if (!desc) problems.push('missing meta description');
if (desc.length > 160) problems.push(`meta description is ${desc.length} chars, likely truncated`);
ok.push(`title ${title.length} chars, description ${desc.length} chars`);

for (const tag of ['rel="canonical"', 'og:title', 'og:description', 'og:image', 'og:url', 'twitter:card', 'viewport']) {
  if (!html.includes(tag)) problems.push(`missing ${tag}`);
}

const h1s = [...html.matchAll(/<h1[^>]*>/g)].length;
if (h1s !== 1) problems.push(`expected exactly one h1, found ${h1s}`);
ok.push(`headings: ${h1s} h1, ${[...html.matchAll(/<h2[^>]*>/g)].length} h2`);

const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
for (const [, href] of html.matchAll(/href="#([^"]+)"/g)) {
  if (!ids.has(href)) problems.push(`anchor #${href} has no target`);
}
for (const [, url] of html.matchAll(/href="(http:\/\/[^"]+)"/g)) problems.push(`insecure link: ${url}`);

for (const asset of ['og-image.png', 'favicon.svg', 'apple-touch-icon.png', 'robots.txt', 'sitemap.xml', 'CNAME']) {
  if (!fs.existsSync(path.join(root, 'site', asset))) problems.push(`missing site/${asset}`);
}

// Every locally referenced image must exist and declare its dimensions, so the
// page reserves space for it and does not shift as it loads.
for (const [tag, src] of html.matchAll(/<img[^>]*src="(?!https?:)\/?([^"]+)"[^>]*>/g)) {
  if (!fs.existsSync(path.join(root, 'site', src))) problems.push(`<img> references missing site/${src}`);
  if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) problems.push(`<img src="${src}"> is missing width/height`);
  if (!/\salt="[^"]+"/.test(tag)) problems.push(`<img src="${src}"> is missing alt text`);
}
ok.push(`images: ${[...html.matchAll(/<img[^>]*>/g)].length} checked`);

for (const tag of ['section', 'div', 'details']) {
  const open = [...html.matchAll(new RegExp(`<${tag}[\\s>]`, 'g'))].length;
  const close = [...html.matchAll(new RegExp(`</${tag}>`, 'g'))].length;
  if (open !== close) problems.push(`<${tag}>: ${open} opened, ${close} closed`);
}

console.log(ok.map((o) => '  ok  ' + o).join('\n'));
if (problems.length) {
  console.error('\n' + problems.map((p) => '  !!  ' + p).join('\n'));
  process.exit(1);
}
console.log('\nSite checks passed.');
