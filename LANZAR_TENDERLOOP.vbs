Option Explicit

Dim WshShell, fso, scriptDir, batPath, installerUi, viteLauncher

Set WshShell = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = scriptDir & "\motor_tenderloop.bat"
installerUi = scriptDir & "\INSTALAR_TENDERLOOP.hta"
viteLauncher = scriptDir & "\node_modules\.bin\vite.cmd"
WshShell.Environment("PROCESS")("TENDERLOOP_ROOT") = scriptDir

If fso.FileExists(viteLauncher) Then
    ' Normal run: if Vite exists, TenderLoop is ready to start. Do not
    ' require an installer marker, since a previous interrupted setup must
    ' never prevent an otherwise working local application from opening.
    WshShell.Run """" & batPath & """ HIDDEN", 0, False
Else
    ' First run or an incomplete installation: always show the Windows-style
    ' installer instead of silently attempting to launch a broken app.
    If fso.FileExists(scriptDir & "\INSTALAR_TENDERLOOP.vbs") Then
        WshShell.Run "wscript.exe """ & scriptDir & "\INSTALAR_TENDERLOOP.vbs""", 1, False
    Else
        WshShell.Run """" & batPath & """ VISIBLE", 1, False
    End If
End If

Set fso = Nothing
Set WshShell = Nothing
