/*
 * M2_SCOUT
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */

// ============================================================
// M2_SCOUT - theme registry (framework-free port of M2_GIT_DIFF themes)
// Applies a set of CSS custom properties to <html> and persists the
// choice in localStorage ('appTheme'). Self-initialises on load (before
// <body> paints) to avoid a flash of the wrong theme (FOUC).
//
// To add a theme: add an entry to THEMES with a full `vars` map (or spread
// an existing base and override). It appears in the Settings list with no
// other code change.
// ============================================================

'use strict';

(function () {
  // Light base (mirrors the original M2_SEEK light look exactly).
  const DAYLIGHT = {
    '--bg': '#f4f4f4',
    '--panel': '#ffffff',
    '--border': '#cfcfcf',
    '--text': '#1c1c1c',
    '--muted': '#555555',
    '--hint': '#888888',
    '--text-soft': '#444444',
    '--tabbar-bg': '#e7e7e7',
    '--tab-bg': '#dcdcdc',
    '--tab-add-hover': '#cdcdcd',
    '--tab-active': '#227F9E',
    '--tab-active-text': '#ffffff',
    '--input-bg': '#ffffff',
    '--btn-bg': '#f0f0f0',
    '--btn-bg-hover': '#e6e6e6',
    '--btn-border': '#b9b9b9',
    '--btn-text': '#1c1c1c',
    '--accent': '#227F9E',
    '--green': '#479B49',
    '--blue': '#497F9F',
    '--purple': '#9E3D87',
    '--red': '#9F2A2C',
    '--files-hl': '#b7f7b7',
    '--files-dim': '#d9d9d9',
    '--kw-hl': '#FFEB3B',
    '--kw-hl-text': '#000000',
    '--f3-hl': '#FF9800',
    '--f3-hl-text': '#000000',
    '--cscope-hl': '#7FFFD4',
    '--cscope-hl-text': '#000000',
    '--row-hover': '#eef5fb',
    '--row-selected': '#cfe8ff',
    '--row-sel-outline': '#2a6fb0',
    '--statusbar-bg': '#ececec',
    '--debug-bg': '#1e1e1e',
    '--debug-text': '#d4d4d4',
    '--debug-border': '#444444',
    '--ctxmenu-bg': '#ffffff',
    '--ctxmenu-border': '#b9b9b9',
    '--ctxmenu-hover': '#e6f0fa',
    '--syn-comment': '#6A737D',
    '--syn-string': '#22863A',
    '--syn-number': '#6F42C1',
    '--syn-keyword': '#005CC5',
    '--syn-type': '#B31D28',
    '--syn-decorator': '#B08800',
    '--syn-common_kw': '#D73A49',
  };

  // Dark base (derived from M2_GIT_DIFF "Low Key").
  const LOW_KEY = {
    '--bg': '#0a0e14',
    '--panel': '#121a28',
    '--border': '#1e2a3a',
    '--text': '#cfe3f2',
    '--muted': '#8aa0b6',
    '--hint': '#6b8199',
    '--text-soft': '#9fb3c8',
    '--tabbar-bg': '#0f1622',
    '--tab-bg': '#16202e',
    '--tab-add-hover': '#1e2a3a',
    '--tab-active': '#1c6e85',
    '--tab-active-text': '#eaf6ff',
    '--input-bg': '#0e1622',
    '--btn-bg': '#16202e',
    '--btn-bg-hover': '#1e2a3a',
    '--btn-border': '#2a3a4d',
    '--btn-text': '#cfe3f2',
    '--accent': '#36d6ff',
    '--green': '#3fa66a',
    '--blue': '#3a7fa6',
    '--purple': '#9a5fc0',
    '--red': '#c0494f',
    '--files-hl': '#1f5130',
    '--files-dim': '#1a2433',
    '--kw-hl': '#FFEB3B',
    '--kw-hl-text': '#000000',
    '--f3-hl': '#FF9800',
    '--f3-hl-text': '#000000',
    '--cscope-hl': '#7FFFD4',
    '--cscope-hl-text': '#000000',
    '--row-hover': '#15212f',
    '--row-selected': '#1d3b57',
    '--row-sel-outline': '#36d6ff',
    '--statusbar-bg': '#0f1622',
    '--debug-bg': '#05080d',
    '--debug-text': '#cfe3f2',
    '--debug-border': '#1e2a3a',
    '--ctxmenu-bg': '#121a28',
    '--ctxmenu-border': '#2a3a4d',
    '--ctxmenu-hover': '#1c2a3a',
    '--syn-comment': '#7d8b99',
    '--syn-string': '#7ee787',
    '--syn-number': '#d2a8ff',
    '--syn-keyword': '#79c0ff',
    '--syn-type': '#ff7b72',
    '--syn-decorator': '#e3b341',
    '--syn-common_kw': '#ff7b72',
  };

  // Army (olive drab + military orange, after the "Eagle Force" army template:
  // olive-green panels, deep olive background, bright orange accent, off-white
  // text). Overrides the dark base.
  const ARMY = Object.assign({}, LOW_KEY, {
    '--bg': '#2b2c1d',
    '--panel': '#454830',
    '--border': '#5c5f3a',
    '--text': '#f1f0e1',
    '--muted': '#b9b89a',
    '--hint': '#8f8e72',
    '--text-soft': '#d9d8c5',
    '--tabbar-bg': '#23241a',
    '--tab-bg': '#3a3c27',
    '--tab-add-hover': '#4a4d30',
    '--tab-active': '#e9701a',
    '--tab-active-text': '#1b1c10',
    '--input-bg': '#23241a',
    '--btn-bg': '#3a3c27',
    '--btn-bg-hover': '#4a4d30',
    '--btn-border': '#5c5f3a',
    '--btn-text': '#f1f0e1',
    '--accent': '#f47521',
    '--green': '#6b8f3d',
    '--blue': '#4a7fa6',
    '--purple': '#9a6fc0',
    '--red': '#c4564a',
    '--files-hl': '#4d5a25',
    '--files-dim': '#33341f',
    '--row-hover': '#43462b',
    '--row-selected': '#5a5e36',
    '--row-sel-outline': '#f47521',
    '--statusbar-bg': '#23241a',
    '--debug-bg': '#1a1b12',
    '--debug-text': '#d9d8c5',
    '--debug-border': '#5c5f3a',
    '--ctxmenu-bg': '#3f4329',
    '--ctxmenu-border': '#5c5f3a',
    '--ctxmenu-hover': '#4d512f',
    '--syn-comment': '#9a9a78',
    '--syn-string': '#c4d17a',
    '--syn-number': '#e0a85a',
    '--syn-keyword': '#f0a030',
    '--syn-type': '#d6e08a',
    '--syn-decorator': '#e3b341',
    '--syn-common_kw': '#f47521',
  });

  // Army (Dark) - steel/iron-grey base with military-green accents, after the
  // Gun Shop dark template (near-black charcoal panels, olive-green highlight).
  // Steel grey background per request, olive-green accent for tabs / selection /
  // throughput / progress. Overrides the dark base.
  const ARMY_DARK = Object.assign({}, LOW_KEY, {
    '--bg': '#1b1e21',
    '--panel': '#26292d',
    '--border': '#3a4047',
    '--text': '#dfe2e5',
    '--muted': '#9aa3ab',
    '--hint': '#79828b',
    '--text-soft': '#c4c9ce',
    '--tabbar-bg': '#16191c',
    '--tab-bg': '#23272b',
    '--tab-add-hover': '#2e3338',
    '--tab-active': '#7e8c3a',
    '--tab-active-text': '#10130a',
    '--input-bg': '#15181b',
    '--btn-bg': '#23272b',
    '--btn-bg-hover': '#2e3338',
    '--btn-border': '#3a4047',
    '--btn-text': '#dfe2e5',
    '--accent': '#8a9a3d',
    '--green': '#7e8c3a',
    '--blue': '#5a7fa0',
    '--purple': '#9a6fc0',
    '--red': '#cf4b3f',
    '--files-hl': '#3c4a1e',
    '--files-dim': '#262a2e',
    '--row-hover': '#262b22',
    '--row-selected': '#3a4626',
    '--row-sel-outline': '#8a9a3d',
    '--statusbar-bg': '#16191c',
    '--debug-bg': '#121417',
    '--debug-text': '#c4c9ce',
    '--debug-border': '#3a4047',
    '--ctxmenu-bg': '#23272b',
    '--ctxmenu-border': '#3a4047',
    '--ctxmenu-hover': '#2e3a20',
    '--syn-comment': '#7a8472',
    '--syn-string': '#b5c46a',
    '--syn-number': '#d6c07a',
    '--syn-keyword': '#a8b84a',
    '--syn-type': '#c4d17a',
    '--syn-decorator': '#cda83e',
    '--syn-common_kw': '#8a9a3d',
  });

  // VS Code Dark+ (matches VS Code's default dark color scheme).
  const VSCODE_DARK = Object.assign({}, LOW_KEY, {
    '--bg': '#1e1e1e', // editor background
    '--panel': '#252526', // side bar / panel background
    '--border': '#3c3c3c',
    '--text': '#d4d4d4', // editor foreground
    '--muted': '#858585',
    '--hint': '#6e7681',
    '--text-soft': '#cccccc',
    '--tabbar-bg': '#252526',
    '--tab-bg': '#2d2d2d', // inactive tab
    '--tab-add-hover': '#37373d',
    '--tab-active': '#0e639c', // filled active tab in VS Code blue
    '--tab-active-text': '#ffffff',
    '--input-bg': '#3c3c3c', // input background
    '--btn-bg': '#0e639c', // primary button blue
    '--btn-bg-hover': '#1177bb',
    '--btn-border': '#0e639c',
    '--btn-text': '#ffffff',
    '--accent': '#007acc', // focus / accent blue
    '--green': '#4ec9b0',
    '--blue': '#569cd6',
    '--purple': '#c586c0',
    '--red': '#f14c4c',
    '--files-hl': '#264f33',
    '--files-dim': '#2a2a2a',
    '--row-hover': '#2a2d2e', // list hover
    '--row-selected': '#094771', // list active selection
    '--row-sel-outline': '#007acc',
    '--statusbar-bg': '#007acc', // VS Code status bar blue
    '--debug-bg': '#1e1e1e',
    '--debug-text': '#cccccc',
    '--debug-border': '#3c3c3c',
    '--ctxmenu-bg': '#252526',
    '--ctxmenu-border': '#454545',
    '--ctxmenu-hover': '#04395e', // menu hover blue
    '--syn-comment': '#6A9955',
    '--syn-string': '#ce9178',
    '--syn-number': '#b5cea8',
    '--syn-keyword': '#569cd6',
    '--syn-type': '#4EC9B0',
    '--syn-decorator': '#DCDCAA',
    '--syn-common_kw': '#C586C0',
  });

  const THEMES = {
    daylight: { name: 'Daylight (Light)', vars: DAYLIGHT },
    low_key: { name: 'Low Key (Dark)', vars: LOW_KEY },
    vscode_dark: { name: 'VS Code (Dark)', vars: VSCODE_DARK },
    army: { name: 'Army', vars: ARMY },
    army_dark: { name: 'Army (Dark)', vars: ARMY_DARK },
  };

  const DEFAULT_THEME = 'daylight';

  function list() {
    return Object.keys(THEMES).map((id) => ({ id, name: THEMES[id].name }));
  }

  function current() {
    try {
      const saved = localStorage.getItem('appTheme');
      if (saved && THEMES[saved]) return saved;
    } catch (_e) { /* localStorage unavailable */ }
    return DEFAULT_THEME;
  }

  function apply(id) {
    const themeId = THEMES[id] ? id : DEFAULT_THEME;
    const vars = THEMES[themeId].vars;
    const root = document.documentElement;
    for (const k of Object.keys(vars)) root.style.setProperty(k, vars[k]);
    root.setAttribute('data-theme', themeId);
    try { localStorage.setItem('appTheme', themeId); } catch (_e) { /* ignore */ }
    try {
      window.dispatchEvent(new CustomEvent('m2-theme-changed', { detail: { theme: themeId } }));
    } catch (_e) { /* ignore */ }
  }

  function init() { apply(current()); }

  // Apply immediately (this file is loaded in <head>) to avoid FOUC.
  init();

  window.M2Themes = { list, apply, current, init, THEMES };
})();
