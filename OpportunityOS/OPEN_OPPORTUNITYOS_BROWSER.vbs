Option Explicit

Dim shell, fso, scriptDir, motorPath, viteLauncher, command, windowStyle

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
motorPath = scriptDir & "\engine_opportunityos.bat"
viteLauncher = scriptDir & "\node_modules\.bin\vite.cmd"

If Not fso.FileExists(motorPath) Then
    MsgBox "engine_opportunityos.bat was not found in this folder." & vbCrLf & scriptDir, vbCritical, "OpportunityOS"
    WScript.Quit 1
End If

' Same as OPEN_OPPORTUNITYOS.vbs, but opens OpportunityOS as a normal browser
' tab (address bar, tabs, back button) instead of the app-style window — for
' users who prefer that.
If fso.FileExists(viteLauncher) Then
    command = "cmd.exe /d /c call """ & motorPath & """ HIDDEN TAB"
    windowStyle = 0
Else
    command = "cmd.exe /d /c call """ & motorPath & """ INSTALL"
    windowStyle = 1
End If

shell.Run command, windowStyle, False

Set fso = Nothing
Set shell = Nothing
