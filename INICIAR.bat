@echo off
setlocal EnableDelayedExpansion
title OpenMedia Downloader
color 0A

:MENU
cls
echo.
echo  ==========================================
echo    OpenMedia Downloader - INICIO
echo  ==========================================
echo    [1] Desarrollo       (Vite + Express)
echo    [2] Produccion      (Express + Tunnel)
echo    [3] Diagnostico
echo    [4] Salir
echo  ==========================================
echo.
set /p OPC="Elige [1-4]: "
if "%OPC%"=="1" goto DEV
if "%OPC%"=="2" goto PROD
if "%OPC%"=="3" goto DIAG
if "%OPC%"=="4" exit /b 0
goto MENU

:CHECKS_FAST
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node 22+ no encontrado - https://nodejs.org
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [OK] Node %%v
where yt-dlp >nul 2>&1
if %ERRORLEVEL% equ 0 (
  for /f "delims=" %%v in ('yt-dlp --version') do echo [OK] yt-dlp %%v
) else (
  echo [AVISO] yt-dlp no encontrado - pip install -U yt-dlp
)
where ffmpeg >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [OK] ffmpeg
) else (
  echo [INFO] ffmpeg portable en tools\ffmpeg
)
where cloudflared >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [OK] cloudflared
) else (
  echo [AVISO] cloudflared no instalado
)
exit /b 0

:DIAG
cls
echo === DIAGNOSTICO ===
call :CHECKS_FAST
if exist "server\.env" (echo [OK] server.env) else echo [FALTA] server.env
if exist "client\.env" (echo [OK] client.env) else echo [FALTA] client.env
if exist "tools\ffmpeg\ffmpeg.exe" (echo [OK] ffmpeg portable) else echo [FALTA] ffmpeg portable
netstat -ano | findstr ":3001" >nul
if %ERRORLEVEL% equ 0 (echo [OCUPADO] :3001) else echo [LIBRE] :3001
curl -s http://127.0.0.1:3001/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [OK] API
  curl -s http://127.0.0.1:3001/health
) else (
  echo [OFF] API no responde
)
findstr "ALLOWED_ORIGINS" server\.env 2>nul
pause
goto MENU

:DEV
cls
echo === DESARROLLO (Vite + Express) ===
call :CHECKS_FAST
if not exist "server\.env" copy "server\.env.example" "server\.env" >nul
if not exist "client\.env" copy "client\.env.example" "client\.env" >nul
if not exist "tools\ffmpeg\ffmpeg.exe" (
  echo [SETUP] ffmpeg portable...
  powershell -NoProfile -Command "try{New-Item -Path tools\ffmpeg -ItemType Directory -Force|Out-Null;$z='$env:TEMP\ffmpeg.zip';Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile $z -UseBasicParsing;Expand-Archive -Path $z -DestinationPath $env:TEMP\ff -Force;$e=Get-ChildItem $env:TEMP\ff -Recurse -Filter ffmpeg.exe|Select -First 1;Copy-Item $e.FullName tools\ffmpeg\ffmpeg.exe -Force;Copy-Item (Join-Path $e.DirectoryName ffprobe.exe) tools\ffmpeg\ffprobe.exe -Force -ErrorAction SilentlyContinue;Write-Host '[OK] ffmpeg'}catch{Write-Host '[ERROR]'}"
)
echo [1/3] Deps (secuencial, evita carrera tsc)...
if exist "server\package-lock.json" (
  echo  Instalando server...
  call npm ci --prefix server
  if %ERRORLEVEL% neq 0 call npm install --prefix server
) else (
  call npm install --prefix server
)
if %ERRORLEVEL% neq 0 (
  echo [ERROR] server deps
  pause
  goto MENU
)
echo [OK] server
if exist "client\package-lock.json" (
  echo  Instalando client...
  call npm ci --prefix client
  if %ERRORLEVEL% neq 0 call npm install --prefix client
) else (
  call npm install --prefix client
)
if %ERRORLEVEL% neq 0 (
  echo [ERROR] client deps
  pause
  goto MENU
)
echo [OK] client
call npm install >nul 2>&1
if %ERRORLEVEL% equ 0 echo [OK] root
echo [2/3] Build...
call npm run build --prefix server
if %ERRORLEVEL% neq 0 (
  echo [ERROR] build server
  pause
  goto MENU
)
call npm run build --prefix client
if %ERRORLEVEL% neq 0 (
  echo [ERROR] build client
  pause
  goto MENU
)
echo [3/3] Iniciando Vite+Express http://127.0.0.1:5173 http://127.0.0.1:3001
call npm run dev
pause
goto MENU

:PROD
cls
echo === PRODUCCION (Express + Tunnel) ===
call :CHECKS_FAST
where cloudflared >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [SETUP] cloudflared no encontrado, descargando oficial...
  powershell -NoProfile -Command "$a='amd64';if(-not [Environment]::Is64BitOperatingSystem){$a='386'};$u=\"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-$a.exe\";$d=\"$env:TEMP\cloudflared.exe\";try{Invoke-WebRequest -Uri $u -OutFile $d -UseBasicParsing;$h=(Get-FileHash $d -Algorithm SHA256).Hash;Write-Host \"[OK] $a $h\";Move-Item $d tools\cloudflared.exe -Force;Write-Host '[OK] tools\cloudflared.exe'}catch{Write-Host '[ERROR] descarga cloudflared fallo'}"
  if exist "tools\cloudflared.exe" (
    set "PATH=%CD%\tools;%PATH%"
    echo [OK] cloudflared en tools
  )
)
if not exist "server\.env" copy "server\.env.example" "server\.env" >nul
if not exist "temp" mkdir temp
powershell -NoProfile -Command "Get-ChildItem temp -ErrorAction SilentlyContinue | Where LastWriteTime -lt (Get-Date).AddHours(-1) | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue; Write-Host '[OK] temp limpio'"
start "Express" /min cmd /c "npm run start --prefix server"
echo Esperando /health...
for /l %%i in (1,1,15) do (
  timeout /t 1 /nobreak >nul
  curl -s http://127.0.0.1:3001/health | findstr "ok" >nul
  if %ERRORLEVEL% equ 0 goto TUNNEL
)
echo [ERROR] Express no responde
pause
goto MENU
:TUNNEL
echo [OK] Express
curl -s http://127.0.0.1:3001/health
echo.
echo Iniciando Tunnel...
del /q "%TEMP%\cf.log" 2>nul
start "Tunnel" /min cmd /c "cloudflared tunnel --url http://127.0.0.1:3001 --no-autoupdate > %TEMP%\cf.log 2>&1"
for /l %%i in (1,1,20) do (
  timeout /t 2 /nobreak >nul
  findstr "trycloudflare.com" "%TEMP%\cf.log" >nul 2>&1
  if %ERRORLEVEL% equ 0 goto SHOWURL
  echo Esperando tunnel...
)
echo [ERROR] No se obtuvo URL, revisa %TEMP%\cf.log
type "%TEMP%\cf.log"
pause
goto MENU
:SHOWURL
for /f "tokens=*" %%u in ('findstr /r "https://.*trycloudflare.com" "%TEMP%\cf.log"') do set URL=%%u
echo.
echo  ====================================
echo   SERVER ONLINE
echo  ====================================
echo   Local:  http://127.0.0.1:3001
type "%TEMP%\cf.log" | findstr "trycloudflare"
echo   Vercel: VITE_API_URL=%URL%/api
echo   Health: %URL%/health
curl -s "%URL%/health" | findstr "ok" >nul
if %ERRORLEVEL% equ 0 (
  echo [OK] Tunnel responde
) else (
  echo [AVISO] Tunnel iniciando
)
echo  Deja las ventanas minimizadas abiertas.
pause
goto MENU
