Set WshShell = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Ubicar carpeta del script
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' Siempre mostrar la ventana (al menos minimizada) para que el usuario
' pueda ver logs y errores. El estilo 7 = minimizada, 1 = normal.
' Primera ejecucion: ventana normal para ver instalacion.
' Siguientes: minimizada para no estorbar.
If fso.FolderExists(scriptDir & "\node_modules") Then
    ' Ejecucion normal: ventana minimizada (se puede maximizar si hay errores)
    WshShell.Run chr(34) & "motor_tenderloop.bat" & Chr(34), 7
Else
    ' Primera ejecucion: mostrar ventana normal
    WshShell.Run chr(34) & "motor_tenderloop.bat" & Chr(34), 1
End If

Set fso = Nothing
Set WshShell = Nothing