# M2_SCOUT

[English](README.md) | [繁體中文](README.zh-TW.md)

**M2_SCOUT** 是 **M2 SEEK** 的 Node.js / Electron 移植版本，
是一套桌面 GUI 搜尋工具，底層使用 [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`)、
[fd](https://github.com/sharkdp/fd) 與 [cscope](https://cscope.sourceforge.net/)。

此專案忠實重現原始 Python/Tkinter 版本 (`../M2_SEEK.py`) 的功能，
並維持與 M2 SEEK 對齊。設定儲存在獨立 **INI 檔案**
(`M2_SCOUT.ini`, `M2_SCOUT_EXCLUDE_GROUPS.ini`, `M2_SCOUT_HL.ini`)。

---

## 動畫示範

### 全功能流程動畫

![M2_SCOUT full workflow demo](docs/demo-full-workflow.svg)

這段動畫展示完整使用流程：
- 多分頁操作
- OR / 平行 AND 搜尋
- FILES 清單即時更新
- Preview 高亮 + `F3` / `Shift+F3`
- Preview 內 `Ctrl+F` 懸浮搜尋框
- cscope 操作流程

### `rg.exe` 多執行緒 + CPU 壓榨動畫

![M2_SCOUT rg parallel CPU demo](docs/demo-rg-cpu.svg)

M2_SCOUT 在 AND 模式下會平行啟動多個 `rg.exe` worker，在大型程式碼庫可把 CPU 使用率拉到很高。

### Preview 搜尋動畫（舊版）

![M2_SCOUT preview find demo](docs/demo-preview-find.svg)

---

## 快速開始

```powershell
cd M2_SCOUT
npm install      # 首次安裝 (會下載 Electron)
npm start        # 啟動
# 可選：帶入預設資料夾
npm start -- "C:\CODE\UEFI\Devices0522"
```

或直接雙擊 **`M2_SCOUT.cmd`**（首次會先安裝相依，之後直接啟動）。

### 工具解析順序 (`rg.exe`, `fd.exe`, `cscope`)

M2_SCOUT 依序解析執行檔位置：

1. UI 欄位輸入的 `rg.exe` / `fd.exe`（絕對路徑優先）
2. M2_SCOUT 目錄
3. 上層目錄 `../`（原 M2_SEEK repo 內建 `rg.exe`, `fd.exe`, `cscope.exe`）
4. 系統 `PATH`

所以預設可直接重用 M2_SEEK repo 既有工具。

---

## 與 M2 SEEK 的功能對齊

| 區塊 | M2 SEEK (Python/Tk) | M2_SCOUT (Node/Electron) |
|------|---------------------|------------------------|
| 多分頁 UI | ✅ notebook tabs | ✅ tab bar (Ctrl+T / Ctrl+W, 可拖曳排序) |
| 內容搜尋 (ripgrep) | ✅ `--json --stats --fixed-strings` | ✅ 相同參數 |
| OR / AND 關鍵字模式 | ✅ | ✅ |
| 平行 AND | ✅ concurrent `rg` | ✅ concurrent spawns |
| 大小寫區分 | ✅ | ✅ |
| Respect ignore files | ✅ off 時 `--no-ignore` | ✅ |
| Include filter globs | ✅ | ✅ |
| Exclude dirs/files | ✅ | ✅ |
| Exclude 群組 (INI keys) | ✅ `exd_* / exf_*` | ✅ 相同規則 |
| 搜尋時 FILES 即時更新 | ✅ throttled | ✅ throttled (80 ms) |
| STOP / ESC | ✅ kill `rg` | ✅ kill child process |
| Filename 搜尋 (fd) | ✅ | ✅ |
| Preview 上下文合併 | ✅ | ✅ |
| 語法高亮 (HL INI) | ✅ Tk tags | ✅ DOM spans |
| 關鍵字高亮 + F3 next / Shift+F3 prev | ✅ | ✅ |
| Preview 內文搜尋 (Ctrl+F popup + count + next/prev) | ❌ | ✅ |
| 編輯器整合 (跳行) | ✅ `$(FILEPATH)/$(LINENUM)` | ✅ 同模板 |
| FILES HL / Filter coloring | ✅ F2/F3/F4 | ✅ F2/F3/F4 |
| F1 複製全部結果 | ✅ | ✅ |
| Preview 縮放 Ctrl +/- | ✅ | ✅ |
| GEN cscope.files | ✅ | ✅ |
| CSCOPE 視窗 (index + 9 modes) | ✅ | ✅ |
| DEBUG panel | ✅ collapsible | ✅ collapsible |
| INI 持久化 | ✅ default tab | ✅ `TAB BASE` |

### 快捷鍵

| 按鍵 | 功能 |
|-----|------|
| `Ctrl+F` | focus Keywords |
| `Ctrl+D` | focus Filter |
| `Enter` (Keywords/Filter) | 執行搜尋 |
| `Esc` | 停止搜尋 |
| `Ctrl+T` / `Ctrl+W` | 新增 / 關閉分頁 |
| `Alt+Down` | 聚焦 FILES 清單 |
| `Ctrl+Right` | 聚焦 Preview 第一個命中 |
| FILES `F1/F2/F3/F4` | copy all / HL / Dim / clear |
| Preview `F3` / `Shift+F3` | 下一個 / 上一個關鍵字命中 |
| Preview `Ctrl+F` | 開啟 Preview 懸浮搜尋框 |
| Preview find `Enter` / `Shift+Enter` | 下一個 / 上一個 Preview 內文命中 |
| Preview `Ctrl + / Ctrl -` | 縮放 |
| Preview 右鍵 | 在編輯器以點擊行開啟 |

---

## 額外功能（超出 M2 SEEK 對齊範圍）

以下是 M2_SCOUT 在 M2 SEEK 功能之上額外提供的功能，多數位於分頁列上的
**設定 (⚙)** 彈出視窗中。

### 應用程式自動更新

在 **設定 (⚙)** 點擊 **檢查新版本**。M2_SCOUT 會比對目前版本與最新的
[GitHub Release](https://github.com/M2Station/M2_SCOUT/releases)，若有新版本則：

1. **提示** 目前與最新版本，
2. **下載** 對應你 CPU 架構的 NSIS 安裝檔
   (`M2_SCOUT-Setup-<version>-x64.exe` / `-arm64.exe`)，
3. **啟動** 安裝程式（安裝程式會取代並重新啟動 App），
4. 下次啟動時 **刪除** 已下載的安裝檔。

### 工具自動更新 (rg / fd)

`rg.exe` / `fd.exe` 欄位旁的 **檢查更新** 按鈕會從 GitHub 取得最新的
ripgrep / fd Windows 版本，並將對應執行檔安裝到 `TOOLS/`。目標平台
（x86_64 / aarch64）可在設定中選擇。

### 佈景主題與語言

- **5 種內建主題** — Daylight (Light)、Low Key (Dark)、VS Code (Dark)、
  Army、Army (Dark)。選擇會被記住，並在首次繪製前套用（不會閃爍成錯誤主題）。
- **雙語介面** — 英文與繁體中文，可在設定中即時切換。

### FILES 清單額外功能

- **清單 / 樹狀** 檢視切換，以及 **依名稱或命中數排序**。
- **關鍵字搜尋紀錄** 彈出視窗（最近關鍵字，去重、由新到舊）。

### Beyond Compare 整合

在 FILES 清單選取兩個檔案後右鍵，即可用 **Beyond Compare** 開啟比對
（自動偵測已安裝的版本）。

### 內建字型自動安裝

啟動時會將 `FONTS/` 內附的 `Source Code Pro` 字型以 per-user 方式安裝
（Windows 10 1809+ 免系統管理員權限），確保 UI 字型堆疊正確解析。

---

## 授權

MIT. "Powered By OA Hsiao".
