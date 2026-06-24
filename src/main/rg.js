/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - ripgrep command builder
// Ported from rg_search_cmd
// ============================================================

'use strict';

const { SearchConfig } = require('./config');

// Build the ripgrep argv (without the exe). Emits --json --stats and uses
// fixed-strings literal matching, matching M2_SEEK behavior.
//
// `keywords` may be a single string or an array. When several patterns are
// passed they are emitted as multiple `-e` patterns so ripgrep matches their
// union (OR) in a SINGLE filesystem scan instead of one process per keyword.
function rgSearchArgs(folder, keywords, inc, exd, exf, caseSensitive, respectIgnoreFiles) {
  const args = ['--json', '--stats', '--fixed-strings'];

  if (!respectIgnoreFiles) {
    args.push('--no-ignore');
    if (SearchConfig.NO_IGNORE_STRONG_WHEN_UNCHECKED) {
      args.push('--no-ignore-parent', '--no-ignore-vcs');
    }
  }

  if (!caseSensitive) args.push('--ignore-case');

  for (const g of [...inc, ...exd, ...exf]) {
    args.push('-g', g);
  }

  // `-e` also protects patterns that start with '-' from being parsed as flags.
  const kws = Array.isArray(keywords) ? keywords : [keywords];
  for (const kw of kws) args.push('-e', kw);

  args.push(folder);
  return args;
}

module.exports = { rgSearchArgs };
