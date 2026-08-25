@echo off
chcp 65001 >nul
echo === DIAGNOSTICO OpenMedia ===
where node >nul 2>&1 && (for /f "delims=" %%v in ('node -v') do echo [OK] Node %%v) || echo [FAIL] Node
where npm >nul 2>&1 && (for /f "delims=" %%v in ('npm -v') do echo [OK] npm %%v) || echo [FAIL] npm
where yt-dlp >nul 2>&1 && (for /f "delims=" %%v in ('yt-dlp --version') do echo [OK] yt-dlp %%v) || echo [FALTA] yt-dlp
where ffmpeg >nul 2>&1 && (echo [OK] ffmpeg) || (if exist "tools\ffmpeg\ffmpeg.exe" (echo [OK] ffmpeg portable) else echo [FALTA] ffmpeg)
where cloudflared >nul 2>&1 && (for /f "delims=" %%v in ('cloudflared --version 2^>^&1') do echo [OK] cloudflared %%v) || echo [FALTA] cloudflared - https://developers.cloudflare.com/cloudflare-one/connections/connect/downloads/
if exist "server\.env" (echo [OK] server\.env) else echo [FALTA] server\.env
if exist "client\.env" (echo [OK] client\.env) else echo [FALTA] client\.env
if exist "temp" (echo [OK] temp) else echo [FALTA] temp
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul && echo [OCUPADO] Puerto 3001 - LISTENING || echo [LIBRE] Puerto 3001 (TIME_WAIT es normal, no bloquea)
curl -s http://127.0.0.1:3001/health >nul 2>&1 && (echo [OK] API health & curl -s http://127.0.0.1:3001/health) || echo [OFF] API no responde - inicia con INICIAR.bat [1]
echo CORS ALLOWED_ORIGINS:
findstr "ALLOWED_ORIGINS" server\.env 2>nul || echo (no configurado)
pause
