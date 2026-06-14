# M2_SCOUT

**M2_SCOUT** is a Node.js / Electron port of **M2 SEEK** — a desktop GUI search tool built
on top of [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`),
[fd](https://github.com/sharkdp/fd), and [cscope](https://cscope.sourceforge.net/).

It is a faithful re-implementation of the original Python/Tkinter app
(`../M2_SEEK.py`). All features are aligned with M2 SEEK and it reads/writes the
**same INI files** (`M2_SEEK.ini`, `M2_SEEK_EXCLUDE_GROUPS.ini`, `M2_SEEK_HL.ini`).

---

## Quick start

```powershell
cd M2_SCOUT
npm install      # first time only (downloads Electron)
npm start        # launch the app
# optional: pre-fill a folder
npm start -- "C:\CODE\UEFI\Devices0522"
```

Or just double-click **`M2_SCOUT.cmd`** (installs deps on first run, then launches).

### Tools (`rg.exe`, `fd.exe`, `cscope`)

M2_SCOUT resolves the executables in this order:

1. the value typed in the **rg.exe / fd.exe** fields (absolute path wins),
2. the M2_SCOUT folder,
3. the parent folder (`../`, the original M2_SEEK repo that already ships
   `rg.exe`, `fd.exe`, `cscope.exe`),
4. the system `PATH`.

So out of the box it reuses the binaries already present in the M2_SEEK repo.

---

## Feature parity with M2 SEEK

| Area | M2 SEEK (Python/Tk) | M2_SCOUT (Node/Electron) |
|------|---------------------|------------------------|
| Multi-tab UI | ✅ notebook tabs | ✅ tab bar (Ctrl+T / Ctrl+W, drag to reorder) |
| Content search (ripgrep) | ✅ `--json --stats --fixed-strings` | ✅ identical args |
| OR / AND keyword modes | ✅ | ✅ |
| Parallel AND | ✅ concurrent `rg` | ✅ concurrent spawns |
| Case sensitive toggle | ✅ | ✅ |
| Respect ignore files | ✅ `--no-ignore` when off | ✅ |
| Include filter globs | ✅ | ✅ |
| Exclude dirs/files (manual) | ✅ | ✅ |
| Exclude **groups** (INI keys) | ✅ `exd_* / exf_*` | ✅ same resolution rules |
| Live FILES list while searching | ✅ throttled | ✅ throttled (80 ms) |
| STOP button / ESC | ✅ kills `rg` | ✅ kills child processes |
| Filename search (fd) | ✅ | ✅ |
| Preview ±10 lines, merged blocks | ✅ | ✅ |
| Syntax highlight (HL INI) | ✅ Tk tags | ✅ DOM spans, same priority layering |
| Keyword highlight + F3 next | ✅ | ✅ |
| Editor integration (open at line) | ✅ template `$(FILEPATH)/$(LINENUM)` | ✅ same template, 740-elevation fallback |
| FILES HL / Filter coloring | ✅ F2/F3/F4 | ✅ F2/F3/F4 |
| F1 copy all results | ✅ | ✅ |
| Preview zoom Ctrl +/- | ✅ | ✅ |
| GEN cscope.files | ✅ | ✅ |
| CSCOPE window (index + 9 modes) | ✅ | ✅ separate window |
| DEBUG panel | ✅ collapsible | ✅ collapsible |
| INI persistence | ✅ default tab | ✅ default tab (`TAB BASE`) |

### Hotkeys

| Key | Action |
|-----|--------|
| `Ctrl+F` | focus Keywords |
| `Ctrl+D` | focus Filter |
| `Enter` (Keywords/Filter) | run search |
| `Esc` | stop running search |
| `Ctrl+T` / `Ctrl+W` | new / close tab |
| `Alt+Down` | focus FILES list |
| FILES `F1/F2/F3/F4` | copy all / HL / Dim / clear |
| Preview `F3` | next keyword match |
| Preview `Ctrl + / Ctrl -` | zoom |
| Preview right-click | open in editor at clicked line |

---

## Project structure

```
M2_SCOUT/
├─ package.json
├─ M2_SCOUT.cmd               launcher (npm install + start)
├─ M2_SEEK.ini                settings (shared format with M2 SEEK)
├─ M2_SEEK_EXCLUDE_GROUPS.ini exclude group definitions
├─ M2_SEEK_HL.ini             syntax highlight rules
└─ src/
   ├─ main/                   Electron main process (Node backend)
   │  ├─ main.js              window lifecycle
   │  ├─ ipc.js               all IPC handlers
   │  ├─ config.js            constants (ported config classes)
   │  ├─ paths.js             app dir + exe resolver
   │  ├─ ini.js               configparser-compatible INI read/write
   │  ├─ utils.js             token/keyword parsing
   │  ├─ globs.js             rg include/exclude glob builders
   │  ├─ excludeGroups.js     group key resolution
   │  ├─ rg.js                ripgrep arg builder
   │  ├─ search.js            content search orchestrator (OR / parallel AND)
   │  ├─ fd.js                filename search
   │  ├─ cscope.js            cscope index / query / preview
   │  ├─ preview.js           preview text builder
   │  ├─ editor.js            editor template + launch
   │  └─ highlight.js         HL rule compiler
   ├─ preload/preload.js      contextBridge API (window.m2scout)
   └─ renderer/
      ├─ index.html           main window
      ├─ cscope.html          CSCOPE window
      ├─ css/style.css
      └─ js/
         ├─ renderer.js       tabs, search lifecycle, files, preview, hotkeys
         ├─ highlight.js      client-side syntax/keyword highlighter
         └─ cscope.js         CSCOPE window logic
```

---

## Architecture notes

- **Main process** owns all OS access: spawning `rg`/`fd`/`cscope`, reading/writing
  INI files, building previews, and launching the editor. It streams search
  events to the renderer over a single `search:event` IPC channel keyed by a
  per-tab `sessionId`.
- **Renderer** is sandboxed (`contextIsolation: true`, `nodeIntegration: false`)
  and talks to the backend only through the `window.m2scout` bridge defined in
  `preload.js`.
- Preview match detection uses literal (fixed-string) matching in JS, which is
  equivalent to ripgrep's `--fixed-strings` mode used by the search.

### Intentional differences

- The original shows live **CPU%** of the `rg` process via `psutil`. M2_SCOUT shows a
  lightweight running/idle indicator instead (no per-child CPU sampling
  dependency). Install the optional `pidusage` package if you want to extend this.
- Tk text tags are reproduced with layered DOM spans; foreground precedence
  follows the same tag priority order as M2 SEEK.

---

## License

MIT. "Powered By OA Hsiao".
