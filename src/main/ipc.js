// ============================================================
// M2_SCOUT - IPC handlers (main process backend)
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const {
  ipcMain, dialog, shell, BrowserWindow,
} = require('electron');

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
const cscope = require('./cscope');

const activeSessions = new Map(); // sessionId -> session (rg or fd)

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

function registerIpc({ openCscopeWindow }) {
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
  ipcMain.handle('preview:build', (_e, { filePath, keywords, caseSensitive }) => {
    try {
      const kws = Array.isArray(keywords) ? keywords : parseKeywords(keywords);
      const text = buildPreviewText(filePath, kws, !!caseSensitive, PreviewConfig.CONTEXT_LINES);
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
}

function isDir(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch (_e) {
    return false;
  }
}

module.exports = { registerIpc };
