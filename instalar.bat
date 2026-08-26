@echo off
chcp 65001 >nul
cd /d "%~dp0"
title JR — Instalador

echo.
echo  ========================================
echo   Instalador del sistema
echo  ========================================
echo.
echo  Esto prepara el programa en este PC
echo  (como un instalador .exe, pero en .bat).
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: No se encontro Node.js.
  echo Instale Node.js LTS 22 o superior desde https://nodejs.org
  echo y vuelva a ejecutar este instalador.
  echo.
  pause
  exit /b 1
)

if not exist "producto.key" if not exist "data\product.key" (
  echo ERROR: Falta la clave de producto.
  echo En su PC de proveedor ejecute generar-clave.bat y copie
  echo el archivo producto.key junto a este instalador.
  echo.
  pause
  exit /b 1
)

echo [1/4] Dependencias...
if not exist "node_modules" (
  call npm install
  if errorlevel 1 (
    echo Fallo npm install.
    pause
    exit /b 1
  )
) else (
  echo       Ya estaban instaladas.
)

echo [2/4] Activando clave de producto...
if exist "producto.key" (
  node scripts/apply-license.js --file producto.key
) else (
  node scripts/apply-license.js --file data\product.key
)
if errorlevel 1 (
  echo No se pudo aplicar la clave.
  pause
  exit /b 1
)

echo [3/4] ¿Dejar el sistema limpio para el local? (borra ventas/caja, conserva menu)
choice /C SN /M "Instalacion limpia"
if errorlevel 2 goto skip_reset
if errorlevel 1 (
  node scripts/factory-reset.js --confirm INSTALAR
  if errorlevel 1 (
    echo Aviso: no se completo la limpieza.
  )
)
:skip_reset

echo [4/4] Acceso directo...
set "SHORTCUT=%USERPROFILE%\Desktop\JR Sistema.lnk"
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%SHORTCUT%');" ^
  "$s.TargetPath='%~dp0iniciar.bat';" ^
  "$s.WorkingDirectory='%~dp0';" ^
  "$s.Description='Sistema de restaurante';" ^
  "$s.Save()" 2>nul

echo.
echo  ========================================
echo   Instalacion terminada
echo  ========================================
echo.
echo  Use el acceso directo "JR Sistema" o ejecute iniciar.bat
echo  Entrada tipica: usuario admin (cambie la contraseña al entrar)
echo.
echo  El personal del restaurante NO ve pantallas de licencia.
echo.
pause
