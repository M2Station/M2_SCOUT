/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - INI read/write (compatible with Python configparser output)
// Format: [section] / key = value  (keys are lowercased on read)
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { iniPath, excludeGroupIniPath, hlIniPath, settingsDir, appDir } = require('./paths');

// Parse an INI string into { section: { key: value } } (sections & keys lowercased).
function parseIni(text) {
  const out = {};
  let section = null;
  const lines = (text || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/^\uFEFF/, '');
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith(';') || t.startsWith('#')) continue;
    const sm = t.match(/^\[(.+?)\]\s*$/);
    if (sm) {
      section = sm[1].trim().toLowerCase();
      if (!out[section]) out[section] = {};
      continue;
    }
    if (section === null) continue;
    // key = value  (also accept key: value)
    const eq = line.indexOf('=');
    const colon = line.indexOf(':');
    let sep = -1;
    if (eq >= 0 && (colon < 0 || eq < colon)) sep = eq;
    else if (colon >= 0) sep = colon;
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (key) out[section][key] = value;
  }
  return out;
}

// Serialize { key: value } under a single section.
function serializeSection(sectionName, data) {
  let s = `[${sectionName}]\n`;
  for (const [k, v] of Object.entries(data)) {
    s += `${k} = ${v === undefined || v === null ? '' : String(v)}\n`;
  }
  s += '\n';
  return s;
}

function readFileSafe(p) {
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  } catch (_e) {
    /* ignore */
  }
  return null;
}

// When running as a packaged app, INI files live in settingsDir() (userData).
// On first run that directory has no INI files yet.  If a same-named file
// exists next to the exe (placed there by the installer as a template or
// carried over from an older dev run), copy it so the user's previous
// settings are preserved.  The copy is best-effort; failure is silently
// ignored.
function migrateIniIfNeeded(destPath) {
  if (fs.existsSync(destPath)) return; // already present – nothing to do
  try {
    const srcPath = path.join(appDir(), path.basename(destPath));
    if (srcPath !== destPath && fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  } catch (_e) {
    /* best-effort */
  }
}

// Ensure the directory for a settings file exists (in case userData dir was
// just created and subdirectories are needed).
function ensureDir(filePath) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_e) {
    /* ignore */
  }
}

// ---- main settings INI ([search]) ----
function loadIniRaw() {
  const p = iniPath();
  migrateIniIfNeeded(p);
  const text = readFileSafe(p);
  if (!text) return {};
  const parsed = parseIni(text);
  return parsed.search ? { ...parsed.search } : {};
}

function saveIniRaw(data) {
  const p = iniPath();
  ensureDir(p);
  const out = serializeSection('search', data || {});
  fs.writeFileSync(p, out, 'utf8');
}

// ---- exclude group INI ([groups]) ----
function loadExcludeGroupIni() {
  const p = excludeGroupIniPath();
  migrateIniIfNeeded(p);
  const text = readFileSafe(p);
  if (!text) return {};
  const parsed = parseIni(text);
  return parsed.groups ? { ...parsed.groups } : {};
}

function ensureExcludeGroupIniExists() {
  const p = excludeGroupIniPath();
  migrateIniIfNeeded(p);
  if (fs.existsSync(p)) return;
  const groups = {
    exd_1: '.git;node_modules;build;dist;out;bin;obj;.vs',
    exf_1: '*.obj;*.pch;*.pdb;*.dll;*.exe;*.log;*.tmp',
    exd_js: 'node_modules;dist',
    exf_js: '*.map;*.min.js',
  };
  fs.writeFileSync(p, serializeSection('groups', groups), 'utf8');
}

// ---- highlight INI (multiple sections) ----
function ensureHlIniExists() {
  const p = hlIniPath();
  migrateIniIfNeeded(p);
  if (fs.existsSync(p)) return;
  const sections = {
    common: {
      string_regex: '(?:"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')',
      number_regex: '\\b\\d+(?:\\.\\d+)?\\b',
      common_keywords: 'TODO FIXME NOTE WARNING IMPORTANT HACK BUG XXX TEMP DEPRECATED',
    },
    c: {
      extensions: '.c;.h;.cpp;.cc;.hpp;.hh;.inl',
      comment_regex: '//.*?$|/\\*.*?\\*/',
      keywords:
        'auto break case char const continue default do double else enum extern ' +
        'float for goto if inline int long register restrict return short signed sizeof ' +
        'static struct switch typedef union unsigned void volatile while ' +
        'class namespace public private protected template typename using ' +
        'nullptr true false',
      types_regex:
        '\\b(?:uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|size_t|ssize_t|bool|wchar_t)\\b',
    },
    python: {
      extensions: '.py;.pyw',
      comment_regex: '#.*?$',
      keywords:
        'False None True and as assert async await break class continue def del elif else ' +
        'except finally for from global if import in is lambda nonlocal not or pass raise ' +
        'return try while with yield',
      decorator_regex: '^\\s*@\\w+(?:\\.\\w+)*',
    },
  };
  let out = '';
  for (const [name, data] of Object.entries(sections)) {
    out += serializeSection(name, data);
  }
  fs.writeFileSync(p, out, 'utf8');
}

function loadHlIni() {
  const text = readFileSafe(hlIniPath());
  if (!text) return {};
  const parsed = parseIni(text);
  const out = {};
  for (const [sec, data] of Object.entries(parsed)) {
    out[sec.toLowerCase()] = { ...data };
  }
  return out;
}

module.exports = {
  parseIni,
  loadIniRaw,
  saveIniRaw,
  loadExcludeGroupIni,
  ensureExcludeGroupIniExists,
  ensureHlIniExists,
  loadHlIni,
};
