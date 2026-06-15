/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - In-app keyboard-driven folder picker popup
// A fast, keyboard-first folder browser that replaces the OS directory
// dialog for choosing the search folder. Inspired by M2_GIT_DIFF's
// FolderPicker, adapted to vanilla DOM (no framework) and to plain folder
// selection (no git-repo concept).
//
// Keys:
//   ↑ / ↓            move the highlight
//   Enter            select the highlighted folder (close + return it)
//   → / dblclick     open (descend into) the highlighted folder
//   ← / Backspace    go up to the parent folder
//   Ctrl+Enter       select the CURRENT (already-open) folder
//   Esc              cancel
//   type             live-filter the list by name
//
// Usage:
//   window.M2FolderPicker.open({ start, onPick })
//     start  : initial folder path (optional; falls back to drives/home)
//     onPick : (absolutePath) => void  — called when the user selects a folder
// ============================================================

'use strict';

(function () {
  const t = (k, v) => (window.M2I18n ? window.M2I18n.t(k, v) : k);
  const api = () => window.m2scout;

  let overlay = null;
  let titleEl = null;
  let pathEl = null;
  let filterEl = null;
  let listEl = null;
  let hintEl = null;
  let upBtn = null;
  let cancelBtn = null;
  let selectBtn = null;

  let currentOnPick = null;
  let cur = null; // last listDir() result: { path, parent, canGoUp, isDriveList, entries }
  let visible = []; // filtered entries currently shown
  let active = -1; // index into `visible`

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'settings-overlay folderpick-overlay';
    overlay.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'settings-panel folderpick-panel';

    titleEl = document.createElement('div');
    titleEl.className = 'settings-title';
    panel.appendChild(titleEl);

    pathEl = document.createElement('div');
    pathEl.className = 'folderpick-path';
    panel.appendChild(pathEl);

    filterEl = document.createElement('input');
    filterEl.type = 'text';
    filterEl.className = 'folderpick-filter';
    filterEl.addEventListener('input', () => { renderList(); });
    filterEl.addEventListener('keydown', onKeyDown);
    panel.appendChild(filterEl);

    listEl = document.createElement('div');
    listEl.className = 'folderpick-list';
    listEl.tabIndex = 0;
    listEl.addEventListener('keydown', onKeyDown);
    panel.appendChild(listEl);

    const footer = document.createElement('div');
    footer.className = 'folderpick-footer';

    hintEl = document.createElement('span');
    hintEl.className = 'folderpick-hint';
    footer.appendChild(hintEl);

    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    footer.appendChild(spacer);

    upBtn = document.createElement('button');
    upBtn.className = 'btn btn-mini';
    upBtn.addEventListener('click', () => { goUp(); filterEl.focus(); });
    footer.appendChild(upBtn);

    cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.addEventListener('click', hide);
    footer.appendChild(cancelBtn);

    selectBtn = document.createElement('button');
    selectBtn.className = 'btn btn-green';
    selectBtn.addEventListener('click', () => pick(cur && cur.path));
    footer.appendChild(selectBtn);

    panel.appendChild(footer);
    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) hide(); });
    document.body.appendChild(overlay);
  }

  function syncLabels() {
    titleEl.textContent = t('folderpick.title');
    filterEl.placeholder = t('folderpick.filter');
    hintEl.textContent = t('folderpick.hint');
    upBtn.textContent = t('folderpick.up');
    cancelBtn.textContent = t('folderpick.cancel');
    selectBtn.textContent = t('folderpick.select');
  }

  // Render the (filtered) entries and refresh the path/select state.
  function renderList() {
    const q = (filterEl.value || '').trim().toLowerCase();
    const entries = (cur && cur.entries) || [];
    visible = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries.slice();
    active = visible.length ? 0 : -1;

    pathEl.textContent = cur && cur.isDriveList ? t('folderpick.thisPc') : (cur ? cur.path : '');
    upBtn.disabled = !(cur && cur.canGoUp);
    // A drive list is not itself a selectable folder.
    selectBtn.disabled = !(cur && !cur.isDriveList);

    listEl.innerHTML = '';
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'folderpick-empty';
      empty.textContent = t('folderpick.empty');
      listEl.appendChild(empty);
      return;
    }
    const frag = document.createDocumentFragment();
    visible.forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = 'folderpick-row';
      row.dataset.idx = String(i);

      const icon = document.createElement('span');
      icon.className = 'folderpick-icon';
      icon.textContent = entry.isDrive ? '\uD83D\uDCBE' : '\uD83D\uDCC1'; // 💾 / 📁
      row.appendChild(icon);

      const name = document.createElement('span');
      name.className = 'folderpick-name';
      name.textContent = entry.name;
      row.appendChild(name);

      row.addEventListener('click', () => { active = i; paintActive(); });
      row.addEventListener('dblclick', () => { active = i; descend(); });
      frag.appendChild(row);
    });
    listEl.appendChild(frag);
    paintActive();
  }

  function paintActive() {
    const rows = listEl.querySelectorAll('.folderpick-row');
    rows.forEach((r, i) => r.classList.toggle('active', i === active));
    if (active >= 0 && rows[active]) {
      rows[active].scrollIntoView({ block: 'nearest' });
    }
  }

  function move(delta) {
    if (!visible.length) return;
    active = Math.max(0, Math.min(visible.length - 1, active + delta));
    paintActive();
  }

  async function loadDir(dir) {
    const S = api();
    if (!S || !S.listDir) return;
    const res = await S.listDir(dir);
    if (!res) return; // access denied / error: stay put
    cur = res;
    filterEl.value = '';
    renderList();
  }

  function descend() {
    if (active < 0 || !visible[active]) return;
    loadDir(visible[active].path);
    filterEl.focus();
  }

  function goUp() {
    if (cur && cur.canGoUp && cur.parent) loadDir(cur.parent);
  }

  function pick(p) {
    if (!p || (cur && cur.isDriveList)) return;
    if (typeof currentOnPick === 'function') currentOnPick(p);
    hide();
  }

  function onKeyDown(e) {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'ArrowRight': e.preventDefault(); descend(); break;
      case 'Enter':
        e.preventDefault();
        // Enter selects the highlighted folder. On the drive list there is
        // nothing selectable, so Enter opens the drive instead. Ctrl+Enter
        // still selects the current (already-open) folder.
        if (e.ctrlKey) pick(cur && cur.path);
        else if (cur && cur.isDriveList) descend();
        else if (active >= 0 && visible[active]) pick(visible[active].path);
        else pick(cur && cur.path);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        goUp();
        break;
      case 'Backspace':
        // Only navigate up when the filter box is empty, so Backspace can
        // still edit the filter text normally.
        if (!filterEl.value) { e.preventDefault(); goUp(); }
        break;
      case 'Escape': e.preventDefault(); hide(); break;
      default: break;
    }
  }

  function hide() { if (overlay) overlay.hidden = true; }

  function open({ start, onPick } = {}) {
    if (!overlay) build();
    currentOnPick = onPick;
    syncLabels();
    overlay.hidden = false;
    // Start at the given folder; on failure the backend returns null and we
    // fall back to the drive list (Windows) or the home directory.
    const S = api();
    const isWin = navigator.userAgent.includes('Windows');
    const fallback = isWin ? (S && S.drivesSentinel) || ':drives:' : (S && S.homeDir) || '.';
    loadDir(start || fallback).then(() => {
      if (!cur) loadDir(fallback);
      filterEl.focus();
    });
  }

  window.M2FolderPicker = { open, hide };
}());
