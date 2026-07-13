Option Explicit

Dim shell, fso, scriptDir, launcher

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
launcher = scriptDir & "\LANZAR_TENDERLOOP.vbs"

If Not fso.FileExists(launcher) Then
    MsgBox "LANZAR_TENDERLOOP.vbs was not found in this folder." & vbCrLf & scriptDir, vbCritical, "TenderLoop"
    WScript.Quit 1
End If

' This is the user-facing launcher. It opens TenderLoop without a console;
' if setup is incomplete, LANZAR_TENDERLOOP opens the verified installer.
shell.Run "wscript.exe """ & launcher & """", 0, False

Set fso = Nothing
Set shell = Nothing
