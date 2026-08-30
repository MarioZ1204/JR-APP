@echo off
chcp 65001 >nul
cd /d "%~dp0"
title JR â€” Generar clave

echo.
echo  ========================================
echo   Generar clave de producto
echo   (solo proveedor â€” carpeta Key)
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
node scripts\generate-key.js "%CLIENT%" %UNTIL%
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo Siguiente paso:
echo   1. Copie producto.key a la carpeta "Sistema JR" del cliente
echo   2. En el PC del cliente ejecute instalar.bat o renovar.bat
echo.
pause
