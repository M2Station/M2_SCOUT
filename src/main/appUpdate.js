/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - Application self-updater
// Checks the running app version against the latest GitHub release and, when a
// newer version exists, downloads the matching Windows NSIS installer and
// launches it. The installer replaces the installed app and (per the build
// config's runAfterFinish) relaunches it.
//
//   M2_SCOUT -> https://github.com/M2Station/M2_SCOUT
//
// Release installers are attached to each tag (see .github/workflows/release.yml)
// and named by electron-builder's artifactName:
//   M2_SCOUT-Setup-<version>-x64.exe
//   M2_SCOUT-Setup-<version>-arm64.exe
// so we select by "-<arch>.exe" (arch = x64 | arm64).
//
// Download lifecycle: the installer is saved under the OS temp folder in a
// dedicated "M2_SCOUT-update" directory. It is deleted by cleanupDownloads(),
// which runs at every app startup - so the freshly installed/relaunched app (or
// the next launch after a cancelled update) always removes the leftover
// installer. We intentionally do NOT delete right after spawning: an installer
// that elevates (all-users install) hands off to a child process, and deleting
// the file mid-install would break it.
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const { app } = require('electron');

const OWNER = 'M2Station';
const REPO = 'M2_SCOUT';
const UA = { 'User-Agent': 'M2_SCOUT-app-updater' };
const UPDATE_DIR_NAME = 'M2_SCOUT-update';
const SETUP_RE = /^M2_SCOUT-Setup-[\w.\-]+\.exe$/i;

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

// Map the Electron process architecture to the installer asset suffix.
function currentArch() {
  return process.arch === 'arm64' ? 'arm64' : 'x64';
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

async function getLatestRelease() {
  const api = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
  const body = await httpsGetBuffer(api, { ...UA, Accept: 'application/vnd.github+json' });
  const json = JSON.parse(body.toString('utf8'));
  const version = String(json.tag_name || '').replace(/^v/, '');
  const notes = String(json.body || '');
  const htmlUrl = String(json.html_url || '');
  const assets = (json.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url }));
  return {
    version, notes, htmlUrl, assets,
  };
}

// Choose the NSIS Setup .exe for the requested architecture.
function pickAsset(assets, arch) {
  const a = arch === 'arm64' ? 'arm64' : 'x64';
  const re = new RegExp(`-${a}\\.exe$`, 'i');
  return (assets || []).find((x) => re.test(x.name)) || null;
}

// Dedicated temp folder that holds downloaded installers.
function updateDir() {
  return path.join(app.getPath('temp'), UPDATE_DIR_NAME);
}

// Remove any leftover installer(s) from a previous update. Best-effort; never
// throws. Called once at startup so a completed (or cancelled) update never
// leaves the downloaded Setup .exe behind.
function cleanupDownloads() {
  try {
    const dir = updateDir();
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (SETUP_RE.test(name)) {
        try { fs.rmSync(path.join(dir, name), { force: true }); } catch (_e) { /* ignore */ }
      }
    }
  } catch (_e) {
    /* temp unreadable - ignore */
  }
}

// Check current vs latest. Returns
// { ok, currentVersion, latestVersion, upToDate, asset, arch, notes, htmlUrl }.
async function checkUpdate() {
  const current = app.getVersion();
  const arch = currentArch();
  const rel = await getLatestRelease();
  const asset = pickAsset(rel.assets, arch);
  const upToDate = !!(rel.version && semverCmp(current, rel.version) >= 0);
  return {
    ok: true,
    currentVersion: current,
    latestVersion: rel.version,
    upToDate,
    asset,
    arch,
    notes: rel.notes,
    htmlUrl: rel.htmlUrl,
  };
}

// Download the matching installer into the temp update folder and launch it.
// Returns { ok, version, path } on success.
async function downloadAndInstall(params) {
  const arch = currentArch();
  let asset = params && params.asset;
  let version = params && params.version;
  if (!asset || !asset.url) {
    const rel = await getLatestRelease();
    asset = pickAsset(rel.assets, arch);
    version = rel.version;
  }
  if (!asset || !asset.url) return { ok: false, error: `No Windows ${arch} installer found` };
  // Defensive: only accept the expected Setup .exe name before using on disk.
  if (!SETUP_RE.test(asset.name || '')) return { ok: false, error: `Unexpected asset name: ${asset.name}` };

  const dir = updateDir();
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, asset.name);

  await httpsDownload(asset.url, dest, UA);

  // Launch the interactive installer detached so it outlives this process while
  // it replaces the installed app and relaunches it. The leftover installer is
  // removed by cleanupDownloads() on the next startup (see file header).
  try {
    const child = spawn(dest, [], { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', () => { /* swallow: async spawn error must not crash main */ });
    child.unref();
  } catch (err) {
    try { fs.rmSync(dest, { force: true }); } catch (_e) { /* ignore */ }
    return { ok: false, error: `Failed to launch installer: ${String((err && err.message) || err)}` };
  }

  return { ok: true, version, path: dest };
}

module.exports = {
  checkUpdate,
  downloadAndInstall,
  cleanupDownloads,
  getLatestRelease,
  semverCmp,
};
