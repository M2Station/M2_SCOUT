/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - static feature self-tests
//
// Fast, dependency-free guards that run on every PR to catch regressions
// that broke real features in the past WITHOUT launching Electron or a DOM:
//
//   1. Every source file still parses (node --check).
//   2. No class defines the same method twice. A duplicate silently shadows
//      the earlier one - this is exactly what broke the "Select Folder"
//      button + Alt+F (two `_selectFolder` methods).
//   3. The global keyboard shortcuts are still wired and routed correctly,
//      incl. Alt+F / Esc being handled before the "user is typing" guard.
//   4. Every `data-action` button in index.html is wired to a handler, so a
//      button can never silently become a no-op.
//   5. The author-signature icon stays an inline <svg> (not the old "GH" text).
//
// Run with:  npm test     (alias for: node --test test/selftest.test.js)
// ============================================================

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

// Recursively list every .js file under a directory.
function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}

// ------------------------------------------------------------
// Lightweight class/method scanner.
//
// The codebase convention (verified for the renderer) is: classes are
// declared at column 0 and their methods are indented exactly two spaces, so
// the class body runs until the first column-0 `}`. That lets us collect
// method definitions reliably without a full JS parser or extra dependency.
// ------------------------------------------------------------
// Match a method definition at EXACTLY two-space indent (the class-body level).
// Modifiers must follow the indent immediately, so deeper-indented call sites
// like `    act('x', ...)` or `      this.set(...)` are NOT mistaken for methods.
const METHOD_RE = /^ {2}(?:static )?(?:async )?(?:\* ?)?(get |set )?([#A-Za-z_$][\w$]*)\s*\(/;
// Keywords that can look like `name(` at 2-space indent but are not methods.
const NON_METHOD = new Set(['if', 'for', 'while', 'switch', 'catch', 'do', 'else', 'return', 'function']);

function classesIn(source) {
  const lines = source.split(/\r?\n/);
  const classes = [];
  for (let i = 0; i < lines.length; i += 1) {
    const decl = /^class\s+([A-Za-z_$][\w$]*)/.exec(lines[i]);
    if (!decl) continue;
    const methods = [];
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      if (/^\}/.test(lines[j])) break; // a column-0 brace closes the class body
      const m = METHOD_RE.exec(lines[j]);
      if (!m) continue;
      const name = m[2];
      if (NON_METHOD.has(name)) continue;
      const kind = m[1] ? m[1].trim() : 'method'; // get / set / method (so get x and set x don't collide)
      methods.push({ key: `${kind} ${name}`, name, line: j + 1 });
    }
    classes.push({ name: decl[1], methods });
    i = j;
  }
  return classes;
}

function tabMethodNames(source) {
  const tab = classesIn(source).find((c) => c.name === 'Tab');
  return new Set((tab ? tab.methods : []).map((m) => m.name));
}

// ------------------------------------------------------------
// 1. Every source file parses.
// ------------------------------------------------------------
test('all source JS parses (node --check)', () => {
  const files = listJsFiles(SRC);
  assert.ok(files.length > 0, 'no source files found');
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (err) {
      const detail = (err.stderr && err.stderr.toString()) || err.message;
      assert.fail(`Syntax error in ${rel(file)}:\n${detail}`);
    }
  }
});

// ------------------------------------------------------------
// 2. No duplicate method names in a class (the _selectFolder collision).
// ------------------------------------------------------------
test('no class defines the same method twice', () => {
  const problems = [];
  for (const file of listJsFiles(SRC)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const cls of classesIn(source)) {
      const seen = new Map();
      for (const m of cls.methods) {
        if (seen.has(m.key)) {
          problems.push(
            `${rel(file)}: class ${cls.name} re-defines "${m.key}" `
            + `(lines ${seen.get(m.key)} and ${m.line}) - the later one silently shadows the first`,
          );
        } else {
          seen.set(m.key, m.line);
        }
      }
    }
  }
  assert.deepEqual(problems, [], `Duplicate class methods found:\n${problems.join('\n')}`);
});

// ------------------------------------------------------------
// 3. Global keyboard shortcuts stay wired and correctly routed.
// ------------------------------------------------------------
test('global keyboard shortcuts are wired and routed correctly', () => {
  const src = read('src/renderer/js/renderer.js');
  const at = src.indexOf("addEventListener('keydown'");
  assert.ok(at >= 0, 'global keydown handler not found in renderer.js');
  const region = src.slice(at);

  // Alt+F (Select Folder) and Esc (Stop) must be handled BEFORE the
  // "is the user typing in a field?" guard, so they fire regardless of focus.
  const guard = region.indexOf('isTypingTarget) return');
  const altF = region.indexOf("e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'f'");
  const esc = region.search(/e\.key === 'Escape'/);
  assert.ok(guard >= 0, 'the isTypingTarget guard is missing');
  assert.ok(altF >= 0 && altF < guard, 'Alt+F must be handled BEFORE the typing-target guard');
  assert.ok(esc >= 0 && esc < guard, 'Esc must be handled BEFORE the typing-target guard');

  const bindings = [
    [/altKey && !e\.ctrlKey && !e\.metaKey && \(e\.key === 'f'[\s\S]{0,120}?_selectFolder\(/, 'Alt+F -> _selectFolder (Select Folder)'],
    [/e\.key === 'Escape'[\s\S]{0,120}?\.stop\(\)/, 'Esc -> stop()'],
    [/ctrlKey && \(e\.key === 'f'[\s\S]{0,120}?focusKeywords\(/, 'Ctrl+F -> focusKeywords'],
    [/ctrlKey && \(e\.key === 'd'[\s\S]{0,120}?focusFilter\(/, 'Ctrl+D -> focusFilter'],
    [/ctrlKey && \(e\.key === 't'[\s\S]{0,120}?manager\.add\(/, 'Ctrl+T -> new tab'],
    [/ctrlKey && \(e\.key === 'w'[\s\S]{0,120}?manager\.closeCurrent\(/, 'Ctrl+W -> close tab'],
    [/altKey && e\.key === 'ArrowDown'[\s\S]{0,120}?focusFiles\(/, 'Alt+Down -> focusFiles'],
  ];
  for (const [re, label] of bindings) {
    assert.match(region, re, `Broken or missing hotkey binding: ${label}`);
  }

  // The methods those shortcuts invoke must exist on the Tab class.
  const tab = tabMethodNames(src);
  for (const need of ['_selectFolder', 'stop', 'focusKeywords', 'focusFilter', 'focusFiles']) {
    assert.ok(tab.has(need), `Tab class is missing method referenced by a hotkey: ${need}()`);
  }
});

// ------------------------------------------------------------
// 4. Every data-action button is wired to a click handler.
// ------------------------------------------------------------
test('every data-action button is wired to a handler', () => {
  const html = read('src/renderer/index.html');
  const js = read('src/renderer/js/renderer.js');
  const actions = [...new Set([...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]))];
  const wired = new Set([...js.matchAll(/act\('([^']+)'/g)].map((m) => m[1]));
  assert.ok(actions.length > 0, 'no data-action buttons found');
  const missing = actions.filter((a) => !wired.has(a));
  assert.deepEqual(missing, [], `data-action button(s) with no act() handler: ${missing.join(', ')}`);
});

// ------------------------------------------------------------
// 5. The author-signature icon stays an inline SVG (not the "GH" text).
// ------------------------------------------------------------
test('author signature uses the inline GitHub SVG mark', () => {
  const html = read('src/renderer/index.html');
  assert.match(html, /<svg class="gh-icon"/, 'gh-icon should be an inline <svg>, not text');
});
