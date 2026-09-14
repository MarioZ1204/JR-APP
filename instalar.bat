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

echo [1/3] Dependencias...
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

echo [2/3] ¿Dejar el sistema limpio para el local? (borra ventas/caja, conserva menu)
choice /C SN /M "Instalacion limpia"
if errorlevel 2 goto skip_reset
if errorlevel 1 (
  if not exist "node_modules" call npm install
  node scripts/factory-reset.js --confirm INSTALAR
  if errorlevel 1 (
    echo Aviso: no se completo la limpieza.
  )
)
:skip_reset

echo [3/3] Acceso directo...
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
pause
