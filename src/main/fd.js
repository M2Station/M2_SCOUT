// ============================================================
// M2_SCOUT - filename search via fd
// Ported from TabApp.search_filename
// ============================================================

'use strict';

const { spawn } = require('child_process');
const { resolveExe } = require('./paths');
const { formatCmdline, splitTokens } = require('./utils');

// Build fd argv (without exe) for a single keyword.
function fdArgs(folder, keyword, caseSensitive, respectIgnore, inc, exdList) {
  const args = [keyword, '--full-path'];

  if (caseSensitive) args.push('-s');
  else args.push('-i');

  if (!respectIgnore) args.push('--no-ignore');

  for (const gRaw of inc) {
    const gg = (gRaw || '').trim();
    if (!gg || gg === '*.*' || gg === '*') continue;

    if (gg.startsWith('*.') && gg.length > 2) {
      const ext = gg.slice(2).trim().replace(/^\.+/, '');
      if (ext) {
        args.push('-e', ext);
        continue;
      }
    }
    if (gg.startsWith('.') && gg.length > 1 && !/[*?/\\]/.test(gg)) {
      const ext = gg.slice(1).trim();
      if (ext) {
        args.push('-e', ext);
        continue;
      }
    }
    if (!/[*?/\\.]/.test(gg)) {
      args.push('-e', gg);
      continue;
    }
    args.push('-g', gg);
  }

  for (const d of exdList) args.push('-E', d);

  args.push('--search-path', folder);
  return args;
}

function runSingleFd(fdExe, folder, keyword, caseSensitive, respectIgnore, inc, exdList, ctx, onDebug) {
  return new Promise((resolve) => {
    const args = fdArgs(folder, keyword, caseSensitive, respectIgnore, inc, exdList);
    if (onDebug) onDebug(`RUN (cmdline): ${formatCmdline([fdExe, ...args])}`);

    const files = new Set();
    let stderr = '';
    let buf = '';
    let child;
    try {
      child = spawn(fdExe, args, { windowsHide: true, cwd: folder });
    } catch (err) {
      resolve({ files, stderr: String(err), error: err });
      return;
    }
    ctx.children.add(child);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let idx;
      // eslint-disable-next-line no-cond-assign
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '').trim();
        buf = buf.slice(idx + 1);
        if (line) files.add(line);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      stderr += `\n${err}`;
    });
    child.on('close', () => {
      ctx.children.delete(child);
      const last = buf.replace(/\r$/, '').trim();
      if (last) files.add(last);
      resolve({ files, stderr: stderr.trim() });
    });
  });
}

class FdSearchSession {
  constructor(emit) {
    this.emit = emit;
    this.children = new Set();
    this.stopRequested = false;
  }

  stop() {
    this.stopRequested = true;
    for (const child of this.children) {
      try {
        child.kill();
      } catch (_e) {
        /* ignore */
      }
    }
    setTimeout(() => {
      for (const child of this.children) {
        try {
          child.kill('SIGKILL');
        } catch (_e) {
          /* ignore */
        }
      }
    }, 200);
  }

  async run(params) {
    const {
      fdExe, folder, keywords, mode, caseSensitive, respectIgnore, inc, effDirs,
    } = params;
    const exe = resolveExe(fdExe);
    const exdList = splitTokens(effDirs).map((x) => x.trim()).filter(Boolean);
    const onDebug = (msg) => this.emit('debug', { msg });
    const t0 = Date.now();

    const perKwSets = [];
    const union = new Set();
    const stderrAny = [];
    let stopped = false;

    for (const kw of keywords) {
      if (this.stopRequested) {
        stopped = true;
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      const r = await runSingleFd(exe, folder, kw, caseSensitive, respectIgnore, inc, exdList, this, onDebug);
      if (r.error && r.error.code === 'ENOENT') {
        this.emit('error', { msg: `fd not found: ${exe}` });
        return;
      }
      if (r.stderr) stderrAny.push(`[${kw}] ${r.stderr}`);
      for (const f of r.files) union.add(f);
      perKwSets.push(r.files);
      onDebug(`fd done kw='${kw}' | files=${r.files.size}`);
      if (this.stopRequested) {
        stopped = true;
        break;
      }
    }

    let final = union;
    if (mode === 'AND' && perKwSets.length) {
      final = perKwSets.reduce((acc, s) => {
        const next = new Set();
        for (const x of acc) if (s.has(x)) next.add(x);
        return next;
      });
    }

    const files = [...final].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map((path) => ({ path, count: 1 }));

    for (const e of stderrAny) onDebug(`fd stderr: ${e}`);

    this.emit('done', {
      files,
      stopped,
      elapsedMs: Date.now() - t0,
      filesSearched: null,
      stderr: stderrAny,
      filenameMode: true,
    });
  }
}

module.exports = { FdSearchSession };
