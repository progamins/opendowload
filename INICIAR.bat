@echo off
setlocal EnableDelayedExpansion
title OpenMedia Downloader
chcp 65001 >nul 2>&1

:MENU
cls
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║         OpenMedia Downloader - INICIO           ║
echo  ╠══════════════════════════════════════════════════╣
echo  ║  [1] Desarrollo        (Vite + Express)          ║
echo  ║  [2] Produccion local  (Express + Tunnel)        ║
echo  ║  [3] Diagnostico                                 ║
echo  ║  [4] Salir                                        ║
echo  ╚══════════════════════════════════════════════════╝
echo.
set /p OPC="Elige opcion [1-4]: "

if "%OPC%"=="1" goto DEV
if "%OPC%"=="2" goto PROD
if "%OPC%"=="3" goto DIAG
if "%OPC%"=="4" exit /b 0
goto MENU

:CHECKS
echo.
echo  === Comprobaciones ===
where node >nul 2>&1 || (echo [ERROR] Node.js no encontrado & pause & exit /b 1)
for /f "delims=" %%v in ('node -v') do echo [OK] Node %%v
where yt-dlp >nul 2>&1 && (for /f "delims=" %%v in ('yt-dlp --version') do echo [OK] yt-dlp %%v) || echo [AVISO] yt-dlp no en PATH - pip install -U yt-dlp
where ffmpeg >nul 2>&1 && (ffmpeg -version | findstr "ffmpeg version" >nul && echo [OK] ffmpeg) || echo [AVISO] ffmpeg no global - usando tools\ffmpeg
where cloudflared >nul 2>&1 && (for /f "delims=" %%v in ('cloudflared --version 2^>^&1') do echo [OK] cloudflared %%v & goto :eof) || echo [AVISO] cloudflared no instalado - https://developers.cloudflare.com/cloudflare-one/connections/connect/downloads/
exit /b 0

:DIAG
cls
echo  === DIAGNOSTICO ===
call :CHECKS
echo.
if exist "server\.env" (echo [OK] server\.env existe) else echo [FALTA] server\.env
if exist "client\.env" (echo [OK] client\.env existe) else echo [FALTA] client\.env
if exist "temp" (echo [OK] temp existe) else echo [FALTA] temp
if exist "tools\ffmpeg\ffmpeg.exe" (echo [OK] ffmpeg portable) else echo [FALTA] ffmpeg portable
netstat -ano | findstr ":3001" >nul && echo [AVISO] Puerto 3001 ocupado || echo [OK] Puerto 3001 libre
curl -s http://127.0.0.1:3001/health >nul 2>&1 && echo [OK] API health responde || echo [INFO] API no responde (normal si no esta iniciado)
echo.
echo  CORS ALLOWED_ORIGINS en server\.env:
findstr "ALLOWED_ORIGINS" server\.env 2>nul || echo  (no configurado - usando defaults localhost + vercel.app)
echo.
pause
goto MENU

:DEV
cls
echo  === MODO DESARROLLO ===
call :CHECKS
if not exist "server\.env" copy "server\.env.example" "server\.env" >nul
if not exist "client\.env" copy "client\.env.example" "client\.env" >nul
if not exist "tools\ffmpeg\ffmpeg.exe" (
  echo [SETUP] Descargando ffmpeg portable...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "New-Item -ItemType Directory -Path tools\ffmpeg -Force | Out-Null; $zip='$env:TEMP\ffmpeg-ess.zip'; $url='https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'; try { Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing; Expand-Archive -Path $zip -DestinationPath $env:TEMP\ffmpeg_ex -Force; $exe=Get-ChildItem -Path $env:TEMP\ffmpeg_ex -Recurse -Filter ffmpeg.exe | Select -First 1; Copy-Item $exe.FullName tools\ffmpeg\ffmpeg.exe -Force; Copy-Item (Join-Path $exe.DirectoryName ffprobe.exe) tools\ffmpeg\ffprobe.exe -Force -ErrorAction SilentlyContinue; Write-Host '[OK] ffmpeg listo' } catch { Write-Host '[AVISO] No se pudo descargar' }"
)
echo [1/3] Instalando dependencias...
call npm install --prefix server || (echo [ERROR] server & pause & goto MENU)
call npm install --prefix client || (echo [ERROR] client & pause & goto MENU)
call npm install || (echo [ERROR] root & pause & goto MENU)
echo [2/3] Verificando build...
call npm run build --prefix server || (echo [ERROR] build server & pause & goto MENU)
call npm run build --prefix client || (echo [ERROR] build client & pause & goto MENU)
echo [3/3] Iniciando Vite + Express...
echo       API http://127.0.0.1:3001  WEB http://127.0.0.1:5173
echo       Ctrl+C para detener
call npm run dev
pause
goto MENU

:PROD
cls
echo  === MODO PRODUCCION LOCAL (Vercel frontend + Tunnel) ===
call :CHECKS
where cloudflared >nul 2>&1 || (
  echo.
  echo [ERROR] cloudflared no instalado.
  echo Descarga oficial: https://developers.cloudflare.com/cloudflare-one/connections/connect/downloads/
  echo Windows x64: https://github.com/cloudflare/cloudflared/releases
  echo Instala y vuelve a intentar.
  pause
  goto MENU
)
if not exist "server\.env" copy "server\.env.example" "server\.env" >nul
if not exist "temp" mkdir temp
echo [OK] TEMP_DIR temp
echo Limpiando temporales >1h...
powershell -NoProfile -Command "Get-ChildItem temp -ErrorAction SilentlyContinue | Where { $_.LastWriteTime -lt (Get-Date).AddHours(-1) } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue; Write-Host '[OK] Limpieza OK'"
echo [OK] Iniciando Express...
start "OpenMedia Express" /min cmd /c "npm run start --prefix server"
echo Esperando /health...
for /l %%i in (1,1,15) do (
  timeout /t 1 /nobreak >nul
  curl -s http://127.0.0.1:3001/health | findstr "ok" >nul && goto TUNNEL
)
echo [ERROR] Express no responde en 15s
pause
goto MENU

:TUNNEL
echo [OK] Express :3001
curl -s http://127.0.0.1:3001/health
echo.
echo [OK] Iniciando Cloudflare Tunnel (Quick Tunnel)...
echo URL publica aparecera abajo (puede tardar 5-10s)
echo.
REM Inicia tunnel y captura URL
del /q "%TEMP%\cf.log" 2>nul
start "Cloudflared" /min cmd /c "cloudflared tunnel --url http://127.0.0.1:3001 --no-autoupdate > %TEMP%\cf.log 2>&1"
:WAITURL
timeout /t 2 /nobreak >nul
findstr "trycloudflare.com" "%TEMP%\cf.log" >nul 2>&1 && goto SHOWURL
findstr "https://" "%TEMP%\cf.log" >nul 2>&1 && goto SHOWURL
echo Esperando tunnel...
if not exist "%TEMP%\cf.log" goto WAITURL
timeout /t 1 /nobreak >nul
goto WAITURL

:SHOWURL
for /f "tokens=*" %%u in ('findstr /r "https://.*trycloudflare.com" "%TEMP%\cf.log"') do set URL=%%u
echo.
echo  ====================================
echo   OPENMEDIA SERVER ONLINE
echo  ====================================
echo.
echo  Local:  http://127.0.0.1:3001
echo  Tunnel: 
type "%TEMP%\cf.log" | findstr "trycloudflare"
echo.
echo  Frontend Vercel debe usar:
echo  VITE_API_URL=%URL%/api
echo  o actualizar public/config.json: {"apiUrl":"%URL%/api"}
echo.
echo  Health: %URL%/health
echo  Verifica: curl %URL%/health
echo.
curl -s "%URL%/health" | findstr "ok" >nul && echo [OK] Tunnel responde || echo [AVISO] Tunnel aun iniciando
echo.
echo  Deja esta ventana y la de Express abiertas.
echo  Ctrl+C en cada una para detener.
pause
goto MENU
