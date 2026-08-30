@echo off
chcp 65001 >nul
cd /d "%~dp0"
title JR â€” Renovar licencia

echo.
echo  ========================================
echo   Renovar licencia en PC del cliente
echo   (carpeta Key â€” lleve producto.key nuevo)
echo  ========================================
echo.
echo  Cierre el sistema del restaurante (iniciar.bat) antes de continuar.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo No se encontro Node.js.
  pause
  exit /b 1
)

if not exist "producto.key" (
  echo Falta producto.key en esta carpeta Key.
  echo Genere uno con generar-clave.bat
  pause
  exit /b 1
)

set /p RUTA=Ruta de la carpeta "Sistema JR" en ESTE PC (ej. C:\Sistema JR): 
if "%RUTA%"=="" (
  echo Debe indicar la ruta.
  pause
  exit /b 1
)

if not exist "%RUTA%\instalar.bat" (
  echo No parece la carpeta del sistema (falta instalar.bat).
  pause
  exit /b 1
)

pushd "%RUTA%"
node scripts\apply-license.js --file "%~dp0producto.key"
set ERR=%ERRORLEVEL%
popd

if %ERR% neq 0 (
  pause
  exit /b 1
)

echo.
echo Listo. En el cliente ejecute iniciar.bat
echo.
pause
