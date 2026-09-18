# Crea la carpeta "Para Instalar" lista para copiar al PC del restaurante.
$ErrorActionPreference = 'Stop'

$Src = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $Src 'package.json'))) {
  throw "No se encontro la raiz del proyecto."
}

$Out = Join-Path $Src 'Para Instalar'
$LauncherSrc = Join-Path $PSScriptRoot 'launcher\JRSistema.cs'
$ExeName = 'JR Sistema.exe'

Write-Host ""
Write-Host "========================================"
Write-Host " Creando carpeta Para Instalar"
Write-Host "========================================"
Write-Host " Destino: $Out"
Write-Host ""

if (Test-Path $Out) {
  Remove-Item $Out -Recurse -Force
}
New-Item -ItemType Directory -Path $Out -Force | Out-Null

$excludeDirs = @(
  'node_modules', '.git', 'proveedor', 'data', 'backups',
  '_disco-J', 'Para Instalar', 'agent-transcripts', '.cursor', 'assets-src'
)
$excludeFiles = @(
  'producto.key', 'product.key', '.env', '*.pem', '.gitignore',
  'empaquetar-entrega.bat', 'crear-para-instalar.bat'
)

robocopy $Src $Out /E /XD $excludeDirs /XF $excludeFiles /NFL /NDL /NJH /NJS /NC /NS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy fallo con codigo $LASTEXITCODE" }

# No copiar scripts de desarrollo / empaquetado
$remove = @(
  (Join-Path $Out 'scripts\empaquetar-entrega.ps1'),
  (Join-Path $Out 'scripts\crear-para-instalar.ps1'),
  (Join-Path $Out 'scripts\capturas.js'),
  (Join-Path $Out 'scripts\smoke-test.js'),
  (Join-Path $Out 'scripts\launcher')
)
foreach ($p in $remove) {
  if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}

$dataDir = Join-Path $Out 'data'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
Set-Content -Path (Join-Path $dataDir '.gitkeep') -Value '' -Encoding UTF8

# Compilar lanzador .exe
$cscCandidates = @(
  "${env:WINDIR}\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "${env:WINDIR}\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$csc = $cscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$exeOut = Join-Path $Out $ExeName

if (-not $csc) {
  Write-Host " AVISO: no se encontro csc.exe; se crea JR-Sistema.bat como alternativa."
  @"
@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" "%~dp0iniciar.bat"
"@ | Set-Content -Path (Join-Path $Out 'JR-Sistema.bat') -Encoding ASCII
} else {
  Write-Host " Compilando $ExeName ..."
  & $csc /nologo /target:winexe /optimize+ /out:"$exeOut" /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll "$LauncherSrc"
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $exeOut)) {
    throw "No se pudo compilar el lanzador .exe"
  }
  Write-Host " OK: $ExeName"
}

# Acceso directo junto al exe (por si el antivirus bloquea exe)
$shortcut = Join-Path $Out 'Abrir JR Sistema.lnk'
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($shortcut)
if (Test-Path $exeOut) {
  $s.TargetPath = $exeOut
} else {
  $s.TargetPath = Join-Path $Out 'iniciar.bat'
}
$s.WorkingDirectory = $Out
$s.Description = 'Abrir JR Sistema'
$s.Save()

@'
================================================================================
  JR SISTEMA — CARPETA PARA INSTALAR
================================================================================

Copie ESTA carpeta completa al PC del restaurante
(por ejemplo: C:\JR-Sistema\ ).

IMPORTANTE: NO la ponga en "Archivos de programa".
Windows bloquea escribir ahi. Use C:\JR-Sistema

Nombre del negocio por defecto: JR Burger
(se puede cambiar en Ajustes).

--------------------------------------------------------------------------------
PRIMERA VEZ
--------------------------------------------------------------------------------

  1. Instale Node.js 22 o superior (LTS) desde:
     https://nodejs.org

  2. Doble clic en:  instalar.bat
     (instala dependencias y deja el sistema listo)

  3. Cada dia abra el programa con:
       •  El acceso directo "JR Sistema" del escritorio
       •  Si no aparece ^(cuenta sin admin^): ejecute crear-acceso-directo.bat
       o • JR Sistema.exe dentro de C:\JR-Sistema

  4. En el navegador entre con:
       Usuario: admin
       Clave:   admin123
     y cambie la contraseña.

--------------------------------------------------------------------------------
USO DIARIO
--------------------------------------------------------------------------------

  • Abra "JR Sistema.exe" y deje la ventana abierta.
  • El navegador se abre solo en http://localhost:3000
  • Para cerrar: boton "Cerrar sistema" en la ventana.

--------------------------------------------------------------------------------
CELULAR / TABLET
--------------------------------------------------------------------------------

  Misma WiFi del local:
  1. En la ventana de inicio vera la IP, ejemplo:
     http://192.168.1.10:3000
  2. Si el celular no entra, ejecute permitir-red.bat

  Tailscale (fuera del local o con datos moviles):
  1. Instale Tailscale en el PC y en el celular (misma cuenta)
  2. Arranque JR Sistema; vera una IP 100.x.x.x o nombre MagicDNS
  3. Abra esa direccion en el celular con Tailscale activo

--------------------------------------------------------------------------------
QUE HAY EN ESTA CARPETA
--------------------------------------------------------------------------------

  JR Sistema.exe     Abrir el sistema (ventana simple)
  instalar.bat       Solo la primera vez
  iniciar.bat        Alternativa sin .exe
  permitir-red.bat   Firewall para celulares
  server\ public\    Programa
  data\              Se crea la base de datos al arrancar
  docs\              Manuales

NO borre ni mueva archivos de adentro de la carpeta.
Mas detalle: INSTRUCCIONES-INSTALACION.txt

================================================================================
'@ | Set-Content -Path (Join-Path $Out 'LEEME.txt') -Encoding UTF8

Write-Host ""
Write-Host "Listo."
Write-Host "  Carpeta: $Out"
if (Test-Path $exeOut) {
  Write-Host "  Lanzador: $ExeName"
}
Write-Host ""
Write-Host " Copie la carpeta 'Para Instalar' al USB o al PC del local."
Write-Host ""
