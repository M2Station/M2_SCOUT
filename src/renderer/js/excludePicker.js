// ============================================================
// M2_SCOUT - Exclude-folders picker popup
// Reads the exclude groups from M2_SCOUT_EXCLUDE_GROUPS.ini (passed in by
// the caller) and lets the user tick which groups to skip. On Apply it
// returns the selected group KEYS, which feed the "Exclude Group Keys"
// field and are resolved by the search backend (getEffectiveExcludes).
//
// Usage:
//   window.M2ExcludePicker.open({ groups, selectedKeys, onApply })
//     groups       : { exd_js: 'node_modules;dist', exf_1: '*.log', ... }
//     selectedKeys : ['exd_js', ...]  (currently selected keys)
//     onApply      : (keysArray) => void
// ============================================================

'use strict';

(function () {
  const t = (k, v) => (window.M2I18n ? window.M2I18n.t(k, v) : k);

  let overlay = null;
  let titleEl = null;
  let filterEl = null;
  let listEl = null;
  let countEl = null;
  let selectAllBtn = null;
  let clearBtn = null;
  let applyBtn = null;
  let cancelBtn = null;

  let currentOnApply = null;
  let unknownKeys = []; // selected keys not present in groups (preserved)

  function isFileGroup(key) {
    const lk = (key || '').toLowerCase();
    return lk.startsWith('exf_') || lk.startsWith('exclude_file');
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'settings-overlay exfolder-overlay';
    overlay.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'settings-panel exfolder-panel';

    titleEl = document.createElement('div');
    titleEl.className = 'settings-title';
    panel.appendChild(titleEl);

    filterEl = document.createElement('input');
    filterEl.type = 'text';
    filterEl.className = 'exfolder-filter';
    filterEl.addEventListener('input', applyFilter);
    panel.appendChild(filterEl);

    listEl = document.createElement('div');
    listEl.className = 'exfolder-list';
    panel.appendChild(listEl);

    const footer = document.createElement('div');
    footer.className = 'exfolder-footer';

    countEl = document.createElement('span');
    countEl.className = 'exfolder-count';
    footer.appendChild(countEl);

    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    footer.appendChild(spacer);

    selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'btn btn-mini';
    selectAllBtn.addEventListener('click', () => { setVisibleChecked(true); updateCount(); });
    footer.appendChild(selectAllBtn);

    clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-mini';
    clearBtn.addEventListener('click', () => { setVisibleChecked(false); updateCount(); });
    footer.appendChild(clearBtn);

    cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.addEventListener('click', hide);
    footer.appendChild(cancelBtn);

    applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn-blue';
    applyBtn.addEventListener('click', apply);
    footer.appendChild(applyBtn);

    panel.appendChild(footer);
    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) hide(); });
    document.body.appendChild(overlay);
  }

  function syncLabels() {
    titleEl.textContent = t('exfolder.title');
    filterEl.placeholder = t('exfolder.search');
    selectAllBtn.textContent = t('exfolder.selectAll');
    clearBtn.textContent = t('exfolder.clear');
    cancelBtn.textContent = t('exfolder.cancel');
    applyBtn.textContent = t('exfolder.apply');
    updateCount();
  }

  function renderList(groups, selectedSet) {
    listEl.innerHTML = '';
    const keys = Object.keys(groups);
    if (!keys.length) {
      const empty = document.createElement('div');
      empty.className = 'exfolder-empty';
      empty.textContent = t('exfolder.empty');
      listEl.appendChild(empty);
      return;
    }
    // Directories first, then files, each group alphabetical.
    keys.sort((a, b) => {
      const fa = isFileGroup(a) ? 1 : 0;
      const fb = isFileGroup(b) ? 1 : 0;
      if (fa !== fb) return fa - fb;
      return a.localeCompare(b);
    });
    const frag = document.createDocumentFragment();
    for (const key of keys) {
      const file = isFileGroup(key);
      const row = document.createElement('label');
      row.className = 'exfolder-row';
      row.dataset.search = `${key} ${groups[key]}`.toLowerCase();

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'exfolder-cb';
      cb.dataset.key = key;
      cb.checked = selectedSet.has(key.toLowerCase());
      cb.addEventListener('change', updateCount);
      row.appendChild(cb);

      const keyEl = document.createElement('span');
      keyEl.className = 'exfolder-key';
      keyEl.textContent = key;
      row.appendChild(keyEl);

      const tag = document.createElement('span');
      tag.className = `exfolder-tag ${file ? 'tag-file' : 'tag-dir'}`;
      tag.textContent = t(file ? 'exfolder.typeFile' : 'exfolder.typeDir');
      row.appendChild(tag);

      const valEl = document.createElement('span');
      valEl.className = 'exfolder-val';
      valEl.textContent = groups[key];
      row.appendChild(valEl);

      frag.appendChild(row);
    }
    listEl.appendChild(frag);
  }

  function visibleCheckboxes() {
    return Array.from(listEl.querySelectorAll('.exfolder-row'))
      .filter((row) => row.style.display !== 'none')
      .map((row) => row.querySelector('.exfolder-cb'));
  }

  function setVisibleChecked(checked) {
    visibleCheckboxes().forEach((cb) => { cb.checked = checked; });
  }

  function updateCount() {
    const n = listEl.querySelectorAll('.exfolder-cb:checked').length;
    countEl.textContent = t('exfolder.count', { n });
  }

  function applyFilter() {
    const q = (filterEl.value || '').trim().toLowerCase();
    listEl.querySelectorAll('.exfolder-row').forEach((row) => {
      row.style.display = !q || row.dataset.search.includes(q) ? '' : 'none';
    });
  }

  function apply() {
    const checked = Array.from(listEl.querySelectorAll('.exfolder-cb:checked'))
      .map((cb) => cb.dataset.key);
    // Preserve any previously-selected keys that are not defined in the groups
    // INI (e.g. typed manually or pointing at the [search] section).
    const result = checked.concat(unknownKeys);
    if (typeof currentOnApply === 'function') currentOnApply(result);
    hide();
  }

  function hide() { if (overlay) overlay.hidden = true; }

  function open({ groups, selectedKeys, onApply }) {
    if (!overlay) build();
    const g = groups || {};
    currentOnApply = onApply;

    const sel = Array.isArray(selectedKeys) ? selectedKeys : [];
    const selectedSet = new Set(sel.map((k) => String(k).toLowerCase()));
    const knownLower = new Set(Object.keys(g).map((k) => k.toLowerCase()));
    unknownKeys = sel.filter((k) => !knownLower.has(String(k).toLowerCase()));

    syncLabels();
    renderList(g, selectedSet);
    filterEl.value = '';
    applyFilter();
    updateCount();
    overlay.hidden = false;
    filterEl.focus();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && !overlay.hidden) { e.preventDefault(); hide(); }
  });

  window.M2ExcludePicker = { open, hide };
})();
