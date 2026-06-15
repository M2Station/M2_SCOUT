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
    // Files list view: 'list' (flat) or 'tree' (collapsible folders, VS Code
    // style). Persisted globally so new tabs inherit the last choice.
    this.viewMode = 'list';
    try {
      const v = localStorage.getItem('filesViewMode');
      if (v === 'tree' || v === 'list') this.viewMode = v;
    } catch (_e) { /* localStorage unavailable */ }
    this.treeCollapsed = new Set(); // collapsed folder keys (relative)
    // Files list sort: 'path' (stable, no jumping during a live search) or
    // 'count' (most matches first). Persisted globally like the view mode.
    this.sortMode = 'path';
    try {
      const s = localStorage.getItem('filesSortMode');
      if (s === 'count' || s === 'path') this.sortMode = s;
    } catch (_e) { /* localStorage unavailable */ }
    this.baseFolder = '';
    this.currentFile = null;
    this.running = false;
    this.selIdx = -1;
    this.selPath = null;
    // Multi-selection (U3): a Set of selected file PATHS (survives re-sort /
    // rebuild, unlike indices). selAnchorPath is the shift-range anchor. The
    // primary single selection (selIdx/selPath) drives the preview.
    this.selPaths = new Set();
    this.selAnchorPath = null;

    this.liveMap = new Map();
    this.liveTimer = null;
    this.pauseLiveUntil = 0;
    // Virtual list (P1): only the rows in view are mounted in the DOM. Tree view
    // is not virtualized. State is reset on new search / view switch.
    this._vItems = null;   // [[path,count],...] currently virtualized (list mode)
    this._vSizer = null;   // the .vlist full-height spacer element
    this._rowH = 0;        // measured row height in px
    this._vFirst = -1;     // first row index currently in the DOM window
    this._vLast = -1;      // end (exclusive) of the DOM window
    this._vRaf = 0;        // rAF handle to coalesce scroll repaints
    this._ro = null;       // ResizeObserver on the list (viewport/splitter/tab)
    // Per-search progress + timing counters. CPU% is now machine-wide and lives
    // on the manager (pushed from main via the always-on 'sys:cpu' event).
    this.searchStartMs = 0;
    this.progMatches = 0;
    this.progMatchedFiles = 0;

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
    this.contentEl.classList.toggle('view-tree', this.viewMode === 'tree');
    this._updateViewToggle();
    this._updateSortToggle();
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
    act('checkRgUpdate', () => this._checkToolUpdate('rg'));
    act('checkFdUpdate', () => this._checkToolUpdate('fd'));
    act('selectFolder', () => this._selectFolder());
    act('pickExcludeFolders', () => this._openExcludePicker());
    act('pickEditor', () => this._openEditorPicker());
    act('searchInFiles', () => this.search());
    act('searchFilename', () => this.searchFilename());
    act('keywordHistory', () => this._openKeywordHistory());
    act('stop', () => this.stop());
    act('genCscope', () => this._genCscope());
    act('cscope', () => this._openCscope());
    act('clearFilesHl', () => this.clearFilesHlFilter());
    act('toggleFilesView', () => this.toggleFilesView());
    act('toggleSort', () => this.toggleSort());
    act('treeCollapseAll', () => this.treeSetAllCollapsed(true));
    act('treeExpandAll', () => this.treeSetAllCollapsed(false));
    act('toggleDebug', () => this._toggleDebug());
    act('copyDebug', () => this._copyDebug());
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
    fl.addEventListener('click', (e) => this._onFilesClick(e));
    fl.addEventListener('scroll', () => this._onFilesScroll());
    fl.addEventListener('contextmenu', (e) => this._onFilesContext(e));
    // Repaint the virtual window when the list box itself changes size — covers
    // window resize, splitter drag, and a tab becoming visible (0 -> real size).
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => {
        if (this.viewMode === 'tree') return;
        this._vFirst = -1; this._vLast = -1;
        this._vRenderWindow();
      });
      this._ro.observe(fl);
    }

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
    // Prefer the in-app keyboard-driven picker (fast, no OS dialog); fall back
    // to the native directory dialog if it is unavailable.
    if (window.M2FolderPicker) {
      const start = (this.val('folder') || '').trim();
      window.M2FolderPicker.open({
        start: start || undefined,
        onPick: (p) => { if (p) { this.setVal('folder', p); this.scheduleSave(); } },
      });
      return;
    }
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

  // Popup of recent keyword searches; picking one fills the keyword field.
  _openKeywordHistory() {
    if (!window.M2KeywordHistory) return;
    window.M2KeywordHistory.open({
      onPick: (kw) => {
        this.setVal('keywords', kw);
        const el = this.fields.keywords;
        if (el) { el.focus(); el.select(); }
      },
    });
  }

  // Compare the configured rg/fd against the latest GitHub release and, when
  // out of date, download+install the matching Windows build into TOOLS/.
  // The target CPU platform (x86_64 / aarch64) comes from Settings.
  async _checkToolUpdate(tool) {
    const platform = (window.M2Platform && window.M2Platform.get()) || 'x86_64';
    const field = tool === 'fd' ? 'fdExe' : 'rgExe';
    const exePath = this.val(field);
    this.debug(`[Update] ${T('update.checking')} ${tool} (${platform})...`);
    let res;
    try {
      res = await S.tool.checkUpdate({ tool, platform, exePath });
    } catch (e) {
      S.showError(T('update.title'), String(e));
      return;
    }
    if (!res || !res.ok) { S.showError(T('update.title'), (res && res.error) || 'Check failed'); return; }
    const cur = res.currentVersion || '?';
    const latest = res.latestVersion || '?';
    this.debug(`[Update] ${tool}: current=${cur} latest=${latest}`);
    if (res.upToDate) {
      await S.showInfo(T('update.title'), `${tool}: ${T('update.upToDate')} (v${latest})`);
      return;
    }
    if (!res.asset) { S.showError(T('update.title'), T('update.noAsset')); return; }
    this.debug(`[Update] ${T('update.downloading')} ${tool} v${latest} (${res.asset.name})...`);
    let dl;
    try {
      dl = await S.tool.downloadUpdate({
        tool, platform, asset: res.asset, version: latest,
      });
    } catch (e) {
      S.showError(T('update.title'), String(e));
      return;
    }
    if (!dl || !dl.ok) { S.showError(T('update.title'), (dl && dl.error) || 'Download failed'); return; }
    this.debug(`[Update] ${tool} -> v${dl.version}: ${dl.path}`);
    await S.showInfo(T('update.title'), `${tool}: ${T('update.done')} v${dl.version}`);
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
    // Record the keyword(s) into search history (deduped, newest first, max 10).
    const kw = this.val('keywords').trim();
    if (kw && window.M2KeywordHistory) window.M2KeywordHistory.add(kw);
    this.updateButtons(true);
    this.baseFolder = this.val('folder').trim();
    this.liveMap = new Map();
    this._vItems = null; this._vSizer = null; this._vFirst = -1; this._vLast = -1;
    this.searchStartMs = Date.now();
    this.progMatches = 0;
    this.progMatchedFiles = 0;
    this.files = [];
    this.counts = {};
    this.currentFile = null;
    this.selIdx = -1;
    this.selPath = null;
    this.selPaths = new Set();
    this.selAnchorPath = null;
    this.els.fileslist.innerHTML = '';
    this.els.fileslist.scrollTop = 0;
    this.els.preview.textContent = '';
    this.previewText = '';
    this.els.status.textContent = `${label}  [${this.mode()}] ${parseKeywords(this.val('keywords')).join(', ')}`;
    this.els.statusMatch.textContent = '';
    if (this.els.statusRate) this.els.statusRate.textContent = '';
    if (this.els.progress) this.els.progress.hidden = false;
    this.els.filesCount.textContent = `${T('files.label')}: \u2014`;
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
    this._endSearchUI();
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
    else if (type === 'progress') {
      this.progMatches = payload.matches;
      this.progMatchedFiles = payload.matchedFiles;
      this.els.statusMatch.textContent = `Matched Files: ${payload.matchedFiles}  Matches: ${payload.matches}`;
    } else if (type === 'done') this._onDone(payload);
    else if (type === 'error') { S.showError('Error', payload.msg); this.running = false; this.updateButtons(false); this._endSearchUI(); this.els.status.textContent = T('status.ready'); }
  }

  // Tear down the running-search UI bits (P6 throughput + U1 progress bar).
  _endSearchUI() {
    if (this.els.progress) this.els.progress.hidden = true;
    if (this.els.statusRate) this.els.statusRate.textContent = '';
    // The CPU slot keeps showing live CPU% - the 200ms painter repaints it.
  }

  _onLive(delta) {
    for (const [p, c] of delta) this.liveMap.set(p, (this.liveMap.get(p) || 0) + c);
    this._scheduleLiveRender();
  }

  _scheduleLiveRender() {
    if (this.liveTimer) return;
    this.liveTimer = setTimeout(() => { this.liveTimer = null; this._renderLive(); }, this._liveFlushDelay());
  }

  // Adaptive flush interval (P5): small result sets flush at FLUSH_MS (snappy);
  // as the live count grows toward ADAPT_TO the interval ramps up to
  // FLUSH_MS_MAX so we repaint less often and spend less CPU. Tree view rebuilds
  // are heavier than the virtualized list, so it gets a slightly higher floor.
  _liveFlushDelay() {
    const c = CONFIG.LiveUpdateConfig;
    const n = this.liveMap.size;
    const min = c.FLUSH_MS;
    const max = c.FLUSH_MS_MAX || min;
    const lo = c.ADAPT_FROM || 0;
    const hi = c.ADAPT_TO || (lo + 1);
    let delay = min;
    if (n > lo) delay = min + (max - min) * Math.min(1, (n - lo) / Math.max(1, hi - lo));
    if (this.viewMode === 'tree') delay = Math.min(max, delay * 1.5);
    return Math.round(delay);
  }

  _renderLive() {
    // A live flush may have been queued just before the search finished. Once
    // 'done' has rendered the authoritative list we must not paint again from
    // the (now-cleared) liveMap, or it would wipe the results.
    if (!this.running) return;
    if (Date.now() < this.pauseLiveUntil) { this._scheduleLiveRender(); return; }
    let items = this._sortItems([...this.liveMap.entries()]);
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
    const items = this._sortItems(payload.files.map((f) => [f.path, f.count]));
    // Safety net: if the search was stopped and produced no final list but we
    // already have rows on screen, keep them instead of clearing the results.
    if (payload.stopped && items.length === 0 && this.files.length > 0) {
      const n = this.files.length;
      const elapsed = (payload.elapsedMs / 1000).toFixed(2);
      const label = payload.filenameMode ? T('status.filenameDone') : T('status.done');
      this.els.status.textContent = `${label} in ${elapsed}s  |  [${this.mode()}] ${parseKeywords(this.val('keywords')).join(', ')} [STOPPED]`;
      this.liveMap = new Map();
      this._endSearchUI();
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
    this._endSearchUI();
  }

  // ---------- files list ----------
  _renderRows(items) {
    this.files = items.map(([p]) => p);
    this.counts = {};
    for (const [p, c] of items) this.counts[p] = c;

    const fl = this.els.fileslist;
    if (this.viewMode === 'tree') {
      this._vItems = null;
      this._vSizer = null;
      fl.innerHTML = '';
      this._renderTree(items, fl);
    } else {
      this._renderListVirtual(items, fl);
    }

    this.els.filesCount.textContent = `${T('files.label')}: ${this.files.length}`;
    // restore selection by path
    if (this.selPath) {
      const i = this.files.indexOf(this.selPath);
      if (i >= 0) this._markSelected(i);
      else { this.selIdx = -1; this.selPath = null; }
    }
    // Tree leaves are coloured inline while rendering (P3); the virtual list
    // applies hl/filter while painting its window. So neither needs a separate
    // recolor pass here.
  }

  // Virtualized flat list (P1). Only the rows visible in the viewport (plus a
  // small overscan) are mounted. A full-height ".vlist" spacer gives the
  // scrollbar the correct range; each row is absolutely positioned at
  // index * rowHeight. The DOM stays at a few dozen nodes regardless of result
  // count, so scrolling stays smooth and memory stays flat for huge result sets.
  _renderListVirtual(items, fl) {
    this._vItems = items;
    // Reuse the spacer across live-search flushes; only build it when missing
    // (first paint, or after a tree render cleared the list).
    let sizer = this._vSizer;
    if (!sizer || sizer.parentNode !== fl) {
      sizer = document.createElement('div');
      sizer.className = 'vlist';
      fl.replaceChildren(sizer);
      this._vSizer = sizer;
    }
    if (!this._rowH) this._rowH = this._measureRowH(sizer) || 18;
    sizer.style.height = `${items.length * this._rowH}px`;
    this._vFirst = -1; this._vLast = -1; // force a fresh window paint
    this._vRenderWindow();
  }

  // Measure the real row height once per (re)build so the math tracks the active
  // theme / font without hardcoding pixels.
  _measureRowH(host) {
    const probe = document.createElement('div');
    probe.className = 'file-row';
    probe.style.visibility = 'hidden';
    probe.textContent = 'Mg';
    host.appendChild(probe);
    const h = probe.offsetHeight;
    probe.remove();
    return h;
  }

  // Paint exactly the rows the viewport needs right now. Cheap enough to run on
  // every scroll frame because the window is only ~(viewportHeight / rowHeight)
  // rows. Highlight / filter colours are applied here too.
  _vRenderWindow() {
    const fl = this.els.fileslist;
    const sizer = this._vSizer;
    const items = this._vItems;
    if (!sizer || !items) return;
    const rowH = this._rowH || 18;
    const total = items.length;
    const viewH = fl.clientHeight || 0;
    const OVER = 8; // overscan rows above & below for smooth wheel / keyboard
    let first = Math.floor(fl.scrollTop / rowH) - OVER;
    let last = Math.ceil((fl.scrollTop + viewH) / rowH) + OVER;
    first = Math.max(0, first);
    last = Math.min(total, Math.max(first, last));
    if (first === this._vFirst && last === this._vLast) return;
    this._vFirst = first; this._vLast = last;
    const hl = this.els.filesHl.value;
    const flt = this.els.filesFilter.value;
    const frag = document.createDocumentFragment();
    for (let i = first; i < last; i += 1) {
      const [p, c] = items[i];
      const row = document.createElement('div');
      row.className = 'file-row';
      row.dataset.idx = String(i);
      row.dataset.path = p;
      row.style.top = `${i * rowH}px`;
      const rel = S.path.relForDisplay(this.baseFolder, p);
      row.textContent = this.displayMode === 'filename' ? `${rel} [${c}]` : `[${c}] ${rel}`;
      if (this._isRowSelected(p, i)) row.classList.add('selected');
      if (matchTokens(p, flt)) row.classList.add('row-dim');
      else if (matchTokens(p, hl)) row.classList.add('row-hl');
      frag.appendChild(row);
    }
    sizer.replaceChildren(frag);
  }

  // Bring the row at idx into view (list mode), adjusting scrollTop minimally
  // like scrollIntoView({ block: 'nearest' }) would for a real element.
  _scrollToIdx(idx) {
    const fl = this.els.fileslist;
    const rowH = this._rowH || 18;
    const top = idx * rowH;
    const bottom = top + rowH;
    if (top < fl.scrollTop) fl.scrollTop = top;
    else if (bottom > fl.scrollTop + fl.clientHeight) fl.scrollTop = bottom - fl.clientHeight;
  }

  // Coalesce scroll events into one repaint per animation frame.
  _onFilesScroll() {
    if (this.viewMode === 'tree') return;
    if (this._vRaf) return;
    this._vRaf = requestAnimationFrame(() => { this._vRaf = 0; this._vRenderWindow(); });
  }

  // Tree view (VS Code style): group files by folder into collapsible nodes.
  // Each folder shows the aggregated match count on the right; file leaves keep
  // data-idx so selection / recolor / keyboard nav continue to work.
  _renderTree(items, fl) {
    // Highlight / dim tokens, read once and applied inline per leaf (P3) so we
    // skip a second full-tree recolor pass after every render.
    const hl = this.els.filesHl.value;
    const flt = this.els.filesFilter.value;
    const root = { folders: new Map(), files: [], count: 0, key: '' };
    items.forEach(([p, c], idx) => {
      const rel = S.path.relForDisplay(this.baseFolder, p);
      const segs = rel.split(/[\\/]+/).filter(Boolean);
      const fname = segs.length ? segs[segs.length - 1] : rel;
      let node = root;
      for (let i = 0; i < segs.length - 1; i += 1) {
        const name = segs[i];
        let child = node.folders.get(name);
        if (!child) {
          child = {
            folders: new Map(), files: [], count: 0, key: node.key ? `${node.key}/${name}` : name,
          };
          node.folders.set(name, child);
        }
        child.count += c;
        node = child;
      }
      node.files.push({ name: fname, idx, count: c });
    });

    const self = this;
    function renderChildren(node, depth) {
      const frag = document.createDocumentFragment();
      // Folder + leaf order follows the active sort toggle: by aggregated /
      // own match count (descending) when sortMode is 'count', else by name.
      const folderNames = [...node.folders.keys()].sort((a, b) => {
        if (self.sortMode === 'count') {
          const d = node.folders.get(b).count - node.folders.get(a).count;
          if (d) return d;
        }
        return a.toLowerCase().localeCompare(b.toLowerCase());
      });
      for (const name of folderNames) {
        const child = node.folders.get(name);
        const collapsed = self.treeCollapsed.has(child.key);
        const frow = document.createElement('div');
        frow.className = 'tree-row tree-folderrow';
        frow.style.paddingLeft = `${depth * 14 + 4}px`;
        frow.dataset.folderkey = child.key;
        const tw = document.createElement('span');
        tw.className = 'tw';
        tw.textContent = collapsed ? '\u25B8' : '\u25BE';
        const nm = document.createElement('span');
        nm.className = 'tree-name';
        nm.textContent = name;
        // Folder rows show no match-count badge — only file leaves report counts.
        frow.appendChild(tw);
        frow.appendChild(nm);
        frag.appendChild(frow);

        const kids = document.createElement('div');
        kids.className = `tree-children${collapsed ? ' collapsed' : ''}`;
        kids.appendChild(renderChildren(child, depth + 1));
        frag.appendChild(kids);
      }
      const files = node.files.slice().sort((a, b) => {
        if (self.sortMode === 'count') {
          const d = b.count - a.count;
          if (d) return d;
        }
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
      for (const f of files) {
        const row = document.createElement('div');
        row.className = 'file-row tree-file';
        row.dataset.idx = String(f.idx);
        row.style.paddingLeft = `${depth * 14 + 20}px`;
        const fp = (items[f.idx] && items[f.idx][0]) || '';
        if (matchTokens(fp, flt)) row.classList.add('row-dim');
        else if (matchTokens(fp, hl)) row.classList.add('row-hl');
        if (self._isRowSelected(fp, f.idx)) row.classList.add('selected');
        const nm = document.createElement('span');
        nm.className = 'tree-name';
        nm.textContent = f.name;
        const badge = document.createElement('span');
        badge.className = 'tree-badge';
        badge.textContent = String(f.count);
        row.appendChild(nm);
        row.appendChild(badge);
        frag.appendChild(row);
      }
      return frag;
    }
    fl.appendChild(renderChildren(root, 0));
  }

  // Re-render the files area from the current data (used by tree toggles).
  _rerenderFiles() {
    const items = this._sortItems(this.files.map((p) => [p, this.counts[p] || 0]));
    this._renderRows(items);
  }

  // Flip one folder open/closed in place (P4): toggle the `.collapsed` class on
  // the folder's children container (its next sibling) and swap the twisty
  // glyph. No tree rebuild, so toggling a giant tree is instant.
  _setFolderRowCollapsed(folderRow, collapsed) {
    const key = folderRow.dataset.folderkey;
    if (collapsed) this.treeCollapsed.add(key); else this.treeCollapsed.delete(key);
    const tw = folderRow.querySelector('.tw');
    if (tw) tw.textContent = collapsed ? '\u25B8' : '\u25BE';
    const kids = folderRow.nextElementSibling;
    if (kids && kids.classList.contains('tree-children')) kids.classList.toggle('collapsed', collapsed);
  }

  _toggleFolder(folderRow) {
    const collapsed = !this.treeCollapsed.has(folderRow.dataset.folderkey);
    this._setFolderRowCollapsed(folderRow, collapsed);
  }

  // Switch between flat list and folder tree, persisting the choice.
  toggleFilesView() {
    this.viewMode = this.viewMode === 'tree' ? 'list' : 'tree';
    try { localStorage.setItem('filesViewMode', this.viewMode); } catch (_e) { /* ignore */ }
    this.contentEl.classList.toggle('view-tree', this.viewMode === 'tree');
    this._updateViewToggle();
    this._rerenderFiles();
  }

  _updateViewToggle() {
    const el = this.els.viewToggle;
    if (!el) return;
    el.textContent = this.viewMode === 'tree' ? T('files.viewTree') : T('files.viewList');
  }

  // Switch the result sort between stable path order and match-count order.
  // Default 'path' keeps rows from jumping around as live counts arrive.
  toggleSort() {
    this.sortMode = this.sortMode === 'count' ? 'path' : 'count';
    try { localStorage.setItem('filesSortMode', this.sortMode); } catch (_e) { /* ignore */ }
    this._updateSortToggle();
    this._rerenderFiles();
  }

  _updateSortToggle() {
    const el = this.els.sortToggle;
    if (!el) return;
    el.textContent = this.sortMode === 'count' ? T('files.sortByCount') : T('files.sortByPath');
  }

  // Sort a [path, count][] list by the current sort mode. Path order is a
  // stable, case-insensitive compare; count order is descending with path as
  // the tie-breaker so equal-count rows still hold a stable position.
  _sortItems(items) {
    const byPath = (a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase());
    if (this.sortMode === 'count') return items.slice().sort((a, b) => (b[1] - a[1]) || byPath(a, b));
    return items.slice().sort(byPath);
  }

  // Every folder key in the current result set (for collapse-all).
  _allFolderKeys() {
    const keys = new Set();
    for (const p of this.files) {
      const rel = S.path.relForDisplay(this.baseFolder, p);
      const segs = rel.split(/[\\/]+/).filter(Boolean);
      let acc = '';
      for (let i = 0; i < segs.length - 1; i += 1) {
        acc = acc ? `${acc}/${segs[i]}` : segs[i];
        keys.add(acc);
      }
    }
    return keys;
  }

  treeSetAllCollapsed(collapsed) {
    if (this.viewMode !== 'tree') return;
    this.treeCollapsed = collapsed ? this._allFolderKeys() : new Set();
    // Toggle every rendered folder in place rather than rebuilding the tree.
    this.els.fileslist.querySelectorAll('.tree-folderrow').forEach((frow) => {
      const tw = frow.querySelector('.tw');
      if (tw) tw.textContent = collapsed ? '\u25B8' : '\u25BE';
      const kids = frow.nextElementSibling;
      if (kids && kids.classList.contains('tree-children')) kids.classList.toggle('collapsed', collapsed);
    });
  }

  // Expand any collapsed ancestor folders so the given file becomes visible.
  _expandAncestors(idx) {
    const p = this.files[idx];
    if (!p) return;
    const rel = S.path.relForDisplay(this.baseFolder, p);
    const segs = rel.split(/[\\/]+/).filter(Boolean);
    let acc = '';
    const fl = this.els.fileslist;
    for (let i = 0; i < segs.length - 1; i += 1) {
      acc = acc ? `${acc}/${segs[i]}` : segs[i];
      if (this.treeCollapsed.has(acc)) {
        // Expand in place (P4): find the folder row and open it; no rebuild.
        const frow = [...fl.querySelectorAll('.tree-folderrow')]
          .find((r) => r.dataset.folderkey === acc);
        if (frow) this._setFolderRowCollapsed(frow, false);
        else this.treeCollapsed.delete(acc);
      }
    }
  }

  // ---------- selection (single + multi, U3) ----------
  // A row is selected when it's in the multi-selection set, or (when there is
  // no multi-selection) when it is the single primary row.
  _isRowSelected(p, i) {
    if (this.selPaths.size) return this.selPaths.has(p);
    return i === this.selIdx;
  }

  // The on-screen row order as paths: array order for the (sorted) list, DOM
  // order for the tree. Used to compute shift-range and a stable open order.
  _rowOrderPaths() {
    if (this.viewMode === 'tree') {
      return [...this.els.fileslist.querySelectorAll('.file-row')]
        .map((r) => this.files[Number(r.dataset.idx)]);
    }
    return this.files;
  }

  // Repaint just the `selected` class across the current view (no data rebuild).
  _repaintSelection() {
    if (this.viewMode === 'tree') {
      this.els.fileslist.querySelectorAll('.file-row').forEach((r) => {
        const i = Number(r.dataset.idx);
        r.classList.toggle('selected', this._isRowSelected(this.files[i], i));
      });
    } else {
      this._vFirst = -1; this._vLast = -1;
      this._vRenderWindow();
    }
  }

  _showPreviewFor(path) {
    this.currentFile = path;
    this.pauseLiveUntil = Date.now() + 800;
    this.els.previewFile.textContent = `${S.path.basename(path)}  —  ${path}`;
    this._buildPreview();
  }

  _markSelected(idx) {
    this.selIdx = idx;
    this.selPath = this.files[idx] || null;
    // Bring the row into view, then repaint the `selected` class.
    if (this.viewMode === 'tree') {
      const row = this.els.fileslist.querySelector(`.file-row[data-idx="${idx}"]`);
      if (row) row.scrollIntoView({ block: 'nearest' });
    } else {
      this._scrollToIdx(idx);
    }
    this._repaintSelection();
  }

  // Plain click / arrow: single selection (clears any multi-selection).
  selectFile(idx) {
    if (idx < 0 || idx >= this.files.length) return;
    this.selPaths = new Set();
    this.selAnchorPath = this.files[idx];
    if (this.viewMode === 'tree') {
      // Make sure the row is visible (expand collapsed parents) before marking.
      this.selPath = this.files[idx];
      this.selIdx = idx;
      this._expandAncestors(idx);
    }
    this._markSelected(idx);
    this._showPreviewFor(this.files[idx]);
  }

  // Ctrl/Cmd+click: toggle one row in/out of the multi-selection.
  _toggleSelect(idx) {
    const p = this.files[idx];
    if (!p) return;
    if (!this.selPaths.size && this.selPath) this.selPaths.add(this.selPath); // seed from single
    if (this.selPaths.has(p)) this.selPaths.delete(p); else this.selPaths.add(p);
    this.selAnchorPath = p;
    // If the user toggled everything off, drop the single-selection fallback so
    // no row stays highlighted.
    if (this.selPaths.size) { this.selIdx = idx; this.selPath = p; } else { this.selIdx = -1; this.selPath = null; }
    this._repaintSelection();
    this._showPreviewFor(p);
  }

  // Shift+click / Shift+arrow: select the contiguous range from the anchor to
  // idx in on-screen order. moveAnchor=false keeps the anchor fixed (keyboard
  // range extend); click sets a fresh anchor only when none exists.
  _selectRangeTo(idx) {
    const targetPath = this.files[idx];
    if (!targetPath) return;
    const order = this._rowOrderPaths();
    const anchorPath = this.selAnchorPath || this.selPath || targetPath;
    let ai = order.indexOf(anchorPath);
    const ti = order.indexOf(targetPath);
    if (ai < 0) ai = ti;
    const lo = Math.min(ai, ti); const hi = Math.max(ai, ti);
    this.selPaths = new Set();
    for (let k = lo; k <= hi; k += 1) if (order[k]) this.selPaths.add(order[k]);
    this.selAnchorPath = anchorPath;
    this.selIdx = idx; this.selPath = targetPath;
    if (this.viewMode === 'tree') this._expandAncestors(idx);
    this._markSelected(idx); // scrolls into view + repaints
    this._showPreviewFor(targetPath);
  }

  // Open every selected file in the editor (Enter / batch open). Falls back to
  // the single current file. Confirms before opening a large batch.
  async openSelected() {
    if (this.running) return;
    let paths = this.selPaths.size
      ? [...this.selPaths]
      : (this.currentFile ? [this.currentFile] : []);
    if (!paths.length) return;
    const order = this._rowOrderPaths();
    const pos = new Map(order.map((p, i) => [p, i]));
    paths = paths.slice().sort((a, b) => (pos.get(a) ?? 0) - (pos.get(b) ?? 0));
    const LIMIT = 10;
    if (paths.length > LIMIT) {
      const msg = T('files.openManyConfirm').replace('{n}', String(paths.length));
      if (!window.confirm(msg)) return;
    }
    const editorCmd = this.val('editorCmd').trim();
    const editorArgs = this.val('editorArgs').trim();
    let ok = 0;
    for (const filePath of paths) {
      // eslint-disable-next-line no-await-in-loop
      const res = await S.openEditor({ editorCmd, editorArgs, filePath, line: 1 });
      (res.debug || []).forEach((m) => this.debug(m));
      if (res.ok) ok += 1;
      else if (res.error) S.showError('Editor launch failed', res.error);
    }
    this.debug(`[Enter] Opened ${ok}/${paths.length} file(s) in the editor`);
  }


  _onFilesKey(e) {
    if (e.key === 'F1') { e.preventDefault(); this.copyAllFiles(); }
    else if (e.key === 'F2') { e.preventDefault(); this.promptFilesHl(); }
    else if (e.key === 'F3') { e.preventDefault(); this.promptFilesFilter(); }
    else if (e.key === 'F4') { e.preventDefault(); this.clearFilesHlFilter(); }
    else if (e.key === 'Enter') { e.preventDefault(); this.openSelected(); }
    else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.selectAllFiles(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this._navFiles(1, e.shiftKey); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this._navFiles(-1, e.shiftKey); }
  }

  // Select every file (Ctrl+A) into the multi-selection.
  selectAllFiles() {
    if (!this.files.length) return;
    this.selPaths = new Set(this.files);
    this._repaintSelection();
  }

  // Move the selection to the next/previous file row. Tree view walks the
  // rendered rows (grouped/sorted, some hidden in collapsed folders) so Up/Down
  // follow on-screen order. List view is virtualized — most rows aren't in the
  // DOM — so it steps by array index instead. With Shift held, extend the
  // multi-selection range from the anchor instead of single-selecting.
  _navFiles(dir, extend) {
    const fl = this.els.fileslist;
    if (!fl) return;
    let nextIdx = -1;
    if (this.viewMode === 'tree') {
      const rows = [...fl.querySelectorAll('.file-row')].filter((r) => r.offsetParent !== null);
      if (!rows.length) return;
      let pos = rows.findIndex((r) => Number(r.dataset.idx) === this.selIdx);
      if (pos < 0) pos = dir > 0 ? -1 : 0; // nothing selected yet -> first visible row
      const next = Math.max(0, Math.min(rows.length - 1, pos + dir));
      nextIdx = Number(rows[next].dataset.idx);
    } else {
      if (!this.files.length) return;
      let pos = this.selIdx;
      if (pos < 0) pos = dir > 0 ? -1 : 0;
      nextIdx = Math.max(0, Math.min(this.files.length - 1, pos + dir));
    }
    if (nextIdx < 0) return;
    if (extend) this._selectRangeTo(nextIdx);
    else this.selectFile(nextIdx);
  }

  async copyAllFiles() {
    if (this.running) return;
    if (!this.files.length) return;
    // Copy full relative paths regardless of list/tree view.
    const lines = this.files.map((p) => {
      const rel = S.path.relForDisplay(this.baseFolder, p);
      const c = this.counts[p] || 0;
      return this.displayMode === 'filename' ? `${rel} [${c}]` : `[${c}] ${rel}`;
    });
    await navigator.clipboard.writeText(`${lines.join('\n')}\n`);
    this.debug(`[F1] Copied ${lines.length} file rows to clipboard`);
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
    if (this.viewMode !== 'tree') {
      // Virtual list paints colours as it renders — just force a window repaint.
      this._vFirst = -1; this._vLast = -1;
      this._vRenderWindow();
      return;
    }
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
  // One delegated click handler for the whole list. Works for the virtual list
  // (rows mount/unmount constantly) and the tree (folder toggle + file select)
  // without per-row listeners.
  _onFilesClick(e) {
    const fl = this.els.fileslist;
    const folder = e.target.closest('.tree-folderrow');
    if (folder && fl.contains(folder)) { this._toggleFolder(folder); return; }
    const row = e.target.closest('.file-row');
    if (!row || !fl.contains(row)) return;
    const idx = Number(row.dataset.idx);
    if (e.shiftKey) this._selectRangeTo(idx);
    else if (e.ctrlKey || e.metaKey) this._toggleSelect(idx);
    else this.selectFile(idx);
  }
  _onFilesContext(e) {
    e.preventDefault();
    const row = e.target.closest('.file-row');
    if (!row) return;
    const idx = parseInt(row.dataset.idx, 10);
    const p = this.files[idx];
    // Keep an existing multi-selection if right-clicking inside it; otherwise
    // single-select the row under the cursor.
    if (!this.selPaths.has(p)) {
      this.selPaths = new Set();
      this._markSelected(idx);
    } else {
      this.selIdx = idx; this.selPath = p;
    }
    this.currentFile = p;
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

  async _copyDebug() {
    const text = this.els.debug.textContent || '';
    if (!text) return;
    await navigator.clipboard.writeText(text);
  }

  refreshI18n() {
    if (window.M2I18n) window.M2I18n.apply(this.contentEl);
    const collapsed = this.els.debug.classList.contains('collapsed');
    this.els.debugToggle.textContent = T(collapsed ? 'debug.toggleHidden' : 'debug.toggleShown');
    this.els.filesCount.textContent = `${T('files.label')}: ${this.files.length || 0}`;
    this._updateViewToggle();
    this._updateSortToggle();
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

  // CLI folder (pulled after boot to avoid a race with a main-process push:
  // the listeners here are only attached after several awaits above).
  try {
    const cliFolder = await S.getCliFolder();
    if (cliFolder) base.setVal('folder', cliFolder);
  } catch (_e) { /* ignore */ }

  // route search events
  S.onSearchEvent(({ sessionId, type, payload }) => {
    const tab = manager.sessionMap.get(sessionId);
    if (tab) tab.handleEvent(type, payload);
  });

  // System-wide CPU%, pushed continuously from main (even when idle).
  manager.sysCpu = 0;
  S.onSysCpu((payload) => {
    manager.sysCpu = (payload && typeof payload.percent === 'number') ? payload.percent : 0;
  });

  // CPU usage indicator. The CPU slot always shows the machine's overall CPU
  // utilization (Task-Manager style: 100% = every logical core fully busy),
  // sampled in the main process from os.cpus() and pushed continuously via the
  // 'sys:cpu' event. While a search runs we add a small spinner and show the
  // live elapsed time in the status bar; the number naturally rises as the
  // rg/fd workers do their job.
  const SPIN = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];
  let spin = 0;
  setInterval(() => {
    spin = (spin + 1) % SPIN.length;
    const g = SPIN[spin];
    const sys = typeof manager.sysCpu === 'number' ? manager.sysCpu : 0;
    for (const t of manager.tabs) {
      if (!t.els || !t.els.cpu) continue;
      if (t.running) {
        const secs = Math.max(0.001, (Date.now() - t.searchStartMs) / 1000);
        if (t.els.statusRate) t.els.statusRate.textContent = `${secs.toFixed(1)}s`;
        t.els.cpu.textContent = `${g} CPU: ${sys}%`;
      } else {
        const txt = `CPU: ${sys}%`;
        if (t.els.cpu.textContent !== txt) t.els.cpu.textContent = txt;
      }
    }
  }, 200);

  base.debug('M2_SCOUT (M2 SEEK Node.js port) - Initialized');
}

boot();
