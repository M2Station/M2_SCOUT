// ============================================================
// M2_SCOUT - CSCOPE window renderer
// Ported from M2_SEEK CscopeWindow.
// ============================================================

'use strict';

const S = window.m2scout;

let ctx = { folder: '', editorCmd: '', editorArgs: '', cscopeExe: 'cscope' };
let results = [];
let selIdx = -1;
let running = false;

const $ = (id) => document.getElementById(id);

function log(msg) {
  const ts = new Date().toTimeString().slice(0, 8);
  $('debug').textContent += `[${ts}] ${msg}\n`;
  $('debug').scrollTop = $('debug').scrollHeight;
}

function setRunning(v) {
  running = v;
  $('btnIndex').disabled = v;
  $('btnSearch').disabled = v;
}

async function refreshInfo() {
  const info = await S.cscope.info(ctx.folder);
  $('info').textContent = `cscope.files: ${info.cscopeFiles ? 'OK' : 'MISSING'} | cscope.out: ${info.cscopeOut ? 'OK' : 'MISSING'}`;
}

async function doIndex() {
  if (!ctx.folder) { log('[CSCOPE] INDEX aborted: Folder invalid'); return; }
  setRunning(true);
  log('[CSCOPE] Building index...');
  const r = await S.cscope.index(ctx.folder, $('cscopeExe').value.trim() || 'cscope');
  (r.debug || []).forEach((m) => log(m));
  if (r.out) log(r.out.trimEnd());
  if (r.err) log('[stderr] ' + r.err.trimEnd());
  log(`[RC] ${r.rc}`);
  if (!r.ok && r.message) { S.showError('CSCOPE', r.message); }
  log('[CSCOPE] INDEX done.');
  await refreshInfo();
  setRunning(false);
}

function renderResults(list) {
  results = list;
  selIdx = -1;
  const box = $('results');
  box.innerHTML = '';
  const frag = document.createDocumentFragment();
  list.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'cs-item';
    div.dataset.idx = String(idx);
    div.textContent = item.disp;
    div.addEventListener('click', () => selectResult(idx));
    div.addEventListener('dblclick', () => openSelected());
    div.addEventListener('contextmenu', (e) => { e.preventDefault(); selectResult(idx); showCtx(e.clientX, e.clientY); });
    frag.appendChild(div);
  });
  box.appendChild(frag);
}

async function doSearch() {
  if (!ctx.folder) { log('[CSCOPE] SEARCH aborted: Folder invalid'); return; }
  const query = $('query').value.trim();
  if (!query) { log('[CSCOPE] SEARCH aborted: Query empty'); return; }
  setRunning(true);
  log('[CSCOPE] Searching...');
  const r = await S.cscope.search(ctx.folder, $('cscopeExe').value.trim() || 'cscope', $('mode').value, query);
  if (r.warning) log('[CSCOPE] ' + r.warning);
  if (r.err) log('[stderr] ' + String(r.err).trimEnd());
  log(`[RC] ${r.rc}`);
  renderResults(r.results || []);
  log(`[CSCOPE] Results: ${results.length}`);
  setRunning(false);
}

function markSelected(idx) {
  $('results').querySelectorAll('.cs-item.selected').forEach((r) => r.classList.remove('selected'));
  const row = $('results').querySelector(`.cs-item[data-idx="${idx}"]`);
  if (row) { row.classList.add('selected'); row.scrollIntoView({ block: 'nearest' }); }
  selIdx = idx;
}

async function selectResult(idx) {
  if (idx < 0 || idx >= results.length) return;
  markSelected(idx);
  const item = results[idx];
  log(`[CSCOPE] SELECT: ${item.abs}:${item.line}`);
  const r = await S.cscope.preview(item.abs, item.line);
  setPreview(r.text || '');
}

function setPreview(text) {
  const pv = $('preview');
  const q = $('query').value.trim();
  if (!q) { pv.textContent = text; return; }
  // highlight query occurrences
  pv.innerHTML = '';
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  let i = 0;
  let html = '';
  while (i < text.length) {
    const j = lower.indexOf(ql, i);
    if (j < 0) { html += esc(text.slice(i)); break; }
    html += esc(text.slice(i, j));
    html += `<span class="cscope_hl">${esc(text.slice(j, j + q.length))}</span>`;
    i = j + q.length;
  }
  pv.innerHTML = html;
}

async function openSelected() {
  if (selIdx < 0 || selIdx >= results.length) return;
  const item = results[selIdx];
  if (!ctx.editorCmd) { log('[CSCOPE] Editor CMD is empty (set it in main window).'); return; }
  const res = await S.openEditor({
    editorCmd: ctx.editorCmd, editorArgs: ctx.editorArgs, filePath: item.abs, line: item.line,
  });
  if (res.ok) log(`[CSCOPE] Open: ${item.abs}:${item.line}`);
  else log(`[CSCOPE] Open failed: ${res.error}`);
}

// context menu
function showCtx(x, y) {
  const m = $('csCtxMenu');
  m.style.left = `${x}px`;
  m.style.top = `${y}px`;
  m.hidden = false;
}
function hideCtx() { $('csCtxMenu').hidden = true; }
$('csCtxMenu').addEventListener('click', async (e) => {
  const cmd = e.target.dataset.cmd;
  if (!cmd || selIdx < 0) { hideCtx(); return; }
  const item = results[selIdx];
  if (cmd === 'open') await openSelected();
  else if (cmd === 'copyPath') { await navigator.clipboard.writeText(item.abs); log(`[CSCOPE] Copied path: ${item.abs}`); }
  else if (cmd === 'copySnippet') {
    const sel = window.getSelection().toString() || $('preview').textContent;
    await navigator.clipboard.writeText(sel);
    log(`[CSCOPE] Copied snippet chars=${sel.length}`);
  }
  hideCtx();
});
window.addEventListener('click', hideCtx);
$('preview').addEventListener('contextmenu', (e) => { e.preventDefault(); showCtx(e.clientX, e.clientY); });

// results keyboard
$('results').addEventListener('keydown', async (e) => {
  if (e.key === 'F1') {
    e.preventDefault();
    const lines = [...$('results').querySelectorAll('.cs-item')].map((r) => r.textContent);
    if (lines.length) { await navigator.clipboard.writeText(lines.join('\n')); log(`[CSCOPE] F1 copied results lines=${lines.length}`); }
  } else if (e.key === 'ArrowDown') { e.preventDefault(); selectResult(Math.min(results.length - 1, selIdx + 1)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); selectResult(Math.max(0, selIdx < 0 ? 0 : selIdx - 1)); }
  else if (e.key === 'Enter') { e.preventDefault(); openSelected(); }
});
$('debug').addEventListener('dblclick', () => openSelected());

// splitter
(() => {
  const sp = $('csSplitter');
  const top = document.querySelector('.cs-top');
  const left = document.querySelector('.cs-results');
  let dragging = false;
  sp.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = top.getBoundingClientRect();
    let pct = ((e.clientX - rect.left) / rect.width) * 100;
    pct = Math.max(15, Math.min(85, pct));
    left.style.flex = `0 0 ${pct}%`;
  });
  window.addEventListener('mouseup', () => { dragging = false; });
})();

// wiring
$('btnIndex').addEventListener('click', doIndex);
$('btnSearch').addEventListener('click', doSearch);
$('query').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
$('openFolder').addEventListener('click', () => S.openExplorer(ctx.folder));

async function boot() {
  ctx = await S.cscope.getContext();
  $('folderLabel').textContent = ctx.folder || '';
  $('folderLabel').title = ctx.folder || '';
  $('cscopeExe').value = ctx.cscopeExe || 'cscope';
  await refreshInfo();
  log('[CSCOPE] Window ready. Tips: click INDEX first, then SEARCH.');
}
boot();
