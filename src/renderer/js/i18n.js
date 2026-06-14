// ============================================================
// M2_SCOUT - i18n (framework-free port of M2_GIT_DIFF locales)
// Flat dot-path keys, English + Traditional Chinese built in. Persists the
// choice in localStorage ('appLang'). Translates the DOM via attributes:
//   data-i18n        -> element.textContent
//   data-i18n-title  -> element.title
//   data-i18n-ph     -> element.placeholder
//
// To add a language: add an entry to STRINGS with a `_name`; it appears in
// the Settings language list automatically.
// ============================================================

'use strict';

(function () {
  const STRINGS = {
    en: {
      _name: 'English',

      'form.rgExe': 'rg.exe',
      'form.fdExe': 'fd.exe',
      'form.browseRg': 'Browse rg.exe',
      'form.browseFd': 'Browse fd.exe',
      'form.folder': 'Folder',
      'form.selectFolder': 'Select Folds',
      'form.filter': 'Filter',
      'form.filterHint': 'e.g. *.c *.h  (blank or *.* = all)',
      'form.excludeFiles': 'Exclude Files (manual)',
      'form.excludeGroupKeys': 'Exclude Group Keys',

      'exfolder.button': 'Exclude Folders\u2026',
      'exfolder.title': 'Exclude Groups (Skip Folders / Files)',
      'exfolder.search': 'Filter\u2026',
      'exfolder.selectAll': 'Select All',
      'exfolder.clear': 'Clear',
      'exfolder.apply': 'Apply',
      'exfolder.cancel': 'Cancel',
      'exfolder.typeDir': 'Dir',
      'exfolder.typeFile': 'File',
      'exfolder.empty': 'No groups found in M2_SCOUT_EXCLUDE_GROUPS.ini',
      'exfolder.count': '{n} selected',
      'form.keywords': 'Keywords',
      'form.mode': 'Mode',
      'form.or': 'OR',
      'form.and': 'AND',
      'form.caseSensitive': 'Case Sensitive',
      'form.respectIgnore': 'Respect (.gitignore/.ignore/.rgignore)',
      'form.editorCmd': 'Editor CMD',
      'form.editorArgs': 'Editor ARGS (template)',
      'form.editor': 'Editor',
      'editor.button': 'Editor\u2026',
      'editor.none': '(not set)',
      'editorpick.title': 'Select Editor',
      'editorpick.vscode': 'VS Code',
      'editorpick.sublime': 'Sublime Text',
      'editorpick.exeLabel': 'Sublime EXE',
      'editorpick.browse': 'Browse subl.exe\u2026',
      'editorpick.hint': 'Pick the Sublime executable (subl.exe / sublime_text.exe).',
      'editorpick.apply': 'Apply',
      'editorpick.cancel': 'Cancel',

      'action.searchInFiles': 'SEARCH_IN_FILES',
      'action.searchFilename': 'SEARCH_FILENAME',
      'action.stop': 'STOP',
      'action.genCscope': 'GEN_cscope.files',
      'action.cscope': 'CSCOPE',

      'files.label': 'Files',
      'files.hl': 'HL:',
      'files.filter': 'Filter:',
      'files.clear': 'Clear',
      'files.hint': 'F1:copy  F2:HL  F3:Dim  F4:Clr',
      'files.matches': 'Matches:',
      'preview.title': 'Preview',
      'status.ready': 'Ready.',
      'status.searching': 'Searching...',
      'status.searchingFilenames': 'Searching filenames...',
      'status.done': 'Done',
      'status.filenameDone': 'Filename search done',

      'debug.toggleShown': '\u25BC DEBUG',
      'debug.toggleHidden': '\u25B6 DEBUG',
      'debug.clear': 'Clear',

      'tab.new': 'New tab (Ctrl+T)',
      'tab.close': 'Close (Ctrl+W)',

      'ctx.openExplorer': 'Open in Explorer',
      'ctx.copyPath': 'Copy path',
      'ctx.copyRelPath': 'Copy relative path',

      'settings.title': 'Settings',
      'settings.language': 'Language',
      'settings.theme': 'Theme',
      'settings.open': 'Settings',
      'settings.close': 'Close',

      'cs.title': 'CSCOPE',
      'cs.folder': 'Folder',
      'cs.openFolder': 'Open Folder',
      'cs.index': 'INDEX',
      'cs.mode': 'Mode',
      'cs.query': 'Query',
      'cs.search': 'SEARCH',
      'cs.results': 'Results (double click to open, F1 copy all)',
      'cs.previewLabel': 'PREVIEW (right click: Open / Copy path / Copy snippet)',
      'cs.debugLabel': 'DEBUG (double click: open selected result)',
      'cs.ctxOpen': 'Open',
      'cs.ctxCopyPath': 'Copy path',
      'cs.ctxCopySnippet': 'Copy snippet',
    },

    'zh-TW': {
      _name: '\u4E2D\u6587\uFF08\u7E41\u9AD4\uFF09',

      'form.rgExe': 'rg.exe',
      'form.fdExe': 'fd.exe',
      'form.browseRg': '\u700F\u89BD rg.exe',
      'form.browseFd': '\u700F\u89BD fd.exe',
      'form.folder': '\u8CC7\u6599\u593E',
      'form.selectFolder': '\u9078\u64C7\u8CC7\u6599\u593E',
      'form.filter': '\u7BE9\u9078',
      'form.filterHint': '\u4F8B\u5982 *.c *.h\uFF08\u7559\u7A7A\u6216 *.* = \u5168\u90E8\uFF09',
      'form.excludeFiles': '\u6392\u9664\u6A94\u6848\uFF08\u624B\u52D5\uFF09',
      'form.excludeGroupKeys': '\u6392\u9664\u7FA4\u7D44\u9375',

      'exfolder.button': '\u6392\u9664\u8CC7\u6599\u593E\u2026',
      'exfolder.title': '\u6392\u9664\u7FA4\u7D44\uFF08\u8DF3\u904E\u8CC7\u6599\u593E / \u6A94\u6848\uFF09',
      'exfolder.search': '\u7BE9\u9078\u2026',
      'exfolder.selectAll': '\u5168\u9078',
      'exfolder.clear': '\u6E05\u9664',
      'exfolder.apply': '\u5957\u7528',
      'exfolder.cancel': '\u53D6\u6D88',
      'exfolder.typeDir': '\u8CC7\u6599\u593E',
      'exfolder.typeFile': '\u6A94\u6848',
      'exfolder.empty': '\u5728 M2_SCOUT_EXCLUDE_GROUPS.ini \u627E\u4E0D\u5230\u4EFB\u4F55\u7FA4\u7D44',
      'exfolder.count': '\u5DF2\u9078 {n}',
      'form.keywords': '\u95DC\u9375\u5B57',
      'form.mode': '\u6A21\u5F0F',
      'form.or': 'OR',
      'form.and': 'AND',
      'form.caseSensitive': '\u5340\u5206\u5927\u5C0F\u5BEB',
      'form.respectIgnore': '\u9075\u5FAA (.gitignore/.ignore/.rgignore)',
      'form.editorCmd': '\u7DE8\u8F2F\u5668\u6307\u4EE4',
      'form.editorArgs': '\u7DE8\u8F2F\u5668\u53C3\u6578\uFF08\u7BC4\u672C\uFF09',
      'form.editor': '\u7DE8\u8F2F\u5668',
      'editor.button': '\u7DE8\u8F2F\u5668\u2026',
      'editor.none': '\uFF08\u672A\u8A2D\u5B9A\uFF09',
      'editorpick.title': '\u9078\u64C7\u7DE8\u8F2F\u5668',
      'editorpick.vscode': 'VS Code',
      'editorpick.sublime': 'Sublime Text',
      'editorpick.exeLabel': 'Sublime \u57F7\u884C\u6A94',
      'editorpick.browse': '\u9078\u64C7 subl.exe\u2026',
      'editorpick.hint': '\u8ACB\u9078\u64C7 Sublime \u57F7\u884C\u6A94\uFF08subl.exe / sublime_text.exe\uFF09\u3002',
      'editorpick.apply': '\u5957\u7528',
      'editorpick.cancel': '\u53D6\u6D88',

      'action.searchInFiles': '\u641C\u5C0B\u5167\u5BB9',
      'action.searchFilename': '\u641C\u5C0B\u6A94\u540D',
      'action.stop': '\u505C\u6B62',
      'action.genCscope': '\u7522\u751F cscope.files',
      'action.cscope': 'CSCOPE',

      'files.label': '\u6A94\u6848',
      'files.hl': '\u6A19\u4EAE\uFF1A',
      'files.filter': '\u7BE9\u9078\uFF1A',
      'files.clear': '\u6E05\u9664',
      'files.hint': 'F1:\u8907\u88FD  F2:\u6A19\u4EAE  F3:\u6DE1\u5316  F4:\u6E05\u9664',
      'files.matches': '\u7B26\u5408\uFF1A',
      'preview.title': '\u9810\u89BD',
      'status.ready': '\u5C31\u7DD2\u3002',
      'status.searching': '\u641C\u5C0B\u4E2D\u2026',
      'status.searchingFilenames': '\u641C\u5C0B\u6A94\u540D\u4E2D\u2026',
      'status.done': '\u5B8C\u6210',
      'status.filenameDone': '\u6A94\u540D\u641C\u5C0B\u5B8C\u6210',

      'debug.toggleShown': '\u25BC \u9664\u932F',
      'debug.toggleHidden': '\u25B6 \u9664\u932F',
      'debug.clear': '\u6E05\u9664',

      'tab.new': '\u65B0\u5206\u9801 (Ctrl+T)',
      'tab.close': '\u95DC\u9589 (Ctrl+W)',

      'ctx.openExplorer': '\u5728\u6A94\u6848\u7E3D\u7BA1\u958B\u555F',
      'ctx.copyPath': '\u8907\u88FD\u8DEF\u5F91',
      'ctx.copyRelPath': '\u8907\u88FD\u76F8\u5C0D\u8DEF\u5F91',

      'settings.title': '\u8A2D\u5B9A',
      'settings.language': '\u8A9E\u8A00',
      'settings.theme': '\u4F48\u666F\u4E3B\u984C',
      'settings.open': '\u8A2D\u5B9A',
      'settings.close': '\u95DC\u9589',

      'cs.title': 'CSCOPE',
      'cs.folder': '\u8CC7\u6599\u593E',
      'cs.openFolder': '\u958B\u555F\u8CC7\u6599\u593E',
      'cs.index': '\u7D22\u5F15',
      'cs.mode': '\u6A21\u5F0F',
      'cs.query': '\u67E5\u8A62',
      'cs.search': '\u641C\u5C0B',
      'cs.results': '\u7D50\u679C\uFF08\u96D9\u64CA\u958B\u555F\uFF0CF1 \u5168\u90E8\u8907\u88FD\uFF09',
      'cs.previewLabel': '\u9810\u89BD\uFF08\u53F3\u9375\uFF1A\u958B\u555F / \u8907\u88FD\u8DEF\u5F91 / \u8907\u88FD\u7247\u6BB5\uFF09',
      'cs.debugLabel': '\u9664\u932F\uFF08\u96D9\u64CA\uFF1A\u958B\u555F\u9078\u53D6\u7684\u7D50\u679C\uFF09',
      'cs.ctxOpen': '\u958B\u555F',
      'cs.ctxCopyPath': '\u8907\u88FD\u8DEF\u5F91',
      'cs.ctxCopySnippet': '\u8907\u88FD\u7247\u6BB5',
    },
  };

  const FALLBACK = STRINGS.en ? 'en' : Object.keys(STRINGS)[0];

  function list() {
    return Object.keys(STRINGS).map((code) => ({ code, name: STRINGS[code]._name || code }));
  }

  function current() {
    try {
      const saved = localStorage.getItem('appLang');
      if (saved && STRINGS[saved]) return saved;
    } catch (_e) { /* localStorage unavailable */ }
    return FALLBACK;
  }

  let lang = current();

  function lookup(code, key) {
    const dict = STRINGS[code];
    return dict ? dict[key] : undefined;
  }

  function t(key, vars) {
    let val = lookup(lang, key);
    if (val === undefined && lang !== FALLBACK) val = lookup(FALLBACK, key);
    if (val === undefined) return key;
    if (vars) {
      val = String(val).replace(/\{(\w+)\}/g, (m, name) =>
        (Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m));
    }
    return val;
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    scope.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.placeholder = t(el.getAttribute('data-i18n-ph'));
    });
  }

  function getLang() { return lang; }

  function setLang(code) {
    if (!STRINGS[code]) return;
    lang = code;
    try { localStorage.setItem('appLang', code); } catch (_e) { /* ignore */ }
    document.documentElement.setAttribute('lang', code === 'zh-TW' ? 'zh-Hant' : code);
    apply(document);
    try {
      window.dispatchEvent(new CustomEvent('m2-lang-changed', { detail: { lang: code } }));
    } catch (_e) { /* ignore */ }
  }

  // Translate static chrome as soon as the DOM is parsed (idempotent;
  // renderer code re-applies after it builds dynamic content).
  function autoApply() {
    document.documentElement.setAttribute('lang', lang === 'zh-TW' ? 'zh-Hant' : lang);
    apply(document);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoApply);
  } else {
    autoApply();
  }

  window.M2I18n = { t, apply, setLang, getLang, list, current };
})();
