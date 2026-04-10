; ── installer.nsh — hooks vacíos a propósito ────────────────────────────────
;
; NO agregar reglas de firewall acá. Modificar firewall durante la instalación
; es el patrón #1 que Windows Defender / Avast / Norton / Kaspersky marcan
; como "trojan backdoor" (heurística de malware). El instalador quedaba
; flaggeado en VirusTotal por culpa del `netsh advfirewall firewall add rule`.
;
; En su lugar, la regla de firewall se crea on-demand desde dentro de la app:
;   - main.js → ensureFirewallRule() al arrancar (intento silencioso)
;   - Pantalla "Acceso Red" → botón "Abrir firewall" con UAC explícito
;
; Esto es además lo que hacen las apps legítimas que escuchan en la red local
; (VLC, OBS, Slack, etc.): preguntan permiso al usuario en tiempo de uso,
; NUNCA lo hacen silenciosamente durante el install.

!macro customInstall
!macroend

!macro customUnInstall
!macroend
