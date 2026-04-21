Set WshShell = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Ubicar carpeta del script
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

If fso.FolderExists(scriptDir & "\node_modules") Then
    ' Ejecucion normal: consola completamente oculta.
    ' El navegador se abrira en modo --app (sin marcos) desde el .bat
    WshShell.Run chr(34) & "motor_tenderloop.bat" & Chr(34) & " HIDDEN", 0
Else
    ' Primera ejecucion: mostrar ventana para ver instalacion y errores
    WshShell.Run chr(34) & "motor_tenderloop.bat" & Chr(34) & " VISIBLE", 1
End If

Set fso = Nothing
Set WshShell = Nothing