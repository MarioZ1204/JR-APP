@echo off
chcp 65001 >nul
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Se necesita permiso de administrador para abrir el puerto 3000
  echo  al celular. Acepte la ventana de Windows.
  echo.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

netsh advfirewall firewall delete rule name="JR Burger LAN" >nul 2>&1
netsh advfirewall firewall add rule name="JR Burger LAN" dir=in action=allow protocol=TCP localport=3000 profile=any enable=yes
if errorlevel 1 (
  echo No se pudo crear la regla del firewall.
  pause
  exit /b 1
)

echo.
echo  Listo. El puerto 3000 ya admite el celular.
echo  En el telefono abra la IP que muestra iniciar.bat, con :3000 al final.
echo  Ejemplo WiFi:     http://192.168.0.104:3000
echo  Ejemplo Tailscale: http://100.x.x.x:3000  ^(PC y celular con Tailscale^)
echo  WiFi: misma red, no datos moviles. Tailscale: misma cuenta en ambos.
echo.
pause
