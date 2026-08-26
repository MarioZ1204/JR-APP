@echo off
chcp 65001 >nul
cd /d "%~dp0.."

echo.
echo  ========================================
echo   JR — Generar clave de producto
echo   (solo en TU computador)
echo  ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo No se encontro Node.js. Instale Node.js LTS 22+ desde https://nodejs.org
  pause
  exit /b 1
)

set /p CLIENT=Nombre del restaurante / cliente: 
if "%CLIENT%"=="" (
  echo Debe indicar un nombre.
  pause
  exit /b 1
)

set /p UNTIL=Fecha de vencimiento (AAAA-MM-DD, ej. 2026-12-31): 
if "%UNTIL%"=="" (
  echo Debe indicar la fecha.
  pause
  exit /b 1
)

echo.
node scripts/license-key.js "%CLIENT%" %UNTIL%
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo Listo. Copie la carpeta del sistema + producto.key al PC del local
echo y alli ejecute instalar.bat
echo.
echo Para renovar: genere otra clave, lleve producto.key y ejecute
echo proveedor\renovar.bat en el PC del restaurante (con el sistema cerrado).
echo.
pause
