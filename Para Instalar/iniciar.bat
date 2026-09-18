@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  JR Burger — inicio local
echo  --------------------------------
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo No se encontro Node.js.
  echo Instale Node.js LTS 22 o superior desde https://nodejs.org y vuelva a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo %~dp0 | findstr /I /C:"\Program Files\" /C:"\Program Files (x86)\" >nul
  if not errorlevel 1 (
    echo Esta carpeta esta en Archivos de programa.
    echo La primera instalacion necesita administrador.
    echo Mejor copie el sistema a C:\JR-Sistema
    echo.
    net session >nul 2>&1
    if errorlevel 1 (
      powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
      exit /b
    )
  )
  echo Instalando dependencias la primera vez. Puede tardar unos minutos...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo Fallo npm install. Si esta en Archivos de programa, ejecute como administrador
    echo o mueva la carpeta a C:\JR-Sistema
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Abriendo el navegador en http://localhost:3000
echo Deje esta ventana abierta mientras use el sistema.
echo.
echo En el celular NO use localhost.
echo Use la IP WiFi o la de Tailscale que aparece abajo, CON el puerto :3000.
echo Ejemplo WiFi: http://192.168.0.104:3000
echo Ejemplo Tailscale: http://100.x.x.x:3000
echo Si no entra, ejecute permitir-red.bat ^(pide administrador^).
echo.
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"

node server/index.js
echo.
pause
