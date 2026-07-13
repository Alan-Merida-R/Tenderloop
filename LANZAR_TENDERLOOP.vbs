Option Explicit

Dim WshShell, fso, scriptDir, batPath, installerUi, viteLauncher, setupMarker

Set WshShell = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = scriptDir & "\motor_tenderloop.bat"
installerUi = scriptDir & "\INSTALAR_TENDERLOOP.hta"
viteLauncher = scriptDir & "\node_modules\.bin\vite.cmd"
setupMarker = scriptDir & "\.tenderloop-setup-complete"
WshShell.Environment("PROCESS")("TENDERLOOP_ROOT") = scriptDir

If fso.FileExists(viteLauncher) And fso.FileExists(setupMarker) Then
    ' Normal run: hidden console, only the app window is visible.
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
