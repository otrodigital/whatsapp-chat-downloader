/**
 * Paste this whole file into the DevTools console on web.whatsapp.com to find
 * out why a scan came back empty.
 *
 * It reports STRUCTURE ONLY - tag names, roles, class names and text *lengths*.
 * No chat names, phone numbers or message text are included, so the output is
 * safe to copy and share.
 */
(() => {
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const report = {};

  report.url = location.origin + location.pathname;
  report.loggedIn = Boolean(document.querySelector('#pane-side, #main'));
  report.extensionLoaded = Boolean(window.__waChatDownloader);

  const pane = document.querySelector('#pane-side');
  report.paneSide = Boolean(pane);

  // How many rows each candidate strategy would find.
  const root = pane || document;
  report.rowCounts = {};
  for (const selector of ['div[role="listitem"]', 'div[role="row"]', 'div[data-testid="cell-frame-container"]', 'div[style*="translate"]']) {
    const all = $$(selector, root);
    report.rowCounts[selector] = {
      total: all.length,
      withTitledSpan: all.filter((row) => row.querySelector('span[title]')).length,
    };
  }

  const titled = $$('span[title]', root).filter((span) => !span.closest('#main'));
  report.titledSpansOutsideMain = titled.length;
  report.titleLengths = titled.slice(0, 8).map((span) => (span.getAttribute('title') || '').length);

  // Is anything actually scrollable, and does it look like a list?
  const scrollables = $$('*', pane || document.body).filter((el) => {
    const style = getComputedStyle(el);
    return /(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 40;
  });
  report.scrollableCount = scrollables.length;
  report.scrollables = scrollables.slice(0, 4).map((el) => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    role: el.getAttribute('role'),
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));

  // Ancestor chain of the first chat-like row, attribute names only.
  const sample = titled[0];
  if (sample) {
    const chain = [];
    let node = sample;
    for (let step = 0; step < 8 && node && node !== document.body; step += 1) {
      chain.push({
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        role: node.getAttribute('role'),
        attrs: node.getAttributeNames().filter((name) => name !== 'title' && name !== 'aria-label'),
        classes: (node.className || '').toString().split(/\s+/).filter(Boolean).length,
        hasTransform: /translate/.test(node.getAttribute('style') || ''),
      });
      node = node.parentElement;
    }
    report.rowAncestry = chain;
  }

  // Message pane, for the second half of the export.
  const main = document.querySelector('#main');
  report.mainPane = Boolean(main);
  if (main) {
    report.messageRows = $$('div[role="row"]', main).length;
    report.messagesWithDataId = $$('[data-id]', main).length;
    report.messagesWithPrePlainText = $$('[data-pre-plain-text]', main).length;
  }

  const text = JSON.stringify(report, null, 2);
  console.log(text);
  try {
    copy(text);
    console.log('%cCopied to clipboard - paste it back to Claude.', 'color:#0f7c5f;font-weight:bold');
  } catch {
    console.log('Select the JSON above and copy it.');
  }
  return report;
})();
