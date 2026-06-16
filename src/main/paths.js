/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - path helpers
// ============================================================

'use strict';

const path = require('path');
const fs = require('fs');
const { AppConfig } = require('./config');

// electron is optional here so these helpers can also be unit-tested in plain Node.
let app = null;
try {
  // eslint-disable-next-line global-require
  ({ app } = require('electron'));
} catch (_e) {
  app = null;
}

// Directory where settings (INI) should live.
// - Packaged app: directory of the executable.
// - Dev run: the M2_SCOUT project root (one level above src/).
function appDir() {
  try {
    if (app && app.isPackaged) {
      return path.dirname(app.getPath('exe'));
    }
  } catch (_e) {
    /* app not ready / not in electron */
  }
  // src/main/paths.js -> M2_SCOUT/
  return path.resolve(__dirname, '..', '..');
}

// Directory where user settings (INI files) are persisted.
// - Packaged app: app.getPath('userData')  e.g. %AppData%\M2_SCOUT
//   This is always writable and survives reinstalls / upgrades.
// - Dev run: same as appDir() so the project-root INI files are used directly.
function settingsDir() {
  try {
    if (app && app.isPackaged) {
      const dir = app.getPath('userData');
      // Ensure the directory exists (it may not on first run).
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return dir;
    }
  } catch (_e) {
    /* app not ready / not in electron */
  }
  return appDir();
}

// The parent directory of M2_SCOUT (the original M2_SEEK root that ships rg.exe/fd.exe/cscope.exe).
function parentToolDir() {
  return path.resolve(appDir(), '..');
}

// Default bundled-tools directory: M2_SCOUT/TOOLS (ships rg.exe/fd.exe/cscope.exe).
function toolsDir() {
  return path.join(appDir(), 'TOOLS');
}

function iniPath() {
  return path.join(settingsDir(), AppConfig.INI_FILENAME);
}

function excludeGroupIniPath() {
  return path.join(settingsDir(), AppConfig.EXCLUDE_GROUP_INI);
}

function hlIniPath() {
  return path.join(settingsDir(), AppConfig.HL_INI);
}

// Directory of bundled fonts (FONTS/) shipped next to the app.
function fontsDir() {
  return path.join(appDir(), 'FONTS');
}

// Resolve an executable name/path to something spawnable.
// If it is an absolute existing file, use it. If it is a bare name like
// "rg.exe", try: M2_SCOUT/TOOLS dir, M2_SCOUT dir, parent (M2_SEEK) dir, else
// return as-is so the OS PATH lookup can resolve it.
function resolveExe(exe) {
  const raw = (exe || '').trim();
  if (!raw) return raw;
  if (path.isAbsolute(raw)) return raw;

  const candidates = [
    path.join(toolsDir(), raw),
    path.join(appDir(), raw),
    path.join(parentToolDir(), raw),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch (_e) {
      /* ignore */
    }
  }
  return raw; // fall back to PATH resolution
}

module.exports = {
  appDir,
  settingsDir,
  parentToolDir,
  toolsDir,
  iniPath,
  excludeGroupIniPath,
  hlIniPath,
  fontsDir,
  resolveExe,
};
