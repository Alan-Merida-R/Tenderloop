Set WshShell = CreateObject("Wscript.Shell")
' Cambiamos a 1 para que el usuario pueda ver errores en consola durante la depuracion
WshShell.Run chr(34) & "motor_tenderloop.bat" & Chr(34), 1
Set WshShell = Nothing