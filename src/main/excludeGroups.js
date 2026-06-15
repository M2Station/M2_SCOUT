/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - exclude group key resolution
// Ported from _lookup_group_key_value / _get_effective_excludes
// ============================================================

'use strict';

const { splitTokens } = require('./utils');

// Resolve a single group key to [realKey, value] using groups map first,
// then the [search] ini map, honoring the exd_/exf_/exclude_* aliases.
function lookupGroupKeyValue(key, groupRaw, iniRaw) {
  const k = (key || '').trim();
  if (!k) return [null, null];

  if (Object.prototype.hasOwnProperty.call(iniRaw, k)) return [k, String(iniRaw[k])];
  if (Object.prototype.hasOwnProperty.call(groupRaw, k)) return [k, String(groupRaw[k])];

  const lk = k.toLowerCase();

  const tryKeys = (keys) => {
    for (const kk of keys) {
      if (Object.prototype.hasOwnProperty.call(groupRaw, kk)) return [kk, String(groupRaw[kk])];
      if (Object.prototype.hasOwnProperty.call(iniRaw, kk)) return [kk, String(iniRaw[kk])];
    }
    return [null, null];
  };

  if (lk.startsWith('exclude_dir_')) {
    const suf = k.slice('exclude_dir_'.length);
    return tryKeys([`exd_${suf}`, `exclude_dirs_group_${suf}`]);
  }
  if (lk.startsWith('exclude_file_')) {
    const suf = k.slice('exclude_file_'.length);
    return tryKeys([`exf_${suf}`, `exclude_files_group_${suf}`]);
  }
  if (lk.startsWith('exd_')) {
    const suf = k.slice(4);
    return tryKeys([`exclude_dirs_group_${suf}`]);
  }
  if (lk.startsWith('exf_')) {
    const suf = k.slice(4);
    return tryKeys([`exclude_files_group_${suf}`]);
  }
  return [null, null];
}

// Combine manual excludes with resolved group keys.
// Returns { effDirs, effFiles, resolved: [[key, value|null], ...] }
function getEffectiveExcludes({ excludeDirs, excludeFiles, excludeGroupKeys, groupRaw, iniRaw }) {
  const manualDirs = (excludeDirs || '').trim();
  const manualFiles = (excludeFiles || '').trim();
  const keys = splitTokens(excludeGroupKeys || '');

  const groupDirsValues = [];
  const groupFilesValues = [];
  const resolved = [];

  for (const key of keys) {
    const [realK, val] = lookupGroupKeyValue(key, groupRaw || {}, iniRaw || {});
    if (val === null) {
      resolved.push([key, null]);
      continue;
    }
    resolved.push([realK, val]);
    const lk = realK.toLowerCase();
    if (lk.startsWith('exd_') || lk.startsWith('exclude_dirs_') || lk.startsWith('exclude_dir_')) {
      groupDirsValues.push(val);
    } else if (lk.startsWith('exf_') || lk.startsWith('exclude_files_') || lk.startsWith('exclude_file_')) {
      groupFilesValues.push(val);
    }
  }

  const groupDirs = groupDirsValues.filter((v) => v.trim()).join(';');
  const groupFiles = groupFilesValues.filter((v) => v.trim()).join(';');

  const effDirs = [manualDirs, groupDirs].filter((x) => x).join(';');
  const effFiles = [manualFiles, groupFiles].filter((x) => x).join(';');

  return { effDirs, effFiles, resolved, groupDirs, groupFiles };
}

module.exports = { lookupGroupKeyValue, getEffectiveExcludes };
