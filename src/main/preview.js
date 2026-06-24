/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - preview builder
// Ported from build_preview_text (uses literal fixed-string matching,
// equivalent to ripgrep --fixed-strings used by M2_SEEK).
// ============================================================

'use strict';

const fs = require('fs');
const { PreviewConfig } = require('./config');

function mergeRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = ranges.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const merged = [sorted[0].slice()];
  for (let i = 1; i < sorted.length; i += 1) {
    const [s, e] = sorted[i];
    const last = merged[merged.length - 1];
    if (s <= last[1] + 1) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }
  return merged;
}

// Build the preview text for a file given keywords. Returns a string with
// "N: line" prefixes and optional block separators.
async function buildPreviewText(filePath, keywords, caseSensitive, contextLines) {
  let raw;
  try {
    raw = await fs.promises.readFile(filePath, 'utf8');
  } catch (e) {
    return `(Failed to open file)\n${e}\n`;
  }
  const allLines = raw.split(/\r?\n/);
  const total = allLines.length;
  if (total === 0) return '(Empty file)\n';

  // Normalise the keyword needles once. For case-insensitive matching we also
  // lowercase each line a single time (instead of once per keyword) below.
  const needles = [];
  for (const kw of keywords) {
    const n = caseSensitive ? kw : (kw || '').toLowerCase();
    if (n) needles.push(n);
  }

  // Single pass over the file, testing every keyword per line. Pushing line
  // numbers in ascending order yields an already-sorted, duplicate-free list,
  // so no Set or sort is needed afterwards.
  const matchLines = [];
  if (needles.length) {
    for (let i = 0; i < total; i += 1) {
      const hay = caseSensitive ? allLines[i] : allLines[i].toLowerCase();
      for (let k = 0; k < needles.length; k += 1) {
        if (hay.includes(needles[k])) {
          matchLines.push(i + 1);
          break;
        }
      }
    }
  }

  if (matchLines.length === 0) {
    const headN = 10;
    const n = Math.min(headN, total);
    const out = ['(No matches in this file with current keyword(s). Show file head)', ''];
    out.push(`----- file head (first ${n} lines) -----`);
    for (let ln = 1; ln <= n; ln += 1) out.push(`${ln}: ${allLines[ln - 1]}`);
    return out.join('\n') + '\n';
  }

  let ranges = [];
  for (const ln of matchLines) {
    const s = Math.max(1, ln - contextLines);
    const e = Math.min(total, ln + contextLines);
    ranges.push([s, e]);
  }
  if (PreviewConfig.MERGE_OVERLAPPED_CONTEXT_BLOCKS) ranges = mergeRanges(ranges);

  const out = [];
  ranges.forEach(([s, e], i) => {
    if (PreviewConfig.SHOW_BLOCK_SEPARATORS && ranges.length > 1) {
      out.push(`----- block ${i + 1}/${ranges.length}  lines ${s}-${e} -----`);
    }
    for (let ln = s; ln <= e; ln += 1) out.push(`${ln}: ${allLines[ln - 1]}`);
    if (PreviewConfig.SHOW_BLOCK_SEPARATORS && i !== ranges.length - 1) out.push('');
  });
  return out.join('\n') + '\n';
}

module.exports = { buildPreviewText };
