# OpenMedia Downloader — Menu principal
# Uso: powershell -ExecutionPolicy Bypass -File iniciar.ps1

function Test-Cmd($n) { $null -ne (Get-Command $n -ErrorAction SilentlyContinue) }
function Show-Menu {
  Clear-Host
  Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Cyan
  Write-Host "  ║      OpenMedia Downloader - INICIO      ║" -ForegroundColor Cyan
  Write-Host "  ╠══════════════════════════════════════════╣" -ForegroundColor Cyan
  Write-Host "  ║  [1] Desarrollo       (Vite + Express)   ║" 
  Write-Host "  ║  [2] Produccion local (Express+Tunnel)  ║"
  Write-Host "  ║  [3] Diagnostico                        ║"
  Write-Host "  ║  [4] Salir                              ║"
  Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Cyan
}

function Do-Checks {
  Write-Host "`n  Comprobaciones" -ForegroundColor Cyan
  if (Test-Cmd node) { Write-Host "[OK] Node $(node -v)" -ForegroundColor Green } else { Write-Host "[ERROR] Node no encontrado" -ForegroundColor Red; return $false }
  if (Test-Cmd "yt-dlp") { Write-Host "[OK] yt-dlp $(yt-dlp --version)" -ForegroundColor Green } else { Write-Host "[AVISO] yt-dlp no en PATH" -ForegroundColor Yellow }
  if (Test-Cmd ffmpeg) { Write-Host "[OK] ffmpeg $((ffmpeg -version 2>&1 | Select-Object -First 1))" -ForegroundColor Green } else { Write-Host "[AVISO] ffmpeg no global" -ForegroundColor Yellow }
  if (Test-Cmd cloudflared) { Write-Host "[OK] cloudflared $(cloudflared --version 2>&1 | Select-Object -First 1)" -ForegroundColor Green } else { Write-Host "[AVISO] cloudflared no instalado - https://developers.cloudflare.com/cloudflare-one/connections/connect/downloads/" -ForegroundColor Yellow }
  return $true
}

function Do-Diag {
  Clear-Host; Write-Host "  DIAGNOSTICO" -ForegroundColor Cyan
  Do-Checks | Out-Null
  Write-Host ""
  foreach ($f in @("server\.env","client\.env","temp","tools\ffmpeg\ffmpeg.exe")) {
    if (Test-Path $f) { Write-Host "[OK] $f" -ForegroundColor Green } else { Write-Host "[FALTA] $f" -ForegroundColor Yellow }
  }
  $p = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
  if ($p) { Write-Host "[AVISO] Puerto 3001 ocupado por PID $($p.OwningProcess)" -ForegroundColor Yellow } else { Write-Host "[OK] Puerto 3001 libre" -ForegroundColor Green }
  try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:3001/health" -UseBasicParsing -TimeoutSec 3; Write-Host "[OK] API health: $($r.Content)" -ForegroundColor Green } catch { Write-Host "[INFO] API no responde (normal si apagado)" -ForegroundColor DarkGray }
  if (Test-Path "server\.env") { Write-Host "`nALLOWED_ORIGINS:"; Select-String -Path "server\.env" -Pattern "ALLOWED_ORIGINS" | ForEach-Object { Write-Host $_.Line } }
  Read-Host "`nEnter para volver"
}

function Do-Dev {
  Clear-Host; Write-Host "  MODO DESARROLLO" -ForegroundColor Cyan
  if (-not (Test-Path "server\.env")) { Copy-Item "server\.env.example" "server\.env" }
  if (-not (Test-Path "client\.env")) { Copy-Item "client\.env.example" "client\.env" }
  if (-not (Test-Path "tools\ffmpeg\ffmpeg.exe")) {
    Write-Host "[SETUP] ffmpeg portable..." -ForegroundColor Yellow
    $dir="tools\ffmpeg"; New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $zip="$env:TEMP\ffmpeg-ess.zip"; $url="https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    try { Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing; Expand-Archive -Path $zip -DestinationPath "$env:TEMP\ffmpeg_ex" -Force; $exe=Get-ChildItem -Path "$env:TEMP\ffmpeg_ex" -Recurse -Filter ffmpeg.exe | Select-Object -First 1; Copy-Item $exe.FullName "$dir\ffmpeg.exe" -Force; Copy-Item (Join-Path $exe.DirectoryName "ffprobe.exe") "$dir\ffprobe.exe" -Force -ErrorAction SilentlyContinue; Write-Host "[OK] ffmpeg listo" -ForegroundColor Green } catch { Write-Host "[AVISO] No se pudo descargar" -ForegroundColor Yellow }
  }
  Write-Host "[1/3] deps..."; npm install --prefix server; if ($LASTEXITCODE -ne 0) { Read-Host "Error server"; return }
  npm install --prefix client; if ($LASTEXITCODE -ne 0) { Read-Host "Error client"; return }
  npm install; if ($LASTEXITCODE -ne 0) { Read-Host "Error root"; return }
  Write-Host "[2/3] build server..."; npm run build --prefix server
  Write-Host "[3/3] build client..."; npm run build --prefix client
  Write-Host "Iniciando Vite + Express... http://127.0.0.1:5173  http://127.0.0.1:3001  Ctrl+C para salir" -ForegroundColor Green
  npm run dev
}

function Do-Prod {
  Clear-Host; Write-Host "  MODO PRODUCCION LOCAL" -ForegroundColor Cyan
  if (-not (Test-Cmd cloudflared)) { Write-Host "[ERROR] cloudflared no instalado. Descarga: https://developers.cloudflare.com/cloudflare-one/connections/connect/downloads/" -ForegroundColor Red; Read-Host "Enter"; return }
  if (-not (Test-Path "server\.env")) { Copy-Item "server\.env.example" "server\.env" }
  if (-not (Test-Path "temp")) { New-Item -ItemType Directory -Path "temp" -Force | Out-Null }
  Get-ChildItem temp -ErrorAction SilentlyContinue | Where { $_.LastWriteTime -lt (Get-Date).AddHours(-1) } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "[OK] TEMP limpio" -ForegroundColor Green
  Write-Host "Iniciando Express..."
  $exp = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run start --prefix server" -WindowStyle Minimized -PassThru
  Write-Host "Esperando /health..."
  for ($i=0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    try { $r=Invoke-WebRequest -Uri "http://127.0.0.1:3001/health" -UseBasicParsing -TimeoutSec 2; if ($r.Content -match "ok") { break } } catch {}
  }
  try { $r=Invoke-WebRequest -Uri "http://127.0.0.1:3001/health" -UseBasicParsing -TimeoutSec 2; Write-Host "[OK] Express :3001 $($r.Content)" -ForegroundColor Green } catch { Write-Host "[ERROR] Express no responde" -ForegroundColor Red; return }
  Write-Host "Iniciando Cloudflare Tunnel (Quick)..."
  $log="$env:TEMP\cf.log"; Remove-Item $log -Force -ErrorAction SilentlyContinue
  $cf = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel --url http://127.0.0.1:3001 --no-autoupdate" -WindowStyle Minimized -PassThru -RedirectStandardOutput $log -RedirectStandardError $log
  Write-Host "Esperando URL publica (5-10s)..."
  $url=$null
  for ($i=0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $log) {
      $content = Get-Content $log -Raw -ErrorAction SilentlyContinue
      if ($content -match "https://[a-z0-9-]+\.trycloudflare\.com") {
        $m = [regex]::Matches($content, "https://[a-z0-9-]+\.trycloudflare\.com")
        $url = $m[0].Value
        break
      }
    }
    Write-Host "." -NoNewline
  }
  Write-Host ""
  if (-not $url) { Write-Host "[ERROR] No se obtuvo URL del tunnel. Revisa $log" -ForegroundColor Red; Get-Content $log -Tail 20; return }
  Write-Host "`n  ====================================" -ForegroundColor Cyan
  Write-Host "   OPENMEDIA SERVER ONLINE" -ForegroundColor Cyan
  Write-Host "  ====================================" -ForegroundColor Cyan
  Write-Host "  Local:  http://127.0.0.1:3001"
  Write-Host "  Tunnel: $url" -ForegroundColor Green
  Write-Host "  Frontend Vercel: VITE_API_URL=$url/api"
  Write-Host "  o public/config.json: {`"apiUrl`":`"$url/api`"}"
  Write-Host "  Health: $url/health"
  try { $r=Invoke-WebRequest -Uri "$url/health" -UseBasicParsing -TimeoutSec 5; Write-Host "[OK] Tunnel responde $($r.Content)" -ForegroundColor Green } catch { Write-Host "[AVISO] Tunnel aun iniciando" -ForegroundColor Yellow }
  Write-Host "`nDeja estas ventanas abiertas. Ctrl+C para detener.`n"
  Read-Host "Enter para volver al menu (no detiene el servidor). Para detener, cierra las ventanas minimizadas"
}

while ($true) {
  Show-Menu
  $op = Read-Host "Elige [1-4]"
  switch ($op) {
    "1" { Do-Dev }
    "2" { Do-Prod }
    "3" { Do-Diag }
    "4" { exit }
    default { }
  }
}
