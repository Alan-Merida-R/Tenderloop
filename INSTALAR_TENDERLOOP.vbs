Option Explicit

Dim shell, fso, scriptDir, installerUi

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
installerUi = scriptDir & "\INSTALAR_TENDERLOOP.hta"

If Not fso.FileExists(installerUi) Then
    MsgBox "INSTALAR_TENDERLOOP.hta was not found in this folder." & vbCrLf & scriptDir, vbCritical, "TenderLoop Installer"
    WScript.Quit 1
End If

shell.Run "mshta.exe """ & installerUi & """", 1, False

Set fso = Nothing
Set shell = Nothing
