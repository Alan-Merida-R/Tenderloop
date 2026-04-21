Set WshShell = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = scriptDir & "\motor_tenderloop.bat"

If fso.FolderExists(scriptDir & "\node_modules") Then
    ' Ejecucion normal: consola oculta, solo se ve el navegador
    WshShell.Run "cmd /c """ & batPath & """ HIDDEN", 0, False
Else
    ' Primera vez: mostrar ventana para que se vea la instalacion
    WshShell.Run "cmd /c """ & batPath & """ VISIBLE", 1, False
End If

Set fso = Nothing
Set WshShell = Nothing