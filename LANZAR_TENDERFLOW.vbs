Set WshShell = CreateObject("Wscript.Shell")
' Ejecuta el motor de Flow de forma invisible para que solo se vea la ventana de la aplicacion
WshShell.Run chr(34) & "motor_tenderflow.bat" & Chr(34), 0
Set WshShell = Nothing
