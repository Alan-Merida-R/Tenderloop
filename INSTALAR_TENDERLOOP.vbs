Option Explicit

Dim shell, fso, scriptDir, installerUi, fallbackInstaller, setupMarker, exitCode, startedAt, setupCompleted

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
installerUi = scriptDir & "\INSTALAR_TENDERLOOP.hta"
fallbackInstaller = scriptDir & "\motor_tenderloop.bat"
shell.Environment("PROCESS")("TENDERLOOP_ROOT") = scriptDir
setupMarker = scriptDir & "\.tenderloop-setup-complete"

If Not fso.FileExists(installerUi) Then
    MsgBox "INSTALAR_TENDERLOOP.hta was not found in this folder." & vbCrLf & scriptDir, vbCritical, "TenderLoop Installer"
    WScript.Quit 1
End If

On Error Resume Next
startedAt = Now
exitCode = shell.Run("mshta.exe """ & installerUi & """", 1, True)
setupCompleted = False
If fso.FileExists(setupMarker) Then
    setupCompleted = (fso.GetFile(setupMarker).DateLastModified >= startedAt)
End If

If Err.Number <> 0 Or Not setupCompleted Then
    MsgBox "TenderLoop setup did not finish." & vbCrLf & vbCrLf & _
        "No TenderLoop data was deleted." & vbCrLf & _
        "The visual setup window may have been blocked or closed by Windows security." & vbCrLf & vbCrLf & _
        "TenderLoop will now open its visible fallback installer. Keep that window open to see any error and retry safely.", _
        vbExclamation, "TenderLoop Setup"
    If fso.FileExists(fallbackInstaller) Then
        shell.Run "cmd.exe /d /c call """ & fallbackInstaller & """ INSTALL", 1, False
    Else
        MsgBox "The fallback installer was not found:" & vbCrLf & fallbackInstaller, vbCritical, "TenderLoop Setup"
    End If
End If
On Error GoTo 0

Set fso = Nothing
Set shell = Nothing
