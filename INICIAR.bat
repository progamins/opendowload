@echo off
setlocal
title OpenMedia Downloader
color 0A

:: Rutas base
set "PROJECT_ROOT=%~dp0"
set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "SERVER_DIR=%PROJECT_ROOT%\server"
set "CLIENT_DIR=%PROJECT_ROOT%\client"
set "CLOUDFLARED=%PROJECT_ROOT%\tools\cloudflared.exe"
if not exist "%CLOUDFLARED%" set "CLOUDFLARED=cloudflared"
set "PID_BACKEND=%TEMP%\openmedia_backend.pid"
set "PID_TUNNEL=%TEMP%\openmedia_tunnel.pid"
set "CF_LOG=%TEMP%\cf.log"

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
set /p OPC="Elige [1-5]: "
if "%OPC%"=="1" goto DEV
if "%OPC%"=="2" goto PROD
if "%OPC%"=="3" goto DIAG
if "%OPC%"=="4" goto STOP_PROD
if "%OPC%"=="5" exit
goto MENU

:CHECKS
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node 22+ no encontrado - https://nodejs.org
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
if exist "%CLOUDFLARED%" (
  echo [OK] cloudflared
) else (
  where cloudflared >nul 2>&1
  if %ERRORLEVEL% equ 0 (
    echo [OK] cloudflared
  ) else (
    echo [ERROR] cloudflared no encontrado - https://developers.cloudflare.com/cloudflare-one/connections/connect/downloads/
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
findstr "ALLOWED_ORIGINS" "%SERVER_DIR%\.env" 2>nul
if %ERRORLEVEL% neq 0 echo (ALLOWED_ORIGINS no configurado)
pause
goto MENU

:DEV
cls
echo === DESARROLLO (Vite + Express) ===
call :CHECKS
if %ERRORLEVEL% neq 0 pause & goto MENU
if not exist "%SERVER_DIR%\.env" copy "%SERVER_DIR%\.env.example" "%SERVER_DIR%\.env" >nul
if not exist "%CLIENT_DIR%\.env" copy "%CLIENT_DIR%\.env.example" "%CLIENT_DIR%\.env" >nul
if not exist "%PROJECT_ROOT%\tools\ffmpeg\ffmpeg.exe" (
  echo [SETUP] ffmpeg portable...
  powershell -NoProfile -Command "try{New-Item -Path tools\ffmpeg -ItemType Directory -Force|Out-Null;$z='$env:TEMP\ffmpeg.zip';Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile $z -UseBasicParsing;Expand-Archive -Path $z -DestinationPath $env:TEMP\ff -Force;$e=Get-ChildItem $env:TEMP\ff -Recurse -Filter ffmpeg.exe|Select -First 1;Copy-Item $e.FullName tools\ffmpeg\ffmpeg.exe -Force;Copy-Item (Join-Path $e.DirectoryName ffprobe.exe) tools\ffmpeg\ffprobe.exe -Force -ErrorAction SilentlyContinue;Write-Host '[OK] ffmpeg'}catch{Write-Host '[ERROR]'}"
)
echo [1/3] Deps...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
if exist "%SERVER_DIR%\package-lock.json" (
  echo  Instalando server...
  call npm ci --prefix "%SERVER_DIR%"
  if %ERRORLEVEL% neq 0 call npm install --prefix "%SERVER_DIR%"
) else (
  call npm install --prefix "%SERVER_DIR%"
)
if %ERRORLEVEL% neq 0 (echo [ERROR] server deps & pause & goto MENU)
echo [OK] server
if exist "%CLIENT_DIR%\package-lock.json" (
  echo  Instalando client...
  call npm ci --prefix "%CLIENT_DIR%"
  if %ERRORLEVEL% neq 0 (
    echo [AVISO] EPERM client, reintentando...
    taskkill /F /IM node.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
    del /f /q "%CLIENT_DIR%\node_modules\@rolldown\binding-win32-x64-msvc\rolldown-binding.win32-x64-msvc.node" >nul 2>&1
    call npm install --prefix "%CLIENT_DIR%" --force
  )
) else (
  call npm install --prefix "%CLIENT_DIR%"
)
if %ERRORLEVEL% neq 0 (echo [ERROR] client deps & pause & goto MENU)
echo [OK] client
call npm install >nul 2>&1 && echo [OK] root
echo [2/3] Build...
call npm run build --prefix "%SERVER_DIR%" || (echo [ERROR] build server & pause & goto MENU)
call npm run build --prefix "%CLIENT_DIR%" || (echo [ERROR] build client & pause & goto MENU)
echo [3/3] Iniciando Vite+Express http://127.0.0.1:5173 http://127.0.0.1:3001
call npm run dev
echo.
echo [INFO] Servidor detenido. Codigo: %ERRORLEVEL%
pause
goto MENU

:PROD
cls
echo === PRODUCCION (Express + Tunnel + Vercel) ===
call :CHECKS
if %ERRORLEVEL% neq 0 pause & goto MENU

:: 1. Verificar git remote (no inventar)
for /f "delims=" %%r in ('git remote 2^>nul') do set HAS_REMOTE=%%r
if not defined HAS_REMOTE (
  echo [ERROR] No hay remote Git configurado. Haz: git remote add origin https://github.com/usuario/repo.git
  pause & goto MENU
)
for /f "tokens=*" %%r in ('git remote -v 2^>nul ^| findstr "(fetch)"') do echo [OK] Remote %%r
for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set BRANCH=%%b
if not defined BRANCH set BRANCH=main
echo [OK] Rama %BRANCH%

:: 2. Comprobar si backend ya responde (evitar EADDRINUSE)
curl -s http://127.0.0.1:3001/health | findstr "\"ok\":true" >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [OK] Backend ya responde en http://127.0.0.1:3001 - reutilizando
  goto PROD_TUNNEL
)
:: No responde, iniciar backend
if not exist "%SERVER_DIR%\.env" copy "%SERVER_DIR%\.env.example" "%SERVER_DIR%\.env" >nul
if not exist "%PROJECT_ROOT%\temp" mkdir "%PROJECT_ROOT%\temp"
powershell -NoProfile -Command "Get-ChildItem temp -ErrorAction SilentlyContinue | Where LastWriteTime -lt (Get-Date).AddHours(-1) | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue; Write-Host '[OK] temp limpio'"
echo Iniciando backend...
if exist "%PID_BACKEND%" del /q "%PID_BACKEND%" 2>nul
start "OpenMedia Backend" /min cmd /c "npm run start --prefix ""%SERVER_DIR%"" "
:: Guardar PID del backend (aproximado via netstat)
timeout /t 2 /nobreak >nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do echo %%p > "%PID_BACKEND%" 2>nul

echo Esperando /health (max 30 intentos)...
for /l %%i in (1,1,30) do (
  timeout /t 1 /nobreak >nul
  curl -s http://127.0.0.1:3001/health > "%TEMP%\health.json" 2>nul
  findstr "\"ok\":true" "%TEMP%\health.json" >nul 2>&1
  if %ERRORLEVEL% equ 0 goto PROD_HEALTH_OK
  findstr "\"ytDlp\":false" "%TEMP%\health.json" >nul 2>&1
  if %ERRORLEVEL% equ 0 (
    echo [ERROR] Backend no listo - yt-dlp/FFmpeg no disponibles
    type "%TEMP%\health.json"
    pause & goto MENU
  )
)
echo [ERROR] Backend no responde en 30s
type "%TEMP%\health.json" 2>nul
pause & goto MENU

:PROD_HEALTH_OK
echo [OK] Backend http://127.0.0.1:3001
type "%TEMP%\health.json"
echo.

:PROD_TUNNEL
:: 3. Iniciar cloudflared si no está ya
tasklist | findstr "cloudflared" >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [INFO] cloudflared ya en ejecucion, reutilizando
  goto PROD_TUNNEL_WAIT
)
if not exist "%CLOUDFLARED%" (
  where cloudflared >nul 2>&1
  if %ERRORLEVEL% neq 0 (
    echo [ERROR] cloudflared no encontrado en %CLOUDFLARED% ni en PATH
    pause & goto MENU
  ) else (
    set "CLOUDFLARED=cloudflared"
  )
)
del /q "%CF_LOG%" 2>nul
echo Iniciando Cloudflare Tunnel...
start "OpenMedia Tunnel" /min cmd /c ""%CLOUDFLARED%" tunnel --url http://127.0.0.1:3001 --no-autoupdate > "%CF_LOG%" 2>&1"
echo %DATE% %TIME% > "%PID_TUNNEL%"
for /f "tokens=2 delims=," %%p in ('tasklist /fi "imagename eq cloudflared.exe" /fo csv ^| findstr cloudflared') do echo %%p >> "%PID_TUNNEL%" 2>nul

:PROD_TUNNEL_WAIT
echo Esperando URL trycloudflare.com (max 30s)...
for /l %%i in (1,1,15) do (
  timeout /t 2 /nobreak >nul
  findstr "trycloudflare.com" "%CF_LOG%" >nul 2>&1
  if %ERRORLEVEL% equ 0 goto PROD_URL_FOUND
  echo  Esperando tunnel... %%i/15
)
echo [ERROR] No se detecto URL. Log:
type "%CF_LOG%" 2>nul
pause & goto MENU

:PROD_URL_FOUND
for /f "tokens=*" %%u in ('findstr /r "https://.*trycloudflare.com" "%CF_LOG%"') do set RAW_URL=%%u
:: Extraer solo la URL https://xxxx.trycloudflare.com
for /f "tokens=2 delims= " %%a in ('echo %RAW_URL% ^| findstr /r "https://.*trycloudflare.com"') do set TUNNEL_URL=%%a
if not defined TUNNEL_URL set TUNNEL_URL=%RAW_URL%
:: Limpiar: quitar caracteres raros y quedarnos con https://xxx.trycloudflare.com
for /f "tokens=1 delims= " %%a in ("%TUNNEL_URL%") do set TUNNEL_URL=%%a
echo %TUNNEL_URL% | findstr "trycloudflare.com" >nul || (
  for /f "tokens=*" %%a in ('powershell -NoProfile -Command "Select-String -Path '%CF_LOG%' -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1 | ForEach-Object { $_.Matches[0].Value } "') do set TUNNEL_URL=%%a
)
if not defined TUNNEL_URL (
  echo [ERROR] No se pudo extraer URL
  type "%CF_LOG%"
  pause & goto MENU
)
echo [OK] Tunnel: %TUNNEL_URL%
set API_URL=%TUNNEL_URL%/api

:: 4. Verificar tunnel publico
echo Verificando %TUNNEL_URL%/health ...
for /l %%i in (1,1,10) do (
  curl -s "%TUNNEL_URL%/health" > "%TEMP%\health_pub.json" 2>nul
  findstr "\"ok\":true" "%TEMP%\health_pub.json" >nul 2>&1
  if %ERRORLEVEL% equ 0 goto PROD_VERIFIED
  timeout /t 2 /nobreak >nul
)
echo [ERROR] Tunnel creado pero backend publico no responde
type "%TEMP%\health_pub.json" 2>nul
pause & goto MENU

:PROD_VERIFIED
echo [OK] Public API %API_URL%
type "%TEMP%\health_pub.json"
echo.

:: 5. Actualizar client/public/config.json (solo este archivo)
echo Actualizando client/public/config.json...
if not exist "%CLIENT_DIR%\public" mkdir "%CLIENT_DIR%\public"
echo {> "%CLIENT_DIR%\public\config.json"
echo   "apiUrl": "%API_URL%">> "%CLIENT_DIR%\public\config.json"
echo }>> "%CLIENT_DIR%\public\config.json"
type "%CLIENT_DIR%\public\config.json"
echo [OK] config.json actualizado

:: 6. Git: solo si cambio, solo ese archivo, proteger otros cambios
git status --porcelain | findstr "client/public/config.json" >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [INFO] config.json sin cambios, no se hace commit
  goto PROD_SHOW
)
:: Detectar otros cambios no relacionados
git status --porcelain | findstr /v "client/public/config.json" | findstr /v "??" >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [INFO] Existen otros cambios locales. Solo se actualizara config.json.
)
git diff --quiet -- client/public/config.json 2>nul
if %ERRORLEVEL% equ 0 goto PROD_SHOW
git add client/public/config.json
if %ERRORLEVEL% neq 0 (
  echo [ERROR] git add fallo
  pause & goto MENU
)
git diff --cached --quiet 2>nul
if %ERRORLEVEL% equ 0 (
  echo [INFO] Sin cambios para commit
  goto PROD_SHOW
)
git commit -m "chore: update Cloudflare tunnel API URL" 2>nul
if %ERRORLEVEL% neq 0 (
  echo [ERROR] git commit fallo
  pause & goto MENU
)
echo [OK] Git commit creado
:: Push a la rama actual
for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set CUR_BRANCH=%%b
if not defined CUR_BRANCH set CUR_BRANCH=main
echo Haciendo git push origin %CUR_BRANCH%...
git push origin %CUR_BRANCH%
if %ERRORLEVEL% neq 0 (
  echo [ERROR] git push fallo
  echo [INFO] Backend y Tunnel siguen funcionando localmente
  pause & goto MENU
)
echo [OK] Git push realizado

:PROD_SHOW
echo.
echo  ========================================
echo   OPEN DOWNLOAD - PRODUCCION
echo  ========================================
echo.
echo  [OK] Backend:
echo       http://127.0.0.1:3001
for /f "delims=" %%v in ('yt-dlp --version 2^>nul') do echo  [OK] yt-dlp: %%v
where ffmpeg >nul 2>&1 && echo  [OK] FFmpeg: Disponible || echo  [OK] FFmpeg: portable
echo  [OK] Cloudflare:
echo       Conectado
echo  [OK] Public API:
echo       %API_URL%
echo  [OK] config.json:
echo       Actualizado
git status >nul 2>&1 && echo  [OK] Git: Push realizado || echo  [INFO] Git: sin cambios
echo.
echo  [INFO] Vercel: Deployment automatico iniciado
echo         Frontend: https://opendowload.vercel.app
echo.
echo  ========================================
echo.
:: Guardar URL para verificacion
echo %API_URL% > "%TEMP%\last_api_url.txt"
:: Abrir web
echo [INFO] Abriendo OpenDownload...
start https://opendowload.vercel.app
echo.
:: Verificacion no bloqueante del config en Vercel (max 5 intentos)
echo Verificando https://opendowload.vercel.app/config.json ...
for /l %%i in (1,1,5) do (
  timeout /t 6 /nobreak >nul
  curl -s https://opendowload.vercel.app/config.json > "%TEMP%\vercel_cfg.json" 2>nul
  findstr "%TUNNEL_URL%" "%TEMP%\vercel_cfg.json" >nul 2>&1
  if %ERRORLEVEL% equ 0 (
    echo [OK] Vercel config.json ya apunta a %TUNNEL_URL%
    goto PROD_END
  )
  echo  Intento %%i/5: Vercel aun desplegando...
)
echo [INFO] Vercel aun no termino el deployment.
echo [INFO] Puedes abrir la web en unos segundos y recargar.

:PROD_END
echo.
echo  Quick Tunnel: URL temporal. Cada reinicio genera nueva URL -> nuevo commit/push.
echo  Backend y Tunnel siguen abiertos en ventanas minimizadas.
echo.
pause
goto MENU

:STOP_PROD
cls
echo Deteniendo produccion...
if exist "%PID_TUNNEL%" (
  for /f "tokens=*" %%p in ('type "%PID_TUNNEL%" 2^>nul') do taskkill /F /PID %%p >nul 2>&1
  del /q "%PID_TUNNEL%" 2>nul
  echo [OK] Tunnel detenido
) else (
  taskkill /F /IM cloudflared.exe >nul 2>&1 && echo [OK] cloudflared detenido || echo [INFO] cloudflared no estaba en ejecucion
)
if exist "%PID_BACKEND%" (
  for /f "tokens=*" %%p in ('type "%PID_BACKEND%" 2^>nul') do taskkill /F /PID %%p >nul 2>&1
  del /q "%PID_BACKEND%" 2>nul
  echo [OK] Backend detenido
) else (
  echo [INFO] Backend no fue iniciado por este script (usa taskkill /F /IM node.exe si lo iniciaste manual)
)
pause
goto MENU
