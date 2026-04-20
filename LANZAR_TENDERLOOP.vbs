Set WshShell = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Ubicar carpeta del script para detectar si es primera ejecucion
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

If fso.FolderExists(scriptDir & "\node_modules") Then
    ' Ejecucion normal: ocultar la ventana para que solo se vea el navegador
    WshShell.Run chr(34) & "motor_tenderloop.bat" & Chr(34), 0
Else
    ' Primera ejecucion: mostrar ventana para que el usuario vea la instalacion
    ' y cualquier error (p.ej. Node.js faltante, proxy corporativo, etc.)
    WshShell.Run chr(34) & "motor_tenderloop.bat" & Chr(34), 1
End If

Set fso = Nothing
Set WshShell = Nothing