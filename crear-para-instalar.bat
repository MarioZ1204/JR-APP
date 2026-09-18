@echo off
chcp 65001 >nul
cd /d "%~dp0"
title JR — Crear carpeta Para Instalar

echo.
echo  Genera la carpeta "Para Instalar" con el programa
echo  y el archivo JR Sistema.exe para abrirlo.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\crear-para-instalar.ps1"
echo.
pause
