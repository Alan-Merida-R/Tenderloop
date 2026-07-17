Option Explicit

Dim WshShell, fso, scriptDir, batPath, viteLauncher, command, windowStyle

Set WshShell = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = scriptDir & "\motor_tenderloop.bat"
viteLauncher = scriptDir & "\node_modules\.bin\vite.cmd"

If Not fso.FileExists(batPath) Then
    MsgBox "motor_tenderloop.bat was not found in this folder." & vbCrLf & scriptDir, vbCritical, "TenderLoop"
    WScript.Quit 1
End If

If fso.FileExists(viteLauncher) Then
    command = "cmd.exe /d /c call """ & batPath & """ HIDDEN"
    windowStyle = 0
Else
    command = "cmd.exe /d /c call """ & batPath & """ INSTALL"
    windowStyle = 1
End If

WshShell.Run command, windowStyle, False

Set fso = Nothing
Set WshShell = Nothing
