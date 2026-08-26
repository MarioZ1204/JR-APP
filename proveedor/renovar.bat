@echo off
chcp 65001 >nul
cd /d "%~dp0.."
title JR — Renovar licencia

echo.
echo  Renovar clave de producto (solo proveedor)
echo  ------------------------------------------
echo  Cierre el sistema (ventana de iniciar.bat) antes de continuar.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo No se encontro Node.js.
  pause
  exit /b 1
)

if not exist "producto.key" (
  echo Coloque el nuevo producto.key en la carpeta del sistema
  echo (generelo antes con proveedor\generar-clave.bat).
  echo.
  pause
  exit /b 1
)

node scripts/apply-license.js --file producto.key
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo Listo. Vuelva a ejecutar iniciar.bat
echo.
pause
