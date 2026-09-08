// Service worker: owns chrome.downloads so exports land in a folder without
// tripping Chrome's "site wants to download multiple files" prompt.
//
// MV3 service workers have no URL.createObjectURL, so text is handed over as a
// data: URL. Very large payloads fall back to a page-side anchor download,
// which the content script handles.
const DATA_URL_LIMIT = 1.5 * 1024 * 1024;

function toDataUrl(text) {
  // encodeURIComponent keeps this UTF-8 safe (emoji, accents, RTL scripts).
  return 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
}

function download(filename, text) {
  return new Promise((resolve) => {
    if (text.length > DATA_URL_LIMIT) {
      resolve({ ok: false, reason: 'too-large' });
      return;
    }
    try {
      chrome.downloads.download(
        { url: toDataUrl(text), filename, saveAs: false, conflictAction: 'uniquify' },
        (id) => {
          const error = chrome.runtime.lastError;
          if (error || id === undefined) resolve({ ok: false, reason: error?.message || 'download-failed' });
          else resolve({ ok: true, id });
        }
      );
    } catch (error) {
      resolve({ ok: false, reason: String(error?.message || error) });
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'download') {
    download(message.filename, message.text).then(sendResponse);
    return true; // keep the channel open for the async reply
  }
  return false;
});
