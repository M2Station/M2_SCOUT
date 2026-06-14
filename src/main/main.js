// ============================================================
// M2_SCOUT - Electron main process
// ============================================================

'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');
const { registerIpc } = require('./ipc');
const { parentToolDir, appDir } = require('./paths');
const { ensureFontsInstalled } = require('./fonts');

// Electron keeps a GPU shader disk cache under the user-data folder. On some
// Windows setups that folder can't be created or moved (antivirus lock, a
// stale lock from a previous run, or a roaming-profile permission quirk),
// which spams the console with "Unable to move the cache: Access is denied",
// "Unable to create cache" and "Gpu Cache Creation failed: -2". Disabling the
// shader disk cache removes those errors with no visible impact for this tool.
// Must run before the app is ready.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

let mainWindow = null;

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
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 560,
    title: 'M2_SCOUT V20260402 - Tabbed Search Tool [Parallel AND | Live Filter]',
    icon: findIcon(),
    autoHideMenuBar: true,
    backgroundColor: '#f4f4f4',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

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
  // Make bundled fonts available to the OS so the CSS font stacks resolve
  // (e.g. "Source Code Pro"). Done before the window is created so the fresh
  // renderer process can enumerate the newly installed font this session.
  try {
    const fontResults = ensureFontsInstalled();
    const installed = fontResults.filter((r) => r.action === 'installed');
    const failed = fontResults.filter((r) => r.action === 'failed');
    if (installed.length) console.log('[fonts] installed:', installed.map((r) => r.file).join(', '));
    if (failed.length) console.warn('[fonts] failed:', failed.map((r) => `${r.file} (${r.error})`).join(', '));
  } catch (e) {
    console.warn('[fonts] ensure failed:', e.message);
  }

  registerIpc({ openCscopeWindow });
  createMainWindow();

  // Optional CLI arg: a folder to pre-fill in the first tab.
  const argFolder = process.argv.slice(app.isPackaged ? 1 : 2).find((a) => {
    try {
      return a && fs.existsSync(a) && fs.statSync(a).isDirectory();
    } catch (_e) {
      return false;
    }
  });
  if (argFolder) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('app:cliFolder', { folder: argFolder });
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

module.exports = { openCscopeWindow };
