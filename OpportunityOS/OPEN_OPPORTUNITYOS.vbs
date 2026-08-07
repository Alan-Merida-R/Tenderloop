Option Explicit

Dim shell, fso, scriptDir, motorPath, viteLauncher, command, windowStyle

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
motorPath = scriptDir & "\engine_opportunityos.bat"
viteLauncher = scriptDir & "\node_modules\.bin\vite.cmd"

' If OpportunityOS is already open, toggle its window (restore/focus it, or
' minimize it if it's already the active window) instead of opening another
' one on top. A quick curl probe first avoids paying PowerShell's ~0.5s
' startup/compile cost on every cold launch, when there's nothing running to
' toggle anyway -- that's the common case, and the one that makes the
' shortcut feel slow if it always pays this cost regardless.
Dim togglePath, toggleCommand, portCheck
togglePath = scriptDir & "\scripts\toggle-app-window.ps1"
If fso.FileExists(togglePath) Then
    portCheck = shell.Run("curl.exe -s -o nul --max-time 1 http://127.0.0.1:3000", 0, True)
    If portCheck = 0 Then
        toggleCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & togglePath & """"
        If shell.Run(toggleCommand, 0, True) = 0 Then
            WScript.Quit 0
        End If
    End If
End If

If Not fso.FileExists(motorPath) Then
    MsgBox "engine_opportunityos.bat was not found in this folder." & vbCrLf & scriptDir, vbCritical, "OpportunityOS"
    WScript.Quit 1
End If

' Launch the reliable batch engine directly. Do not delete or rename this pair:
' OPEN_OPPORTUNITYOS.vbs and engine_opportunityos.bat are the two files every
' other launcher (the .bat fallback, the browser-tab variant, the installer)
' depends on.
If fso.FileExists(viteLauncher) Then
    command = "cmd.exe /d /c call """ & motorPath & """ HIDDEN"
    windowStyle = 0
Else
    command = "cmd.exe /d /c call """ & motorPath & """ INSTALL"
    windowStyle = 1
End If

shell.Run command, windowStyle, False

Set fso = Nothing
Set shell = Nothing
