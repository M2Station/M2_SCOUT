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
// IMPORTANT: child_process.spawn reports a missing executable (ENOENT) via an
// asynchronous 'error' event, NOT a thrown exception. If that event has no
// listener it becomes an uncaught exception and crashes the Electron main
// process. We therefore attach an 'error' handler to every child we spawn.
function launchEditor(editorCmd, editorArgsTpl, file, line) {
  const argv = editorTemplateToArgv(editorArgsTpl, file, line);
  const debugMsgs = [`EDITOR: ${[editorCmd, ...argv].join(' ')}`];

  // Spawn a child and swallow async spawn errors (logging them to debug) so a
  // bad editor path can never crash the app.
  const safeSpawn = (cmd, args, opts) => {
    const child = spawn(cmd, args, opts);
    child.on('error', (err) => {
      debugMsgs.push(`Editor launch error: ${err && err.message ? err.message : err}`);
    });
    child.unref();
    return child;
  };

  try {
    if (process.platform === 'win32') {
      // On Windows the editor command is frequently a .cmd shim (e.g. VS Code's
      // `code` -> code.cmd) which CreateProcess cannot spawn directly (ENOENT).
      // Run it through the shell (cmd.exe /c) so PATH/PATHEXT resolution applies
      // to shims and absolute .exe paths alike. We deliberately do NOT use
      // `start`: start detaches immediately, so VS Code's CLI gets killed before
      // it can hand the "open file" request to the already-running instance and
      // the file never opens. `cmd /c "code ..."` waits for the CLI to deliver
      // the request, then exits. Quote tokens with spaces; cmd strips the single
      // outer quote pair Node adds, leaving inner quotes intact.
      const quote = (c) => (/\s/.test(c) ? `"${c}"` : c);
      const cmdline = [editorCmd, ...argv].map(quote).join(' ');
      debugMsgs.push(`WIN LAUNCH: cmd /c ${cmdline}`);
      safeSpawn(cmdline, [], {
        detached: true, stdio: 'ignore', windowsHide: true, shell: true,
      });
      return { ok: true, debug: debugMsgs };
    }

    // Non-Windows: spawn the editor directly.
    safeSpawn(editorCmd, argv, { detached: true, stdio: 'ignore' });
    return { ok: true, debug: debugMsgs };
  } catch (e) {
    return { ok: false, debug: debugMsgs, error: String(e) };
  }
}

module.exports = { editorTemplateToArgv, launchEditor };
