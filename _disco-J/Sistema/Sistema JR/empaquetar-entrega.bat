@echo off
chcp 65001 >nul
cd /d "%~dp0"
title JR — Empaquetar entrega

echo.
echo  Crea en J:\Sistema\
echo    - Sistema JR   (para el restaurante)
echo    - Key          (claves del proveedor)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\empaquetar-entrega.ps1"
echo.
pause
