// ============================================================
// M2_SCOUT - Electron main process
// ============================================================

'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');
const { registerIpc } = require('./ipc');
const { parentToolDir, appDir } = require('./paths');

let mainWindow = null;

function findIcon() {
  const candidates = [
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
