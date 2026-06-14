// ============================================================
// M2_SCOUT - main window renderer
// Ported from M2_SEEK TabApp / MainApp behavior.
// ============================================================

'use strict';

const S = window.m2scout;
const HLR = window.M2ScoutHighlight;
const T = (k, v) => (window.M2I18n ? window.M2I18n.t(k, v) : k);

let CONFIG = null;
let HL_RULES = {};
let baseIniRaw = {}; // loaded settings INI for the default tab

const manager = {
  tabs: [],
  seq: 0,
  sessionMap: new Map(),

  currentTab() {
    return this.tabs.find((t) => t.active) || this.tabs[0];
  },

  add(isDefault) {
    this.seq += 1;
    const id = `tab-${this.seq}`;
    const title = isDefault ? 'TAB BASE' : `TAB ${this.tabs.length + 1}`;
    // Source to clone from when opening a new tab: the current LAST tab (the
    // "previous" tab), or the base tab if none exists yet. Captured BEFORE the
    // new tab is pushed.
    const source = this.tabs.length ? this.tabs[this.tabs.length - 1] : null;
    const tab = new Tab(id, title, isDefault);
    this.tabs.push(tab);
    this.sessionMap.set(id, tab);
    this.renderTabBar();
    this.activate(tab);
    if (!isDefault) {
      tab.copyFrom(source || this.tabs[0]);
    }
    tab.focusKeywords();
    return tab;
  },

  activate(tab) {
    for (const t of this.tabs) {
      t.active = t === tab;
      t.contentEl.classList.toggle('active', t.active);
    }
    this.renderTabBar();
  },

  closeByIndex(idx) {
    if (idx <= 0 || idx >= this.tabs.length) return; // protect TAB BASE
    const tab = this.tabs[idx];
    const wasActive = tab.active;
    this.sessionMap.delete(tab.id);
    tab.destroy();
    this.tabs.splice(idx, 1);
    if (wasActive) this.activate(this.tabs[Math.max(0, idx - 1)]);
    this.renderTabBar();
  },

  closeCurrent() {
    const idx = this.tabs.findIndex((t) => t.active);
    this.closeByIndex(idx);
  },

  move(from, to) {
    if (from === to || from <= 0 || to <= 0) return; // keep base first
    if (from < 0 || from >= this.tabs.length || to < 0 || to >= this.tabs.length) return;
    const [t] = this.tabs.splice(from, 1);
    this.tabs.splice(to, 0, t);
    this.renderTabBar();
  },

  renderTabBar() {
    const bar = document.getElementById('tabs');
    bar.innerHTML = '';
    this.tabs.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'tab' + (t.active ? ' active' : '') + (i === 0 ? ' protected' : '');
      el.draggable = i !== 0;
      el.dataset.idx = String(i);

      const label = document.createElement('span');
      label.textContent = t.title;
      el.appendChild(label);

      const close = document.createElement('button');
      close.className = 'tab-close';
      close.textContent = '✕';
      close.title = T('tab.close');
      close.addEventListener('click', (e) => { e.stopPropagation(); this.closeByIndex(i); });
      el.appendChild(close);

      el.addEventListener('click', () => this.activate(t));
      el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); });
      el.addEventListener('dragover', (e) => e.preventDefault());
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        this.move(from, i);
      });

      bar.appendChild(el);
    });
  },
};

// ---------- helpers ----------
function parseKeywords(text) {
  let t = (text || '').trim();
  if (!t) return [];
  t = t.replace(/;/g, ' ').replace(/,/g, ' ');
  const parts = [];
  let cur = '';
  let q = null;
  let has = false;
  for (const ch of t) {
    if (q) { cur += ch; if (ch === q) q = null; } else if (ch === '"' || ch === "'") { q = ch; cur += ch; has = true; } else if (/\s/.test(ch)) { if (has) { parts.push(cur); cur = ''; has = false; } } else { cur += ch; has = true; }
  }
  if (has) parts.push(cur);
  return parts.map((p) => {
    let s = p.trim();
    if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) s = s.slice(1, -1);
    return s;
  }).filter(Boolean);
}

function extOf(p) {
  const m = /\.[^.\\/]+$/.exec(p || '');
  return m ? m[0].toLowerCase() : '';
}

function matchTokens(hay, needle) {
  const nd = (needle || '').trim();
  if (!nd) return false;
  let toks = nd.split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  let h = hay;
  if (!CONFIG.UIConfig.FILES_COLOR_MATCH_CASE_SENSITIVE) {
    h = h.toLowerCase();
    toks = toks.map((t) => t.toLowerCase());
  }
  return toks.every((t) => h.includes(t));
}

// ============================================================
// Tab
// ============================================================
class Tab {
  constructor(id, title, isDefault) {
    this.id = id;
    this.title = title;
    this.isDefault = isDefault;
    this.active = false;

    this.files = [];
    this.counts = {};
    this.displayMode = 'content';
    this.baseFolder = '';
    this.currentFile = null;
    this.running = false;
    this.selIdx = -1;
    this.selPath = null;

    this.liveMap = new Map();
    this.liveTimer = null;
    this.pauseLiveUntil = 0;

    this.previewToken = 0;
    this.previewText = '';
    this.previewCache = new Map();
    this.previewFontSize = CONFIG.UIConfig.FONT_SIZE;
    this.previewTimer = null;
    this.highlightTimer = null;
    this.f3RunsMap = new Map();
    this.f3Ids = [];
    this.f3Index = -1;

    this.saveTimer = null;
    this.recolorTimer = null;

    this._build();
  }

  _build() {
    const tpl = document.getElementById('tab-template');
    const frag = tpl.content.cloneNode(true);
    this.contentEl = frag.querySelector('.tab-content');
    document.getElementById('tabContents').appendChild(this.contentEl);

    // refs
    this.fields = {};
    this.contentEl.querySelectorAll('[data-field]').forEach((el) => { this.fields[el.dataset.field] = el; });
    this.els = {};
    this.contentEl.querySelectorAll('[data-el]').forEach((el) => { this.els[el.dataset.el] = el; });

    // mode radios unique name
    this.modeRadios = this.contentEl.querySelectorAll('[data-mode]');
    this.modeRadios.forEach((r) => { r.name = `mode-${this.id}`; });

    this._wire();
    this._applyDefaults();
    if (window.M2I18n) window.M2I18n.apply(this.contentEl);
  }

  _applyDefaults() {
    const d = CONFIG.defaults;
    this.setVal('rgExe', d.rgExe);
    this.setVal('fdExe', d.fdExe);
    this.setVal('filter', '*.*');
    this.setVal('editorCmd', d.editorCmd);
    this.setVal('editorArgs', d.editorArgs);
    this.setMode('OR');
    this.fields.caseSensitive.checked = true;
    this.fields.respectIgnore.checked = true;
    this._updateEditorReadout();
    this.updateButtons(false);
  }

  _wire() {
    const act = (name, fn) => {
      const el = this.contentEl.querySelector(`[data-action="${name}"]`);
      if (el) el.addEventListener('click', fn);
    };
    act('browseRg', () => this._browse('rgExe', 'rg'));
    act('browseFd', () => this._browse('fdExe', 'fd'));
    act('selectFolder', () => this._selectFolder());
    act('pickExcludeFolders', () => this._openExcludePicker());
    act('pickEditor', () => this._openEditorPicker());
    act('searchInFiles', () => this.search());
    act('searchFilename', () => this.searchFilename());
    act('stop', () => this.stop());
    act('genCscope', () => this._genCscope());
    act('cscope', () => this._openCscope());
    act('clearFilesHl', () => this.clearFilesHlFilter());
    act('toggleDebug', () => this._toggleDebug());
    act('clearDebug', () => { this.els.debug.textContent = ''; });

    // Enter-to-search inputs
    this.contentEl.querySelectorAll('[data-enter="search"]').forEach((el) => {
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.search(); } });
    });

    // INI save on change — ONLY the base (default) tab persists to the INI.
    // Other tabs never save, so we don't even attach the listeners for them.
    if (this.isDefault) {
      Object.values(this.fields).forEach((el) => {
        el.addEventListener('input', () => this.scheduleSave());
        el.addEventListener('change', () => this.scheduleSave());
      });
      this.modeRadios.forEach((r) => r.addEventListener('change', () => this.scheduleSave()));
    }

    // files list
    const fl = this.els.fileslist;
    fl.addEventListener('keydown', (e) => this._onFilesKey(e));
    fl.addEventListener('contextmenu', (e) => this._onFilesContext(e));

    // files HL/Filter
    this.els.filesHl.addEventListener('input', () => this.scheduleRecolor());
    this.els.filesFilter.addEventListener('input', () => this.scheduleRecolor());

    // preview
    const pv = this.els.preview;
    pv.addEventListener('contextmenu', (e) => this._onPreviewContext(e));
    pv.addEventListener('keydown', (e) => this._onPreviewKey(e));

    // splitter drag
    this._wireSplitter();
  }

  _wireSplitter() {
    const sp = this.els.splitter;
    const paned = this.contentEl.querySelector('.paned');
    const left = this.contentEl.querySelector('.pane-files');
    let dragging = false;
    sp.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const rect = paned.getBoundingClientRect();
      let pct = ((e.clientX - rect.left) / rect.width) * 100;
      pct = Math.max(15, Math.min(80, pct));
      left.style.flex = `0 0 ${pct}%`;
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  // ---------- field helpers ----------
  val(name) { return this.fields[name] ? this.fields[name].value : ''; }
  setVal(name, v) { if (this.fields[name]) this.fields[name].value = v == null ? '' : v; }
  checked(name) { return this.fields[name] ? this.fields[name].checked : false; }
  mode() { const r = [...this.modeRadios].find((x) => x.checked); return r ? r.value : 'OR'; }
  setMode(m) { this.modeRadios.forEach((r) => { r.checked = (r.value === m); }); }

  // Clone every form field from another tab (used when opening a new tab so it
  // starts as a copy of the previous/base tab). Writes via .value/.checked which
  // do NOT fire input events, so this never triggers an INI save.
  copyFrom(src) {
    if (!src || src === this) return;
    const TEXT = ['rgExe', 'fdExe', 'folder', 'filter', 'excludeDirs',
      'excludeFiles', 'excludeGroupKeys', 'keywords', 'editorCmd', 'editorArgs'];
    for (const name of TEXT) this.setVal(name, src.val(name));
    if (this.fields.caseSensitive && src.fields.caseSensitive) {
      this.fields.caseSensitive.checked = src.fields.caseSensitive.checked;
    }
    if (this.fields.respectIgnore && src.fields.respectIgnore) {
      this.fields.respectIgnore.checked = src.fields.respectIgnore.checked;
    }
    this._updateEditorReadout();
    this.setMode(src.mode());
  }

  // ---------- INI ----------
  loadFromIni(ini) {
    const g = (k) => ini[k];
    if (g('rg_exe')) this.setVal('rgExe', g('rg_exe'));
    if (g('fd_exe')) this.setVal('fdExe', g('fd_exe'));
    if (g('last_folder')) this.setVal('folder', g('last_folder'));
    if (g('filter')) this.setVal('filter', g('filter'));
    if (g('exclude_dirs') !== undefined) this.setVal('excludeDirs', g('exclude_dirs'));
    if (g('exclude_files') !== undefined) this.setVal('excludeFiles', g('exclude_files'));
    if (g('exclude_group_keys') !== undefined) this.setVal('excludeGroupKeys', g('exclude_group_keys'));
    if (g('keywords')) this.setVal('keywords', g('keywords'));
    else if (g('keyword')) this.setVal('keywords', g('keyword'));
    if (g('kw_mode')) this.setMode((g('kw_mode').trim().toUpperCase()) === 'AND' ? 'AND' : 'OR');
    if (g('case_sensitive') !== undefined) this.fields.caseSensitive.checked = ['1', 'true', 'yes', 'y', 'on'].includes(String(g('case_sensitive')).toLowerCase());
    if (g('respect_ignore_files') !== undefined) this.fields.respectIgnore.checked = ['1', 'true', 'yes', 'y', 'on'].includes(String(g('respect_ignore_files')).toLowerCase());
    if (g('editor_cmd')) this.setVal('editorCmd', g('editor_cmd'));
    this._updateEditorReadout();
    if (g('editor_args')) this.setVal('editorArgs', g('editor_args'));
  }

  scheduleSave() {
    if (!this.isDefault) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveToIni(), 300);
  }

  saveToIni(sync) {
    if (!this.isDefault) return;
    // Build a clean, canonical [search] payload. We intentionally do NOT carry
    // over unknown/legacy keys (e.g. a stale singular `keyword`, `skip_a`, or a
    // redundant `folder`), so the INI stays tidy with no duplicates.
    const d = {
      rg_exe: this.val('rgExe').trim() || CONFIG.defaults.rgExe,
      fd_exe: this.val('fdExe').trim() || CONFIG.defaults.fdExe,
      last_folder: this.val('folder').trim(),
      filter: this.val('filter').trim() || '*.*',
      exclude_dirs: this.val('excludeDirs').trim(),
      exclude_files: this.val('excludeFiles').trim(),
      exclude_group_keys: this.val('excludeGroupKeys').trim(),
      keywords: this.val('keywords').trim(),
      kw_mode: this.mode(),
      case_sensitive: this.checked('caseSensitive') ? 'true' : 'false',
      respect_ignore_files: this.checked('respectIgnore') ? 'true' : 'false',
      editor_cmd: this.val('editorCmd').trim() || CONFIG.defaults.editorCmd,
      editor_args: this.val('editorArgs').trim() || CONFIG.defaults.editorArgs,
    };
    baseIniRaw = d;
    if (sync && S.saveIniSync) S.saveIniSync(d);
    else S.saveIni(d);
  }

  // Cancel any pending debounce and write the current settings immediately
  // (synchronously). Called on window close so nothing is lost.
  flushSave() {
    if (!this.isDefault) return;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.saveToIni(true);
  }

  // ---------- browse / folder ----------
  async _browse(field, name) {
    const p = await S.pickFile(name);
    if (p) { this.setVal(field, p); this.scheduleSave(); }
  }
  async _selectFolder() {
    const p = await S.pickFolder();
    if (p) { this.setVal('folder', p); this.scheduleSave(); }
  }

  // Open the exclude-folders picker: reads M2_SCOUT_EXCLUDE_GROUPS.ini fresh,
  // lists its groups as checkboxes, and writes the ticked group keys into the
  // Exclude Group Keys field (resolved to skip patterns at search time).
  async _openExcludePicker() {
    if (!window.M2ExcludePicker) return;
    let groups = {};
    try {
      groups = await S.loadExcludeGroups();
    } catch (_e) {
      groups = {};
    }
    const selectedKeys = (this.val('excludeGroupKeys') || '')
      .split(/[;,\s]+/)
      .filter(Boolean);
    window.M2ExcludePicker.open({
      groups: groups || {},
      selectedKeys,
      onApply: (keys) => {
        this.setVal('excludeGroupKeys', keys.join(' '));
        this.scheduleSave();
        this.debug(`[Exclude folders] applied ${keys.length} group key(s): ${keys.join(' ')}`);
      },
    });
  }

  // Open the editor picker (VS Code / Sublime). Writes the chosen command +
  // args template into the (hidden) editor fields and refreshes the readout.
  _openEditorPicker() {
    if (!window.M2EditorPicker) return;
    window.M2EditorPicker.open({
      cmd: this.val('editorCmd'),
      args: this.val('editorArgs'),
      onApply: ({ cmd, args }) => {
        this.setVal('editorCmd', cmd);
        this.setVal('editorArgs', args);
        this._updateEditorReadout();
        this.scheduleSave();
        this.debug(`[Editor] set to: ${cmd} ${args}`);
      },
    });
  }

  // Show a friendly label for the current editor command next to the button.
  _updateEditorReadout() {
    const el = this.els.editorReadout;
    if (!el) return;
    const cmd = (this.val('editorCmd') || '').trim();
    const lc = cmd.toLowerCase();
    let label;
    if (!cmd) label = T('editor.none');
    else if (cmd === 'code' || lc.endsWith('code.exe') || lc.endsWith('code.cmd')) label = 'VS Code';
    else if (lc.includes('subl')) label = `Sublime \u2014 ${S.path.basename(cmd)}`;
    else label = cmd;
    el.textContent = label;
    el.title = `${cmd} ${this.val('editorArgs')}`.trim();
  }

  // ---------- search ----------
  _searchParams() {
    return {
      sessionId: this.id,
      rgExe: this.val('rgExe').trim(),
      fdExe: this.val('fdExe').trim(),
      folder: this.val('folder').trim(),
      filter: this.val('filter'),
      excludeDirs: this.val('excludeDirs'),
      excludeFiles: this.val('excludeFiles'),
      excludeGroupKeys: this.val('excludeGroupKeys'),
      keywords: this.val('keywords'),
      mode: this.mode(),
      caseSensitive: this.checked('caseSensitive'),
      respectIgnore: this.checked('respectIgnore'),
    };
  }

  _beginSearch(label) {
    this.running = true;
    this.updateButtons(true);
    this.baseFolder = this.val('folder').trim();
    this.liveMap = new Map();
    this.files = [];
    this.counts = {};
    this.currentFile = null;
    this.selIdx = -1;
    this.selPath = null;
    this.els.fileslist.innerHTML = '';
    this.els.preview.textContent = '';
    this.previewText = '';
    this.els.status.textContent = `${label}  [${this.mode()}] ${parseKeywords(this.val('keywords')).join(', ')}`;
    this.els.statusMatch.textContent = '';
    this.els.filesCount.textContent = `${T('files.label')}: —`;
  }

  async search() {
    if (this.running) return;
    this._beginSearch(T('status.searching'));
    const r = await S.startSearch(this._searchParams());
    if (!r.ok) { this._failStart(r.error); }
  }

  async searchFilename() {
    if (this.running) return;
    this._beginSearch(T('status.searchingFilenames'));
    const r = await S.startFilenameSearch(this._searchParams());
    if (!r.ok) { this._failStart(r.error); }
  }

  _failStart(error) {
    this.running = false;
    this.updateButtons(false);
    this.els.status.textContent = T('status.ready');
    S.showError('Error', error || 'Search failed to start');
  }

  stop() {
    if (!this.running) return;
    S.stopSearch(this.id);
    this.debug('!!! STOP requested !!!');
  }

  updateButtons(running) {
    const set = (name, disabled) => {
      const el = this.contentEl.querySelector(`[data-action="${name}"]`);
      if (el) el.disabled = disabled;
    };
    set('searchInFiles', running);
    set('searchFilename', running);
    set('stop', !running);
  }

  // ---------- search events ----------
  handleEvent(type, payload) {
    if (type === 'debug') this.debug(payload.msg);
    else if (type === 'live') this._onLive(payload.delta);
    else if (type === 'progress') this.els.statusMatch.textContent = `Matched Files: ${payload.matchedFiles}  Matches: ${payload.matches}`;
    else if (type === 'done') this._onDone(payload);
    else if (type === 'error') { S.showError('Error', payload.msg); this.running = false; this.updateButtons(false); this.els.status.textContent = T('status.ready'); }
  }

  _onLive(delta) {
    for (const [p, c] of delta) this.liveMap.set(p, (this.liveMap.get(p) || 0) + c);
    this._scheduleLiveRender();
  }

  _scheduleLiveRender() {
    if (this.liveTimer) return;
    this.liveTimer = setTimeout(() => { this.liveTimer = null; this._renderLive(); }, CONFIG.LiveUpdateConfig.FLUSH_MS);
  }

  _renderLive() {
    // A live flush may have been queued just before the search finished. Once
    // 'done' has rendered the authoritative list we must not paint again from
    // the (now-cleared) liveMap, or it would wipe the results.
    if (!this.running) return;
    if (Date.now() < this.pauseLiveUntil) { this._scheduleLiveRender(); return; }
    let items = [...this.liveMap.entries()].sort((a, b) => (b[1] - a[1]) || a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
    const lim = CONFIG.LiveUpdateConfig.SHOW_LIMIT;
    if (lim && items.length > lim) items = items.slice(0, lim);
    this.displayMode = 'content';
    this._renderRows(items);
  }

  _onDone(payload) {
    this.running = false;
    this.updateButtons(false);
    // Cancel any pending live flush so it can't repaint from the cleared
    // liveMap after we render the final results below (which would blank them).
    if (this.liveTimer) { clearTimeout(this.liveTimer); this.liveTimer = null; }
    this.displayMode = payload.filenameMode ? 'filename' : 'content';
    const items = payload.files.map((f) => [f.path, f.count]);
    // Safety net: if the search was stopped and produced no final list but we
    // already have rows on screen, keep them instead of clearing the results.
    if (payload.stopped && items.length === 0 && this.files.length > 0) {
      const n = this.files.length;
      const elapsed = (payload.elapsedMs / 1000).toFixed(2);
      const label = payload.filenameMode ? T('status.filenameDone') : T('status.done');
      this.els.status.textContent = `${label} in ${elapsed}s  |  [${this.mode()}] ${parseKeywords(this.val('keywords')).join(', ')} [STOPPED]`;
      this.liveMap = new Map();
      return;
    }
    this._renderRows(items);
    const n = this.files.length;
    const elapsed = (payload.elapsedMs / 1000).toFixed(2);
    const total = items.reduce((s, [, c]) => s + c, 0);
    this.els.statusMatch.textContent = payload.filenameMode ? `${T('files.label')}: ${n}` : `${T('files.label')}: ${n}  ${T('files.matches')} ${total}`;
    const stoppedTxt = payload.stopped ? ' [STOPPED]' : '';
    const label = payload.filenameMode ? T('status.filenameDone') : T('status.done');
    this.els.status.textContent = `${label} in ${elapsed}s  |  [${this.mode()}] ${parseKeywords(this.val('keywords')).join(', ')}${stoppedTxt}`;
    if (payload.filesSearched != null) this.debug(`SEARCH STATS: elapsed=${elapsed}s | files_searched=${payload.filesSearched}`);
    this.liveMap = new Map();
  }

  // ---------- files list ----------
  _renderRows(items) {
    this.files = items.map(([p]) => p);
    this.counts = {};
    for (const [p, c] of items) this.counts[p] = c;

    const fl = this.els.fileslist;
    fl.innerHTML = '';
    const frag = document.createDocumentFragment();
    items.forEach(([p, c], idx) => {
      const rel = S.path.relForDisplay(this.baseFolder, p);
      const row = document.createElement('div');
      row.className = 'file-row';
      row.dataset.idx = String(idx);
      row.textContent = this.displayMode === 'filename' ? `${rel} [${c}]` : `[${c}] ${rel}`;
      row.addEventListener('click', () => this.selectFile(idx));
      frag.appendChild(row);
    });
    fl.appendChild(frag);

    this.els.filesCount.textContent = `${T('files.label')}: ${this.files.length}`;
    // restore selection by path
    if (this.selPath) {
      const i = this.files.indexOf(this.selPath);
      if (i >= 0) this._markSelected(i);
      else { this.selIdx = -1; this.selPath = null; }
    }
    this.applyRecolor();
  }

  _markSelected(idx) {
    const fl = this.els.fileslist;
    fl.querySelectorAll('.file-row.selected').forEach((r) => r.classList.remove('selected'));
    const row = fl.querySelector(`.file-row[data-idx="${idx}"]`);
    if (row) { row.classList.add('selected'); row.scrollIntoView({ block: 'nearest' }); }
    this.selIdx = idx;
    this.selPath = this.files[idx] || null;
  }

  selectFile(idx) {
    if (idx < 0 || idx >= this.files.length) return;
    this._markSelected(idx);
    this.currentFile = this.files[idx];
    this.pauseLiveUntil = Date.now() + 800;
    this.els.previewFile.textContent = `${S.path.basename(this.currentFile)}  —  ${this.currentFile}`;
    this._buildPreview();
  }

  _onFilesKey(e) {
    if (e.key === 'F1') { e.preventDefault(); this.copyAllFiles(); }
    else if (e.key === 'F2') { e.preventDefault(); this.promptFilesHl(); }
    else if (e.key === 'F3') { e.preventDefault(); this.promptFilesFilter(); }
    else if (e.key === 'F4') { e.preventDefault(); this.clearFilesHlFilter(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this.selectFile(Math.min(this.files.length - 1, (this.selIdx < 0 ? 0 : this.selIdx + 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.selectFile(Math.max(0, (this.selIdx < 0 ? 0 : this.selIdx - 1))); }
  }

  async copyAllFiles() {
    if (this.running) return;
    const rows = [...this.els.fileslist.querySelectorAll('.file-row')].map((r) => r.textContent);
    if (!rows.length) return;
    await navigator.clipboard.writeText(rows.join('\n') + '\n');
    this.debug(`[F1] Copied ${rows.length} file rows to clipboard`);
  }

  promptFilesHl() {
    const v = window.prompt('Highlight FILES containing:', this.els.filesHl.value);
    if (v === null) return;
    this.els.filesHl.value = v;
    this.applyRecolor();
  }
  promptFilesFilter() {
    const v = window.prompt('Dim FILES containing:', this.els.filesFilter.value);
    if (v === null) return;
    this.els.filesFilter.value = v;
    this.applyRecolor();
  }
  clearFilesHlFilter() {
    this.els.filesHl.value = '';
    this.els.filesFilter.value = '';
    this.applyRecolor();
  }
  scheduleRecolor() {
    if (this.recolorTimer) clearTimeout(this.recolorTimer);
    this.recolorTimer = setTimeout(() => this.applyRecolor(), CONFIG.UIConfig.FILES_COLOR_DEBOUNCE_MS);
  }
  applyRecolor() {
    const hl = this.els.filesHl.value;
    const flt = this.els.filesFilter.value;
    const rows = this.els.fileslist.querySelectorAll('.file-row');
    rows.forEach((row) => {
      const idx = parseInt(row.dataset.idx, 10);
      const fp = this.files[idx] || '';
      row.classList.remove('row-hl', 'row-dim');
      if (matchTokens(fp, flt)) row.classList.add('row-dim');
      else if (matchTokens(fp, hl)) row.classList.add('row-hl');
    });
  }

  // ---------- files context menu ----------
  _onFilesContext(e) {
    e.preventDefault();
    const row = e.target.closest('.file-row');
    if (!row) return;
    const idx = parseInt(row.dataset.idx, 10);
    this._markSelected(idx);
    this.currentFile = this.files[idx];
    showFilesCtxMenu(e.clientX, e.clientY, this);
  }

  // ---------- preview ----------
  _buildPreview() {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewToken += 1;
    const token = this.previewToken;
    const filePath = this.currentFile;
    const keywords = parseKeywords(this.val('keywords'));
    const caseSensitive = this.checked('caseSensitive');
    this.els.preview.textContent = `(Loading preview...)\n${filePath}\n`;

    const cacheKey = `${filePath}|${keywords.join('\u0001')}|${caseSensitive}`;
    if (this.previewCache.has(cacheKey)) {
      this.previewText = this.previewCache.get(cacheKey);
      this.els.preview.textContent = this.previewText;
      this.scheduleHighlight();
      return;
    }

    this.previewTimer = setTimeout(async () => {
      if (token !== this.previewToken) return;
      const r = await S.buildPreview({ filePath, keywords, caseSensitive });
      if (token !== this.previewToken || this.currentFile !== filePath) return;
      this.previewText = r.text || '';
      this.previewCache.set(cacheKey, this.previewText);
      if (this.previewCache.size > CONFIG.PreviewConfig.CACHE_MAX) {
        this.previewCache.delete(this.previewCache.keys().next().value);
      }
      this.els.preview.textContent = this.previewText;
      this.scheduleHighlight();
    }, CONFIG.PreviewConfig.DEBOUNCE_MS);
  }

  scheduleHighlight() {
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => this._highlight(), CONFIG.PreviewConfig.DEFER_HIGHLIGHT_MS);
  }

  _highlight() {
    const text = this.previewText;
    if (!text) return;
    const sections = HLR.pickSections(HL_RULES, extOf(this.currentFile));
    const keywords = parseKeywords(this.val('keywords'));
    const { html } = HLR.buildHighlightedHtml(text, sections, keywords, this.checked('caseSensitive'));
    this.els.preview.innerHTML = html;
    // collect F3 runs
    this.f3RunsMap = new Map();
    this.els.preview.querySelectorAll('[data-hl]').forEach((sp) => {
      const rid = sp.dataset.hl;
      if (!this.f3RunsMap.has(rid)) this.f3RunsMap.set(rid, []);
      this.f3RunsMap.get(rid).push(sp);
    });
    this.f3Ids = [...this.f3RunsMap.keys()].sort((a, b) => Number(a) - Number(b));
    this.f3Index = -1;
  }

  f3Next() {
    if (!this.f3Ids.length) return;
    this.f3Index = (this.f3Index + 1) % this.f3Ids.length;
    this.els.preview.querySelectorAll('.f3hit').forEach((sp) => sp.classList.remove('f3hit'));
    const spans = this.f3RunsMap.get(this.f3Ids[this.f3Index]) || [];
    spans.forEach((sp) => sp.classList.add('f3hit'));
    if (spans[0]) spans[0].scrollIntoView({ block: 'center' });
  }

  _onPreviewKey(e) {
    if (e.key === 'F3') { e.preventDefault(); this.f3Next(); }
    else if (e.ctrlKey && (e.key === '+' || e.key === '=')) { e.preventDefault(); this.zoom(1); }
    else if (e.ctrlKey && e.key === '-') { e.preventDefault(); this.zoom(-1); }
  }
  zoom(delta) {
    this.previewFontSize = Math.max(8, Math.min(40, this.previewFontSize + delta));
    this.els.preview.style.fontSize = `${this.previewFontSize}px`;
  }

  _onPreviewContext(e) {
    e.preventDefault();
    if (!this.currentFile) return;
    const line = this._clickedLineNumber(e.clientX, e.clientY);
    if (line == null && CONFIG.EditorConfig.REQUIRE_LINENO_PREFIX) return;
    const ln = line == null ? 1 : line;
    S.openEditor({
      editorCmd: this.val('editorCmd').trim(),
      editorArgs: this.val('editorArgs').trim(),
      filePath: this.currentFile,
      line: ln,
    }).then((res) => {
      (res.debug || []).forEach((m) => this.debug(m));
      if (!res.ok && res.error) S.showError('Editor launch failed', res.error);
    });
  }

  _clickedLineNumber(x, y) {
    try {
      const cr = document.caretRangeFromPoint(x, y);
      if (!cr) return null;
      const r = document.createRange();
      r.setStart(this.els.preview, 0);
      r.setEnd(cr.startContainer, cr.startOffset);
      const offset = r.toString().length;
      const text = this.previewText;
      const start = text.lastIndexOf('\n', offset - 1) + 1;
      let end = text.indexOf('\n', offset);
      if (end < 0) end = text.length;
      const lineStr = text.slice(start, end);
      const m = /^\s*(\d+)[:\-]/.exec(lineStr);
      return m ? parseInt(m[1], 10) : null;
    } catch (_e) {
      return null;
    }
  }

  // ---------- cscope ----------
  async _genCscope() {
    const folder = this.val('folder').trim();
    const r = await S.cscope.genFiles(folder, this.files);
    if (!r.ok) { S.showError('GEN_cscope.files', r.error); return; }
    this.debug(`[CSCOPE] Generated cscope.files: ${r.outPath} (files=${r.count})`);
    S.showInfo('GEN_cscope.files', `Generated:\n${r.outPath}\n\nFiles: ${r.count}`);
  }
  async _openCscope() {
    const folder = this.val('folder').trim();
    const r = await S.openCscopeWindow({
      folder,
      editorCmd: this.val('editorCmd').trim(),
      editorArgs: this.val('editorArgs').trim(),
      cscopeExe: 'cscope',
    });
    if (!r.ok) S.showError('CSCOPE', r.error);
  }

  // ---------- debug ----------
  debug(msg) {
    if (!CONFIG.DEBUG) return;
    const ts = new Date().toTimeString().slice(0, 8);
    this.els.debug.textContent += `[${ts}] ${msg}\n`;
    this.els.debug.scrollTop = this.els.debug.scrollHeight;
  }
  _toggleDebug() {
    const collapsed = this.els.debug.classList.toggle('collapsed');
    this.els.debugToggle.textContent = T(collapsed ? 'debug.toggleHidden' : 'debug.toggleShown');
  }

  refreshI18n() {
    if (window.M2I18n) window.M2I18n.apply(this.contentEl);
    const collapsed = this.els.debug.classList.contains('collapsed');
    this.els.debugToggle.textContent = T(collapsed ? 'debug.toggleHidden' : 'debug.toggleShown');
    this.els.filesCount.textContent = `${T('files.label')}: ${this.files.length || 0}`;
  }

  // ---------- focus ----------
  focusKeywords() { const el = this.fields.keywords; el.focus(); el.select(); }
  focusFilter() { const el = this.fields.filter; el.focus(); el.select(); }
  focusFiles() {
    const fl = this.els.fileslist;
    fl.focus();
    if (!this.files.length) return;
    if (this.selIdx < 0) this.selectFile(0);
  }

  destroy() { this.contentEl.remove(); }
}

// ============================================================
// Files context menu
// ============================================================
let ctxTab = null;
function showFilesCtxMenu(x, y, tab) {
  ctxTab = tab;
  const menu = document.getElementById('filesCtxMenu');
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.hidden = false;
}
function hideFilesCtxMenu() {
  document.getElementById('filesCtxMenu').hidden = true;
}
document.getElementById('filesCtxMenu').addEventListener('click', async (e) => {
  const cmd = e.target.dataset.cmd;
  if (!cmd || !ctxTab) return;
  const path = ctxTab.currentFile;
  if (cmd === 'openExplorer') await S.openExplorer(path);
  else if (cmd === 'copyPath') await navigator.clipboard.writeText(String(path).replace(/\//g, '\\'));
  else if (cmd === 'copyRelPath') await navigator.clipboard.writeText(String(S.path.relForDisplay(ctxTab.baseFolder, path)).replace(/\//g, '\\'));
  hideFilesCtxMenu();
});
window.addEventListener('click', hideFilesCtxMenu);
window.addEventListener('blur', hideFilesCtxMenu);

// ============================================================
// Global hotkeys
// ============================================================
window.addEventListener('keydown', (e) => {
  const tab = manager.currentTab();
  if (!tab) return;
  if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); tab.focusKeywords(); }
  else if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); tab.focusFilter(); }
  else if (e.key === 'Escape') { if (tab.running) { e.preventDefault(); tab.stop(); } }
  else if (e.ctrlKey && (e.key === 't' || e.key === 'T')) { e.preventDefault(); manager.add(false); }
  else if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); manager.closeCurrent(); }
  else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); tab.focusFiles(); }
});

// Persist the base tab's settings to INI right before the window closes. The
// main process intercepts the window close and asks us to flush here; we write
// synchronously (the write completes before we return), then close for real.
S.onFlushSettings(() => {
  const base = manager.tabs[0];
  if (base) base.flushSave();
  window.close();
});

// ============================================================
// Boot
// ============================================================
async function boot() {
  CONFIG = await S.getConfig();
  HL_RULES = await S.loadHl();
  baseIniRaw = await S.loadIni();

  document.getElementById('tabAdd').addEventListener('click', () => manager.add(false));

  const base = manager.add(true);
  base.loadFromIni(baseIniRaw);

  // Localise static + dynamic chrome, and re-localise when the language changes.
  if (window.M2I18n) window.M2I18n.apply(document);
  manager.tabs.forEach((t) => t.refreshI18n());
  window.addEventListener('m2-lang-changed', () => {
    if (window.M2I18n) window.M2I18n.apply(document);
    manager.tabs.forEach((t) => t.refreshI18n());
    manager.renderTabBar();
  });

  // CLI folder
  S.onCliFolder(({ folder }) => { base.setVal('folder', folder); });

  // route search events
  S.onSearchEvent(({ sessionId, type, payload }) => {
    const tab = manager.sessionMap.get(sessionId);
    if (tab) tab.handleEvent(type, payload);
  });

  // CPU pulse (best-effort indicator: running vs idle)
  let pulse = 0;
  setInterval(() => {
    pulse = (pulse + 1) % 4;
    for (const t of manager.tabs) {
      if (t.els && t.els.cpu) t.els.cpu.textContent = t.running ? `CPU: ${'●'.repeat(pulse + 1)}` : 'CPU: --%';
    }
  }, 350);

  base.debug('M2_SCOUT (M2 SEEK Node.js port) - Initialized');
}

boot();
