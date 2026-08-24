Option Explicit

Dim shell, fso, scriptDir, command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

If Not fso.FileExists(scriptDir & "\DESINSTALAR_OPPORTUNITYOS.hta") Then
    MsgBox "DESINSTALAR_OPPORTUNITYOS.hta was not found in this folder." & vbCrLf & scriptDir, vbCritical, "Tender Control Installer"
    WScript.Quit 1
End If

command = "mshta.exe """ & scriptDir & "\DESINSTALAR_OPPORTUNITYOS.hta"""
shell.Run command, 1, False

Set fso = Nothing
Set shell = Nothing
