Option Explicit

Dim shell, fso, scriptDir, installerUi, setupMarker, exitCode

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
installerUi = scriptDir & "\INSTALAR_TENDERLOOP.hta"
shell.Environment("PROCESS")("TENDERLOOP_ROOT") = scriptDir
setupMarker = scriptDir & "\.tenderloop-setup-complete"

If Not fso.FileExists(installerUi) Then
    MsgBox "INSTALAR_TENDERLOOP.hta was not found in this folder." & vbCrLf & scriptDir, vbCritical, "TenderLoop Installer"
    WScript.Quit 1
End If

On Error Resume Next
If fso.FileExists(setupMarker) Then fso.DeleteFile setupMarker, True
exitCode = shell.Run("mshta.exe """ & installerUi & """", 1, True)

If Err.Number <> 0 Or Not fso.FileExists(setupMarker) Then
    MsgBox "TenderLoop setup did not finish." & vbCrLf & vbCrLf & _
        "No TenderLoop data was deleted." & vbCrLf & _
        "Your corporate security policy may have blocked the setup window (mshta.exe) or npm." & vbCrLf & vbCrLf & _
        "Please provide this message to IT so they can allow the TenderLoop folder, Node.js/npm and mshta.exe for this local application.", _
        vbExclamation, "TenderLoop Setup"
End If
On Error GoTo 0

Set fso = Nothing
Set shell = Nothing
