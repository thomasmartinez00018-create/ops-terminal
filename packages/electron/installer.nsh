!macro customInstall
  ; Agregar regla de firewall para que celulares puedan conectarse al servidor
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="OPS Terminal Server" dir=in action=allow protocol=TCP localport=3001 profile=any'
!macroend

!macro customUnInstall
  ; Limpiar regla de firewall al desinstalar
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="OPS Terminal Server"'
!macroend
