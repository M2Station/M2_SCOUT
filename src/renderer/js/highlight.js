// ============================================================
// M2_SCOUT - client-side preview highlighter
// Replicates M2_SEEK Tk tag layering: syntax foreground (priority-based)
// + keyword match background (hl) + F3 current-hit (f3hit).
// ============================================================

'use strict';

const SYN_PRIORITY = {
  syn_comment: 1,
  syn_string: 2,
  syn_number: 3,
  syn_keyword: 4,
  syn_type: 5,
  syn_decorator: 6,
  syn_common_kw: 7,
};

const MAX_CHARS_FOR_HL = 180000;

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pick the highlight sections relevant for a file extension.
function pickSections(hlRules, ext) {
  const out = [];
  const lext = (ext || '').toLowerCase();
  if (hlRules.common) out.push(hlRules.common);
  for (const [name, sec] of Object.entries(hlRules)) {
    if (name === 'common') continue;
    if (lext && Array.isArray(sec.extensions) && sec.extensions.includes(lext)) out.push(sec);
  }
  return out;
}

// Build highlighted HTML for the preview text. Returns { html, runCount }.
function buildHighlightedHtml(text, sections, keywords, caseSensitive) {
  const n = text.length;
  if (n === 0) return { html: '', runCount: 0 };

  const fgClass = new Array(n).fill(null);
  const fgPrio = new Array(n).fill(0);
  const hl = new Array(n).fill(false);

  const tooBig = n > MAX_CHARS_FOR_HL;

  // ---- syntax foreground ----
  if (!tooBig) {
    for (const sec of sections) {
      for (const rule of sec.rules || []) {
        let re;
        try {
          re = new RegExp(rule.source, rule.flags.includes('g') ? rule.flags : rule.flags + 'g');
        } catch (_e) {
          continue;
        }
        const prio = SYN_PRIORITY[rule.tag] || 0;
        let m;
        let guard = 0;
        // eslint-disable-next-line no-cond-assign
        while ((m = re.exec(text)) !== null) {
          if (m.index === re.lastIndex) re.lastIndex += 1; // zero-length guard
          const a = m.index;
          const b = a + m[0].length;
          if (b <= a) { guard += 1; if (guard > n) break; continue; }
          for (let i = a; i < b; i += 1) {
            if (prio > fgPrio[i]) { fgPrio[i] = prio; fgClass[i] = rule.tag; }
          }
        }
      }
    }
  }

  // ---- keyword background (hl) ----
  let runCount = 0;
  if (!tooBig && keywords && keywords.length) {
    const kws = [...new Set(keywords.filter(Boolean))].sort((a, b) => b.length - a.length);
    const pat = kws.map(reEscape).join('|');
    if (pat) {
      let re;
      try {
        re = new RegExp(pat, caseSensitive ? 'g' : 'gi');
      } catch (_e) {
        re = null;
      }
      if (re) {
        let m;
        // eslint-disable-next-line no-cond-assign
        while ((m = re.exec(text)) !== null) {
          if (m.index === re.lastIndex) re.lastIndex += 1;
          const a = m.index;
          const b = a + m[0].length;
          for (let i = a; i < b; i += 1) hl[i] = true;
        }
      }
    }
  }

  // ---- assign contiguous hl run ids ----
  const runId = new Array(n).fill(-1);
  let curRun = -1;
  for (let i = 0; i < n; i += 1) {
    if (hl[i]) {
      if (i === 0 || !hl[i - 1]) { curRun += 1; }
      runId[i] = curRun;
    }
  }
  runCount = curRun + 1;

  // ---- coalesce into spans ----
  let html = '';
  let i = 0;
  while (i < n) {
    const fc = fgClass[i];
    const h = hl[i];
    const rid = runId[i];
    let j = i + 1;
    while (j < n && fgClass[j] === fc && hl[j] === h && runId[j] === rid) j += 1;
    const chunk = escapeHtml(text.slice(i, j));
    if (!fc && !h) {
      html += chunk;
    } else {
      const classes = [];
      if (fc) classes.push(fc);
      if (h) classes.push('hl');
      const attr = h ? ` data-hl="${rid}"` : '';
      html += `<span class="${classes.join(' ')}"${attr}>${chunk}</span>`;
    }
    i = j;
  }

  return { html, runCount };
}

window.M2ScoutHighlight = { pickSections, buildHighlightedHtml, MAX_CHARS_FOR_HL };
