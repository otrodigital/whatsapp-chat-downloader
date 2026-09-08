import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const SRC = new URL('../content.js', import.meta.url);

// Expose internals for testing without shipping a test hook in the extension.
let code = readFileSync(SRC, 'utf8');
const hook = 'window.__waChatDownloader = { status };';
assert.ok(code.includes(hook), 'export hook not found');
code = code.replace(hook,
  'window.__waChatDownloader = { status, parseRow, mergeOrder, dateOrderOf, toEpoch, renderText, renderJson, safeName, messageKey, extractText, visibleChatItems, chatItemName, chatListPane };');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://web.whatsapp.com/', runScripts: 'dangerously' });
const { window } = dom;
window.chrome = { runtime: { onMessage: { addListener() {} }, sendMessage: async () => ({ ok: true }) } };
window.eval(code);
const api = window.__waChatDownloader;
assert.ok(api.parseRow, 'internals exposed');

const results = [];
const check = (name, fn) => {
  try { fn(); results.push(['PASS', name]); }
  catch (error) { results.push(['FAIL', name + ' :: ' + error.message]); }
};

/* ---------------------------------------------------- realistic WhatsApp DOM */

const row = (html) => {
  const holder = window.document.createElement('div');
  holder.innerHTML = html.trim();
  return holder.firstElementChild;
};

const textMessage = (id, dir, stamp, body) => row(`
  <div role="row">
    <div data-id="${id}" class="message-${dir} focusable-list-item">
      <div class="copyable-text" data-pre-plain-text="${stamp}">
        <div><span class="selectable-text copyable-text"><span>${body}</span></span></div>
      </div>
      <div><span aria-hidden="true">10:31</span></div>
    </div>
  </div>`);

check('parses an incoming text message', () => {
  const parsed = api.parseRow(textMessage('false_1@c.us_A', 'in', '[10:31, 12/25/2024] Ada Lovelace: ', 'Hello there'));
  assert.equal(parsed.sender, 'Ada Lovelace');
  assert.equal(parsed.text, 'Hello there');
  assert.equal(parsed.date, '12/25/2024');
  assert.equal(parsed.time, '10:31');
  assert.equal(parsed.kind, 'in');
  assert.equal(parsed.id, 'false_1@c.us_A');
});

check('outgoing message with no sender name falls back to Me', () => {
  const parsed = api.parseRow(textMessage('true_1@c.us_B', 'out', '[10:32, 12/25/2024] ', 'Hi!'));
  assert.equal(parsed.kind, 'out');
  assert.equal(parsed.sender, 'Me');
});

check('emoji images become their alt text', () => {
  const node = row(`
    <div role="row"><div data-id="x1" class="message-in">
      <div class="copyable-text" data-pre-plain-text="[09:00, 01/02/2025] Bob: ">
        <span class="selectable-text"><span>nice <img alt="\u{1F600}" src="x.png"> day<br>bye</span></span>
      </div></div></div>`);
  const parsed = api.parseRow(node);
  assert.equal(parsed.text, 'nice \u{1F600} day\nbye');
});

check('media message without text gets a placeholder', () => {
  const node = row(`
    <div role="row"><div data-id="x2" class="message-in">
      <div><span data-icon="audio-play"></span></div>
      <div><span>08:15</span></div>
    </div></div>`);
  const parsed = api.parseRow(node);
  assert.equal(parsed.text, '<audio omitted>');
  assert.equal(parsed.time, '08:15', 'falls back to the bubble clock');
});

check('date dividers are recognised, not exported as messages', () => {
  for (const label of ['TODAY', 'Yesterday', '12/25/2024', 'Monday']) {
    const node = row(`<div role="row"><div><span>${label}</span></div></div>`);
    const parsed = api.parseRow(node);
    assert.ok(parsed?.divider, `"${label}" should be a divider, got ${JSON.stringify(parsed)}`);
  }
});

check('system notices are kept as system lines', () => {
  const node = row(`<div role="row"><div><span>Messages and calls are end-to-end encrypted. No one outside of this chat can read them.</span></div></div>`);
  const parsed = api.parseRow(node);
  assert.equal(parsed.kind, 'system');
});

/* ------------------------------------------------------------- chat list */

const paneWith = (html) => {
  window.document.body.innerHTML = `<div id="pane-side">${html}</div>`;
  return window.document.getElementById('pane-side');
};

check('reads chat rows marked up as listitems', () => {
  const pane = paneWith(`
    <div role="listitem"><div><span title="Ada Lovelace">Ada Lovelace</span></div></div>
    <div role="listitem"><div><span title="Family Group">Family Group</span></div></div>`);
  const rows = api.visibleChatItems(pane);
  assert.equal(rows.length, 2);
  assert.deepEqual([...rows.map(api.chatItemName)], ['Ada Lovelace', 'Family Group']);
});

check('falls back to role=row when listitem is gone', () => {
  const pane = paneWith(`
    <div role="grid">
      <div role="row"><div role="gridcell"><span title="Ada Lovelace">Ada</span></div></div>
      <div role="row"><div role="gridcell"><span title="Bob">Bob</span></div></div>
    </div>`);
  const rows = api.visibleChatItems(pane);
  assert.equal(rows.length, 2);
  assert.deepEqual([...rows.map(api.chatItemName)], ['Ada Lovelace', 'Bob']);
});

check('falls back to positioned rows when no roles are present at all', () => {
  const pane = paneWith(`
    <div style="transform: translateY(0px)"><div><span title="Ada Lovelace">Ada</span></div></div>
    <div style="transform: translateY(72px)"><div><span title="Bob">Bob</span></div></div>`);
  const rows = api.visibleChatItems(pane);
  assert.equal(rows.length, 2);
  assert.deepEqual([...rows.map(api.chatItemName)], ['Ada Lovelace', 'Bob']);
});

check('a titled message preview never shadows the chat name', () => {
  const pane = paneWith(`
    <div role="listitem"><div>
      <span title="Ada Lovelace">Ada Lovelace</span>
      <span title="see you tomorrow!">see you tomorrow!</span>
    </div></div>`);
  assert.equal(api.chatItemName(api.visibleChatItems(pane)[0]), 'Ada Lovelace');
});

check('rows without a titled span are ignored', () => {
  const pane = paneWith(`
    <div role="listitem"><div><span>Archived</span></div></div>
    <div role="listitem"><div><span title="Ada">Ada</span></div></div>`);
  assert.equal(api.visibleChatItems(pane).length, 1);
});

check('locates the chat list even without #pane-side', () => {
  window.document.body.innerHTML = `
    <div tabindex="0" id="somewhere">
      <div role="listitem"><span title="Ada">Ada</span></div>
      <div role="listitem"><span title="Bob">Bob</span></div>
    </div>
    <div id="main"><div role="row"><span title="a link preview">x</span></div></div>`;
  const pane = api.chatListPane();
  assert.ok(pane, 'a pane should be found');
  assert.equal(pane.id, 'somewhere', 'and it must not be the message pane');
});

check('reports no pane when the page has no chat list', () => {
  window.document.body.innerHTML = '<div id="main"><div role="row"><span title="only a message">x</span></div></div>';
  assert.equal(api.chatListPane(), null);
});

/* ------------------------------------------------------------ order merging */

check('overlapping upward passes rebuild true order', () => {
  // Conversation m1..m9; passes render sliding windows while scrolling up.
  let ordered = [];
  ordered = api.mergeOrder(ordered, ['m7', 'm8', 'm9'], 'up');
  ordered = api.mergeOrder(ordered, ['m4', 'm5', 'm6', 'm7'], 'up');
  ordered = api.mergeOrder(ordered, ['m1', 'm2', 'm3', 'm4'], 'up');
  assert.deepEqual([...ordered], ['m1','m2','m3','m4','m5','m6','m7','m8','m9']);
});

check('a downward sweep slots recycled middles back in place', () => {
  let ordered = api.mergeOrder([], ['m1', 'm2', 'm8', 'm9'], 'up');
  ordered = api.mergeOrder(ordered, ['m2', 'm3', 'm4', 'm8'], 'down');
  assert.deepEqual([...ordered], ['m1','m2','m3','m4','m8','m9']);
});

check('a pass with no overlap respects direction', () => {
  assert.deepEqual([...api.mergeOrder(['m5','m6'], ['m1','m2'], 'up')], ['m1','m2','m5','m6']);
  assert.deepEqual([...api.mergeOrder(['m5','m6'], ['m9'], 'down')], ['m5','m6','m9']);
});

check('merging never duplicates or drops messages', () => {
  const truth = Array.from({ length: 60 }, (_, i) => 'm' + i);
  let ordered = [];
  for (let start = 45; start >= 0; start -= 5) {
    ordered = api.mergeOrder(ordered, truth.slice(start, start + 15), 'up');
  }
  assert.deepEqual([...ordered], truth);
});

/* -------------------------------------------------------------- date parsing */

check('day-first locales are detected from an unambiguous date', () => {
  assert.equal(api.dateOrderOf([{ date: '25/12/2024' }, { date: '01/02/2025' }]), 'DMY');
});

check('month-first is the default and ISO dates are detected', () => {
  assert.equal(api.dateOrderOf([{ date: '01/02/2025' }]), 'MDY');
  assert.equal(api.dateOrderOf([{ date: '2025-02-01' }]), 'YMD');
});

check('timestamps parse for each order, including 12-hour clocks', () => {
  assert.equal(api.toEpoch('12/25/2024', '10:31', 'MDY'), new Date(2024, 11, 25, 10, 31).getTime());
  assert.equal(api.toEpoch('25/12/2024', '10:31', 'DMY'), new Date(2024, 11, 25, 10, 31).getTime());
  assert.equal(api.toEpoch('12/25/24', '1:05 PM', 'MDY'), new Date(2024, 11, 25, 13, 5).getTime());
  assert.equal(api.toEpoch('nonsense', '10:31', 'MDY'), null);
});

/* ------------------------------------------------------------------ rendering */

check('rendered text has a header and one line per message', () => {
  const messages = [
    { kind: 'in', sender: 'Ada', text: 'Hello', date: '12/25/2024', time: '10:31' },
    { kind: 'out', sender: 'Me', text: 'Hi!', date: '12/25/2024', time: '10:32' },
    { kind: 'system', sender: 'System', text: 'Ada joined', date: '', time: '' },
  ];
  const out = api.renderText('Ada', messages);
  assert.ok(out.includes('Chat: Ada'));
  assert.ok(out.includes('Messages: 3'));
  assert.ok(out.includes('Date format: MM/DD/YYYY'));
  assert.ok(out.includes('[12/25/2024 10:31] Ada: Hello'));
  assert.ok(out.includes('[12/25/2024 10:32] Me: Hi!'));
  assert.ok(out.includes('* Ada joined'));
});

check('json export carries resolved timestamps', () => {
  const parsed = JSON.parse(api.renderJson('Ada', [{ kind: 'in', sender: 'Ada', text: 'Hi', date: '12/25/2024', time: '10:31' }]));
  assert.equal(parsed.messageCount, 1);
  assert.equal(parsed.messages[0].timestamp, new Date(2024, 11, 25, 10, 31).getTime());
});

check('filenames are stripped of path and reserved characters', () => {
  assert.equal(api.safeName('Team / Project: "Q1"'), 'Team - Project- -Q1-');
  const traversal = api.safeName('../../etc/passwd');
  assert.ok(!traversal.includes('/') && !traversal.startsWith('.'), traversal);
  assert.ok(!api.safeName('a/b\\c').includes('/'));
  assert.equal(api.safeName(''), 'chat');
});

/* ---------------------------------------------------------------------- done */

for (const [verdict, name] of results) console.log(verdict.padEnd(5), name);
const failed = results.filter(([v]) => v === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
