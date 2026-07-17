Option Explicit

Dim shell, fso, scriptDir, motorPath, viteLauncher, command, windowStyle

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
motorPath = scriptDir & "\motor_tenderloop.bat"
viteLauncher = scriptDir & "\node_modules\.bin\vite.cmd"

If Not fso.FileExists(motorPath) Then
    MsgBox "motor_tenderloop.bat was not found in this folder." & vbCrLf & scriptDir, vbCritical, "TenderLoop"
    WScript.Quit 1
End If

' Launch the reliable batch motor directly. Do not hide, delete or rename any
' support file: corporate Windows policies may block VBS/HTA files, so the
' visible ABRIR_TENDERLOOP.bat and motor_tenderloop.bat must remain available.
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
