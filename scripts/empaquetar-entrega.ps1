# Empaqueta entrega en F:\Sistema\Sistema JR
$ErrorActionPreference = 'Stop'
$Src = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $Src 'package.json'))) {
  throw "No se encontro la raiz del proyecto junto a scripts/"
}

$JRoot = 'F:\Sistema'
$ClientDir = Join-Path $JRoot 'Sistema JR'

New-Item -ItemType Directory -Path $ClientDir -Force | Out-Null

Write-Host ""
Write-Host "========================================"
Write-Host " Empaquetando entrega"
Write-Host "========================================"
Write-Host " Origen : $Src"
Write-Host " Cliente: $ClientDir"
Write-Host ""

$excludeDirs = @(
  'node_modules', '.git', 'proveedor', 'data', 'backups',
  '_disco-J', 'Sistema', 'scripts\key-tools'
)
$excludeFiles = @('producto.key', 'product.key', '.env', 'empaquetar-entrega.bat', '*.pem')

robocopy $Src $ClientDir /MIR /XD $excludeDirs /XF $excludeFiles /NFL /NDL /NJH /NJS /NC /NS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy fallo con codigo $LASTEXITCODE" }

$prov = Join-Path $ClientDir 'proveedor'
if (Test-Path $prov) { Remove-Item $prov -Recurse -Force }
$keyTools = Join-Path $ClientDir 'scripts\key-tools'
if (Test-Path $keyTools) { Remove-Item $keyTools -Recurse -Force }

# Data vacia (plantilla)
$dataDir = Join-Path $ClientDir 'data'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
if (-not (Test-Path (Join-Path $dataDir '.gitkeep'))) {
  Set-Content -Path (Join-Path $dataDir '.gitkeep') -Value '' -Encoding UTF8
}

# Quitar carpeta Key antigua si existe
$KeyDir = Join-Path $JRoot 'Key'
if (Test-Path $KeyDir) {
  Remove-Item $KeyDir -Recurse -Force
  Write-Host " Carpeta Key antigua eliminada."
}

@'
================================================================================
  JR — SISTEMA PARA EL RESTAURANTE
================================================================================

PRIMERA VEZ EN ESTE PC
  1. Instale Node.js 22+ desde https://nodejs.org
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

Mas detalle: INSTRUCCIONES-INSTALACION.txt
================================================================================
'@ | Set-Content -Path (Join-Path $ClientDir 'LEEME.txt') -Encoding UTF8

Write-Host "Listo."
Write-Host ""
Write-Host "  Cliente : $ClientDir"
Write-Host ""
