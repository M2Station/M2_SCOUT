/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - Electron main process
// ============================================================

'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Menu } = require('electron');
const { registerIpc } = require('./ipc');
const { parentToolDir, appDir } = require('./paths');
const { ensureFontsInstalled } = require('./fonts');
const { cleanupDownloads } = require('./appUpdate');
const { version: APP_VERSION } = require('../../package.json');

const mainBootStartMs = Date.now();
const startupLogBuffer = [];
const STARTUP_LOG_MAX = 200;

function pushStartupLog(line) {
  startupLogBuffer.push(line);
  if (startupLogBuffer.length > STARTUP_LOG_MAX) startupLogBuffer.shift();
}

function startupMark(stage) {
  const ms = Date.now() - mainBootStartMs;
  const line = `[startup][main] +${ms}ms ${stage}`;
  pushStartupLog(line);
  console.log(line);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send('app:startupLog', { line });
    }
  }
}

// Electron keeps a GPU shader disk cache under the user-data folder. On some
// Windows setups that folder can't be created or moved (antivirus lock, a
// stale lock from a previous run, or a roaming-profile permission quirk),
// which spams the console with "Unable to move the cache: Access is denied",
// "Unable to create cache" and "Gpu Cache Creation failed: -2". Disabling the
// shader disk cache removes those errors with no visible impact for this tool.
// Must run before the app is ready.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
// Ensure pinned taskbar shortcut resolves to this app identity on Windows.
// Without an explicit AppUserModelID, Windows can show inconsistent icon
// sizing/grouping for pinned shortcuts in some environments.
app.setAppUserModelId('com.m2station.m2scout');

let mainWindow = null;
// Folder passed on the command line (e.g. from the Explorer right-click menu).
// Stored so the renderer can pull it once it has finished booting, which avoids
// a race with the window's did-finish-load event.
let initialFolder = null;

// Default theme background (DAYLIGHT `--bg` in src/renderer/js/themes.js). Used
// as the window backgroundColor when no valid startup cache is available.
const DEFAULT_STARTUP_BG = '#f4f4f4';
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

// Read the cached theme background written by the renderer on the previous run
// (userData/startup.json -> { "bg": "#rrggbb" }). Showing the window with the
// right backgroundColor avoids a white flash before the renderer paints, which
// matters most for dark-theme users. Falls back to the light default theme bg
// when the cache is missing (first launch) or invalid. Wrapped in try/catch so
// a missing file or bad JSON never throws during boot.
function startupBackground() {
  try {
    const cacheFile = path.join(app.getPath('userData'), 'startup.json');
    const raw = fs.readFileSync(cacheFile, 'utf8');
    const bg = JSON.parse(raw).bg;
    if (typeof bg === 'string' && HEX_COLOR_RE.test(bg)) return bg;
  } catch (_e) {
    /* no cache yet / unreadable / invalid JSON - use the default */
  }
  return DEFAULT_STARTUP_BG;
}

function findIcon() {
  const candidates = [
    // Primary location: LOGO/M2_SCOUT.ico next to the app.
    path.join(appDir(), 'LOGO', 'M2_SCOUT.ico'),
    path.join(parentToolDir(), 'LOGO', 'M2_SCOUT.ico'),
    // Backward-compatible fallbacks.
    path.join(appDir(), 'M2_SCOUT.ico'),
    path.join(appDir(), 'M2_LOGO.ico'),
    path.join(parentToolDir(), 'M2_LOGO.ico'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function createMainWindow() {
  startupMark('createMainWindow:start');
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 560,
    title: `M2_SCOUT v${APP_VERSION}`,
    icon: findIcon(),
    autoHideMenuBar: true,
    // Show the window immediately on creation (no `show: false` +
    // `ready-to-show` wait) so it appears as early as possible; the renderer
    // content fills in right after. backgroundColor is seeded from the cached
    // theme bg so dark-theme users don't see a white flash first.
    show: true,
    backgroundColor: startupBackground(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.webContents.once('did-finish-load', () => startupMark('renderer:did-finish-load'));

  // Keep the versioned window title ("M2_SCOUT v0.0.1"). Without this, the
  // page's own <title> element would override the BrowserWindow title once
  // index.html finishes loading.
  mainWindow.on('page-title-updated', (e) => e.preventDefault());

  // Persist settings before the window is destroyed. The browser `beforeunload`
  // event is unreliable for this in Electron, so we intercept the window
  // `close` here: ask the renderer to flush its settings synchronously, then
  // let the close proceed. A short timeout guarantees we never hang.
  let settingsFlushed = false;
  mainWindow.on('close', (e) => {
    if (settingsFlushed) return;
    e.preventDefault();
    settingsFlushed = true;
    if (mainWindow && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('app:flushSettings');
    }
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    }, 800);
  });

  return mainWindow;
}

// Open a separate CSCOPE window with context passed via query string.
function openCscopeWindow(ctx) {
  const win = new BrowserWindow({
    width: 1140,
    height: 760,
    title: 'CSCOPE',
    icon: findIcon(),
    autoHideMenuBar: true,
    backgroundColor: '#f4f4f4',
    parent: mainWindow || undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const params = new URLSearchParams({
    folder: ctx.folder || '',
    editorCmd: ctx.editorCmd || '',
    editorArgs: ctx.editorArgs || '',
    cscopeExe: ctx.cscopeExe || 'cscope',
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'cscope.html'), { search: params.toString() });
  return win;
}

app.whenReady().then(() => {
  startupMark('app.whenReady');
  // Drop the default Electron application menu. With autoHideMenuBar the hidden
  // menu still captures the Alt key and Alt+<mnemonic> combos (e.g. Alt+F for
  // "File"), which swallowed the renderer's Alt+F "Select Folder" hotkey before
  // it could fire. Removing the menu frees all Alt-based shortcuts for the app's
  // own keydown handlers.
  Menu.setApplicationMenu(null);
  // Optional CLI arg: a folder to pre-fill in the first tab (e.g. from the
  // Explorer right-click menu). Resolve it before wiring IPC so the renderer
  // can pull it via 'app:getCliFolder' once it has finished booting. Pushing it
  // on did-finish-load races with the renderer's async boot and gets lost.
  initialFolder = process.argv.slice(app.isPackaged ? 1 : 2).find((a) => {
    try {
      return a && fs.existsSync(a) && fs.statSync(a).isDirectory();
    } catch (_e) {
      return false;
    }
  }) || null;

  registerIpc({
    openCscopeWindow,
    getInitialFolder: () => initialFolder,
    getStartupLogs: () => startupLogBuffer.slice(),
  });
  startupMark('registerIpc:done');
  createMainWindow();
  startupMark('createMainWindow:done');

  // Do non-critical startup work after the first window exists so app launch is
  // responsive even when antivirus/registry access is slow.
  setImmediate(() => {
    try {
      startupMark('fonts:ensure:start');
      const fontResults = ensureFontsInstalled();
      const installed = fontResults.filter((r) => r.action === 'installed');
      const failed = fontResults.filter((r) => r.action === 'failed');
      if (installed.length) console.log('[fonts] installed:', installed.map((r) => r.file).join(', '));
      if (failed.length) console.warn('[fonts] failed:', failed.map((r) => `${r.file} (${r.error})`).join(', '));
      startupMark('fonts:ensure:done');
    } catch (e) {
      console.warn('[fonts] ensure failed:', e.message);
      startupMark('fonts:ensure:failed');
    }

    // Remove any installer left over from a previous self-update (completed or
    // cancelled). Runs after the freshly installed/relaunched app starts, so the
    // downloaded Setup .exe never lingers in the temp folder.
    try {
      cleanupDownloads();
      startupMark('appUpdate:cleanup:done');
    } catch (e) {
      console.warn('[appUpdate] cleanup failed:', e.message);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

module.exports = { openCscopeWindow };
