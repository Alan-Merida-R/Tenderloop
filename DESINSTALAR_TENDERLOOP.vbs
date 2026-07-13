Option Explicit

Dim shell, fso, scriptDir, uninstallerUi
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
uninstallerUi = scriptDir & "\DESINSTALAR_TENDERLOOP.hta"
shell.Environment("PROCESS")("TENDERLOOP_ROOT") = scriptDir

If Not fso.FileExists(uninstallerUi) Then
    MsgBox "DESINSTALAR_TENDERLOOP.hta was not found in this folder." & vbCrLf & scriptDir, vbCritical, "TenderLoop Uninstaller"
    WScript.Quit 1
End If

shell.Run "mshta.exe """ & uninstallerUi & """", 1, False
Set fso = Nothing
Set shell = Nothing
