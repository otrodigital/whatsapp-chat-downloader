/**
 * WhatsApp Chat Downloader - page-side exporter.
 *
 * Runs inside web.whatsapp.com. Walks the chat list, opens each chat, scrolls
 * its history to the top while harvesting messages, and hands finished text to
 * the service worker for download.
 *
 * WhatsApp recycles DOM nodes as you scroll, so messages are collected across
 * many passes, deduped by their `data-id`, and merged back into true
 * conversation order (see mergeOrder).
 */
(() => {
  if (window.__waChatDownloader) return;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const DEFAULTS = {
    chats: [],
    scrollDelay: 700,
    chatDelay: 500,
    maxScrolls: 600,
    maxMessages: 0,
    sinceDays: 0,
    perChat: true,
    combined: false,
    json: false,
  };

  const state = {
    running: false,
    cancel: false,
    phase: 'idle',
    total: 0,
    done: 0,
    current: '',
    currentMessages: 0,
    files: 0,
    log: [],
    error: null,
  };

  function log(message, level = 'info') {
    state.log.push({ at: Date.now(), message, level });
    if (state.log.length > 400) state.log.shift();
  }

  function status() {
    return {
      running: state.running,
      phase: state.phase,
      total: state.total,
      done: state.done,
      current: state.current,
      currentMessages: state.currentMessages,
      files: state.files,
      error: state.error,
      log: state.log.slice(-40),
    };
  }

  /* ---------------------------------------------------------------- DOM utils */

  function isScrollable(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    return /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 40;
  }

  function findScrollable(root) {
    if (!root) return null;
    if (isScrollable(root)) return root;
    for (const element of $$('*', root)) if (isScrollable(element)) return element;
    return root;
  }

  // React listens at the document root, so a plain click() bubbles correctly -
  // but WhatsApp rows also react to pointer events, so send the full sequence.
  function realClick(element) {
    const options = { bubbles: true, cancelable: true, composed: true, view: window };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const Ctor = type.startsWith('pointer') && window.PointerEvent ? PointerEvent : MouseEvent;
      element.dispatchEvent(new Ctor(type, options));
    }
  }

  async function waitFor(predicate, timeout = 8000, interval = 150) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (state.cancel) return false;
      let value = false;
      try { value = predicate(); } catch { value = false; }
      if (value) return true;
      await sleep(interval);
    }
    return false;
  }

  /* ------------------------------------------------------------ the chat list */

  // WhatsApp reshuffles its markup between releases, so the chat list is found
  // by structure with several fallbacks rather than one hard-coded selector.
  function chatListPane() {
    const direct = $('#pane-side');
    if (direct) return direct;

    // Fall back to whichever container holds the most rows with a titled span,
    // ignoring the conversation pane. Matching on aria-label is deliberately
    // avoided: those strings are translated.
    const groups = new Map();
    for (const span of $$('span[title]')) {
      if (span.closest('#main')) continue;
      const row = span.closest('[role="listitem"], [role="row"]') || span;
      const host = row.parentElement?.closest('div[tabindex], div[role="grid"], div[role="list"], div[role="application"]');
      if (host) groups.set(host, (groups.get(host) || 0) + 1);
    }
    let best = null;
    let bestCount = 0;
    for (const [host, count] of groups) if (count > bestCount) { best = host; bestCount = count; }
    return bestCount >= 2 ? best : null;
  }

  function chatListScroller() {
    const pane = chatListPane();
    return pane ? findScrollable(pane) : null;
  }

  const ROW_SELECTORS = [
    'div[role="listitem"]',
    'div[role="row"]',
    'div[data-testid="cell-frame-container"]',
  ];
  let rowStrategy = 'none';

  function visibleChatItems(scroller) {
    if (!scroller) return [];
    for (const selector of ROW_SELECTORS) {
      const rows = $$(selector, scroller).filter((row) => $('span[title]', row));
      if (rows.length) {
        rowStrategy = selector;
        return rows;
      }
    }
    // Last resort: virtualised rows are absolutely positioned, so group titled
    // spans by their nearest positioned ancestor.
    const seen = new Set();
    const rows = [];
    for (const span of $$('span[title]', scroller)) {
      const row = span.closest('div[style*="translate"]') || span.closest('div[tabindex]') || span.parentElement?.parentElement;
      if (row && !seen.has(row)) {
        seen.add(row);
        rows.push(row);
      }
    }
    if (rows.length) rowStrategy = 'positioned span[title]';
    return rows;
  }

  function chatItemName(item) {
    // The chat title is the first titled span in the row; the message preview
    // below it can also carry a title attribute, so order matters here.
    const titled = $('span[title]', item);
    const title = titled?.getAttribute('title')?.trim();
    if (title) return title;
    const fallback = $('span[dir="auto"]', item)?.textContent?.trim();
    return fallback || '';
  }

  // Click the title span, not the row: React attaches its handler to an inner
  // element, and events bubble up, so clicking an outer wrapper does nothing.
  function clickChatItem(item) {
    realClick($('span[title]', item) || item);
  }

  async function scanChats(limit = 0) {
    const scroller = chatListScroller();
    if (!scroller) {
      throw new Error('Chat list not found. Open web.whatsapp.com, sign in, and leave the chat list visible.');
    }

    const names = [];
    const seen = new Set();
    let duplicates = 0;
    scroller.scrollTop = 0;
    await sleep(400);

    let idle = 0;
    for (let pass = 0; pass < 400 && idle < 3; pass += 1) {
      for (const item of visibleChatItems(scroller)) {
        const name = chatItemName(item);
        if (!name) continue;
        if (seen.has(name)) { duplicates += 1; continue; }
        seen.add(name);
        names.push(name);
      }
      if (limit && names.length >= limit) break;

      const before = scroller.scrollTop;
      scroller.scrollTop = Math.min(scroller.scrollTop + scroller.clientHeight * 0.8, scroller.scrollHeight);
      await sleep(350);
      idle = scroller.scrollTop <= before + 2 ? idle + 1 : 0;
    }

    scroller.scrollTop = 0;
    await sleep(200);

    if (!names.length) {
      throw new Error(
        'Found the chat list container but could not read any chat names. WhatsApp may have changed its markup - ' +
        'run diagnose.js (in the extension folder) from the page console and send the output.'
      );
    }
    log(`Found ${names.length} chats (matched by ${rowStrategy})`);
    if (duplicates) log(`${duplicates} row(s) shared a name with another chat and were skipped`, 'warn');
    return limit ? names.slice(0, limit) : names;
  }

  function openChatTitle() {
    const header = $('#main header');
    if (!header) return '';
    const titled = $('span[title]', header);
    return titled?.getAttribute('title')?.trim() || titled?.textContent?.trim() || '';
  }

  async function openChat(name) {
    const scroller = chatListScroller();
    if (!scroller) return false;

    const findItem = () =>
      visibleChatItems(scroller).find((item) => chatItemName(item) === name) || null;

    let item = findItem();
    if (!item) {
      scroller.scrollTop = 0;
      await sleep(300);
      for (let pass = 0; pass < 400; pass += 1) {
        item = findItem();
        if (item || state.cancel) break;
        const before = scroller.scrollTop;
        scroller.scrollTop += scroller.clientHeight * 0.8;
        await sleep(250);
        if (scroller.scrollTop <= before + 2) break;
      }
    }
    if (!item) return false;

    clickChatItem(item);
    const opened = await waitFor(() => openChatTitle() === name, 8000);
    if (!opened) {
      // Header text can differ from the list entry (truncation, saved contact
      // name); accept any chat pane that finished rendering.
      const anyChat = await waitFor(() => Boolean($('#main div[role="row"]')), 4000);
      if (!anyChat) return false;
    }
    await sleep(300);
    return true;
  }

  /* -------------------------------------------------------- message extraction */

  const DIVIDER_PATTERN = /^(today|yesterday|[a-z]{3,9}day|\d{1,2}[\/.\-]\d{1,2}([\/.\-]\d{2,4})?|[a-z]{3,9} \d{1,2},? \d{4})$/i;

  function extractText(root) {
    if (!root) return '';
    let out = '';
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          out += child.nodeValue;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName.toLowerCase();
          if (tag === 'br') out += '\n';
          else if (tag === 'img') out += child.getAttribute('alt') || ''; // emoji render as <img alt="...">
          else if (!child.hasAttribute('data-icon')) walk(child);
        }
      }
    };
    walk(root);
    return out.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
  }

  function describeMedia(bubble) {
    if ($('[data-icon="audio-play"], [data-icon="ptt-play"], audio', bubble)) return '<audio omitted>';
    if ($('[data-icon="media-play"], video', bubble)) return '<video omitted>';
    if ($('[data-icon="sticker"]', bubble)) return '<sticker omitted>';
    if ($('[data-icon="document"], [data-icon="document-pdf"]', bubble)) {
      const label = extractText($('[role="button"] span[dir="auto"]', bubble));
      return label ? `<document omitted: ${label}>` : '<document omitted>';
    }
    if ($('[data-icon="poll"]', bubble)) return '<poll omitted>';
    if ($('img[src^="blob:"], img[src^="data:"]', bubble)) return '<image omitted>';
    return '';
  }

  function bubbleTime(bubble) {
    for (const span of $$('span', bubble).reverse()) {
      const text = span.textContent?.trim() || '';
      if (/^\d{1,2}:\d{2}(\s?[ap]\.?m\.?)?$/i.test(text)) return text;
    }
    return '';
  }

  function quotedSnippet(bubble) {
    const quote = $('[data-testid="quoted-message"], .quoted-mention', bubble);
    if (!quote) return '';
    const container = quote.closest('[role="button"]') || quote;
    const text = extractText(container).replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 120) : '';
  }

  /**
   * Turn one `div[role="row"]` into a message record, a date divider, or null.
   */
  function parseRow(row) {
    const bubble = $('[data-id]', row) || (row.hasAttribute('data-id') ? row : null);

    if (!bubble) {
      const text = (row.innerText || row.textContent || '').trim();
      if (!text) return null;
      if (text.length <= 24 && DIVIDER_PATTERN.test(text)) return { divider: text };
      return { kind: 'system', sender: 'System', text: text.replace(/\s*\n\s*/g, ' '), stamp: '', date: '', time: '' };
    }

    const id = bubble.getAttribute('data-id');
    const outgoing = bubble.classList.contains('message-out') || Boolean($('.message-out', row));
    const body = $('[data-pre-plain-text]', row);
    const stamp = body?.getAttribute('data-pre-plain-text') || '';

    // Format: "[10:31, 12/25/2024] Sender Name: "
    const parsed = /^\[([^,\]]+),\s*([^\]]+)\]\s*(.*?):?\s*$/.exec(stamp.trim());
    const time = parsed ? parsed[1].trim() : bubbleTime(bubble);
    const date = parsed ? parsed[2].trim() : '';
    let sender = parsed ? parsed[3].trim() : '';
    if (!sender) sender = outgoing ? 'Me' : '';

    const text = extractText(body ? $('span.selectable-text', body) : null);
    const media = text ? '' : describeMedia(bubble);
    const caption = text && $('img[src^="blob:"], video, [data-icon="media-play"]', bubble) ? describeMedia(bubble) : '';
    const quoted = quotedSnippet(bubble);

    let finalText = [caption, text || media].filter(Boolean).join(' ').trim();
    if (!finalText) finalText = '<message omitted>';
    if (quoted) finalText = `(replying to: ${quoted}) ${finalText}`;

    return { id, kind: outgoing ? 'out' : 'in', sender, text: finalText, date, time, stamp };
  }

  function messageKey(message) {
    if (message.id) return message.id;
    return `${message.kind}|${message.date}|${message.time}|${message.sender}|${message.text.slice(0, 120)}`;
  }

  /**
   * Merge one harvested pass into the running order.
   *
   * Passes overlap, so shared keys act as sync points: unseen keys from the new
   * pass slot in around them. With no overlap at all, direction decides whether
   * the pass belongs before (scrolling up) or after the known messages.
   */
  function mergeOrder(ordered, pass, direction) {
    if (!pass.length) return ordered;
    if (!ordered.length) return pass.slice();

    const known = new Set(ordered);
    const shared = new Set(pass.filter((key) => known.has(key)));
    if (!shared.size) return direction === 'up' ? pass.concat(ordered) : ordered.concat(pass);

    const out = [];
    let i = 0;
    let j = 0;
    while (i < ordered.length || j < pass.length) {
      if (i < ordered.length && !shared.has(ordered[i])) { out.push(ordered[i++]); continue; }
      if (j < pass.length && !shared.has(pass[j])) { out.push(pass[j++]); continue; }
      if (i < ordered.length && j < pass.length) {
        out.push(ordered[i]);
        if (ordered[i] === pass[j]) j += 1;
        i += 1;
        continue;
      }
      if (i < ordered.length) out.push(ordered[i++]);
      else out.push(pass[j++]);
    }

    const seen = new Set();
    return out.filter((key) => (seen.has(key) ? false : seen.add(key)));
  }

  function messageScroller() {
    const main = $('#main');
    if (!main) return null;
    const app = $('div[role="application"]', main);
    let element = app?.parentElement || null;
    while (element && element !== document.body) {
      if (isScrollable(element)) return element;
      element = element.parentElement;
    }
    return findScrollable($('.copyable-area', main) || main);
  }

  async function collectMessages(options) {
    const scroller = messageScroller();
    if (!scroller) throw new Error('Message pane not found.');

    const byKey = new Map();
    let ordered = [];
    let lastDivider = '';

    const harvest = (direction) => {
      const pass = [];
      for (const row of $$('#main div[role="row"]')) {
        const parsed = parseRow(row);
        if (!parsed) continue;
        if (parsed.divider) { lastDivider = parsed.divider; continue; }
        if (!parsed.date && lastDivider) parsed.date = lastDivider;
        const key = messageKey(parsed);
        pass.push(key);
        if (!byKey.has(key)) byKey.set(key, parsed);
      }
      ordered = mergeOrder(ordered, pass, direction);
      state.currentMessages = ordered.length;
    };

    const cutoff = options.sinceDays ? Date.now() - options.sinceDays * 86400000 : 0;
    const limitHit = () => {
      if (options.maxMessages && ordered.length >= options.maxMessages) return true;
      if (!cutoff) return false;
      const oldest = byKey.get(ordered[0]);
      const ms = oldest ? toEpoch(oldest.date, oldest.time, dateOrderOf([...byKey.values()])) : null;
      return ms !== null && ms < cutoff;
    };

    harvest('up');

    let idle = 0;
    for (let pass = 0; pass < options.maxScrolls && !state.cancel; pass += 1) {
      if (limitHit()) break;
      const height = scroller.scrollHeight;

      if (scroller.scrollTop > 2) {
        // Step upward through already-rendered history.
        scroller.scrollTop = Math.max(0, scroller.scrollTop - scroller.clientHeight * 0.85);
        await sleep(options.scrollDelay);
      } else {
        // Parked at the top: WhatsApp fetches the next page of history here.
        scroller.scrollTop = 0;
        await sleep(Math.max(options.scrollDelay, 900));
        if (scroller.scrollHeight <= height + 10 && scroller.scrollTop <= 2) {
          idle += 1;
          if (idle >= 3) { harvest('up'); break; }
        } else {
          idle = 0;
        }
      }
      harvest('up');
    }

    // Downward sweep: guarantees coverage of anything the upward pass skipped
    // if WhatsApp recycled a stretch of the middle.
    for (let pass = 0; pass < options.maxScrolls && !state.cancel; pass += 1) {
      const before = scroller.scrollTop;
      scroller.scrollTop = Math.min(scroller.scrollTop + scroller.clientHeight * 0.85, scroller.scrollHeight);
      await sleep(Math.min(options.scrollDelay, 350));
      harvest('down');
      if (scroller.scrollTop <= before + 2) break;
    }

    return ordered.map((key) => byKey.get(key)).filter(Boolean);
  }

  /* ----------------------------------------------------------- date handling */

  // WhatsApp renders dates in the account's own locale, so 03/04/2025 is
  // genuinely ambiguous. Infer the order from any unambiguous date in the chat
  // and fall back to month-first, which is WhatsApp Web's default.
  function dateOrderOf(messages) {
    let order = 'MDY';
    for (const message of messages) {
      const parts = String(message.date || '').split(/[\/.\-]/);
      if (parts.length < 3) continue;
      if (parts[0].length === 4) return 'YMD';
      const first = Number(parts[0]);
      const second = Number(parts[1]);
      if (first > 12) return 'DMY';
      if (second > 12) order = 'MDY';
    }
    return order;
  }

  function toEpoch(date, time, order) {
    const parts = String(date || '').split(/[\/.\-]/).map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    let [year, month, day] =
      order === 'YMD' ? [parts[0], parts[1], parts[2]]
      : order === 'DMY' ? [parts[2], parts[1], parts[0]]
      : [parts[2], parts[0], parts[1]];
    if (year < 100) year += 2000;
    const clock = /^(\d{1,2}):(\d{2})\s*([ap])?/i.exec(String(time || '')) || [];
    let hours = Number(clock[1] || 0);
    const minutes = Number(clock[2] || 0);
    if (clock[3]) {
      const pm = clock[3].toLowerCase() === 'p';
      hours = (hours % 12) + (pm ? 12 : 0);
    }
    const ms = new Date(year, month - 1, day, hours, minutes).getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  /* --------------------------------------------------------------- rendering */

  function safeName(name) {
    return (name || 'chat')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .slice(0, 80) || 'chat';
  }

  function stampNow() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  function renderText(chat, messages) {
    const order = dateOrderOf(messages);
    const label = order === 'YMD' ? 'YYYY-MM-DD' : order === 'DMY' ? 'DD/MM/YYYY' : 'MM/DD/YYYY';
    const first = messages.find((message) => message.date);
    const last = [...messages].reverse().find((message) => message.date);

    const header = [
      '='.repeat(64),
      'WhatsApp chat export',
      `Chat: ${chat}`,
      `Messages: ${messages.length}`,
      first && last ? `Range: ${first.date} ${first.time} -> ${last.date} ${last.time}` : null,
      `Date format: ${label} (as displayed by WhatsApp)`,
      `Exported: ${new Date().toISOString()}`,
      '='.repeat(64),
      '',
    ].filter(Boolean).join('\n');

    const body = messages
      .map((message) => {
        const when = [message.date, message.time].filter(Boolean).join(' ');
        const who = message.sender || (message.kind === 'out' ? 'Me' : chat);
        const prefix = when ? `[${when}] ` : '';
        return message.kind === 'system' ? `${prefix}* ${message.text}` : `${prefix}${who}: ${message.text}`;
      })
      .join('\n');

    return `${header}${body}\n`;
  }

  function renderJson(chat, messages) {
    const order = dateOrderOf(messages);
    return JSON.stringify(
      {
        chat,
        exportedAt: new Date().toISOString(),
        dateOrder: order,
        messageCount: messages.length,
        messages: messages.map((message) => ({
          sender: message.sender || (message.kind === 'out' ? 'Me' : chat),
          direction: message.kind,
          date: message.date,
          time: message.time,
          timestamp: toEpoch(message.date, message.time, order),
          text: message.text,
        })),
      },
      null,
      2
    );
  }

  /* --------------------------------------------------------------- downloads */

  function anchorDownload(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.split('/').pop();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function save(filename, text) {
    let result = { ok: false };
    try {
      result = await chrome.runtime.sendMessage({ type: 'download', filename, text });
    } catch {
      result = { ok: false, reason: 'worker-unavailable' };
    }
    if (!result?.ok) anchorDownload(filename, text);
    state.files += 1;
  }

  /* ------------------------------------------------------------- export loop */

  async function exportChats(input) {
    const options = { ...DEFAULTS, ...input };
    state.running = true;
    state.cancel = false;
    state.error = null;
    state.done = 0;
    state.files = 0;
    state.log = [];
    state.phase = 'scanning';

    const folder = `whatsapp-export/${stampNow()}`;
    const combined = [];

    try {
      const targets = options.chats.length ? options.chats : await scanChats(0);
      state.total = targets.length;
      log(`Exporting ${targets.length} chat${targets.length === 1 ? '' : 's'}`);

      for (const name of targets) {
        if (state.cancel) break;
        state.current = name;
        state.currentMessages = 0;

        state.phase = 'opening';
        const opened = await openChat(name);
        if (!opened) {
          log(`Skipped "${name}" - could not open it`, 'warn');
          state.done += 1;
          continue;
        }

        state.phase = 'loading';
        const messages = await collectMessages(options);
        if (!messages.length) {
          log(`Skipped "${name}" - no messages found`, 'warn');
          state.done += 1;
          continue;
        }

        state.phase = 'saving';
        const text = renderText(name, messages);
        if (options.perChat) await save(`${folder}/${safeName(name)}.txt`, text);
        if (options.json) await save(`${folder}/${safeName(name)}.json`, renderJson(name, messages));
        if (options.combined) combined.push(text);

        state.done += 1;
        log(`Saved "${name}" - ${messages.length} messages`);
        await sleep(options.chatDelay);
      }

      if (options.combined && combined.length) {
        await save(`${folder}/all-chats.txt`, combined.join('\n\n'));
        log(`Saved combined file - ${combined.length} chats`);
      }

      state.phase = state.cancel ? 'cancelled' : 'done';
    } catch (error) {
      state.error = String(error?.message || error);
      state.phase = 'error';
      log(state.error, 'error');
    } finally {
      state.running = false;
      state.current = '';
    }
  }

  /* ---------------------------------------------------------------- messaging */

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'ping') { sendResponse({ ok: true }); return false; }
    if (message?.type === 'status') { sendResponse(status()); return false; }
    if (message?.type === 'cancel') { state.cancel = true; log('Stopping after the current chat'); sendResponse({ ok: true }); return false; }
    if (message?.type === 'scan') {
      scanChats(message.limit || 0)
        .then((chats) => sendResponse({ ok: true, chats }))
        .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
    if (message?.type === 'start') {
      if (state.running) { sendResponse({ ok: false, error: 'An export is already running.' }); return false; }
      exportChats(message.options || {});
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  window.__waChatDownloader = { status };
})();
