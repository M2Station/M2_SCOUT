// ============================================================
// M2_SCOUT - glob builders for ripgrep -g options
// Ported from include_globs / exclude_dir_globs / exclude_file_globs
// ============================================================

'use strict';

const { splitTokens } = require('./utils');

// Include filter: "*.*" or empty => no include globs.
function includeGlobs(filterText) {
  const s = (filterText || '').trim();
  if (!s || s === '*.*') return [];
  return splitTokens(s);
}

// Exclude directory globs -> negated rg globs ("!dir/**").
function excludeDirGlobs(text) {
  const out = [];
  for (let t of splitTokens(text)) {
    t = t.replace(/\\/g, '/').trim();
    if (!t) continue;
    if (!t.includes('*') && !t.includes('?')) {
      t = t.replace(/\/+$/, '') + '/**';
    }
    if (!t.startsWith('!')) t = '!' + t;
    out.push(t);
  }
  return out;
}

// Exclude file globs -> negated rg globs ("!*.log").
function excludeFileGlobs(text) {
  const out = [];
  for (let t of splitTokens(text)) {
    t = t.replace(/\\/g, '/').trim();
    if (!t) continue;
    if (!t.startsWith('!')) t = '!' + t;
    out.push(t);
  }
  return out;
}

module.exports = { includeGlobs, excludeDirGlobs, excludeFileGlobs };
