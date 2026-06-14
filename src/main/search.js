// ============================================================
// M2_SCOUT - search orchestrator (content search via ripgrep)
// Ported from TabApp.search worker (sequential OR + parallel AND)
// ============================================================

'use strict';

const { spawn } = require('child_process');
const { rgSearchArgs } = require('./rg');
const { resolveExe } = require('./paths');
const { formatCmdline } = require('./utils');
const { SearchConfig, LiveUpdateConfig } = require('./config');

const WINDOWS = process.platform === 'win32';

// Run a single ripgrep keyword search, streaming match counts.
// onMatch(path) is called for every match line. Returns a promise resolving to
// { counts: Map, filesSearched, stderr, stopped }.
function runSingleRg(rgExe, folder, keyword, inc, exd, exf, caseSensitive, respectIgnore, ctx, onMatch, onDebug) {
  return new Promise((resolve) => {
    const args = rgSearchArgs(folder, keyword, inc, exd, exf, caseSensitive, respectIgnore);
    if (onDebug) onDebug(`RUN (cmdline): ${formatCmdline([rgExe, ...args])}`);

    const counts = new Map();
    let filesSearched = null;
    let stderr = '';
    let stopped = false;
    let buf = '';

    let child;
    try {
      child = spawn(rgExe, args, { windowsHide: true, cwd: folder });
    } catch (err) {
      resolve({ counts, filesSearched, stderr: String(err), stopped, error: err });
      return;
    }

    ctx.children.add(child);

    const handleLine = (line) => {
      if (!line) return;
      let j;
      try {
        j = JSON.parse(line);
      } catch (_e) {
        return;
      }
      const t = j.type;
      if (t === 'match') {
        const p = j.data && j.data.path && j.data.path.text;
        if (p) {
          counts.set(p, (counts.get(p) || 0) + 1);
          if (onMatch) onMatch(p);
        }
      } else if (t === 'summary') {
        const stats = (j.data && j.data.stats) || {};
        if (typeof stats.searches === 'number') filesSearched = stats.searches;
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let idx;
      // eslint-disable-next-line no-cond-assign
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        handleLine(line.replace(/\r$/, ''));
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
      if (buf) handleLine(buf.replace(/\r$/, ''));
      stopped = stopped || ctx.stopRequested;
      resolve({ counts, filesSearched, stderr: stderr.trim(), stopped });
    });

    // expose for stop()
    ctx.childRefs.set(child, true);
  });
}

class SearchSession {
  constructor(emit) {
    this.emit = emit; // (type, payload) => void
    this.children = new Set();
    this.childRefs = new Map();
    this.stopRequested = false;
    this._liveDelta = new Map();
    this._liveTimer = null;
    this._matchedFiles = new Set();
    this._matchCount = 0;
    this._progressTimer = null;
  }

  _scheduleLiveFlush() {
    if (this._liveTimer) return;
    this._liveTimer = setTimeout(() => {
      this._liveTimer = null;
      this._flushLive();
    }, LiveUpdateConfig.FLUSH_MS);
  }

  _flushLive() {
    if (this._liveDelta.size === 0) return;
    const delta = [];
    for (const [p, c] of this._liveDelta.entries()) delta.push([p, c]);
    this._liveDelta.clear();
    this.emit('live', { delta });
  }

  _onMatch(path) {
    this._matchCount += 1;
    this._matchedFiles.add(path);
    this._liveDelta.set(path, (this._liveDelta.get(path) || 0) + 1);
    this._scheduleLiveFlush();
    if (!this._progressTimer) {
      this._progressTimer = setTimeout(() => {
        this._progressTimer = null;
        this.emit('progress', { matchedFiles: this._matchedFiles.size, matches: this._matchCount });
      }, 100);
    }
  }

  stop() {
    this.stopRequested = true;
    for (const child of this.children) {
      try {
        if (WINDOWS) {
          child.kill();
        } else {
          child.kill('SIGTERM');
        }
      } catch (_e) {
        /* ignore */
      }
    }
    // force kill shortly after
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
      rgExe, folder, keywords, mode, caseSensitive, respectIgnore, inc, exd, exf,
    } = params;
    const exe = resolveExe(rgExe);
    const t0 = Date.now();
    const onDebug = (msg) => this.emit('debug', { msg });
    const onMatch = (p) => this._onMatch(p);

    const useParallelAnd = mode === 'AND' && keywords.length >= SearchConfig.PARALLEL_AND_THRESHOLD;
    if (useParallelAnd) onDebug(`[PARALLEL AND] ${keywords.length} keywords will run concurrently`);

    const perKwCounts = [];
    const perKwFiles = [];
    const stderrAny = [];
    const filesSearchedSeen = [];
    let stopped = false;

    if (useParallelAnd) {
      const results = await Promise.all(
        keywords.map((kw) =>
          runSingleRg(exe, folder, kw, inc, exd, exf, caseSensitive, respectIgnore, this, onMatch, onDebug)
            .then((r) => ({ kw, r })))
      );
      for (const { kw, r } of results) {
        if (r.error && r.error.code === 'ENOENT') {
          this.emit('error', { msg: `rg not found: ${exe}` });
          return;
        }
        if (r.stopped) stopped = true;
        if (r.filesSearched !== null && r.filesSearched !== undefined) filesSearchedSeen.push(r.filesSearched);
        if (r.stderr) stderrAny.push(`[${kw}] ${r.stderr}`);
        perKwCounts.push(r.counts);
        perKwFiles.push(new Set(r.counts.keys()));
        onDebug(`[PARALLEL AND] kw='${kw}' done | files=${r.counts.size}`);
      }
    } else {
      for (const kw of keywords) {
        if (this.stopRequested) {
          stopped = true;
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        const r = await runSingleRg(exe, folder, kw, inc, exd, exf, caseSensitive, respectIgnore, this, onMatch, onDebug);
        if (r.error && r.error.code === 'ENOENT') {
          this.emit('error', { msg: `rg not found: ${exe}` });
          return;
        }
        if (r.filesSearched !== null && r.filesSearched !== undefined) filesSearchedSeen.push(r.filesSearched);
        if (r.stderr) stderrAny.push(`[${kw}] ${r.stderr}`);
        if (r.stopped) {
          stopped = true;
          onDebug(`rg stopped during kw='${kw}'`);
          // Keep the matches already collected for this keyword so pressing
          // STOP/ESC does not discard the results found so far.
          perKwCounts.push(r.counts);
          perKwFiles.push(new Set(r.counts.keys()));
          break;
        }
        onDebug(`rg done kw='${kw}' | files=${r.counts.size} matches=${sumMap(r.counts)}`);
        perKwCounts.push(r.counts);
        perKwFiles.push(new Set(r.counts.keys()));
      }
    }

    this._flushLive();

    // Combine
    let combined = new Map();
    if (perKwCounts.length > 0) {
      if (mode === 'OR' || (mode === 'AND' && perKwFiles.length !== keywords.length)) {
        for (const m of perKwCounts) {
          for (const [fp, c] of m.entries()) combined.set(fp, (combined.get(fp) || 0) + c);
        }
      } else {
        const inter = intersectSets(perKwFiles);
        for (const fp of inter) {
          let s = 0;
          for (const m of perKwCounts) s += m.get(fp) || 0;
          combined.set(fp, s);
        }
      }
    }

    const files = [...combined.entries()]
      .sort((a, b) => (b[1] - a[1]) || a[0].toLowerCase().localeCompare(b[0].toLowerCase()))
      .map(([path, count]) => ({ path, count }));

    const filesSearched = filesSearchedSeen.length ? Math.max(...filesSearchedSeen) : null;
    for (const e of stderrAny) onDebug(`rg stderr: ${e}`);

    this.emit('done', {
      files,
      stopped,
      elapsedMs: Date.now() - t0,
      filesSearched,
      stderr: stderrAny,
    });
  }
}

function sumMap(m) {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

function intersectSets(sets) {
  if (!sets.length) return new Set();
  let acc = sets[0];
  for (let i = 1; i < sets.length; i += 1) {
    const next = new Set();
    for (const x of acc) if (sets[i].has(x)) next.add(x);
    acc = next;
  }
  return acc;
}

module.exports = { SearchSession };
