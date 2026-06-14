// ============================================================
// M2_SCOUT - editor launch
// Ported from editor_template_to_argv + on_right_click launch logic
// ============================================================

'use strict';

const path = require('path');
const { spawn } = require('child_process');
const { shlexSplit, stripWrappingQuotes } = require('./utils');

// Convert an editor args template into an argv array, substituting the file
// path and line number. Mirrors M2_SEEK.editor_template_to_argv.
function editorTemplateToArgv(template, file, line) {
  const fileWin = path.normalize(file);
  let t = (template || '').trim()
    .split('$(FILEPATH)').join(fileWin)
    .split('$(LINENUM)').join(String(line));

  let argv = shlexSplit(t).map((x) => stripWrappingQuotes(x));

  // join tokens that start with ":" onto a preceding path-like token
  const fixed = [];
  for (const tok of argv) {
    if (tok.startsWith(':') && fixed.length) {
      const prev = fixed[fixed.length - 1];
      if (prev.includes('\\') || prev.includes('/') || prev.includes(':')) {
        fixed[fixed.length - 1] = prev + tok;
        continue;
      }
    }
    fixed.push(tok);
  }

  const norm = [];
  for (const tok of fixed) {
    let m = tok.match(/^:"([^"]+)":(\d+)$/);
    if (m) {
      norm.push(`${m[1]}:${m[2]}`);
      continue;
    }
    m = tok.match(/^:([A-Za-z]:[\\/].+):(\d+)$/);
    if (m) {
      norm.push(`${m[1]}:${m[2]}`);
      continue;
    }
    norm.push(tok);
  }
  return norm;
}

// Launch the configured editor for file:line. Returns { ok, debug, error }.
function launchEditor(editorCmd, editorArgsTpl, file, line) {
  const argv = editorTemplateToArgv(editorArgsTpl, file, line);
  const debugMsgs = [`EDITOR: ${[editorCmd, ...argv].join(' ')}`];

  try {
    const child = spawn(editorCmd, argv, { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    return { ok: true, debug: debugMsgs };
  } catch (e) {
    // WinError 740 -> requires elevation; fall back to "cmd /c start"
    if (process.platform === 'win32' && (e.code === 'EACCES' || e.errno === -4092 || /740/.test(String(e)))) {
      debugMsgs.push('Elevation required (740). Fallback: cmd /c start ...');
      try {
        const quoted = [editorCmd, ...argv]
          .map((c) => (/[\s\t]/.test(c) ? `"${c}"` : c))
          .join(' ');
        const fallback = `start "" ${quoted}`;
        debugMsgs.push(`FALLBACK: cmd /c ${fallback}`);
        const child = spawn('cmd.exe', ['/c', fallback], { detached: true, stdio: 'ignore', windowsHide: true, shell: false });
        child.unref();
        return { ok: true, debug: debugMsgs };
      } catch (e2) {
        return { ok: false, debug: debugMsgs, error: `Elevation issue (740) and fallback failed: ${e2}` };
      }
    }
    return { ok: false, debug: debugMsgs, error: String(e) };
  }
}

module.exports = { editorTemplateToArgv, launchEditor };
