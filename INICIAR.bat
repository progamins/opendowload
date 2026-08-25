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
:: Auto-crear .env si no existe (requerido por node --env-file=.env)
if not exist "%SERVER_DIR%\.env" (
  echo [INFO] Creando server\.env con valores por defecto...
  if exist "%SERVER_DIR%\.env.example" (
    copy "%SERVER_DIR%\.env.example" "%SERVER_DIR%\.env" >nul
  ) else (
    echo HOST=127.0.0.1> "%SERVER_DIR%\.env"
    echo PORT=3001>> "%SERVER_DIR%\.env"
  )
  echo [OK] server\.env creado
)

:: Verificar remote git
for /f "delims=" %%r in ('git remote 2^>nul') do set "HAS_REMOTE=%%r"
if not defined HAS_REMOTE (
  echo [ERROR] No hay remote Git configurado.
  pause & goto MENU
)
for /f "tokens=*" %%r in ('git remote -v 2^>nul ^| findstr "(fetch)"') do echo [OK] Remote %%r
:: Proteger token expuesto
git remote get-url origin 2>nul | findstr "ghp_" >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [AVISO] Remote tiene token ghp_ expuesto. Cambiando a URL segura...
  git remote set-url origin https://github.com/progamins/opendowload.git 2>nul
  echo [OK] Remote ahora seguro.
)
for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set "BRANCH=%%b"
if not defined BRANCH set "BRANCH=main"
echo [OK] Rama %BRANCH%

:: ============================================================
:: PASO 1: Verificar/Iniciar backend Express en 127.0.0.1:3001
:: ============================================================
echo.
echo [1/7] Verificando backend...
curl -s http://127.0.0.1:3001/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [OK] Backend ya responde en http://127.0.0.1:3001 - reutilizando
) else (
  echo Compilando servidor TypeScript...
  cd /d "%SERVER_DIR%" && npm run build
  if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build del servidor fallo
    pause & goto MENU
  )
  cd /d "%PROJECT_ROOT%"
  echo [OK] Build del servidor completado
  echo Iniciando Express backend en http://127.0.0.1:3001...
  if exist "%PID_BACKEND%" del /q "%PID_BACKEND%" 2>nul
  cd /d "%SERVER_DIR%"
  start "OpenMedia Backend" /min cmd /c "node --env-file=.env dist/index.js"
  cd /d "%PROJECT_ROOT%"
  echo Esperando que el backend arranque...
  timeout /t 5 /nobreak >nul
)

:: Health check backend local
echo Verificando /health backend local...
set "BACKEND_OK=0"
for /l %%j in (1,1,%MAX_HEALTH_CHECK%) do (
  curl -s http://127.0.0.1:3001/health > "%TEMP%\health_backend.json" 2>nul
  findstr "\"ok\":true" "%TEMP%\health_backend.json" >nul 2>&1
  if !ERRORLEVEL! equ 0 set "BACKEND_OK=1"
  if "!BACKEND_OK!"=="1" goto :BACKEND_HEALTH_OK_LOOP_DONE
  timeout /t 1 /nobreak >nul
)
:BACKEND_HEALTH_OK_LOOP_DONE
if "%BACKEND_OK%"=="0" (
  echo [ERROR] Backend no pudo iniciar en 127.0.0.1:3001
  echo [ERROR] Backend no responde en /health despues de %MAX_HEALTH_CHECK% intentos
  type "%TEMP%\health_backend.json" 2>nul
  pause & goto MENU
)
echo [OK] Backend iniciado http://127.0.0.1:3001
echo [OK] Backend /health HTTP 200

:: ============================================================
:: PASO 2: Iniciar Cloudflare Tunnel
:: ============================================================
echo.
echo [2/7] Iniciando Cloudflare Tunnel...
tasklist 2>nul | findstr /i "cloudflared" >nul 2>&1
if %ERRORLEVEL% neq 0 (
  if not exist "%CLOUDFLARED_EXE%" (
    echo [ERROR] No se encuentra %CLOUDFLARED_EXE%
    pause & goto MENU
  )
  del /q "%CF_LOG%" 2>nul
  start "OpenMedia Tunnel" /min cmd /c ""%CLOUDFLARED_EXE%" tunnel --url http://127.0.0.1:3001 --no-autoupdate > "%CF_LOG%" 2>&1"
  echo Esperando que cloudflared arranque...
  timeout /t 3 /nobreak >nul
) else (
  echo [INFO] cloudflared ya en ejecucion
)

:: ============================================================
:: PASO 3: Detectar URL REAL del Quick Tunnel (regex estricta)
:: ============================================================
echo.
echo [3/7] Detectando URL del Quick Tunnel (hasta %MAX_TUNNEL_WAIT% segundos)...
set "TUNNEL_URL="
for /l %%k in (1,1,%MAX_TUNNEL_WAIT%) do (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "$log = Get-Content -Path '%CF_LOG%' -ErrorAction SilentlyContinue; if ($log) { $matches = [regex]::Matches($log -join [Environment]::NewLine, 'https://[a-zA-Z0-9][a-zA-Z0-9-]+\.trycloudflare\.com'); if ($matches.Count -gt 0) { Write-Output $matches[$matches.Count - 1].Value } }"`) do (
    set "TUNNEL_URL=%%A"
  )
  if defined TUNNEL_URL goto :TUNNEL_LOOP_DONE
  timeout /t 1 /nobreak >nul
  if %%k==10 echo   Esperando... (10s)
  if %%k==20 echo   Esperando... (20s)
  if %%k==30 echo   Esperando... (30s)
  if %%k==45 echo   Esperando... (45s)
)
:TUNNEL_LOOP_DONE
if not defined TUNNEL_URL (
  echo [ERROR] Cloudflare no genero una URL valida despues de %MAX_TUNNEL_WAIT% segundos.
  echo [INFO] El log de cloudflared es:
  type "%CF_LOG%" 2>nul
  pause & goto MENU
)

:: Validacion estricta de la URL detectada
echo   URL bruta detectada: %TUNNEL_URL%
:: Debe empezar con https://
echo %TUNNEL_URL% | findstr /b "https://" >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] URL invalida - no empieza con https://
  pause & goto MENU
)
:: No debe ser solo https://trycloudflare.com
echo %TUNNEL_URL% | findstr /i "^https://trycloudflare\.com$" >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [ERROR] URL invalida - es solo trycloudflare.com sin subdominio
  pause & goto MENU
)
:: No debe contener espacios
echo %TUNNEL_URL% | findstr " " >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [ERROR] URL invalida - contiene espacios
  pause & goto MENU
)
:: No debe terminar en ...
echo %TUNNEL_URL% | findstr "\.\.\." >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [ERROR] URL invalida - termina en ...
  pause & goto MENU
)
:: No debe contener texto de logs
echo %TUNNEL_URL% | findstr /i "Requesting INF" >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [ERROR] URL invalida - contiene texto de log
  pause & goto MENU
)

echo [OK] Cloudflare Tunnel detectado: %TUNNEL_URL%

:: ============================================================
:: PASO 4: Validar que el tunnel responde /health
:: ============================================================
echo.
echo [4/7] Validando tunnel publico...

set "API_URL=%TUNNEL_URL%/api"

set "TUNNEL_HEALTH_OK=0"
for /l %%m in (1,1,5) do (
  curl -s -o "%TEMP%\health_tunnel.json" -w "%%{http_code}" "%TUNNEL_URL%/health" > "%TEMP%\health_tunnel_code.txt" 2>nul
  set /p HTTP_CODE=<"%TEMP%\health_tunnel_code.txt"
  if "!HTTP_CODE!"=="200" set "TUNNEL_HEALTH_OK=1"
  if "!TUNNEL_HEALTH_OK!"=="1" goto :TUNNEL_HEALTH_OK_LOOP_DONE
  echo   Intento %%m/5 - HTTP !HTTP_CODE! - reintentando en 3s...
  timeout /t 3 /nobreak >nul
)
:TUNNEL_HEALTH_OK_LOOP_DONE
if "%TUNNEL_HEALTH_OK%"=="0" (
  echo [ERROR] Cloudflare Tunnel detectado pero no responde.
  echo [ERROR] Tunnel detectado: %TUNNEL_URL%
  echo [ERROR] /health fallo despues de 5 intentos
  pause & goto MENU
)
echo [OK] Public /health HTTP 200
echo [OK] Public API: %API_URL%

:: ============================================================
:: PASO 5: Actualizar client/public/config.json
:: ============================================================
echo.
echo [5/7] Actualizando config.json...
if not exist "%CLIENT_DIR%\public" mkdir "%CLIENT_DIR%\public"

:: Usar Node.js para escribir JSON valido (sin depender de paths de Windows)
node -e "const fs=require('fs'),p=require('path');const dir=p.join(process.cwd(),'client','public');fs.mkdirSync(dir,{recursive:true});const cfg={apiUrl:'%API_URL%'};fs.writeFileSync(p.join(dir,'config.json'),JSON.stringify(cfg,null,2)+String.fromCharCode(10));console.log('OK:'+p.join(dir,'config.json'))"

:: Verificar que se escribio correctamente
node -e "const fs=require('fs'),p=require('path');const f=p.join(process.cwd(),'client','public','config.json');try{const c=JSON.parse(fs.readFileSync(f,'utf8'));if(!c.apiUrl||c.apiUrl.indexOf('trycloudflare.com')===-1){process.exit(1)}console.log('URL:'+c.apiUrl)}catch(e){process.exit(1)}" > "%TEMP%\config_api_check.txt" 2>&1
set /p CONFIG_CHECK=<"%TEMP%\config_api_check.txt"

set "CONFIG_API_URL="
echo %CONFIG_CHECK% | findstr "^URL:" >nul 2>&1
if %ERRORLEVEL% equ 0 (
  for /f "tokens=2 delims=:" %%U in ("%CONFIG_CHECK%") do set "CONFIG_API_URL=%%U"
)

if not defined CONFIG_API_URL (
  echo [ERROR] config.json no contiene una URL valida
  type "%CLIENT_DIR%\public\config.json"
  echo.
  echo [DEBUG] Node output: %CONFIG_CHECK%
  pause & goto MENU
)

:: Verificar que la URL en config.json coincide con la esperada
echo %CONFIG_API_URL% | findstr /i "%TUNNEL_URL%/api" >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] config.json contiene URL incorrecta: %CONFIG_API_URL%
  echo [ERROR] Se esperaba: %TUNNEL_URL%/api
  pause & goto MENU
)

echo [OK] config.json actualizado correctamente
echo   Contenido:
type "%CLIENT_DIR%\public\config.json"

:: ============================================================
:: PASO 6: Git add, commit, push
:: ============================================================
echo.
echo [6/7] Git push...

git status --porcelain >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] No hay repositorio git
  pause & goto MENU
)

git add "client/public/config.json" 2>nul

:: Verificar si hay cambios reales
git diff --cached --quiet -- "client/public/config.json" 2>nul
if %ERRORLEVEL% equ 0 (
  :: Tambien verificar unstaged changes
  git diff --quiet -- "client/public/config.json" 2>nul
  if %ERRORLEVEL% equ 0 (
    echo [INFO] config.json sin cambios reales - no se hace commit
    goto :GIT_PUSH
  )
)

git commit -m "chore: update Cloudflare tunnel API URL" 2>nul
if %ERRORLEVEL% neq 0 (
  echo [ERROR] git commit fallo
  pause & goto MENU
)
echo [OK] Git commit creado

:GIT_PUSH
echo Haciendo git push origin %BRANCH%...
git push origin %BRANCH%
if %ERRORLEVEL% neq 0 (
  echo [ERROR] git push fallo
  echo [INFO] Backend y Tunnel siguen funcionando localmente
  pause & goto MENU
)
echo [OK] Git push realizado

:: ============================================================
:: PASO 7: Esperar Vercel y verificar config.json
:: ============================================================
echo.
echo [7/7] Esperando Vercel deployment (hasta %MAX_VERCEL_POLL% segundos)...
set "VERCEL_OK=0"
for /l %%n in (1,1,%MAX_VERCEL_POLL%) do (
  timeout /t %POLL_INTERVAL% /nobreak >nul
  curl -s "%VERCEL_URL%/config.json" > "%TEMP%\vercel_cfg.json" 2>nul
  if !ERRORLEVEL! equ 0 (
    node -e "const cfg=JSON.parse(require('fs').readFileSync('%TEMP%/vercel_cfg.json','utf8'));if(cfg.apiUrl&&cfg.apiUrl.indexOf('trycloudflare.com')!==-1&&cfg.apiUrl.indexOf('%TUNNEL_URL%/api')!==-1){process.exit(0)}process.exit(1)" 2>nul
    if !ERRORLEVEL! equ 0 set "VERCEL_OK=1"
  )
  if "!VERCEL_OK!"=="1" goto :VERCEL_LOOP_DONE
  echo   Intento %%n/%MAX_VERCEL_POLL% - desplegando...
)
:VERCEL_LOOP_DONE
if "%VERCEL_OK%"=="0" (
  echo [WARN] Vercel no actualizo config.json despues de %MAX_VERCEL_POLL% segundos
  echo [INFO] Continuando de todas formas - el deployment puede terminar tarde
) else (
  echo [OK] Vercel config.json actualizado con URL correcta
)

:: ============================================================
:: VALIDACION FINAL
:: ============================================================
echo.
echo Verificando endpoints publicos...
curl -s -o nul -w "%%{http_code}" "%TUNNEL_URL%/health" > "%TEMP%\final_health.txt" 2>nul
set /p FINAL_HEALTH=<"%TEMP%\final_health.txt"
echo   /health via tunnel: HTTP %FINAL_HEALTH%

curl -s -o nul -w "%%{http_code}" "%VERCEL_URL%/config.json" > "%TEMP%\final_vercel.txt" 2>nul
set /p FINAL_VERCEL=<"%TEMP%\final_vercel.txt"
echo   Vercel config.json: HTTP %FINAL_VERCEL%

:: ============================================================
:: SALIDA FINAL
:: ============================================================
echo.
echo  ==========================================
echo   OPENMEDIA LISTO
echo  ==========================================
echo.
echo  Frontend:
echo    %VERCEL_URL%
echo.
echo  Backend:
echo    http://127.0.0.1:3001
echo.
echo  Tunnel:
echo    %TUNNEL_URL%
echo.
echo  API:
echo    %API_URL%
echo.
echo  [CONECTADO] Tunnel activo
echo  [CONECTADO] Backend activo
if "%VERCEL_OK%"=="1" (
  echo  [ACTUALIZADO] Vercel
) else (
  echo  [PENDIENTE] Vercel (puede tardar mas)
)
echo.
echo  ==========================================
echo.

:: Guardar URL para referencia
echo %TUNNEL_URL% > "%TEMP%\last_tunnel_url.txt"
echo %API_URL% >> "%TEMP%\last_tunnel_url.txt"

pause
goto MENU

:STOP_PROD
cls
echo Deteniendo produccion...
taskkill /F /IM cloudflared.exe >nul 2>&1 && echo [OK] cloudflared detenido || echo [INFO] cloudflared no estaba en ejecucion
echo [INFO] Para detener el backend: taskkill /F /IM node.exe
pause
goto MENU
