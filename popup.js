const el = (id) => document.getElementById(id);
const scanButton = el('scan');
const filterInput = el('filter');
const chatList = el('chat-list');
const selectAll = el('select-all');
const selectionCount = el('selection-count');
const startButton = el('start');
const stopButton = el('stop');
const statusText = el('status');
const countText = el('count');
const progress = el('progress');
const errorText = el('error');
const logBox = el('log');

const OPTION_IDS = ['speed', 'since', 'max-messages', 'per-chat', 'combined', 'json'];

let chats = [];
let selected = new Set();
let poller = null;

/* --------------------------------------------------------------- messaging */

async function whatsappTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://web.whatsapp.com/')) {
    throw new Error('Open web.whatsapp.com in the active tab first.');
  }
  return tab;
}

async function send(message) {
  const tab = await whatsappTab();
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // No content script in this tab yet - normal when the WhatsApp tab was
    // already open before the extension was loaded. Inject it and retry once.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch (error) {
      throw new Error(`Could not inject into WhatsApp Web: ${error.message}`);
    }
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      throw new Error('Could not reach WhatsApp Web. Reload the tab and try again.');
    }
  }
}

/* ------------------------------------------------------------------- render */

function showError(message) {
  errorText.textContent = message;
  errorText.hidden = !message;
}

function renderChats() {
  const needle = filterInput.value.trim().toLowerCase();
  const visible = chats.filter((name) => !needle || name.toLowerCase().includes(needle));

  if (!chats.length) {
    chatList.innerHTML = '<p class="empty">Scan to pick chats, or export everything without scanning.</p>';
  } else if (!visible.length) {
    chatList.innerHTML = '<p class="empty">No chats match that filter.</p>';
  } else {
    chatList.innerHTML = '';
    for (const name of visible) {
      const row = document.createElement('label');
      row.className = 'chat-row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = selected.has(name);
      box.addEventListener('change', () => {
        if (box.checked) selected.add(name);
        else selected.delete(name);
        updateSelection();
      });
      const label = document.createElement('span');
      label.textContent = name;
      label.title = name;
      row.append(box, label);
      chatList.append(row);
    }
  }
  updateSelection();
}

function updateSelection() {
  const total = chats.length;
  selectionCount.textContent = total
    ? `${selected.size} of ${total} selected`
    : '0 selected';
  selectAll.disabled = !total;
  selectAll.checked = total > 0 && selected.size === total;
  startButton.textContent = selected.size ? `Download ${selected.size} chat${selected.size === 1 ? '' : 's'}` : 'Download all chats';
}

function renderLog(entries) {
  if (!entries?.length) return;
  logBox.innerHTML = '';
  for (const entry of entries) {
    const line = document.createElement('div');
    line.className = `log-line log-${entry.level || 'info'}`;
    line.textContent = entry.message;
    logBox.append(line);
  }
  logBox.scrollTop = logBox.scrollHeight;
}

function setRunning(running) {
  startButton.disabled = running;
  stopButton.disabled = !running;
  scanButton.disabled = running;
  for (const id of OPTION_IDS) el(id).disabled = running;
}

const PHASES = {
  scanning: 'Scanning chat list',
  opening: 'Opening chat',
  loading: 'Loading history',
  saving: 'Saving file',
  done: 'Finished',
  cancelled: 'Stopped',
  error: 'Failed',
  idle: 'Ready',
};

function applyStatus(state) {
  const total = state.total || 0;
  countText.textContent = `${state.done || 0} / ${total}`;
  progress.style.width = total ? `${Math.round(((state.done || 0) / total) * 100)}%` : '0%';

  const phase = PHASES[state.phase] || state.phase;
  if (state.running) {
    const detail = state.current ? ` - ${state.current}` : '';
    const messages = state.currentMessages ? ` (${state.currentMessages} messages)` : '';
    statusText.textContent = `${phase}${detail}${messages}`;
  } else {
    statusText.textContent = state.files ? `${phase} - ${state.files} file${state.files === 1 ? '' : 's'} saved` : phase;
    if (state.phase === 'done' || state.phase === 'cancelled') progress.style.width = '100%';
  }

  renderLog(state.log);
  if (state.error) showError(state.error);
  setRunning(Boolean(state.running));

  if (!state.running && poller) {
    clearInterval(poller);
    poller = null;
  }
}

function startPolling() {
  if (poller) clearInterval(poller);
  poller = setInterval(async () => {
    try {
      const state = await send({ type: 'status' });
      if (state) applyStatus(state);
    } catch {
      clearInterval(poller);
      poller = null;
      setRunning(false);
    }
  }, 500);
}

/* ------------------------------------------------------------------ options */

function readOptions() {
  return {
    chats: [...selected],
    scrollDelay: Number(el('speed').value),
    sinceDays: Number(el('since').value),
    maxMessages: Math.max(0, Number(el('max-messages').value) || 0),
    perChat: el('per-chat').checked,
    combined: el('combined').checked,
    json: el('json').checked,
  };
}

async function saveOptions() {
  const values = {};
  for (const id of OPTION_IDS) {
    const node = el(id);
    values[id] = node.type === 'checkbox' ? node.checked : node.value;
  }
  await chrome.storage.local.set({ options: values });
}

async function loadOptions() {
  const { options } = await chrome.storage.local.get('options');
  if (!options) return;
  for (const id of OPTION_IDS) {
    const node = el(id);
    if (!(id in options)) continue;
    if (node.type === 'checkbox') node.checked = Boolean(options[id]);
    else node.value = options[id];
  }
}

/* ------------------------------------------------------------------- events */

scanButton.addEventListener('click', async () => {
  showError('');
  scanButton.disabled = true;
  scanButton.textContent = 'Scanning...';
  try {
    const result = await send({ type: 'scan' });
    if (!result?.ok) throw new Error(result?.error || 'Scan failed.');
    chats = result.chats;
    selected = new Set(chats);
    filterInput.disabled = false;
    renderChats();
  } catch (error) {
    showError(error.message);
  } finally {
    scanButton.disabled = false;
    scanButton.textContent = 'Rescan';
  }
});

filterInput.addEventListener('input', renderChats);

selectAll.addEventListener('change', () => {
  selected = selectAll.checked ? new Set(chats) : new Set();
  renderChats();
});

startButton.addEventListener('click', async () => {
  showError('');
  const options = readOptions();
  if (!options.perChat && !options.combined && !options.json) {
    showError('Pick at least one output format.');
    return;
  }
  setRunning(true);
  statusText.textContent = 'Starting...';
  try {
    await saveOptions();
    const result = await send({ type: 'start', options });
    if (!result?.ok) throw new Error(result?.error || 'Could not start.');
    startPolling();
  } catch (error) {
    setRunning(false);
    showError(error.message);
    statusText.textContent = 'Not started';
  }
});

stopButton.addEventListener('click', async () => {
  stopButton.disabled = true;
  statusText.textContent = 'Stopping after the current chat...';
  try {
    await send({ type: 'cancel' });
  } catch (error) {
    showError(error.message);
  }
});

for (const id of OPTION_IDS) el(id).addEventListener('change', saveOptions);

(async function init() {
  await loadOptions();
  updateSelection();
  try {
    const state = await send({ type: 'status' });
    if (state) {
      applyStatus(state);
      if (state.running) startPolling();
    }
  } catch (error) {
    showError(error.message);
  }
})();
