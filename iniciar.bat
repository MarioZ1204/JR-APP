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
  echo Instalando dependencias la primera vez. Puede tardar unos minutos...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo Fallo npm install. Revise la conexion a internet e intente de nuevo.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Abriendo el navegador en http://localhost:3000
echo Deje esta ventana abierta mientras use el sistema.
echo En tablets y celulares del WiFi use la IP que aparece abajo.
echo.
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"

node server/index.js
echo.
pause
