@echo off
setlocal EnableDelayedExpansion
title OpenMedia Downloader
color 0A

set "PROJECT_ROOT=%~dp0"
set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "SERVER_DIR=%PROJECT_ROOT%\server"
set "CLIENT_DIR=%PROJECT_ROOT%\client"
set "CLOUDFLARED_EXE=%PROJECT_ROOT%\tools\cloudflared.exe"
set "CF_LOG=%TEMP%\openmedia-cloudflared.log"
set "MAX_TUNNEL_WAIT=60"

:MENU
cls
echo.
echo  ==========================================
echo    OpenMedia Downloader - INICIO
echo  ==========================================
echo    [1] Desarrollo       (Vite + Express)
echo    [2] Produccion       (Express + Tunnel)
echo    [3] Diagnostico
echo    [4] Detener produccion
echo    [5] Salir
echo  ==========================================
echo.
set /p "OPC=Elige [1-5]: "
if "%OPC%"=="1" goto DEV
if "%OPC%"=="2" goto PROD
if "%OPC%"=="3" goto DIAG
if "%OPC%"=="4" goto STOP_PROD
if "%OPC%"=="5" exit
goto MENU

:CHECKS
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node no encontrado
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [OK] Node %%v
where npm >nul 2>&1 || (echo [ERROR] npm no encontrado & exit /b 1)
where git >nul 2>&1 || (echo [ERROR] Git no encontrado & exit /b 1)
where yt-dlp >nul 2>&1
if %ERRORLEVEL% equ 0 (
  for /f "delims=" %%v in ('yt-dlp --version') do echo [OK] yt-dlp %%v
) else (
  echo [ERROR] yt-dlp no encontrado
  exit /b 1
)
if exist "%PROJECT_ROOT%\tools\ffmpeg\ffmpeg.exe" (
  echo [OK] ffmpeg portable
) else (
  where ffmpeg >nul 2>&1
  if %ERRORLEVEL% equ 0 (
    echo [OK] ffmpeg
  ) else (
    echo [ERROR] FFmpeg no encontrado
    exit /b 1
  )
)
if exist "%CLOUDFLARED_EXE%" (
  echo [OK] cloudflared
) else (
  echo [ERROR] cloudflared no encontrado
  exit /b 1
)
exit /b 0

:DIAG
cls
echo === DIAGNOSTICO ===
call :CHECKS
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Faltan dependencias
  pause
  goto MENU
)
curl -s http://127.0.0.1:3001/health 2>nul
echo.
pause
goto MENU

:DEV
cls
echo === DESARROLLO ===
call :CHECKS
if %ERRORLEVEL% neq 0 pause & goto MENU
if not exist "%SERVER_DIR%\.env" copy "%SERVER_DIR%\.env.example" "%SERVER_DIR%\.env" >nul 2>&1
call npm run dev
pause
goto MENU

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
  echo FFMPEG_PATH=../tools/ffmpeg/ffmpeg.exe>> "%SERVER_DIR%\.env"
  echo [OK] server\.env creado
)

:: Git info
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
  if defined TUNNEL_URL goto TUNNEL_OK
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
set "TUNNEL_HEALTH_OK=0"
for /l %%m in (1,1,10) do (
  curl -s -o nul -w "%%{http_code}" "%TUNNEL_URL%/health" > "%TEMP%\thc.txt" 2>nul
  set /p HC=<"%TEMP%\thc.txt"
  if "!HC!"=="200" set "TUNNEL_HEALTH_OK=1"
  if "!TUNNEL_HEALTH_OK!"=="1" goto TUNNEL_HEALTH_DONE
  timeout /t 3 /nobreak >nul
)
:TUNNEL_HEALTH_DONE
if "%TUNNEL_HEALTH_OK%"=="0" (
  echo [ERROR] Tunnel no responde /health
  pause & goto MENU
)
echo [OK] Tunnel /health HTTP 200

:: ============================================================
:: PASO 3: Actualizar config.json
:: ============================================================
echo.
echo [3/3] Actualizando config.json...
node -e "const fs=require('fs'),p=require('path');const d=p.join(process.cwd(),'client','public');fs.mkdirSync(d,{recursive:true});const c={apiUrl:'%API_URL%'};fs.writeFileSync(p.join(d,'config.json'),JSON.stringify(c,null,2)+String.fromCharCode(10));console.log('OK')"
if %ERRORLEVEL% neq 0 (
  echo [ERROR] No se pudo escribir config.json
  pause & goto MENU
)
echo.
type "%CLIENT_DIR%\public\config.json"
echo.
:: Validar que no sea log
findstr "trycloudflare.com" "%CLIENT_DIR%\public\config.json" >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] config.json invalido
  pause & goto MENU
)

:: Git automatico
echo Actualizando git...
git add client/public/config.json >nul 2>&1
git diff --cached --quiet 2>nul
if %ERRORLEVEL%==0 (
  echo [INFO] config.json sin cambios - no se crea commit
) else (
  git commit -m "chore: update Cloudflare tunnel API URL" >nul 2>&1
  if %ERRORLEVEL% neq 0 (
    echo [WARN] commit fallo
  ) else (
    echo [OK] Commit creado
    git push origin %BRANCH% >nul 2>&1
    if %ERRORLEVEL% neq 0 (
      echo [ERROR] git push fallo - revisa credenciales
    ) else (
      echo [OK] Push origin %BRANCH% - Vercel desplegando...
      echo Esperando Vercel ^(max 120s^)...
      for /l %%v in (1,1,24) do (
        timeout /t 5 /nobreak >nul
        curl -s https://opendowload.vercel.app/config.json > "%TEMP%\vercel.json" 2>nul
        findstr "%TUNNEL_URL%" "%TEMP%\vercel.json" >nul 2>&1
        if !ERRORLEVEL!==0 (
          echo [OK] Vercel config.json actualizado
          goto VERCEL_OK
        )
        echo   ...esperando Vercel %%v/24
      )
      echo [WARN] Vercel aun no refleja el cambio - revisa en unos segundos
      :VERCEL_OK
    )
  )
)

echo.
echo  ==========================================
echo   OPENMEDIA LISTO
echo  ==========================================
echo.
echo  Backend:  http://127.0.0.1:3001
echo  Tunnel:  %TUNNEL_URL%
echo  API:     %API_URL%
echo  Frontend: https://opendowload.vercel.app
echo.
echo  Ventanas minimizadas: Backend y Tunnel siguen activos
echo  Usa [4] para detener
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
