/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - cscope integration
// Ported from CscopeWindow (index_db / search / gen_cscope_files)
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { resolveExe } = require('./paths');
const { formatCmdline } = require('./utils');

function cscopeFilesPath(folder) {
  return path.join(folder, 'cscope.files');
}
function cscopeOutPath(folder) {
  return path.join(folder, 'cscope.out');
}

function info(folder) {
  return {
    folder,
    cscopeFiles: fs.existsSync(cscopeFilesPath(folder)),
    cscopeOut: fs.existsSync(cscopeOutPath(folder)),
  };
}

// Write cscope.files from the supplied list of file paths (absolute, de-duped).
function genCscopeFiles(folder, files) {
  const abs = path.resolve(folder);
  const outPath = cscopeFilesPath(abs);
  const seen = new Set();
  const norm = [];
  for (const fp of files || []) {
    let ap;
    try {
      ap = path.resolve(fp);
    } catch (_e) {
      ap = fp;
    }
    if (!ap) continue;
    const key = ap.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    norm.push(ap);
  }
  fs.writeFileSync(outPath, norm.join('\n') + (norm.length ? '\n' : ''), 'utf8');
  return { outPath, count: norm.length };
}

// Run a command, capturing stdout/stderr; returns { rc, out, err }.
function runCmd(cmd, cwd, onDebug) {
  return new Promise((resolve) => {
    if (onDebug) onDebug(`[CMD] ${formatCmdline(cmd)}`);
    let child;
    try {
      child = spawn(cmd[0], cmd.slice(1), { cwd, windowsHide: true });
    } catch (err) {
      resolve({ rc: -1, out: '', err: `Exception: ${err}` });
      return;
    }
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', (e) => {
      if (e.code === 'ENOENT') err += `\nFileNotFoundError: ${e}`;
      else err += `\nException: ${e}`;
    });
    child.on('close', (code) => resolve({ rc: code === null ? -1 : code, out, err }));
  });
}

async function index(folder, cscopeExe, onDebug) {
  const abs = path.resolve(folder);
  if (!fs.existsSync(cscopeFilesPath(abs))) {
    return { ok: false, message: 'cscope.files missing. Use GEN_cscope.files first.' };
  }
  const exe = resolveExe((cscopeExe || 'cscope').trim());
  const cmd = [exe, '-b', '-q', '-k', '-i', cscopeFilesPath(abs)];
  const res = await runCmd(cmd, abs, onDebug);
  return { ok: res.rc === 0, ...res };
}

// Split a line into at most n+1 fields on whitespace (like Python split(None, n)).
function splitN(line, n) {
  const out = [];
  let i = 0;
  const len = line.length;
  while (out.length < n) {
    while (i < len && /\s/.test(line[i])) i += 1;
    if (i >= len) break;
    let start = i;
    while (i < len && !/\s/.test(line[i])) i += 1;
    out.push(line.slice(start, i));
  }
  while (i < len && /\s/.test(line[i])) i += 1;
  if (i < len) out.push(line.slice(i));
  return out;
}

async function search(folder, cscopeExe, modeText, query, onDebug) {
  const abs = path.resolve(folder);
  const m = (modeText || '').match(/^(\d+)\s+/);
  const idx = m ? m[1] : '3';
  const exe = resolveExe((cscopeExe || 'cscope').trim());
  const cmd = [exe, '-d', `-L${idx}`, query];
  const res = await runCmd(cmd, abs, onDebug);

  const results = [];
  if (res.rc !== 0 && !res.out) {
    return { results, rc: res.rc, out: res.out, err: res.err, warning: 'No output (rc != 0). Check if INDEX exists.' };
  }

  const lines = (res.out || '').split(/\r?\n/).filter((l) => l.trim());
  for (const ln of lines) {
    const parts = splitN(ln, 3);
    if (parts.length < 3) continue;
    const rawFile = parts[0];
    const func = parts[1] || '';
    const lineS = parts[2] || '1';
    const tail = parts[3] || '';
    let lineNo = parseInt(lineS, 10);
    if (Number.isNaN(lineNo)) lineNo = 1;

    let absPath = rawFile;
    if (!path.isAbsolute(absPath)) absPath = path.join(abs, absPath);
    absPath = path.normalize(absPath);

    let dispFile = rawFile;
    try {
      const folderAbs = path.resolve(abs);
      const absNorm = path.resolve(absPath);
      const prefix = folderAbs.replace(/[\\/]+$/, '') + path.sep;
      if (absNorm.toLowerCase().startsWith(prefix.toLowerCase())) {
        dispFile = path.relative(folderAbs, absNorm);
      }
    } catch (_e) {
      dispFile = rawFile;
    }

    results.push({
      abs: absPath,
      rel: dispFile,
      func,
      line: lineNo,
      text: tail,
      raw: ln,
      disp: `${dispFile} ${func} ${lineNo} ${tail}`.trimEnd(),
    });
  }

  return { results, rc: res.rc, out: res.out, err: res.err };
}

// Build a +/-10 line preview around a line for the cscope result.
function readPreview(filePath, lineNo, context = 10) {
  if (!fs.existsSync(filePath)) {
    return `[PREVIEW] File not found: ${filePath}`;
  }
  let lines;
  try {
    lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  } catch (e) {
    return `[PREVIEW] Read failed: ${e}`;
  }
  const total = lines.length;
  const a = Math.max(1, lineNo - context);
  const b = Math.min(total, lineNo + context);
  const out = [];
  for (let i = a; i <= b; i += 1) {
    const prefix = i === lineNo ? '>>' : '  ';
    out.push(`${prefix}${String(i).padStart(6)}: ${(lines[i - 1] || '').replace(/\s+$/, '')}`);
  }
  return out.join('\n');
}

module.exports = {
  info,
  genCscopeFiles,
  index,
  search,
  readPreview,
  cscopeFilesPath,
  cscopeOutPath,
};
