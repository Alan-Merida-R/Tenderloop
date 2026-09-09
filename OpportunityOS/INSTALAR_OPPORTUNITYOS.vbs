Option Explicit

Dim shell, fso, scriptDir, motorPath, installerPath, command, exitCode

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
motorPath = scriptDir & "\engine_opportunityos.bat"
installerPath = scriptDir & "\INSTALAR_OPPORTUNITYOS.hta"

If Not fso.FileExists(motorPath) Then
    MsgBox "engine_opportunityos.bat was not found in this folder." & vbCrLf & scriptDir, vbCritical, "Tender Control Installer"
    WScript.Quit 1
End If

' Prefer the installer UI: it reports the active step, streams npm output and
' explains failures instead of leaving the user looking at a command window
' that appears stuck. Wait only for mshta itself; all long-running setup work
' is polled asynchronously by the HTA.
If fso.FileExists(installerPath) Then
    command = "mshta.exe """ & installerPath & """"
    exitCode = shell.Run(command, 1, True)
    If exitCode = 0 Then
        WScript.Quit 0
    End If
End If

' Corporate policies sometimes block mshta. Keep the visible batch installer
' as a reliable fallback so installation never depends on manually opening the
' engine file.
command = "cmd.exe /d /c call """ & motorPath & """ INSTALL"
shell.Run command, 1, False

Set fso = Nothing
Set shell = Nothing
