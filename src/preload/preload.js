/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - preload (contextBridge API)
// ============================================================

'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const os = require('os');

// Display helper: path relative to base folder (for FILES list), like M2_SEEK.
function relForDisplay(base, fp) {
  try {
    if (!base) return fp;
    const absFp = path.resolve(fp);
    const baseAbs = path.resolve(base).replace(/[\\/]+$/, '');
    const prefix = baseAbs + path.sep;
    if (absFp.toLowerCase().startsWith(prefix.toLowerCase())) {
      return path.relative(baseAbs, absFp);
    }
    if (absFp.toLowerCase() === baseAbs.toLowerCase()) {
      return path.basename(absFp);
    }
  } catch (_e) {
    /* ignore */
  }
  return fp;
}

contextBridge.exposeInMainWorld('m2scout', {
  // config & ini
  getConfig: () => ipcRenderer.invoke('config:get'),
  loadIni: () => ipcRenderer.invoke('ini:load'),
  saveIni: (data) => ipcRenderer.invoke('ini:save', data),
  // Synchronous save: blocks until the file is written. Used on window close
  // so the settings are flushed to disk before the renderer is destroyed.
  saveIniSync: (data) => ipcRenderer.sendSync('ini:saveSync', data),
  loadExcludeGroups: () => ipcRenderer.invoke('excludeGroups:load'),
  loadHl: () => ipcRenderer.invoke('hl:load'),
  reloadHl: () => ipcRenderer.invoke('hl:reload'),

  // dialogs
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  // In-app keyboard-driven folder browser backend.
  listDir: (dir) => ipcRenderer.invoke('dialog:listDir', { dir }),
  // Starting points / sentinel for the folder picker fallbacks.
  homeDir: os.homedir(),
  drivesSentinel: ':drives:',
  pickFile: (name) => ipcRenderer.invoke('dialog:pickFile', { name }),
  showError: (title, message) => ipcRenderer.invoke('dialog:error', { title, message }),
  showInfo: (title, message) => ipcRenderer.invoke('dialog:info', { title, message }),

  // search
  startSearch: (params) => ipcRenderer.invoke('search:start', params),
  startFilenameSearch: (params) => ipcRenderer.invoke('searchFilename:start', params),
  stopSearch: (sessionId) => ipcRenderer.invoke('search:stop', { sessionId }),
  onSearchEvent: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('search:event', listener);
    return () => ipcRenderer.removeListener('search:event', listener);
  },

  // System CPU% pushed continuously from main (always-on, even when idle).
  onSysCpu: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('sys:cpu', listener);
    return () => ipcRenderer.removeListener('sys:cpu', listener);
  },

  // preview & editor
  buildPreview: (params) => ipcRenderer.invoke('preview:build', params),
  openEditor: (params) => ipcRenderer.invoke('editor:open', params),
  openExplorer: (target) => ipcRenderer.invoke('fs:openExplorer', { target }),
  // Open an external URL (http/https only) in the default browser.
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', { url }),

  // cscope
  cscope: {
    info: (folder) => ipcRenderer.invoke('cscope:info', { folder }),
    genFiles: (folder, files) => ipcRenderer.invoke('cscope:genFiles', { folder, files }),
    index: (folder, cscopeExe) => ipcRenderer.invoke('cscope:index', { folder, cscopeExe }),
    search: (folder, cscopeExe, mode, query) => ipcRenderer.invoke('cscope:search', {
      folder, cscopeExe, mode, query,
    }),
    preview: (filePath, line) => ipcRenderer.invoke('cscope:preview', { filePath, line }),
    getContext: () => ipcRenderer.invoke('cscope:getContext'),
    onDebug: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on('cscope:debug', listener);
      return () => ipcRenderer.removeListener('cscope:debug', listener);
    },
  },

  // windows
  openCscopeWindow: (ctx) => ipcRenderer.invoke('window:openCscope', ctx),

  // tool updates (ripgrep / fd)
  tool: {
    checkUpdate: (params) => ipcRenderer.invoke('tool:checkUpdate', params),
    downloadUpdate: (params) => ipcRenderer.invoke('tool:downloadUpdate', params),
  },

  // app events
  getCliFolder: () => ipcRenderer.invoke('app:getCliFolder'),
  onCliFolder: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('app:cliFolder', listener);
    return () => ipcRenderer.removeListener('app:cliFolder', listener);
  },
  // Main process asks the renderer to persist settings synchronously right
  // before the window closes (reliable replacement for window `beforeunload`).
  onFlushSettings: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('app:flushSettings', listener);
    return () => ipcRenderer.removeListener('app:flushSettings', listener);
  },

  // path helpers
  path: {
    basename: (p) => path.basename(p),
    normalize: (p) => path.normalize(p),
    relForDisplay,
    sep: path.sep,
  },

  // clipboard (renderer can also use navigator.clipboard)
  writeClipboard: (text) => {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
  },
});
