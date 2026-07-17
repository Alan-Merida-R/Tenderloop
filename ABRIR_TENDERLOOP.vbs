Option Explicit

Dim shell, fso, scriptDir, launcher, supportFiles, supportFile, supportPath

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
launcher = scriptDir & "\LANZAR_TENDERLOOP.vbs"

' Keep the folder simple for normal users. These files remain available to
' TenderLoop internally, but Explorer hides them after the first launch.
' motor_tenderloop.bat deliberately stays visible as the recovery launcher.
supportFiles = Array( _
    "ABRIR_TENDERLOOP.bat", _
    "LANZAR_TENDERLOOP.vbs", _
    "INSTALAR_TENDERLOOP.vbs", _
    "INSTALAR_TENDERLOOP.hta" _
)

On Error Resume Next
For Each supportFile In supportFiles
    supportPath = scriptDir & "\" & supportFile
    If fso.FileExists(supportPath) Then
        fso.GetFile(supportPath).Attributes = fso.GetFile(supportPath).Attributes Or 2
    End If
Next
On Error GoTo 0

If Not fso.FileExists(launcher) Then
    MsgBox "LANZAR_TENDERLOOP.vbs was not found in this folder." & vbCrLf & scriptDir, vbCritical, "TenderLoop"
    WScript.Quit 1
End If

' This is the only normal user-facing launcher. It opens TenderLoop without a
' console; if setup is incomplete, the hidden launcher opens the installer.
shell.Run "wscript.exe """ & launcher & """", 0, False

Set fso = Nothing
Set shell = Nothing
