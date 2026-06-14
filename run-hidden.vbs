' ============================================================
' M2_SCOUT - hidden launcher
' Starts Electron with NO console window. Called by the .cmd
' launchers so the app appears without a flashing/persistent
' command prompt.
'
' Usage (from the repo root):
'   wscript.exe //nologo run-hidden.vbs [folder]
' ============================================================
Option Explicit

Dim shell, fso, scriptDir, electronCmd, args, i, folderArg

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Directory this script lives in (the app root).
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Local Electron launcher installed by `npm install`.
electronCmd = fso.BuildPath(scriptDir, "node_modules\.bin\electron.cmd")

' Optional first argument: a folder to pre-fill in the first tab.
folderArg = ""
If WScript.Arguments.Count > 0 Then
  folderArg = " """ & WScript.Arguments(0) & """"
End If

' Run electron in the app dir with the window hidden (0) and do not wait.
shell.CurrentDirectory = scriptDir
shell.Run """" & electronCmd & """ ." & folderArg, 0, False
