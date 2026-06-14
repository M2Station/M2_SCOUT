// ============================================================
// M2_SCOUT - bundled font auto-install (Windows, per-user)
// On startup we scan the FONTS/ directory and make sure every bundled
// font is available to the OS so the CSS font stacks (e.g. "Source Code
// Pro") resolve by family name. Installing per-user needs NO admin rights
// on Windows 10 1809+: copy into the per-user Fonts folder and register
// the file under HKCU. Best-effort - never throws, never blocks startup.
// ============================================================

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { fontsDir } = require('./paths');

// Proper registry display names for fonts we ship. Anything not listed
// falls back to "<filename-without-ext> (TrueType|OpenType)".
const REG_NAMES = {
  'SourceCodePro-Regular.ttf': 'Source Code Pro (TrueType)',
};

function userFontsDir() {
  const base = process.env.LOCALAPPDATA
    || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'Microsoft', 'Windows', 'Fonts');
}

function systemFontsDir() {
  return path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');
}

// All shippable font files in FONTS/ (ttf/otf/ttc).
function listBundledFonts() {
  try {
    return fs.readdirSync(fontsDir()).filter((f) => /\.(ttf|otf|ttc)$/i.test(f));
  } catch (_e) {
    return [];
  }
}

// Installed if the file already exists in the per-user OR the system Fonts dir.
function isInstalled(fileName) {
  return [path.join(userFontsDir(), fileName), path.join(systemFontsDir(), fileName)]
    .some((p) => {
      try { return fs.existsSync(p); } catch (_e) { return false; }
    });
}

function regName(fileName) {
  if (REG_NAMES[fileName]) return REG_NAMES[fileName];
  const base = fileName.replace(/\.(ttf|otf|ttc)$/i, '');
  const kind = /\.otf$/i.test(fileName) ? 'OpenType' : 'TrueType';
  return `${base} (${kind})`;
}

// Copy into the per-user Fonts folder and register under HKCU so it
// survives reboot and resolves by family name. No elevation required.
function installFont(fileName) {
  const src = path.join(fontsDir(), fileName);
  const destDir = userFontsDir();
  const dest = path.join(destDir, fileName);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  // execFileSync (no shell) keeps the spaces/parens in the value name safe.
  execFileSync('reg', [
    'add', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
    '/v', regName(fileName),
    '/t', 'REG_SZ',
    '/d', dest,
    '/f',
  ], { stdio: 'ignore', windowsHide: true });
}

// Ensure all bundled fonts are installed for the current user.
// Returns a summary array: [{ file, action: 'present'|'installed'|'failed', error? }].
function ensureFontsInstalled() {
  if (process.platform !== 'win32') return [];
  const results = [];
  for (const file of listBundledFonts()) {
    try {
      if (isInstalled(file)) {
        results.push({ file, action: 'present' });
      } else {
        installFont(file);
        results.push({ file, action: 'installed' });
      }
    } catch (err) {
      results.push({ file, action: 'failed', error: err.message });
    }
  }
  return results;
}

module.exports = {
  ensureFontsInstalled, listBundledFonts, isInstalled,
};
