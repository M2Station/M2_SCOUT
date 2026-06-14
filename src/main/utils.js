// ============================================================
// M2_SCOUT - basic utilities (ported from M2_SEEK.py helpers)
// ============================================================

'use strict';

function nowTs() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function stripWrappingQuotes(s) {
  if (s && s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

// split on ; , whitespace
function splitTokens(s) {
  return ((s || '').trim())
    .split(/[;,\s\t]+/)
    .filter((x) => x.length > 0);
}

// Parse keyword text into a list, honoring quoted phrases.
function parseKeywords(text) {
  let t = (text || '').trim();
  if (!t) return [];
  t = t.replace(/;/g, ' ').replace(/,/g, ' ');
  const parts = shlexSplit(t).map((p) => stripWrappingQuotes(p.trim())).filter((p) => p.length > 0);
  return parts;
}

// A small shlex.split(posix=False)-like tokenizer: splits on whitespace but
// keeps double/single quoted segments together (quotes preserved like Windows).
function shlexSplit(s) {
  const out = [];
  let cur = '';
  let quote = null;
  let has = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has) {
        out.push(cur);
        cur = '';
        has = false;
      }
    } else {
      cur += ch;
      has = true;
    }
  }
  if (has) out.push(cur);
  return out;
}

// Quote a single argument for display (Windows-ish), used only for DEBUG output.
function quoteArg(a) {
  const s = String(a);
  if (s.length === 0) return '""';
  if (/[\s"]/.test(s)) {
    return '"' + s.replace(/"/g, '\\"') + '"';
  }
  return s;
}

function formatCmdline(cmd) {
  return (cmd || []).filter((c) => c !== null && c !== undefined).map(quoteArg).join(' ');
}

function toBool(v, dflt = false) {
  if (v === undefined || v === null) return dflt;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(s);
}

module.exports = {
  nowTs,
  stripWrappingQuotes,
  splitTokens,
  parseKeywords,
  shlexSplit,
  formatCmdline,
  quoteArg,
  toBool,
};
