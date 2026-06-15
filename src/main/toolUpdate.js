/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - Tool updater (ripgrep / fd)
// Checks the bundled rg.exe / fd.exe versions against the latest GitHub
// release and, when out of date, downloads the matching Windows zip and
// extracts the executable into the TOOLS directory.
//
//   ripgrep -> https://github.com/BurntSushi/ripgrep   (asset rg.exe)
//   fd      -> https://github.com/sharkdp/fd           (asset fd.exe)
//
// Windows release assets are named like:
//   ripgrep-14.1.1-x86_64-pc-windows-msvc.zip
//   fd-v10.3.0-aarch64-pc-windows-msvc.zip
// so we select by "<platform>-pc-windows-msvc.zip" (platform = x86_64|aarch64).
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const { toolsDir, resolveExe } = require('./paths');

const REPOS = {
  rg: { owner: 'BurntSushi', repo: 'ripgrep', exe: 'rg.exe' },
  fd: { owner: 'sharkdp', repo: 'fd', exe: 'fd.exe' },
};

function normTool(t) { return t === 'fd' ? 'fd' : 'rg'; }
function normPlatform(p) { return p === 'aarch64' ? 'aarch64' : 'x86_64'; }

// Compare two "a.b.c" version strings. Returns 1 / 0 / -1.
function semverCmp(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

// Run "<exe> --version" and pull the first x.y.z token out of the output.
function getCurrentVersion(tool, exePath) {
  const meta = REPOS[normTool(tool)];
  const exe = resolveExe((exePath || '').trim() || meta.exe);
  try {
    const r = spawnSync(exe, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const m = out.match(/(\d+\.\d+\.\d+)/);
    return m ? m[1] : null;
  } catch (_e) {
    return null;
  }
}

// GET a URL following redirects. Resolves with a Buffer of the body.
function httpsGetBuffer(url, headers) {
  return new Promise((resolve, reject) => {
    const go = (u, redirects) => {
      const req = https.get(u, { headers }, (res) => {
        const code = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(code) && res.headers.location && redirects < 6) {
          res.resume();
          go(res.headers.location, redirects + 1);
          return;
        }
        if (code !== 200) {
          res.resume();
          reject(new Error(`HTTP ${code} for ${u}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', reject);
    };
    go(url, 0);
  });
}

// Stream-download a URL (following redirects) to a destination file.
function httpsDownload(url, dest, headers) {
  return new Promise((resolve, reject) => {
    const go = (u, redirects) => {
      const req = https.get(u, { headers }, (res) => {
        const code = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(code) && res.headers.location && redirects < 6) {
          res.resume();
          go(res.headers.location, redirects + 1);
          return;
        }
        if (code !== 200) {
          res.resume();
          reject(new Error(`HTTP ${code} for ${u}`));
          return;
        }
        const f = fs.createWriteStream(dest);
        res.pipe(f);
        f.on('finish', () => f.close(() => resolve()));
        f.on('error', (err) => { try { fs.unlinkSync(dest); } catch (_e) { /* ignore */ } reject(err); });
      });
      req.on('error', reject);
    };
    go(url, 0);
  });
}

const UA = { 'User-Agent': 'M2_SCOUT-tool-updater' };

async function getLatestRelease(tool) {
  const meta = REPOS[normTool(tool)];
  const api = `https://api.github.com/repos/${meta.owner}/${meta.repo}/releases/latest`;
  const body = await httpsGetBuffer(api, { ...UA, Accept: 'application/vnd.github+json' });
  const json = JSON.parse(body.toString('utf8'));
  const version = String(json.tag_name || '').replace(/^v/, '');
  const assets = (json.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url }));
  return { version, assets };
}

// Choose the Windows zip for the requested platform (prefer msvc, fall back to gnu).
function pickAsset(assets, platform) {
  const plat = normPlatform(platform);
  const msvc = new RegExp(`${plat}-pc-windows-msvc\\.zip$`, 'i');
  const gnu = new RegExp(`${plat}-pc-windows-gnu\\.zip$`, 'i');
  return assets.find((a) => msvc.test(a.name)) || assets.find((a) => gnu.test(a.name)) || null;
}

function extractZip(zipPath, destDir) {
  const cmd = `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
    encoding: 'utf8', timeout: 120000, windowsHide: true,
  });
  if (r.status !== 0) throw new Error(`Expand-Archive failed: ${(r.stderr || '').trim() || r.status}`);
}

// Recursively find the first file whose basename matches `name`.
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

function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_e) { /* ignore */ } }

// Check current vs latest. Returns { ok, tool, currentVersion, latestVersion, upToDate, asset }.
async function checkUpdate(params) {
  const tool = normTool(params && params.tool);
  const platform = normPlatform(params && params.platform);
  const current = getCurrentVersion(tool, params && params.exePath);
  const rel = await getLatestRelease(tool);
  const asset = pickAsset(rel.assets, platform);
  const upToDate = !!(current && rel.version && semverCmp(current, rel.version) >= 0);
  return {
    ok: true, tool, currentVersion: current, latestVersion: rel.version, upToDate, asset,
  };
}

// Download the matching zip and install the exe into TOOLS/.
async function downloadAndInstall(params) {
  const tool = normTool(params && params.tool);
  const platform = normPlatform(params && params.platform);
  const meta = REPOS[tool];

  let asset = params && params.asset;
  let version = params && params.version;
  if (!asset || !asset.url) {
    const rel = await getLatestRelease(tool);
    asset = pickAsset(rel.assets, platform);
    version = rel.version;
  }
  if (!asset || !asset.url) return { ok: false, error: `No Windows ${platform} asset found` };
  // Defensive: only accept safe asset file names before using on disk.
  if (!/^[\w.\-]+\.zip$/i.test(asset.name || '')) return { ok: false, error: `Unexpected asset name: ${asset.name}` };

  const tools = toolsDir();
  const zipDir = path.join(tools, 'ZIP');
  fs.mkdirSync(zipDir, { recursive: true });
  const zipPath = path.join(zipDir, asset.name);

  await httpsDownload(asset.url, zipPath, UA);

  const tmp = path.join(zipDir, `_x_${tool}_${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    extractZip(zipPath, tmp);
    const src = findFile(tmp, meta.exe);
    if (!src) return { ok: false, error: `${meta.exe} not found inside ${asset.name}` };
    const dest = path.join(tools, meta.exe);
    fs.copyFileSync(src, dest);
    return { ok: true, tool, version, path: dest };
  } finally {
    rmrf(tmp);
  }
}

module.exports = {
  checkUpdate,
  downloadAndInstall,
  getCurrentVersion,
  getLatestRelease,
  semverCmp,
};
