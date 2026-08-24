Option Explicit

Dim shell, fso, scriptDir, motorPath, command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
motorPath = scriptDir & "\engine_opportunityos.bat"

If Not fso.FileExists(motorPath) Then
    MsgBox "engine_opportunityos.bat was not found in this folder." & vbCrLf & scriptDir, vbCritical, "Tender Control Installer"
    WScript.Quit 1
End If

' Use the same visible installer path that works on restricted corporate PCs.
' The HTA remains available as an optional UI, but installation no longer
' depends on mshta.exe or on a second VBS process being allowed to launch.
command = "cmd.exe /d /c call """ & motorPath & """ INSTALL"
shell.Run command, 1, False

Set fso = Nothing
Set shell = Nothing
