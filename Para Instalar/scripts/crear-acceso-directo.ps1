param(
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][string]$WorkDir,
  [string]$UserDesktop = ''
)

$ErrorActionPreference = 'Continue'
$shell = New-Object -ComObject WScript.Shell
$name = 'JR Sistema.lnk'
$created = @()

function New-JrShortcut([string]$folder) {
  if (-not $folder) { return $false }
  try {
    if (-not (Test-Path -LiteralPath $folder)) {
      New-Item -ItemType Directory -Path $folder -Force | Out-Null
    }
    $link = Join-Path $folder $name
    $s = $shell.CreateShortcut($link)
    $s.TargetPath = $Target
    $s.WorkingDirectory = $WorkDir.TrimEnd('\')
    $s.Description = 'JR Burger — sistema de restaurante'
    $s.WindowStyle = 1
    $s.Save()
    if (Test-Path -LiteralPath $link) {
      $script:created += $link
      return $true
    }
  } catch {
    Write-Host "  No se pudo crear en: $folder"
  }
  return $false
}

$targets = New-Object System.Collections.Generic.List[string]

# Escritorio público: lo ven todos los usuarios (incluye cuentas sin admin)
$publicDesktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
if ($publicDesktop) { [void]$targets.Add($publicDesktop) }

# Escritorio del usuario que pidió la instalación (antes de elevar)
if ($UserDesktop) { [void]$targets.Add($UserDesktop) }

# Escritorio del usuario actual
$desk = [Environment]::GetFolderPath('Desktop')
if ($desk) { [void]$targets.Add($desk) }

# OneDrive / variantes frecuentes
$candidates = @(
  (Join-Path $env:USERPROFILE 'Desktop'),
  (Join-Path $env:USERPROFILE 'Escritorio'),
  (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
  (Join-Path $env:USERPROFILE 'OneDrive\Escritorio')
)
foreach ($c in $candidates) {
  if ($c -and (Test-Path -LiteralPath $c)) { [void]$targets.Add($c) }
}

$unique = $targets | Select-Object -Unique
$ok = 0
foreach ($folder in $unique) {
  if (New-JrShortcut $folder) {
    Write-Host "  OK: $folder"
    $ok++
  }
}

if ($ok -eq 0) {
  Write-Host "No se creo ningun acceso directo."
  exit 1
}

Write-Host "Accesos creados: $ok"
exit 0
