// ============================================================
// M2_SCOUT - Editor picker popup
// Lets the user choose their editor (VS Code or Sublime Text) instead of
// hand-editing the editor command / args. For Sublime the user browses to
// the executable; the launch args template is filled in automatically.
//
// Usage:
//   window.M2EditorPicker.open({ cmd, args, onApply })
//     cmd     : current editor command (used to preselect the kind)
//     onApply : ({ cmd, args }) => void
// ============================================================

'use strict';

(function () {
  const S = window.m2scout;
  const t = (k, v) => (window.M2I18n ? window.M2I18n.t(k, v) : k);

  // Canonical launch templates per editor.
  const VSCODE = { cmd: 'code', args: '-g "$(FILEPATH):$(LINENUM)" -r' };
  const SUBLIME_ARGS = '"$(FILEPATH):$(LINENUM)"';

  let overlay = null;
  let titleEl = null;
  let vscodeRadio = null;
  let sublimeRadio = null;
  let vscodeLabelEl = null;
  let sublimeLabelEl = null;
  let sublimeRow = null;
  let exeLabelEl = null;
  let exeReadout = null;
  let browseBtn = null;
  let hintEl = null;
  let cancelBtn = null;
  let applyBtn = null;

  let currentOnApply = null;
  let sublimeExe = '';

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    overlay.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'settings-panel';

    titleEl = document.createElement('div');
    titleEl.className = 'settings-title';
    panel.appendChild(titleEl);

    // VS Code option
    const vRow = document.createElement('label');
    vRow.className = 'settings-row';
    vscodeRadio = document.createElement('input');
    vscodeRadio.type = 'radio';
    vscodeRadio.name = 'editorKind';
    vscodeRadio.value = 'vscode';
    vscodeRadio.addEventListener('change', refresh);
    vscodeLabelEl = document.createElement('span');
    vscodeLabelEl.className = 'settings-label';
    vRow.appendChild(vscodeRadio);
    vRow.appendChild(vscodeLabelEl);
    panel.appendChild(vRow);

    // Sublime option
    const sRow = document.createElement('label');
    sRow.className = 'settings-row';
    sublimeRadio = document.createElement('input');
    sublimeRadio.type = 'radio';
    sublimeRadio.name = 'editorKind';
    sublimeRadio.value = 'sublime';
    sublimeRadio.addEventListener('change', refresh);
    sublimeLabelEl = document.createElement('span');
    sublimeLabelEl.className = 'settings-label';
    sRow.appendChild(sublimeRadio);
    sRow.appendChild(sublimeLabelEl);
    panel.appendChild(sRow);

    // Sublime executable picker (only relevant when Sublime is selected)
    sublimeRow = document.createElement('div');
    sublimeRow.className = 'settings-row editor-exe-row';
    exeLabelEl = document.createElement('span');
    exeLabelEl.className = 'settings-label';
    exeReadout = document.createElement('span');
    exeReadout.className = 'editor-exe-readout';
    browseBtn = document.createElement('button');
    browseBtn.className = 'btn btn-mini';
    browseBtn.addEventListener('click', onBrowse);
    sublimeRow.appendChild(exeLabelEl);
    sublimeRow.appendChild(exeReadout);
    sublimeRow.appendChild(browseBtn);
    panel.appendChild(sublimeRow);

    hintEl = document.createElement('div');
    hintEl.className = 'editor-exe-hint hintcell';
    panel.appendChild(hintEl);

    const footer = document.createElement('div');
    footer.className = 'exfolder-footer';
    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    footer.appendChild(spacer);

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
    titleEl.textContent = t('editorpick.title');
    vscodeLabelEl.textContent = t('editorpick.vscode');
    sublimeLabelEl.textContent = t('editorpick.sublime');
    exeLabelEl.textContent = t('editorpick.exeLabel');
    browseBtn.textContent = t('editorpick.browse');
    hintEl.textContent = t('editorpick.hint');
    cancelBtn.textContent = t('editorpick.cancel');
    applyBtn.textContent = t('editorpick.apply');
  }

  function selectedKind() { return sublimeRadio.checked ? 'sublime' : 'vscode'; }

  async function onBrowse() {
    try {
      const p = await S.pickFile('Sublime');
      if (p) { sublimeExe = p; refresh(); }
    } catch (_e) { /* ignore */ }
  }

  // Reflect the current selection into the UI (show/hide the EXE row, enable
  // Apply only when a Sublime executable has been chosen).
  function refresh() {
    const isSub = selectedKind() === 'sublime';
    sublimeRow.style.display = isSub ? '' : 'none';
    hintEl.style.display = (isSub && !sublimeExe) ? '' : 'none';
    exeReadout.textContent = sublimeExe || '';
    exeReadout.title = sublimeExe || '';
    applyBtn.disabled = isSub && !sublimeExe;
  }

  function apply() {
    let result;
    if (selectedKind() === 'sublime') {
      if (!sublimeExe) return;
      result = { cmd: sublimeExe, args: SUBLIME_ARGS };
    } else {
      result = { cmd: VSCODE.cmd, args: VSCODE.args };
    }
    if (typeof currentOnApply === 'function') currentOnApply(result);
    hide();
  }

  function hide() { if (overlay) overlay.hidden = true; }

  function open({ cmd, onApply }) {
    if (!overlay) build();
    currentOnApply = onApply;
    const lc = String(cmd || '').toLowerCase();
    const isSub = lc.includes('subl');
    sublimeExe = isSub ? String(cmd) : '';
    vscodeRadio.checked = !isSub;
    sublimeRadio.checked = isSub;
    syncLabels();
    refresh();
    overlay.hidden = false;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && !overlay.hidden) { e.preventDefault(); hide(); }
  });

  window.M2EditorPicker = { open, hide };
})();
