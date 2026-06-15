/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - configuration constants
// Ported from M2_SEEK.py config classes (AppConfig, UIConfig, ...)
// ============================================================

'use strict';

const DEBUG = true;

const AppConfig = {
  INI_FILENAME: 'M2_SCOUT.ini',
  EXCLUDE_GROUP_INI: 'M2_SCOUT_EXCLUDE_GROUPS.ini',
  HL_INI: 'M2_SCOUT_HL.ini',
};

const UIConfig = {
  FONT_FAMILY: 'Source Code Pro',
  FONT_SIZE: 13, // px (Tk size 10 -> ~13px on screen)
  FONT_FALLBACK: 'Segoe UI',

  FILES_HL_BG: '#b7f7b7',
  FILES_FILTER_BG: '#d9d9d9',
  FILES_COLOR_MATCH_CASE_SENSITIVE: false,
  FILES_COLOR_DEBOUNCE_MS: 120,
};

const EditorConfig = {
  DEFAULT_CMD: 'code',
  DEFAULT_ARGS_TEMPLATE: '-g "$(FILEPATH):$(LINENUM)" -r',
  REQUIRE_LINENO_PREFIX: true,
};

const ToolConfig = {
  DEFAULT_RG_EXE: 'rg.exe',
  DEFAULT_FD_EXE: 'fd.exe',
  DEFAULT_CSCOPE_EXE: 'cscope',
};

const PreviewConfig = {
  CONTEXT_LINES: 10,
  MERGE_OVERLAPPED_CONTEXT_BLOCKS: true,
  SHOW_BLOCK_SEPARATORS: true,
  DEBOUNCE_MS: 120,
  CACHE_MAX: 80,
  MAX_CHARS_FOR_HL: 180000,
  DEFER_HIGHLIGHT_MS: 30,
};

const HighlightConfig = {
  KEYWORD_MATCH_BG: '#FFEB3B',
  KEYWORD_MATCH_FG: null,
  F3_HIT_BG: '#FF9800',
  F3_HIT_FG: '#000000',
  CSCOPE_HL_BG: '#7FFFD4',
  CSCOPE_HL_FG: null,
  // foreground colors per syntax tag (from M2_SEEK tag_configure)
  SYN_COLORS: {
    syn_comment: '#6A737D',
    syn_string: '#22863A',
    syn_number: '#6F42C1',
    syn_keyword: '#005CC5',
    syn_type: '#B31D28',
    syn_decorator: '#B08800',
    syn_common_kw: '#D73A49',
  },
  // tag priority (higher wins for overlapping foreground), matches Tk creation order
  SYN_PRIORITY: {
    syn_comment: 1,
    syn_string: 2,
    syn_number: 3,
    syn_keyword: 4,
    syn_type: 5,
    syn_decorator: 6,
    syn_common_kw: 7,
  },
};

const LiveUpdateConfig = {
  FLUSH_MS: 80,
  // Adaptive live-flush throttle (P5): the flush interval ramps from FLUSH_MS
  // (responsive, small result sets) up to FLUSH_MS_MAX (calmer, big result
  // sets) as the live result count grows from ADAPT_FROM to ADAPT_TO. This
  // keeps the UI snappy for small searches but cuts repaint CPU on huge ones.
  FLUSH_MS_MAX: 300,
  ADAPT_FROM: 500,
  ADAPT_TO: 5000,
  SHOW_LIMIT: 2000,
};

const SearchConfig = {
  NO_IGNORE_STRONG_WHEN_UNCHECKED: false,
  PARALLEL_AND_THRESHOLD: 2,
};

module.exports = {
  DEBUG,
  AppConfig,
  UIConfig,
  EditorConfig,
  ToolConfig,
  PreviewConfig,
  HighlightConfig,
  LiveUpdateConfig,
  SearchConfig,
};
