/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - Keyword search history (popup picker)
// Keeps the last 10 distinct keyword strings the user searched for, newest
// first, in localStorage. A small popup (modelled on the folder picker) lets
// the user pick one to auto-fill the keyword field, or delete entries via the
// "x" on each row.
//
// Keys:
//   Up / Down   move the highlight
//   Enter       select the highlighted entry (auto-fills keywords)
//   Delete      remove the highlighted entry
//   Esc         close
//
// Usage:
//   window.M2KeywordHistory.add(keyword)        // record a search
//   window.M2KeywordHistory.open({ onPick })    // show the picker
//     onPick : (keyword) => void  - called when an entry is chosen
// ============================================================

'use strict';

(function () {
  const t = (k, v) => (window.M2I18n ? window.M2I18n.t(k, v) : k);
  const KEY = 'm2scout.keywordHistory';
  const MAX = 10;

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s.trim()) : [];
    } catch (_e) { return []; }
  }
  function write(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX))); } catch (_e) { /* ignore */ }
  }
  // Record a keyword: dedupe (case-sensitive exact match), newest first, cap 10.
  function add(kw) {
    const s = (kw || '').trim();
    if (!s) return;
    const arr = read().filter((x) => x !== s);
    arr.unshift(s);
    write(arr);
  }
  function remove(kw) { write(read().filter((x) => x !== kw)); }
  function list() { return read().slice(0, MAX); }

  // ---- popup ----
  let overlay = null;
  let titleEl = null;
  let listEl = null;
  let emptyEl = null;
  let cancelBtn = null;
  let onPick = null;
  let items = [];
  let active = -1;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'settings-overlay history-overlay';
    overlay.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'settings-panel history-panel';

    titleEl = document.createElement('div');
    titleEl.className = 'settings-title';
    panel.appendChild(titleEl);

    listEl = document.createElement('div');
    listEl.className = 'history-list';
    listEl.tabIndex = 0;
    listEl.addEventListener('keydown', onKeyDown);
    panel.appendChild(listEl);

    emptyEl = document.createElement('div');
    emptyEl.className = 'history-empty muted';
    panel.appendChild(emptyEl);

    const footer = document.createElement('div');
    footer.className = 'history-footer';
    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    footer.appendChild(spacer);
    cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.addEventListener('click', hide);
    footer.appendChild(cancelBtn);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) hide(); });
    document.body.appendChild(overlay);
  }

  function syncLabels() {
    titleEl.textContent = t('history.title');
    emptyEl.textContent = t('history.empty');
    cancelBtn.textContent = t('history.cancel');
  }

  function renderList() {
    items = list();
    listEl.innerHTML = '';
    emptyEl.hidden = items.length > 0;
    if (active >= items.length) active = items.length - 1;
    if (active < 0 && items.length) active = 0;
    items.forEach((kw, i) => {
      const row = document.createElement('div');
      row.className = `history-row${i === active ? ' active' : ''}`;
      row.dataset.idx = String(i);

      const name = document.createElement('span');
      name.className = 'history-kw';
      name.textContent = kw;
      name.addEventListener('click', () => pick(kw));
      row.appendChild(name);

      const del = document.createElement('button');
      del.className = 'history-del';
      del.textContent = '\u00D7'; // multiplication sign "x"
      del.title = t('history.delete');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        remove(kw);
        renderList();
        listEl.focus();
      });
      row.appendChild(del);

      listEl.appendChild(row);
    });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); hide(); return; }
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); renderList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); renderList(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) pick(items[active]); }
    else if (e.key === 'Delete') { e.preventDefault(); if (active >= 0) { remove(items[active]); renderList(); } }
  }

  function pick(kw) {
    const cb = onPick;
    hide();
    if (cb && kw != null) cb(kw);
  }

  function hide() {
    if (overlay) overlay.hidden = true;
    onPick = null;
  }

  function open(opts) {
    if (!overlay) build();
    syncLabels();
    onPick = (opts && opts.onPick) || null;
    active = 0;
    renderList();
    overlay.hidden = false;
    setTimeout(() => listEl.focus(), 0);
  }

  window.M2KeywordHistory = {
    add, remove, list, open,
  };
})();
