@echo off
chcp 65001 >nul
cd /d "%~dp0"
title JR — Instalador

REM Si nos elevaron, recuperar escritorio del usuario original
set "USER_DESKTOP="
if /I "%~1"=="-userdesktop" (
  set "USER_DESKTOP=%~2"
)

echo.
echo  ========================================
echo   Instalador del sistema
echo  ========================================
echo.

REM Archivos de programa: necesita admin, pero el acceso directo debe ir al usuario real
echo %~dp0 | findstr /I /C:"\Program Files\" /C:"\Program Files (x86)\" >nul
if not errorlevel 1 (
  echo  AVISO: Esta carpeta esta en Archivos de programa.
  echo  Mejor use C:\JR-Sistema
  echo.
  net session >nul 2>&1
  if errorlevel 1 (
    echo  Se pedira permiso de administrador...
    if "%USER_DESKTOP%"=="" set "USER_DESKTOP=%USERPROFILE%\Desktop"
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "Start-Process -FilePath '%~f0' -ArgumentList '-userdesktop','%USER_DESKTOP%' -Verb RunAs"
    exit /b
  )
  echo  Ejecutando como administrador.
  echo.
)

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
    echo Si esta en Archivos de programa, ejecute este .bat como administrador.
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

echo [3/3] Accesos directos...
> "%~dp0jr-home.txt" echo %~dp0

set "TARGET=%~dp0iniciar.bat"
if exist "%~dp0JR Sistema.exe" set "TARGET=%~dp0JR Sistema.exe"
if "%USER_DESKTOP%"=="" set "USER_DESKTOP=%USERPROFILE%\Desktop"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\crear-acceso-directo.ps1" -Target "%TARGET%" -WorkDir "%~dp0" -UserDesktop "%USER_DESKTOP%"
if errorlevel 1 (
  echo Aviso: no se pudo crear el acceso directo automaticamente.
  echo Ejecute crear-acceso-directo.bat con su usuario normal ^(sin admin^).
)

echo.
echo  ========================================
echo   Instalacion terminada
echo  ========================================
echo.
echo  Accesos directos:
echo   • Escritorio publico ^(lo ven todos los usuarios^)
echo   • Su escritorio, si Windows lo permitio
echo.
echo  Si NO ve el icono en SU escritorio:
echo   1. Cierre esta ventana
echo   2. Con su usuario normal, ejecute: crear-acceso-directo.bat
echo.
echo  NO copie el .exe al escritorio; use el acceso directo.
echo  Lugar recomendado: C:\JR-Sistema
echo  Entrada: admin / admin123 ^(cambie la clave^)
echo.
pause
