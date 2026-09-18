@echo off
chcp 65001 >nul
cd /d "%~dp0"
title JR Burger — Conectar Tailscale

set "TS=C:\Program Files\Tailscale\tailscale.exe"
set "MAIL=jrburgerpasto@gmail.com"

echo.
echo  ========================================
echo   Tailscale — JR Burger
echo  ========================================
echo.
echo  Cuenta a usar:  %MAIL%
echo.
echo  En el navegador:
echo   1. Elija iniciar sesion con Google
echo   2. Entre con  %MAIL%
echo   3. Acepte conectar este PC
echo.

if not exist "%TS%" (
  echo No se encontro Tailscale.
  echo Instale desde https://tailscale.com/download
  echo.
  pause
  exit /b 1
)

echo Abriendo inicio de sesion de Tailscale...
echo.
"%TS%" login
echo.
echo Si el navegador no abrio, copie la URL que aparece arriba.
echo Cuando termine, vuelva a abrir JR Sistema para ver la IP 100.x.x.x
echo.
pause
