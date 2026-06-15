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
function rgSearchArgs(folder, keyword, inc, exd, exf, caseSensitive, respectIgnoreFiles) {
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

  args.push(keyword, folder);
  return args;
}

module.exports = { rgSearchArgs };
