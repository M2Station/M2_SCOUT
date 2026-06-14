// ============================================================
// M2_SCOUT - highlight rule compiler
// Ported from _compile_one_section / _compile_hl_rules.
// Produces JS-RegExp-ready descriptors for the renderer.
// ============================================================

'use strict';

const { splitTokens } = require('./utils');
const { loadHlIni, ensureHlIniExists } = require('./ini');

function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Compile one section dict into { extensions:[], rules:[{tag, source, flags}] }.
function compileSection(sec) {
  const extensions = [];
  const exts = sec.extensions || '';
  if (exts) {
    for (const e of splitTokens(exts.replace(/,/g, ';'))) {
      extensions.push(e.trim().toLowerCase());
    }
  }

  const rules = [];
  const add = (tag, source, flags) => {
    if (!source) return;
    rules.push({ tag, source, flags });
  };

  add('syn_string', sec.string_regex || '', 'gm');
  add('syn_number', sec.number_regex || '', 'gm');

  const ckws = sec.common_keywords || '';
  if (ckws) {
    const list = ckws.split(/\s+/).filter(Boolean);
    if (list.length) add('syn_common_kw', `\\b(?:${list.map(reEscape).join('|')})\\b`, 'gm');
  }

  if (sec.comment_regex) add('syn_comment', sec.comment_regex, 'gms');
  if (sec.decorator_regex) add('syn_decorator', sec.decorator_regex, 'gm');

  const kws = sec.keywords || '';
  if (kws) {
    const list = kws.split(/\s+/).filter(Boolean);
    if (list.length) add('syn_keyword', `\\b(?:${list.map(reEscape).join('|')})\\b`, 'gm');
  }

  if (sec.types_regex) add('syn_type', sec.types_regex, 'gm');

  return { extensions, rules };
}

// Load all HL sections from the INI and compile them.
function loadCompiledHlRules() {
  ensureHlIniExists();
  const raw = loadHlIni();
  const out = {};
  for (const [name, sec] of Object.entries(raw)) {
    out[name.toLowerCase()] = compileSection(sec);
  }
  return out;
}

module.exports = { loadCompiledHlRules, compileSection };
