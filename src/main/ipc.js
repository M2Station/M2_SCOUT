/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - IPC handlers (main process backend)
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const {
  ipcMain, dialog, shell, BrowserWindow, app,
} = require('electron');
const os = require('os');
const { spawn } = require('child_process');

const {
  DEBUG, UIConfig, EditorConfig, ToolConfig, PreviewConfig, HighlightConfig, LiveUpdateConfig, SearchConfig,
} = require('./config');
const {
  loadIniRaw, saveIniRaw, loadExcludeGroupIni, ensureExcludeGroupIniExists,
} = require('./ini');
const { getEffectiveExcludes } = require('./excludeGroups');
const { includeGlobs, excludeDirGlobs, excludeFileGlobs } = require('./globs');
const { parseKeywords, toBool, splitTokens } = require('./utils');
const { resolveExe } = require('./paths');
const { SearchSession } = require('./search');
const { FdSearchSession } = require('./fd');
const { buildPreviewText } = require('./preview');
const { launchEditor } = require('./editor');
const { loadCompiledHlRules } = require('./highlight');
const { listDir: fsListDir } = require('./fsdialog');
const toolUpdate = require('./toolUpdate');
const appUpdate = require('./appUpdate');
const cscope = require('./cscope');

const activeSessions = new Map(); // sessionId -> session (rg or fd)

// ---- system CPU sampler ----
// We surface the machine's overall CPU utilization (Task-Manager style:
// 100% = every logical core fully busy) and push it to every window on a fixed
// cadence, even when no search is running. This reads Node's native `os.cpus()`
// accumulated tick counters (user/nice/sys/idle/irq) and derives a percent from
// the busy-vs-idle delta between two samples - no child process, no PowerShell,
// no spawning, and it works on every platform. During a search the rg/fd
// workers naturally push this number up, so it doubles as an activity meter.
const SYS_CPU_INTERVAL_MS = 1000;
let cpuTimer = null;
let sysCpuPrev = null; // { idle, total } from the previous sample

function cpuTimesSnapshot() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

function sampleSystemCpu() {
  const cur = cpuTimesSnapshot();
  let percent = 0;
  if (sysCpuPrev) {
    const idleDelta = cur.idle - sysCpuPrev.idle;
    const totalDelta = cur.total - sysCpuPrev.total;
    if (totalDelta > 0) {
      percent = Math.round((1 - idleDelta / totalDelta) * 100);
      if (percent < 0) percent = 0;
      if (percent > 100) percent = 100;
    }
  }
  sysCpuPrev = cur;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send('sys:cpu', { percent });
    }
  }
}

function startCpuSampler() {
  if (cpuTimer) return;
  // Prime the baseline so the first broadcast one interval later is a real
  // delta rather than a meaningless 0.
  sysCpuPrev = cpuTimesSnapshot();
  cpuTimer = setInterval(sampleSystemCpu, SYS_CPU_INTERVAL_MS);
}

// ---- Beyond Compare discovery ----
// Locate BCompare.exe (the launcher) under the usual Windows install roots.
// Checks explicit known version folders first, then scans for any
// "Beyond Compare*" folder so future major versions are picked up too.
// Result is cached after the first lookup (undefined=unchecked, null=absent).
let bcPathCache; // undefined | null | string
function findBeyondCompare() {
  if (process.platform !== 'win32') return null;
  const roots = [
    process.env.ProgramW6432,
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
  ].filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    for (const v of ['Beyond Compare 5', 'Beyond Compare 4', 'Beyond Compare 3', 'Beyond Compare']) {
      candidates.push(path.join(root, v, 'BCompare.exe'));
    }
    try {
      for (const name of fs.readdirSync(root)) {
        if (/^beyond compare/i.test(name)) candidates.push(path.join(root, name, 'BCompare.exe'));
      }
    } catch (_e) { /* root unreadable - ignore */ }
  }
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (_e) { /* ignore */ }
  }
  return null;
}

function validateExe(exe, name) {
  const raw = (exe || '').trim();
  if (!raw) return `${name} is empty`;
  const lower = raw.toLowerCase();
  if (lower === name || lower === `${name}.exe`) return null; // bare name: rely on PATH/resolver
  const resolved = resolveExe(raw);
  if (!fs.existsSync(resolved)) return `${name} not found: ${raw}`;
  return null;
}

function normalizeMode(m) {
  const mode = (m || 'OR').trim().toUpperCase();
  return mode === 'AND' ? 'AND' : 'OR';
}

// Build resolved search context + debug lines from raw renderer params.
function buildContext(raw) {
  ensureExcludeGroupIniExists();
  const groupRaw = loadExcludeGroupIni();
  const iniRaw = loadIniRaw();

  const {
    effDirs, effFiles, resolved,
  } = getEffectiveExcludes({
    excludeDirs: raw.excludeDirs,
    excludeFiles: raw.excludeFiles,
    excludeGroupKeys: raw.excludeGroupKeys,
    groupRaw,
    iniRaw,
  });

  const inc = includeGlobs(raw.filter);
  const exd = excludeDirGlobs(effDirs);
  const exf = excludeFileGlobs(effFiles);

  return {
    effDirs, effFiles, resolved, inc, exd, exf,
  };
}

function registerIpc({ openCscopeWindow, getInitialFolder, getStartupLogs }) {
  startCpuSampler();

  // ---- config & ini ----
  ipcMain.handle('config:get', () => ({
    DEBUG,
    UIConfig,
    EditorConfig,
    ToolConfig,
    PreviewConfig,
    HighlightConfig,
    LiveUpdateConfig,
    SearchConfig,
    defaults: {
      rgExe: ToolConfig.DEFAULT_RG_EXE,
      fdExe: ToolConfig.DEFAULT_FD_EXE,
      editorCmd: EditorConfig.DEFAULT_CMD,
      editorArgs: EditorConfig.DEFAULT_ARGS_TEMPLATE,
    },
  }));

  ipcMain.handle('ini:load', () => loadIniRaw());
  ipcMain.handle('ini:save', (_e, data) => {
    saveIniRaw(data || {});
    return { ok: true };
  });
  // Synchronous variant for save-on-close: the renderer blocks until the file
  // is written, guaranteeing the settings are persisted before the window dies.
  ipcMain.on('ini:saveSync', (e, data) => {
    try {
      saveIniRaw(data || {});
      e.returnValue = true;
    } catch (_err) {
      e.returnValue = false;
    }
  });
  ipcMain.handle('excludeGroups:load', () => {
    ensureExcludeGroupIniExists();
    return loadExcludeGroupIni();
  });
  ipcMain.handle('hl:load', () => loadCompiledHlRules());
  ipcMain.handle('hl:reload', () => loadCompiledHlRules());

  // ---- dialogs ----
  ipcMain.handle('dialog:pickFolder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths.length) return null;
    return r.filePaths[0];
  });

  // List the subdirectories under a path for the in-app keyboard-driven folder
  // picker. Returns null on error (e.g. access denied) so the renderer can keep
  // the user on the previous folder instead of crashing.
  ipcMain.handle('dialog:listDir', async (_e, { dir }) => {
    try {
      return await fsListDir(dir);
    } catch (_err) {
      return null;
    }
  });

  ipcMain.handle('dialog:pickFile', async (e, { name }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const filters = [];
    if (name) filters.push({ name, extensions: ['exe'] });
    filters.push({ name: 'Executable', extensions: ['exe'] });
    filters.push({ name: 'All files', extensions: ['*'] });
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
    if (r.canceled || !r.filePaths.length) return null;
    return r.filePaths[0];
  });

  ipcMain.handle('dialog:error', async (e, { title, message }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    await dialog.showMessageBox(win, { type: 'error', title: title || 'Error', message: message || '' });
    return { ok: true };
  });

  ipcMain.handle('dialog:info', async (e, { title, message }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    await dialog.showMessageBox(win, { type: 'info', title: title || 'Info', message: message || '' });
    return { ok: true };
  });

  // Yes/No confirmation. Returns { ok, confirmed } where confirmed is true only
  // when the user picked the first (confirm) button.
  ipcMain.handle('dialog:confirm', async (e, params) => {
    const {
      title, message, detail, confirmLabel, cancelLabel,
    } = params || {};
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: [confirmLabel || 'OK', cancelLabel || 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: title || '',
      message: message || '',
      detail: detail || '',
    });
    return { ok: true, confirmed: r.response === 0 };
  });

  // ---- content search (ripgrep) ----
  ipcMain.handle('search:start', (e, raw) => {
    const sessionId = raw.sessionId;
    const rgExe = (raw.rgExe || ToolConfig.DEFAULT_RG_EXE).trim();
    const exeErr = validateExe(rgExe, 'rg');
    if (exeErr) return { ok: false, error: exeErr };

    const folder = (raw.folder || '').trim();
    if (!folder || !isDir(folder)) return { ok: false, error: 'Folder invalid' };

    const keywords = parseKeywords(raw.keywords);
    if (!keywords.length) return { ok: false, error: 'Keywords empty' };

    const mode = normalizeMode(raw.mode);
    const caseSensitive = !!raw.caseSensitive;
    const respectIgnore = !!raw.respectIgnore;
    const ctx = buildContext(raw);

    const sender = e.sender;
    const emit = (type, payload) => {
      if (!sender.isDestroyed()) sender.send('search:event', { sessionId, type, payload });
    };

    if (activeSessions.has(sessionId)) activeSessions.get(sessionId).stop();

    // debug log block (mirrors M2_SEEK)
    emit('debug', { msg: '=== SEARCH START ===' });
    emit('debug', { msg: `rg_exe: ${rgExe}` });
    emit('debug', { msg: `Folder: ${folder}` });
    emit('debug', { msg: `Case Sensitive: ${caseSensitive}` });
    emit('debug', { msg: `Respect ignore files: ${respectIgnore}` });
    emit('debug', { msg: `Filter include: ${JSON.stringify(ctx.inc)}` });
    emit('debug', { msg: `Exclude manual dirs: ${(raw.excludeDirs || '').trim()}` });
    emit('debug', { msg: `Exclude manual files: ${(raw.excludeFiles || '').trim()}` });
    emit('debug', { msg: `Exclude group keys raw: ${(raw.excludeGroupKeys || '').trim()}` });
    for (const [k, v] of ctx.resolved) {
      emit('debug', { msg: `  group key ${v !== null ? 'OK' : 'NOT FOUND'}: ${k}${v === null ? '' : ' = ' + v}` });
    }
    emit('debug', { msg: `Effective exclude dirs globs: ${JSON.stringify(ctx.exd)}` });
    emit('debug', { msg: `Effective exclude files globs: ${JSON.stringify(ctx.exf)}` });
    emit('debug', { msg: `Keywords: ${JSON.stringify(keywords)} | Mode=${mode}` });

    const session = new SearchSession(emit);
    activeSessions.set(sessionId, session);
    session.run({
      rgExe, folder, keywords, mode, caseSensitive, respectIgnore,
      inc: ctx.inc, exd: ctx.exd, exf: ctx.exf,
    }).catch((err) => emit('error', { msg: String(err) }))
      .finally(() => {
        emit('debug', { msg: '=== SEARCH END ===' });
        if (activeSessions.get(sessionId) === session) activeSessions.delete(sessionId);
      });

    return { ok: true };
  });

  // ---- filename search (fd) ----
  ipcMain.handle('searchFilename:start', (e, raw) => {
    const sessionId = raw.sessionId;
    const fdExe = (raw.fdExe || ToolConfig.DEFAULT_FD_EXE).trim();
    const exeErr = validateExe(fdExe, 'fd');
    if (exeErr) return { ok: false, error: exeErr };

    const folder = (raw.folder || '').trim();
    if (!folder) return { ok: false, error: 'Folder empty' };

    const keywords = parseKeywords(raw.keywords);
    if (!keywords.length) return { ok: false, error: 'Keywords empty' };

    const mode = normalizeMode(raw.mode);
    const caseSensitive = !!raw.caseSensitive;
    const respectIgnore = !!raw.respectIgnore;
    const ctx = buildContext(raw);

    const sender = e.sender;
    const emit = (type, payload) => {
      if (!sender.isDestroyed()) sender.send('search:event', { sessionId, type, payload });
    };

    if (activeSessions.has(sessionId)) activeSessions.get(sessionId).stop();

    emit('debug', { msg: '=== SEARCH_FILENAME START ===' });
    emit('debug', { msg: `fd_exe: ${fdExe}` });
    emit('debug', { msg: `Folder: ${folder}` });
    emit('debug', { msg: `Case Sensitive: ${caseSensitive}` });
    emit('debug', { msg: `Respect ignore files: ${respectIgnore}` });
    emit('debug', { msg: `Filter include(globs): ${JSON.stringify(ctx.inc)}` });
    emit('debug', { msg: `Effective exclude dirs: ${JSON.stringify(splitTokens(ctx.effDirs))}` });
    emit('debug', { msg: `Keywords: ${JSON.stringify(keywords)} | Mode=${mode}` });

    const session = new FdSearchSession(emit);
    activeSessions.set(sessionId, session);
    session.run({
      fdExe, folder, keywords, mode, caseSensitive, respectIgnore,
      inc: ctx.inc, effDirs: ctx.effDirs,
    }).catch((err) => emit('error', { msg: String(err) }))
      .finally(() => {
        emit('debug', { msg: '=== SEARCH_FILENAME END ===' });
        if (activeSessions.get(sessionId) === session) activeSessions.delete(sessionId);
      });

    return { ok: true };
  });

  ipcMain.handle('search:stop', (_e, { sessionId }) => {
    const s = activeSessions.get(sessionId);
    if (s) s.stop();
    return { ok: true };
  });

  // ---- preview ----
  ipcMain.handle('preview:build', async (_e, { filePath, keywords, caseSensitive, contextLines }) => {
    try {
      const kws = Array.isArray(keywords) ? keywords : parseKeywords(keywords);
      const lines = (typeof contextLines === 'number' && contextLines > 0) ? contextLines : PreviewConfig.CONTEXT_LINES;
      const text = await buildPreviewText(filePath, kws, !!caseSensitive, lines);
      return { ok: true, text };
    } catch (err) {
      return { ok: false, text: `(Preview build failed)\n${err}\n` };
    }
  });

  // ---- editor ----
  ipcMain.handle('editor:open', (_e, {
    editorCmd, editorArgs, filePath, line,
  }) => {
    const cmd = (editorCmd || EditorConfig.DEFAULT_CMD).trim();
    const tpl = (editorArgs || EditorConfig.DEFAULT_ARGS_TEMPLATE).trim();
    return launchEditor(cmd, tpl, filePath, line || 1);
  });

  // ---- filesystem helpers ----
  ipcMain.handle('fs:openExplorer', (_e, { target }) => {
    try {
      const p = path.normalize(target);
      if (isDir(p)) {
        shell.openPath(p);
      } else if (fs.existsSync(p)) {
        shell.showItemInFolder(p);
      } else {
        return { ok: false, error: `Not found: ${p}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Open an external URL in the user's default browser. Restricted to http/https
  // so a compromised renderer can't launch arbitrary protocol handlers.
  ipcMain.handle('app:openExternal', async (_e, { url }) => {
    try {
      const u = new URL(String(url || ''));
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { ok: false, error: `Blocked protocol: ${u.protocol}` };
      }
      await shell.openExternal(u.href);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // ---- Beyond Compare integration ----
  ipcMain.handle('tools:detectBeyondCompare', () => {
    if (bcPathCache === undefined) bcPathCache = findBeyondCompare();
    return { ok: true, found: !!bcPathCache, path: bcPathCache || '' };
  });

  // Launch Beyond Compare on exactly two files. Detached so closing the tool's
  // window never affects the compare session.
  ipcMain.handle('tools:beyondCompare', (_e, { left, right }) => {
    try {
      if (bcPathCache === undefined) bcPathCache = findBeyondCompare();
      if (!bcPathCache) return { ok: false, error: 'Beyond Compare not found' };
      const l = path.normalize(String(left || ''));
      const r = path.normalize(String(right || ''));
      if (!l || !r) return { ok: false, error: 'Two files are required' };
      if (!fs.existsSync(l)) return { ok: false, error: `Not found: ${l}` };
      if (!fs.existsSync(r)) return { ok: false, error: `Not found: ${r}` };
      const child = spawn(bcPathCache, [l, r], { detached: true, windowsHide: false });
      child.on('error', () => { /* swallow: async spawn error must not crash main */ });
      child.unref();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // ---- cscope ----
  ipcMain.handle('cscope:info', (_e, { folder }) => cscope.info(path.resolve(folder)));

  ipcMain.handle('cscope:genFiles', (_e, { folder, files }) => {
    try {
      if (!folder || !isDir(folder)) return { ok: false, error: 'Folder is empty/invalid.' };
      if (!files || !files.length) return { ok: false, error: 'FILES list is empty. Run SEARCH first.' };
      const r = cscope.genCscopeFiles(folder, files);
      return { ok: true, ...r };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('cscope:index', async (e, { folder, cscopeExe }) => {
    const debugMsgs = [];
    const onDebug = (m) => {
      debugMsgs.push(m);
      if (!e.sender.isDestroyed()) e.sender.send('cscope:debug', { msg: m });
    };
    const r = await cscope.index(folder, cscopeExe, onDebug);
    return { ...r, debug: debugMsgs };
  });

  ipcMain.handle('cscope:search', async (e, {
    folder, cscopeExe, mode, query,
  }) => {
    const onDebug = (m) => {
      if (!e.sender.isDestroyed()) e.sender.send('cscope:debug', { msg: m });
    };
    return cscope.search(folder, cscopeExe, mode, query, onDebug);
  });

  ipcMain.handle('cscope:preview', (_e, { filePath, line }) => ({
    text: cscope.readPreview(path.normalize(filePath || ''), line || 1, 10),
  }));

  ipcMain.handle('cscope:getContext', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return win && win._m2scoutCscopeContext ? win._m2scoutCscopeContext : {};
  });

  // ---- windows ----
  ipcMain.handle('window:openCscope', (_e, ctx) => {
    if (!ctx.folder || !isDir(ctx.folder)) return { ok: false, error: 'Folder is empty/invalid.' };
    const win = openCscopeWindow(ctx);
    win._m2scoutCscopeContext = ctx;
    return { ok: true };
  });

  // ---- app ----
  // Renderer pulls the optional command-line folder once it has booted.
  ipcMain.handle('app:getCliFolder', () => (typeof getInitialFolder === 'function' ? (getInitialFolder() || null) : null));
  ipcMain.handle('app:getStartupLogs', () => (typeof getStartupLogs === 'function' ? getStartupLogs() : []));

  // Renderer caches the current theme background here whenever a theme is
  // applied. The main process reads it on the next cold start (see
  // startupBackground() in main.js) to paint the window with the right color
  // immediately. Only valid hex colors are accepted; everything is wrapped so a
  // bad value or a write failure returns false instead of crashing the app.
  ipcMain.handle('app:setStartupBg', (_e, color) => {
    try {
      if (typeof color !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(color)) return false;
      const cacheFile = path.join(app.getPath('userData'), 'startup.json');
      fs.writeFileSync(cacheFile, JSON.stringify({ bg: color }));
      return true;
    } catch (_err) {
      return false;
    }
  });

  // ---- tool updates (ripgrep / fd) ----
  ipcMain.handle('tool:checkUpdate', async (_e, params) => {
    try { return await toolUpdate.checkUpdate(params || {}); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
  });
  ipcMain.handle('tool:downloadUpdate', async (_e, params) => {
    try { return await toolUpdate.downloadAndInstall(params || {}); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
  });

  // ---- app self-update (M2_SCOUT installer) ----
  ipcMain.handle('app:checkUpdate', async () => {
    try { return await appUpdate.checkUpdate(); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
  });
  ipcMain.handle('app:downloadUpdate', async (_e, params) => {
    try { return await appUpdate.downloadAndInstall(params || {}); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
  });
}

function isDir(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch (_e) {
    return false;
  }
}

module.exports = { registerIpc };
