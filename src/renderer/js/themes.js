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

  // Solarized Dark (override the dark base).
  const SOLARIZED = Object.assign({}, LOW_KEY, {
    '--bg': '#002b36',
    '--panel': '#073642',
    '--border': '#0f4b58',
    '--text': '#93a1a1',
    '--muted': '#839496',
    '--hint': '#586e75',
    '--text-soft': '#93a1a1',
    '--tabbar-bg': '#073642',
    '--tab-bg': '#0a3d49',
    '--tab-add-hover': '#0f4b58',
    '--tab-active': '#268bd2',
    '--tab-active-text': '#fdf6e3',
    '--input-bg': '#002b36',
    '--btn-bg': '#0a3d49',
    '--btn-bg-hover': '#0f4b58',
    '--btn-border': '#11505e',
    '--btn-text': '#93a1a1',
    '--accent': '#2aa198',
    '--row-hover': '#073f4c',
    '--row-selected': '#0c5563',
    '--row-sel-outline': '#2aa198',
    '--statusbar-bg': '#073642',
    '--debug-bg': '#00212b',
    '--debug-text': '#93a1a1',
    '--debug-border': '#0f4b58',
    '--ctxmenu-bg': '#073642',
    '--ctxmenu-border': '#0f4b58',
    '--ctxmenu-hover': '#0c4a57',
  });

  // Matrix (green on black).
  const MATRIX = Object.assign({}, LOW_KEY, {
    '--bg': '#000000',
    '--panel': '#031003',
    '--border': '#0c3a0c',
    '--text': '#33ff66',
    '--muted': '#2bbf52',
    '--hint': '#1f8f3e',
    '--text-soft': '#2bbf52',
    '--tabbar-bg': '#021002',
    '--tab-bg': '#052105',
    '--tab-add-hover': '#0c3a0c',
    '--tab-active': '#0f8f2f',
    '--tab-active-text': '#c8ffd4',
    '--input-bg': '#020a02',
    '--btn-bg': '#052105',
    '--btn-bg-hover': '#0c3a0c',
    '--btn-border': '#0f4d18',
    '--btn-text': '#33ff66',
    '--accent': '#39ff14',
    '--row-hover': '#06220b',
    '--row-selected': '#0a3a14',
    '--row-sel-outline': '#39ff14',
    '--statusbar-bg': '#021002',
    '--debug-bg': '#000000',
    '--debug-text': '#33ff66',
    '--debug-border': '#0c3a0c',
    '--ctxmenu-bg': '#031003',
    '--ctxmenu-border': '#0f4d18',
    '--ctxmenu-hover': '#0a2e0a',
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
    solarized: { name: 'Solarized', vars: SOLARIZED },
    matrix: { name: 'Matrix', vars: MATRIX },
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
