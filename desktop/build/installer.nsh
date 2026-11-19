; Permite que los móviles de la WiFi del local se conecten al TPV (puerto 8077)
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Platet TPV"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Platet TPV" dir=in action=allow protocol=TCP localport=8077 profile=private,domain,public'
!macroend
!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Platet TPV"'
!macroend
