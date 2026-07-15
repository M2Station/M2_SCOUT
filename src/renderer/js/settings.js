/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - Settings popup (language + theme switcher)
// Framework-free; shared by the main window and the CSCOPE window.
// Wires itself to a trigger button with id="btnSettings" and builds the
// popup DOM on demand. Depends on window.M2I18n and window.M2Themes.
// ============================================================

'use strict';

(function () {
  const I18N = window.M2I18n;
  const THEMES = window.M2Themes;
  const t = (k) => (I18N ? I18N.t(k) : k);

  // Platform preference for tool (rg/fd) update downloads. Default x86_64.
  const PLAT_KEY = 'm2scout.toolPlatform';
  const M2Platform = {
    get() { try { return localStorage.getItem(PLAT_KEY) === 'aarch64' ? 'aarch64' : 'x86_64'; } catch (_e) { return 'x86_64'; } },
    set(v) { try { localStorage.setItem(PLAT_KEY, v === 'aarch64' ? 'aarch64' : 'x86_64'); } catch (_e) { /* ignore */ } },
  };
  window.M2Platform = M2Platform;

  let overlay = null;
  let titleEl = null;
  let langLabelEl = null;
  let themeLabelEl = null;
  let platLabelEl = null;
  let ctxLinesLabelEl = null;
  let langSel = null;
  let themeSel = null;
  let platSel = null;
  let ctxLinesInput = null;
  let closeBtn = null;
  let updRowEl = null;
  let updLabelEl = null;
  let updBtn = null;
  let updBusy = false;

  function buildPopup() {
    overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    overlay.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'settings-panel';

    titleEl = document.createElement('div');
    titleEl.className = 'settings-title';
    panel.appendChild(titleEl);

    // Language row
    const langRow = document.createElement('label');
    langRow.className = 'settings-row';
    langLabelEl = document.createElement('span');
    langLabelEl.className = 'settings-label';
    langSel = document.createElement('select');
    langSel.className = 'settings-select';
    if (I18N) {
      I18N.list().forEach(({ code, name }) => {
        const o = document.createElement('option');
        o.value = code;
        o.textContent = name;
        langSel.appendChild(o);
      });
      langSel.value = I18N.getLang();
    }
    langSel.addEventListener('change', () => { if (I18N) I18N.setLang(langSel.value); });
    langRow.appendChild(langLabelEl);
    langRow.appendChild(langSel);
    panel.appendChild(langRow);

    // Theme row
    const themeRow = document.createElement('label');
    themeRow.className = 'settings-row';
    themeLabelEl = document.createElement('span');
    themeLabelEl.className = 'settings-label';
    themeSel = document.createElement('select');
    themeSel.className = 'settings-select';
    if (THEMES) {
      THEMES.list().forEach(({ id, name }) => {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = name;
        themeSel.appendChild(o);
      });
      themeSel.value = THEMES.current();
    }
    themeSel.addEventListener('change', () => { if (THEMES) THEMES.apply(themeSel.value); });
    themeRow.appendChild(themeLabelEl);
    themeRow.appendChild(themeSel);
    panel.appendChild(themeRow);

    // Platform row (for rg/fd update downloads)
    const platRow = document.createElement('label');
    platRow.className = 'settings-row';
    platLabelEl = document.createElement('span');
    platLabelEl.className = 'settings-label';
    platSel = document.createElement('select');
    platSel.className = 'settings-select';
    ['x86_64', 'aarch64'].forEach((id) => {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = id;
      platSel.appendChild(o);
    });
    platSel.value = M2Platform.get();
    platSel.addEventListener('change', () => M2Platform.set(platSel.value));
    platRow.appendChild(platLabelEl);
    platRow.appendChild(platSel);
    panel.appendChild(platRow);

    // Preview context lines row
    const ctxRow = document.createElement('label');
    ctxRow.className = 'settings-row';
    ctxLinesLabelEl = document.createElement('span');
    ctxLinesLabelEl.className = 'settings-label';
    ctxLinesInput = document.createElement('input');
    ctxLinesInput.type = 'number';
    ctxLinesInput.min = '1';
    ctxLinesInput.max = '100';
    ctxLinesInput.className = 'settings-select';
    ctxLinesInput.style.width = '5em';
    ctxLinesInput.addEventListener('change', () => {
      const n = parseInt(ctxLinesInput.value, 10);
      if (!Number.isNaN(n) && n > 0) {
        document.querySelectorAll('[data-field="previewContextLines"]').forEach((el) => {
          el.value = String(n);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
    });
    ctxRow.appendChild(ctxLinesLabelEl);
    ctxRow.appendChild(ctxLinesInput);
    panel.appendChild(ctxRow);

    // App self-update row (shown only when the update bridge is available).
    const M = window.m2scout;
    if (M && M.appUpdate) {
      updRowEl = document.createElement('div');
      updRowEl.className = 'settings-row';
      updLabelEl = document.createElement('span');
      updLabelEl.className = 'settings-label';
      updBtn = document.createElement('button');
      updBtn.className = 'btn btn-blue';
      updBtn.addEventListener('click', checkAppUpdate);
      updRowEl.appendChild(updLabelEl);
      updRowEl.appendChild(updBtn);
      panel.appendChild(updRowEl);
    }

    // Close button
    closeBtn = document.createElement('button');
    closeBtn.className = 'btn settings-close';
    closeBtn.addEventListener('click', hide);
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) hide(); });
    document.body.appendChild(overlay);

    syncLabels();
    // Keep labels current when the language changes from within the popup.
    window.addEventListener('m2-lang-changed', syncLabels);
  }

  function syncLabels() {
    if (!overlay) return;
    titleEl.textContent = t('settings.title');
    langLabelEl.textContent = t('settings.language');
    themeLabelEl.textContent = t('settings.theme');
    if (platLabelEl) platLabelEl.textContent = t('settings.platform');
    if (ctxLinesLabelEl) ctxLinesLabelEl.textContent = t('form.previewContextLines');
    closeBtn.textContent = t('settings.close');
    if (I18N && langSel) langSel.value = I18N.getLang();
    if (THEMES && themeSel) themeSel.value = THEMES.current();
    if (platSel) platSel.value = M2Platform.get();
    if (ctxLinesInput) {
      const el = document.querySelector('[data-field="previewContextLines"]');
      ctxLinesInput.value = el ? (el.value || '13') : '13';
    }
    if (updLabelEl) {
      const v = (window.m2scout && window.m2scout.appVersion) || '?';
      updLabelEl.textContent = `${t('appUpdate.version')} v${v}`;
    }
    if (updBtn && !updBusy) updBtn.textContent = t('appUpdate.button');
  }

  function show() {
    if (!overlay) buildPopup();
    syncLabels();
    overlay.hidden = false;
  }
  function hide() { if (overlay) overlay.hidden = true; }
  function toggle() { if (!overlay || overlay.hidden) show(); else hide(); }

  // Full app self-update flow: check GitHub for a newer release, and when one
  // exists prompt the user, then download + launch the matching installer.
  // The downloaded installer is cleaned up on the next app startup.
  async function checkAppUpdate() {
    const M = window.m2scout;
    if (!M || !M.appUpdate || updBusy) return;
    updBusy = true;
    const restore = () => {
      updBusy = false;
      if (updBtn) { updBtn.disabled = false; updBtn.textContent = t('appUpdate.button'); }
    };
    if (updBtn) { updBtn.disabled = true; updBtn.textContent = t('appUpdate.checking'); }

    let res;
    try {
      res = await M.appUpdate.check();
    } catch (e) {
      await M.showError(t('appUpdate.title'), String(e));
      restore();
      return;
    }
    if (!res || !res.ok) {
      await M.showError(t('appUpdate.title'), (res && res.error) || t('appUpdate.checkFailed'));
      restore();
      return;
    }
    const cur = res.currentVersion || '?';
    const latest = res.latestVersion || '?';
    if (res.upToDate) {
      await M.showInfo(t('appUpdate.title'), `${t('appUpdate.upToDate')} (v${cur})`);
      restore();
      return;
    }
    if (!res.asset) {
      await M.showError(t('appUpdate.title'), t('appUpdate.noAsset'));
      restore();
      return;
    }

    let confirm;
    try {
      confirm = await M.showConfirm({
        title: t('appUpdate.title'),
        message: t('appUpdate.available', { cur, latest }),
        detail: t('appUpdate.installDetail'),
        confirmLabel: t('appUpdate.downloadInstall'),
        cancelLabel: t('appUpdate.cancel'),
      });
    } catch (_e) { confirm = null; }
    if (!confirm || !confirm.confirmed) { restore(); return; }

    if (updBtn) updBtn.textContent = t('appUpdate.downloading');
    let dl;
    try {
      dl = await M.appUpdate.download({ asset: res.asset, version: latest });
    } catch (e) {
      await M.showError(t('appUpdate.title'), String(e));
      restore();
      return;
    }
    if (!dl || !dl.ok) {
      await M.showError(t('appUpdate.title'), (dl && dl.error) || t('appUpdate.downloadFailed'));
      restore();
      return;
    }
    await M.showInfo(t('appUpdate.title'), t('appUpdate.launched'));
    restore();
  }

  function init() {
    const btn = document.getElementById('btnSettings');
    if (btn) btn.addEventListener('click', toggle);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay && !overlay.hidden) { e.preventDefault(); hide(); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.M2Settings = { show, hide, toggle };
})();
