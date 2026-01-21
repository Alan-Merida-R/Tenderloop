Set WshShell = CreateObject("Wscript.Shell")
' Ejecuta el .bat que tiene toda la lógica, pero lo hace invisible (parámetro 0)
WshShell.Run chr(34) & "motor_tenderloop.bat" & Chr(34), 0
Set WshShell = Nothing