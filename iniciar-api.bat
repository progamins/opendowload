@echo off
setlocal EnableDelayedExpansion
title OpenMedia - Iniciar API
color 0B

set "PROJECT_ROOT=%~dp0"
set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "SERVER_DIR=%PROJECT_ROOT%\server"
set "CLOUDFLARED_EXE=%PROJECT_ROOT%\tools\cloudflared.exe"
set "CF_LOG=%TEMP%\openmedia-cloudflared.log"

echo.
echo  ==========================================
echo   OpenMedia - Iniciando API...
echo  ==========================================
echo.

:: 1. Build servidor
echo [1/4] Compilando servidor...
cd /d "%SERVER_DIR%" && npx --no-install tsc -p tsconfig.json
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Build fallo
  pause
  exit /b 1
)
cd /d "%PROJECT_ROOT%"
echo [OK] Build completado

:: 2. Matar backend anterior y arrancar nuevo
echo.
echo [2/4] Iniciando backend...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
  taskkill /PID %%p /F >nul 2>&1
)
timeout /t 2 /nobreak >nul
cd /d "%SERVER_DIR%"
start "OpenMedia Backend" /min cmd /c "node --env-file=.env dist/index.js"
cd /d "%PROJECT_ROOT%"
timeout /t 5 /nobreak >nul

curl -s http://127.0.0.1:3001/health | findstr "\"ok\":true" >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Backend no responde
  pause
  exit /b 1
)
echo [OK] Backend http://127.0.0.1:3001

:: 3. Matar cloudflared anterior y arrancar nuevo
echo.
echo [3/4] Iniciando tunnel...
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 2 /nobreak >nul
del /q "%CF_LOG%" 2>nul
start "OpenMedia Tunnel" /min cmd /c ""%CLOUDFLARED_EXE%" tunnel --url http://127.0.0.1:3001 --no-autoupdate > "%CF_LOG%" 2>&1"
timeout /t 8 /nobreak >nul

:: 4. Detectar URL del tunnel
echo [4/4] Detectando URL del tunnel...
set "TUNNEL_URL="
for /l %%k in (1,1,60) do (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "$log = Get-Content -Path '%CF_LOG%' -ErrorAction SilentlyContinue; if ($log) { $m = [regex]::Matches($log -join [Environment]::NewLine, 'https://[a-zA-Z0-9][a-zA-Z0-9-]+\.trycloudflare\.com'); if ($m.Count -gt 0) { Write-Output $m[$m.Count - 1].Value } }"`) do (
    set "TUNNEL_URL=%%A"
  )
  if defined TUNNEL_URL goto FOUND
  timeout /t 1 /nobreak >nul
)

:FOUND
if not defined TUNNEL_URL (
  echo [ERROR] No se detecto URL del tunnel
  pause
  exit /b 1
)

:: Verificar health via tunnel
set "TUNNEL_OK=0"
for /l %%m in (1,1,10) do (
  curl -s -o nul -w "%%{http_code}" "%TUNNEL_URL%/health" > "%TEMP%\api_check.txt" 2>nul
  set /p HC=<"%TEMP%\api_check.txt"
  if "!HC!"=="200" set "TUNNEL_OK=1"
  if "!TUNNEL_OK!"=="1" goto HEALTH_OK
  timeout /t 3 /nobreak >nul
)

:HEALTH_OK
if "%TUNNEL_OK%"=="0" (
  echo [ERROR] Tunnel no responde
  pause
  exit /b 1
)

:: Limpiar URL (quitar trailing slash si tiene)
set "API_URL=%TUNNEL_URL%/api"

echo.
echo  ==========================================
echo   API LISTA
echo  ==========================================
echo.
echo  Backend:  http://127.0.0.1:3001
echo  Tunnel:  %TUNNEL_URL%
echo  API:     %API_URL%
echo.
echo  Pegar en el frontend:
echo  %TUNNEL_URL%
echo.
echo  ==========================================
echo.

:: Copiar al clipboard
echo %TUNNEL_URL%| clip 2>nul && echo [OK] URL copiada al portapapeles

pause
