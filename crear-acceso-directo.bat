@echo off
chcp 65001 >nul
cd /d "%~dp0"
title JR — Crear acceso directo

echo.
echo  Crea el acceso directo "JR Sistema" en SU escritorio
echo  ^(no necesita ser administrador^)
echo.

set "TARGET=%~dp0iniciar.bat"
if exist "%~dp0JR Sistema.exe" set "TARGET=%~dp0JR Sistema.exe"
if not exist "%TARGET%" (
  echo No se encontro JR Sistema.exe ni iniciar.bat en esta carpeta.
  pause
  exit /b 1
)

> "%~dp0jr-home.txt" echo %~dp0

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\crear-acceso-directo.ps1" -Target "%TARGET%" -WorkDir "%~dp0" -UserDesktop "%USERPROFILE%\Desktop"
if errorlevel 1 (
  echo.
  echo No se pudo crear. Pruebe crear el acceso directo a mano:
  echo  1. Vaya a esta carpeta
  echo  2. Clic derecho en "JR Sistema.exe" o iniciar.bat
  echo  3. Enviar a - Escritorio ^(crear acceso directo^)
  echo.
  pause
  exit /b 1
)

echo.
echo  Listo. Busque "JR Sistema" en el escritorio.
echo  Si no aparece, mire el Escritorio publico o pulse F5.
echo.
pause
