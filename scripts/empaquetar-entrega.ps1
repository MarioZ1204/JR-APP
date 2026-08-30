# Empaqueta entrega en F:\Sistema\Sistema JR  y  F:\Sistema\Key
$ErrorActionPreference = 'Stop'
$Src = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $Src 'package.json'))) {
  throw "No se encontro la raiz del proyecto junto a scripts/"
}

$JRoot = 'F:\Sistema'

$ClientDir = Join-Path $JRoot 'Sistema JR'
$KeyDir = Join-Path $JRoot 'Key'

New-Item -ItemType Directory -Path $ClientDir -Force | Out-Null
New-Item -ItemType Directory -Path $KeyDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $KeyDir 'scripts') -Force | Out-Null

Write-Host ""
Write-Host "========================================"
Write-Host " Empaquetando entrega"
Write-Host "========================================"
Write-Host " Origen : $Src"
Write-Host " Cliente: $ClientDir"
Write-Host " Key    : $KeyDir"
Write-Host ""

$excludeDirs = @(
  'node_modules', '.git', 'proveedor', 'data', 'backups',
  '_disco-J', 'Sistema'
)
$excludeFiles = @('producto.key', 'product.key', '.env', 'empaquetar-entrega.bat')

robocopy $Src $ClientDir /MIR /XD $excludeDirs /XF $excludeFiles /NFL /NDL /NJH /NJS /NC /NS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy fallo con codigo $LASTEXITCODE" }

# Quitar carpeta proveedor si quedo
$prov = Join-Path $ClientDir 'proveedor'
if (Test-Path $prov) { Remove-Item $prov -Recurse -Force }

# Data vacia (plantilla)
$dataDir = Join-Path $ClientDir 'data'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
if (-not (Test-Path (Join-Path $dataDir '.gitkeep'))) {
  Set-Content -Path (Join-Path $dataDir '.gitkeep') -Value '' -Encoding UTF8
}

# --- Carpeta Key (proveedor) ---
Copy-Item (Join-Path $Src 'scripts\key-tools\generate-key.js') (Join-Path $KeyDir 'scripts\generate-key.js') -Force

@'
@echo off
chcp 65001 >nul
cd /d "%~dp0"
title JR — Generar clave

echo.
echo  ========================================
echo   Generar clave de producto
echo   (solo proveedor — carpeta Key)
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
'@ | Set-Content -Path (Join-Path $KeyDir 'generar-clave.bat') -Encoding UTF8

@'
@echo off
chcp 65001 >nul
cd /d "%~dp0"
title JR — Renovar licencia

echo.
echo  ========================================
echo   Renovar licencia en PC del cliente
echo   (carpeta Key — lleve producto.key nuevo)
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
'@ | Set-Content -Path (Join-Path $KeyDir 'renovar.bat') -Encoding UTF8

@'
================================================================================
  JR — Carpeta KEY (solo proveedor)
================================================================================

Esta carpeta NO va al restaurante. Quédese en su PC o USB de soporte.

ARCHIVOS
  generar-clave.bat   Crea producto.key para un cliente y fecha de vencimiento
  renovar.bat         Aplica una clave nueva en el PC del cliente (sistema cerrado)
  producto.key        Se genera aqui al crear una clave

FLUJO — INSTALACION NUEVA
  1. Ejecute generar-clave.bat
  2. Copie producto.key dentro de la carpeta "Sistema JR"
  3. Lleve "Sistema JR" al PC del restaurante
  4. Alli ejecute instalar.bat (solo la primera vez)

FLUJO — RENOVACION
  1. Generar clave nueva (generar-clave.bat)
  2. Cierre el sistema en el restaurante (ventana iniciar.bat)
  3. Ejecute renovar.bat e indique la ruta de "Sistema JR" en ese PC
     (puede llevar esta carpeta Key en USB con el producto.key nuevo)

REQUISITO: Node.js 22+ instalado en el PC donde ejecute estos .bat
================================================================================
'@ | Set-Content -Path (Join-Path $KeyDir 'LEEME.txt') -Encoding UTF8

@'
================================================================================
  JR — SISTEMA PARA EL RESTAURANTE (cliente)
================================================================================

PRIMERA VEZ EN ESTE PC
  1. El proveedor debe haber copiado producto.key dentro de esta carpeta
  2. Doble clic en instalar.bat
  3. Luego use iniciar.bat o el acceso directo "JR Sistema"

CADA DIA
  Doble clic en iniciar.bat — deje la ventana abierta durante el servicio

CELULARES / TABLETS
  Misma WiFi del local. Abra http://IP-DEL-PC:3000
  Si no entra: permitir-red.bat

USUARIOS INICIALES (cambie las contraseñas)
  admin / admin123
  mesero / mesero123
  cocina / cocina123
  cajero / cajero123

La licencia NO se activa desde la app. El proveedor instala la clave con
instalar.bat o renovar.bat (carpeta Key del proveedor).

Mas detalle: INSTRUCCIONES-INSTALACION.txt
================================================================================
'@ | Set-Content -Path (Join-Path $ClientDir 'LEEME.txt') -Encoding UTF8

# Actualizar instalar.bat mensaje clave
$instBat = Join-Path $ClientDir 'instalar.bat'
if (Test-Path $instBat) {
  (Get-Content $instBat -Raw -Encoding UTF8) `
    -replace 'En su PC de proveedor ejecute generar-clave\.bat y copie', 'En la carpeta Key del proveedor ejecute generar-clave.bat y copie' `
    | Set-Content $instBat -Encoding UTF8 -NoNewline
}

Write-Host "Listo."
Write-Host ""
Write-Host "  Cliente : $ClientDir"
Write-Host "  Key     : $KeyDir"
Write-Host ""
