// ============================================================
// M2_SCOUT - backend for the in-app keyboard-driven folder picker.
// Lists the subdirectories of a path so the renderer can show a fast,
// keyboard-navigable folder browser instead of the OS dialog.
//
// Adapted from M2_GIT_DIFF's fsdialog.js, trimmed to plain folder
// browsing (M2_SCOUT is not git-aware, so the repo detection is dropped).
// Fully async (fs/promises) so scanning a large directory never blocks the
// Electron main process and the window stays responsive.
// ============================================================

'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// Sentinel path that represents the Windows "This PC" level (the list of
// drive roots) reached by going up from a drive root such as C:\.
const DRIVES = ':drives:';

// Probe C: through Z: for existing drive roots (A:/B: are skipped — legacy
// floppy letters that can block for seconds when empty).
function listDrives() {
  const drives = [];
  for (let code = 67 /* C */; code <= 90 /* Z */; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`;
    try {
      if (fs.existsSync(root)) drives.push({ name: root, path: root, isDrive: true });
    } catch (_e) {
      /* drive not ready / access denied — skip */
    }
  }
  return drives;
}

// List the directories directly under `dirPath`. Returns a descriptor the
// renderer can render and navigate:
//   { path, parent, canGoUp, isDriveList, entries: [{ name, path, isDrive? }] }
async function listDir(dirPath) {
  if (dirPath === DRIVES && process.platform === 'win32') {
    return {
      path: DRIVES,
      parent: null,
      canGoUp: false,
      isDriveList: true,
      entries: listDrives(),
    };
  }

  const abs = path.resolve(dirPath);
  const dirents = await fsp.readdir(abs, { withFileTypes: true });

  const entries = [];
  for (const de of dirents) {
    let isDir = de.isDirectory();
    if (de.isSymbolicLink()) {
      // Follow links so junctions/symlinks to folders still show up.
      try {
        // eslint-disable-next-line no-await-in-loop
        const st = await fsp.stat(path.join(abs, de.name));
        isDir = st.isDirectory();
      } catch (_e) {
        isDir = false;
      }
    }
    if (!isDir) continue;
    entries.push({ name: de.name, path: path.join(abs, de.name) });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const parent = path.dirname(abs);
  const atRoot = parent === abs; // e.g. C:\ or / — dirname returns itself
  return {
    path: abs,
    // On Windows, going up from a drive root surfaces the drive list; on
    // POSIX the filesystem root has no parent.
    parent: atRoot ? (process.platform === 'win32' ? DRIVES : null) : parent,
    canGoUp: process.platform === 'win32' ? true : !atRoot,
    isDriveList: false,
    entries,
  };
}

module.exports = { listDir, DRIVES };
