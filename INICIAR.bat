@echo off
setlocal EnableDelayedExpansion
title OpenMedia Downloader
color 0A

set "PROJECT_ROOT=%~dp0"
set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "SERVER_DIR=%PROJECT_ROOT%\server"
set "CLIENT_DIR=%PROJECT_ROOT%\client"
set "CLOUDFLARED_EXE=%PROJECT_ROOT%\tools\cloudflared.exe"
set "CLOUDFLARED=cloudflared"
set "CF_LOG=%TEMP%\openmedia-cloudflared.log"
set "PID_BACKEND=%TEMP%\openmedia_backend.pid"
set "PID_TUNNEL=%TEMP%\openmedia_tunnel.pid"
set "VERCEL_URL=https://opendowload.vercel.app"
set "MAX_TUNNEL_WAIT=60"
set "MAX_HEALTH_CHECK=30"
set "MAX_VERCEL_POLL=40"
set "POLL_INTERVAL=5"

:MENU
cls
echo.
echo  ==========================================
echo    OpenMedia Downloader - INICIO
echo  ==========================================
echo    [1] Desarrollo       (Vite + Express)
echo    [2] Produccion       (Express + Tunnel + Vercel)
echo    [3] Diagnostico
echo    [4] Detener produccion
echo    [5] Salir
echo  ==========================================
echo.
:GETCHOICE
set /p "OPC=Elige [1-5]: "
if "%OPC%"=="1" goto DEV
if "%OPC%"=="2" goto PROD
if "%OPC%"=="3" goto DIAG
if "%OPC%"=="4" goto STOP_PROD
if "%OPC%"=="5" exit
goto GETCHOICE

:CHECKS
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node no encontrado - https://nodejs.org
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [OK] Node %%v
where npm >nul 2>&1 || (echo [ERROR] npm no encontrado & exit /b 1)
where git >nul 2>&1 || (echo [ERROR] Git no encontrado & exit /b 1)
where yt-dlp >nul 2>&1
if %ERRORLEVEL% equ 0 (
  for /f "delims=" %%v in ('yt-dlp --version') do echo [OK] yt-dlp %%v
) else (
  echo [ERROR] yt-dlp no encontrado - pip install -U yt-dlp
  exit /b 1
)
where ffmpeg >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [OK] ffmpeg
) else (
  if exist "%PROJECT_ROOT%\tools\ffmpeg\ffmpeg.exe" (
    echo [OK] ffmpeg portable
  ) else (
    echo [ERROR] FFmpeg no encontrado
    exit /b 1
  )
)
if exist "%CLOUDFLARED_EXE%" (
  echo [OK] cloudflared %CLOUDFLARED_EXE%
) else (
  where %CLOUDFLARED% >nul 2>&1
  if %ERRORLEVEL% equ 0 (
    echo [OK] cloudflared
  ) else (
    echo [ERROR] cloudflared no encontrado
    exit /b 1
  )
)
exit /b 0

:DIAG
cls
echo === DIAGNOSTICO ===
call :CHECKS
if %ERRORLEVEL% neq 0 (
  echo.
  echo [ERROR] Faltan dependencias, no se puede continuar
  pause
  goto MENU
)
if exist "%SERVER_DIR%\.env" (echo [OK] server\.env) else echo [FALTA] server\.env
if exist "%CLIENT_DIR%\.env" (echo [OK] client\.env) else echo [FALTA] client\.env
if exist "%PROJECT_ROOT%\tools\ffmpeg\ffmpeg.exe" (echo [OK] ffmpeg portable) else echo [INFO] ffmpeg global
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul
if %ERRORLEVEL% equ 0 (echo [OCUPADO] :3001 LISTENING) else echo [LIBRE] :3001
curl -s http://127.0.0.1:3001/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [OK] API
  curl -s http://127.0.0.1:3001/health
  echo.
) else (
  echo [OFF] API no responde - inicia con [1] o [2]
)
pause
goto MENU

:DEV
cls
echo === DESARROLLO (Vite + Express) ===
call :CHECKS
if %ERRORLEVEL% neq 0 pause & goto MENU
if not exist "%SERVER_DIR%\.env" copy "%SERVER_DIR%\.env.example" "%SERVER_DIR%\.env" >nul
if not exist "%CLIENT_DIR%\.env" copy "%CLIENT_DIR%\.env.example" "%CLIENT_DIR%\.env" >nul
echo [1/3] Verificando deps...
echo [OK] Dependencias verificadas
echo [2/3] Construyendo...
call npm run build --prefix "%SERVER_DIR%" 2>&1 | findstr /i "error" >nul
if %ERRORLEVEL% equ 0 (
  echo [ERROR] Error en build server
  pause & goto MENU
)
call npm run build --prefix "%CLIENT_DIR%" 2>&1 | findstr /i "error" >nul
if %ERRORLEVEL% equ 0 (
  echo [ERROR] Error en build client
  pause & goto MENU
)
echo [OK] Build completado
echo [3/3] Iniciando Vite+Express http://127.0.0.1:5173 http://127.0.0.1:3001
call npm run dev
echo.
echo [INFO] Servidor detenido. Codigo: %ERRORLEVEL%
pausegoto MENU

:PROD
cls
echo  ==========================================
echo   OPENMEDIA DOWNLOADER - PRODUCCION
echo  ==========================================
echo.
call :CHECKS
if %ERRORLEVEL% neq 0 pause & goto MENU

:: Auto-crear .env si no existe
if not exist "%SERVER_DIR%\.env" (
  echo HOST=127.0.0.1> "%SERVER_DIR%\.env"
  echo PORT=3001>> "%SERVER_DIR%\.env"
  echo [OK] server\.env creado
)

:: Git info
for /f "delims=" %%r in ('git remote 2^>nul') do set "HAS_REMOTE=%%r"
if not defined HAS_REMOTE (
  echo [ERROR] No hay remote Git configurado.
  pause & goto MENU
)
for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set "BRANCH=%%b"
if not defined BRANCH set "BRANCH=main"
echo [OK] Rama %BRANCH%

:: ============================================================
:: PASO 1: Compilar y reiniciar backend
:: ============================================================
echo.
echo [1/3] Compilando servidor...
cd /d "%SERVER_DIR%" && npm run build
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Build fallo
  cd /d "%PROJECT_ROOT%"
  pause & goto MENU
)
cd /d "%PROJECT_ROOT%"
echo [OK] Build completado

:: Matar backend anterior
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
  taskkill /PID %%p /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

:: Iniciar backend nuevo
echo Iniciando backend en :3001...
cd /d "%SERVER_DIR%"
start "OpenMedia Backend" /min cmd /c "node --env-file=.env dist/index.js"
cd /d "%PROJECT_ROOT%"
timeout /t 5 /nobreak >nul

:: Health check
curl -s http://127.0.0.1:3001/health | findstr "\"ok\":true" >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Backend no responde en /health
  pause & goto MENU
)
echo [OK] Backend http://127.0.0.1:3001

:: ============================================================
:: PASO 2: Cloudflare Tunnel
:: ============================================================
echo.
echo [2/3] Iniciando Cloudflare Tunnel...
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 2 /nobreak >nul
del /q "%CF_LOG%" 2>nul
start "OpenMedia Tunnel" /min cmd /c ""%CLOUDFLARED_EXE%" tunnel --url http://127.0.0.1:3001 --no-autoupdate > "%CF_LOG%" 2>&1"
echo Esperando tunnel...
timeout /t 8 /nobreak >nul

:: Detectar URL
echo Detectando URL del tunnel...
set "TUNNEL_URL="
for /l %%k in (1,1,%MAX_TUNNEL_WAIT%) do (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "$log = Get-Content -Path '%CF_LOG%' -ErrorAction SilentlyContinue; if ($log) { $m = [regex]::Matches($log -join [Environment]::NewLine, 'https://[a-zA-Z0-9][a-zA-Z0-9-]+\.trycloudflare\.com'); if ($m.Count -gt 0) { Write-Output $m[$m.Count - 1].Value } }"`) do (
    set "TUNNEL_URL=%%A"
  )
  if defined TUNNEL_URL goto :TUNNEL_OK
  timeout /t 1 /nobreak >nul
  if %%k==15 echo   ...esperando
  if %%k==30 echo   ...todavia buscando
  if %%k==45 echo   ...casi listo
)
:TUNNEL_OK
if not defined TUNNEL_URL (
  echo [ERROR] No se detecto URL del tunnel
  pause & goto MENU
)
echo [OK] Tunnel: %TUNNEL_URL%

:: Validar health via tunnel
set "API_URL=%TUNNEL_URL%/api"
set "TUNNEL_OK=0"
for /l %%m in (1,1,10) do (
  curl -s -o nul -w "%%{http_code}" "%TUNNEL_URL%/health" > "%TEMP%\thc.txt" 2>nul
  set /p HC=<"%TEMP%\thc.txt"
  if "!HC!"=="200" set "TUNNEL_OK=1"
  if "!TUNNEL_OK!"=="1" goto :TUNNEL_HEALTH_DONE
  timeout /t 3 /nobreak >nul
)
:TUNNEL_HEALTH_DONE
if "%TUNNEL_OK%"=="0" (
  echo [ERROR] Tunnel no responde /health
  pause & goto MENU
)
echo [OK] Tunnel /health HTTP 200

:: ============================================================
:: PASO 3: Actualizar config.json y deploy
:: ============================================================
echo.
echo [3/3] Actualizando config.json...
node -e "const fs=require('fs'),p=require('path');const d=p.join(process.cwd(),'client','public');fs.mkdirSync(d,{recursive:true});const c={apiUrl:'%API_URL%'};fs.writeFileSync(p.join(d,'config.json'),JSON.stringify(c,null,2)+String.fromCharCode(10));console.log('OK')"
echo.
type "%CLIENT_DIR%\public\config.json"
echo.

echo [OK] Config actualizado
echo.
echo  ==========================================
echo   OPENMEDIA LISTO
  ==========================================
echo.
echo  Backend:  http://127.0.0.1:3001
echo  Tunnel:  %TUNNEL_URL%
echo  API:     %API_URL%
echo  Frontend: %VERCEL_URL%
echo.
echo  ==========================================
echo.
pause
goto MENU

:STOP_PROD
cls
echo Deteniendo produccion...
taskkill /F /IM cloudflared.exe >nul 2>&1 && echo [OK] cloudflared detenido || echo [INFO] cloudflared no estaba en ejecucion
echo [INFO] Para detener el backend: taskkill /F /IM node.exe
pause
goto MENU
