/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - stage per-architecture native search tools.
//
// electron-builder ships one app per CPU target (x64 + arm64). The bundled
// search tools (rg.exe / fd.exe / cscope.exe) are NATIVE binaries, so each
// installer must carry the matching architecture. This script extracts the
// correct Windows binaries out of TOOLS/ZIP into build/tools/<arch>/, and
// package.json wires those folders into each pack via:
//
//     extraFiles: [{ from: "build/tools/${arch}", to: "TOOLS" }]
//
// Mapping (electron-builder ${arch} -> ripgrep/fd asset platform token):
//     x64   -> x86_64    (native)
//     arm64 -> aarch64   (native)
//
// cscope has no aarch64 Windows build, so the x64 cscope.exe is reused for
// arm64 (it runs under the Windows on ARM x64 emulation layer).
//
// The script is idempotent: it wipes build/tools/ and rebuilds it. It only
// uses Node core + PowerShell's Expand-Archive (the build host is Windows).
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const zipDir = path.join(repoRoot, 'TOOLS', 'ZIP');
const outRoot = path.join(repoRoot, 'build', 'tools');

// electron-builder ${arch} value -> ripgrep/fd asset platform token.
const ARCHES = {
  x64: 'x86_64',
  arm64: 'aarch64',
};

function log(msg) { console.log(`==> ${msg}`); }
function fail(msg) { console.error(`ERR ${msg}`); process.exit(1); }

function listZips() {
  try {
    return fs.readdirSync(zipDir).filter((f) => f.toLowerCase().endsWith('.zip'));
  } catch (_e) {
    return [];
  }
}

// Compare dotted version strings ("a.b.c"). Returns 1 / 0 / -1.
function verCmp(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

// From the zip list, pick the highest-version name matching `re` (group 1 = version).
function pickHighest(zips, re) {
  let best = null;
  for (const name of zips) {
    const m = name.match(re);
    if (!m) continue;
    const ver = m[1] || '0';
    if (!best || verCmp(ver, best.ver) > 0) best = { name, ver };
  }
  return best ? best.name : null;
}

// Recursively find the first file whose basename matches `name` (case-insensitive).
function findFile(root, name) {
  const target = name.toLowerCase();
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { entries = []; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.name.toLowerCase() === target) return full;
    }
  }
  return null;
}

// Extract one exe out of a zip in TOOLS/ZIP into destDir.
function extract(zipName, exeName, destDir) {
  const zipPath = path.join(zipDir, zipName);
  const tmp = path.join(outRoot, `_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const cmd = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' `
      + `-DestinationPath '${tmp.replace(/'/g, "''")}' -Force`;
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
      encoding: 'utf8', timeout: 120000, windowsHide: true,
    });
    if (r.status !== 0) fail(`Expand-Archive failed for ${zipName}: ${(r.stderr || '').trim() || r.status}`);
    const src = findFile(tmp, exeName);
    if (!src) fail(`${exeName} not found inside ${zipName}`);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, path.join(destDir, exeName));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const zips = listZips();
  if (!zips.length) fail(`No tool archives found in ${zipDir}`);

  // cscope ships a single (x64) build shared by every architecture.
  const csZip = pickHighest(zips, /^cscope-(\d+(?:\.\d+)*)\.zip$/i)
    || zips.find((z) => /^cscope.*\.zip$/i.test(z));
  if (!csZip) fail('No cscope archive in TOOLS/ZIP');

  // Start from a clean staging tree (never touches build/installer.nsh).
  fs.rmSync(outRoot, { recursive: true, force: true });

  for (const [arch, plat] of Object.entries(ARCHES)) {
    const destDir = path.join(outRoot, arch);
    log(`Staging ${arch} tools (${plat})`);

    const rgZip = pickHighest(zips, new RegExp(`^ripgrep-(\\d+\\.\\d+\\.\\d+)-${plat}-pc-windows-msvc\\.zip$`, 'i'));
    const fdZip = pickHighest(zips, new RegExp(`^fd-v?(\\d+\\.\\d+\\.\\d+)-${plat}-pc-windows-msvc\\.zip$`, 'i'));
    if (!rgZip) fail(`No ripgrep ${plat} archive in TOOLS/ZIP`);
    if (!fdZip) fail(`No fd ${plat} archive in TOOLS/ZIP`);

    extract(rgZip, 'rg.exe', destDir);
    extract(fdZip, 'fd.exe', destDir);
    extract(csZip, 'cscope.exe', destDir);
    log(`  rg.exe     <- ${rgZip}`);
    log(`  fd.exe     <- ${fdZip}`);
    log(`  cscope.exe <- ${csZip}`);
  }

  log(`Tool staging complete -> ${path.relative(repoRoot, outRoot)}`);
}

main();
