Set WshShell = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = scriptDir & "\motor_tenderloop.bat"
installerUi = scriptDir & "\INSTALAR_TENDERLOOP.hta"

If fso.FolderExists(scriptDir & "\node_modules") Then
    ' Normal run: hidden console, only the app window is visible.
    WshShell.Run """" & batPath & """ HIDDEN", 0, False
Else
    ' First run: show the Windows-style installer.
    If fso.FileExists(installerUi) Then
        WshShell.Run "mshta.exe """ & installerUi & """", 1, False
    Else
        WshShell.Run """" & batPath & """ VISIBLE", 1, False
    End If
End If

Set fso = Nothing
Set WshShell = Nothing
