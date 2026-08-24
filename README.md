# OpenMedia Downloader

Plataforma web profesional para gestionar descargas de música (hasta **2 simultáneas**) desde enlaces compatibles de YouTube, usando **yt-dlp** + **FFmpeg**. Arquitectura híbrida: **frontend en Vercel** + **backend local en tu PC vía Cloudflare Tunnel** — el archivo se guarda directo en tu equipo con **File System Access API** (fallback a descarga clásica).

> **Uso responsable:** solo contenido con permiso. No evade DRM.

## Arquitectura

```
Vercel (React+Vite)  --HTTPS-->  Cloudflare Tunnel  --HTTPS-->  PC (Express :3001)
                                                                    ├─ Queue MAX=2 (global + por IP)
                                                                    ├─ yt-dlp / FFmpeg (spawn array, sin shell)
                                                                    ├─ TEMP_DIR/<uuid> (streaming, TTL 10m, cleanup finish/close)
                                                                    └─ SQLite (historial) + SSE progreso
         │ streaming (createReadStream -> res) │
         └──────── File System Access API ─────►  C:\Musica\... (showSaveFilePicker) o fallback <a download>
```

- **Frontend** (`client/`) React 19 + Vite 8 + Tailwind 4, `DownloadManager` singleton con máquina de estados centralizada (`IDLE→VALIDATING→ANALYZING→READY→WAITING_FOR_DESTINATION→DOWNLOADING→COMPLETED/CANCELLED/ERROR/RETRYING`), progreso real (bytes/total/speed/ETA), `AbortController` por tarea, doble-clic bloqueado.
- **Backend** (`server/`) Node 22+ `node:sqlite`, Express, `MAX_CONCURRENT=2` (autoridad), `MAX_PER_IP=2`, rate-limit por endpoint, validación allowlist YouTube + SSRF, `TEMP_DIR` único por tarea.

## Requisitos

- Node.js 22.5+ (`node:sqlite`)
- yt-dlp (`pip install -U yt-dlp`) y FFmpeg (portable en `tools/ffmpeg` sin admin si falta)
- cloudflared (para producción) — https://developers.cloudflare.com/cloudflare-one/connections/connect/downloads/

## Desarrollo (Vite + Express local)

```bash
git clone <repo>
cd openmedia-downloader
npm run install:all
cp server/.env.example server/.env
cp client/.env.example client/.env
# Edita client/.env: VITE_API_URL=http://127.0.0.1:3001/api
npm run dev
# API http://127.0.0.1:3001  WEB http://127.0.0.1:5173
```

O doble clic en **`INICIAR.bat` → [1] Desarrollo**.

## Producción (Vercel + Tunnel)

**No se necesita dominio.** Frontend en `https://tu-app.vercel.app`, backend en `https://xxxxx.trycloudflare.com` (Quick Tunnel, URL cambia).

### 1) Desplegar frontend en Vercel

- En Vercel: **New Project → Import Git → Root Directory = `client`**
- Build: `Framework: Vite`, `Build Command: npm run build`, `Output Directory: dist`
- Variables (Settings → Environment Variables):
  - `VITE_API_URL` = `https://xxxxx.trycloudflare.com/api` (para pruebas, luego cambia a la URL real del túnel)
  - Scope: Production + Preview
  - **No pongas secretos en `VITE_*`** (son públicas). `API_KEY` es solo backend (`server/.env`).
- Deploy. El build **no** necesita tu PC encendida (solo compila React).

> Si la URL del túnel cambia, hay dos opciones:
> - **Build-time:** cambia `VITE_API_URL` en Vercel y **Redeploy**.
> - **Runtime (recomendado):** deja `VITE_API_URL` vacío y edita `client/public/config.json` → `{"apiUrl":"https://nueva-url.trycloudflare.com/api"}` y redeploy solo ese json (o genera `config.json` con un script).

### 2) Iniciar backend local

Doble clic `INICIAR.bat` → **[2] Producción local** hace:

1. Checks Node/yt-dlp/FFmpeg/cloudflared
2. Crea/limpia `TEMP_DIR`
3. Inicia `Express` y espera `/health`
4. Lanza `cloudflared tunnel --url http://127.0.0.1:3001 --no-autoupdate`
5. Captura URL `https://xxxxx.trycloudflare.com` y verifica `curl https://.../health`
6. Muestra `VITE_API_URL` a configurar en Vercel

Manual:

```bash
npm run build --prefix server
npm run start --prefix server # :3001
cloudflared tunnel --url http://127.0.0.1:3001
# copia la URL https://xxxxx.trycloudflare.com y ponla en Vercel
```

### 3) Configurar CORS

`server/.env`:

```env
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,https://tu-app.vercel.app,https://*.vercel.app
API_KEY= # opcional, si lo pones debes enviar X-API-Key (no uses VITE_API_SECRET)
```

Para producción con dominio propio futuro: `https://miapp.com,https://api.miapp.com`.

## Variables de entorno

**`server/.env.example`:**
```env
PORT=3001
HOST=127.0.0.1
DOWNLOAD_DIR=../downloads # solo hint inicial para diálogo antiguo, no destino final
TEMP_DIR=../temp
LOG_DIR=../logs
DATABASE_PATH=../data/app.db
MAX_CONCURRENT_DOWNLOADS=2
YTDLP_PATH=yt-dlp
FFMPEG_PATH=ffmpeg
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
API_KEY=
```

**`client/.env.example`:**
```env
VITE_API_URL=http://127.0.0.1:3001/api
# Producción: VITE_API_URL=https://xxxxx.trycloudflare.com/api
```

`.env` está en `.gitignore`, nunca subir secretos.

## Endpoints clave

- `GET /health` / `GET /api/health` → `{ok, service, ytDlp, ffmpeg, queue:{active,pending,max}}`
- `POST /analyze` (1 URL) y `POST /analyze/batch` (1-2 URLs) → metadatos
- `POST /download` → encola (stream a TEMP), `429` si `active+pending>=2` o por IP
- `GET /downloads/:id/file` → `createReadStream` con `Content-Disposition: attachment; filename*=UTF-8`, cleanup en `finish/close`
- `POST /downloads/:id/cancel` → `AbortController` + `kill(SIGTERM)` + `rm -rf temp/<id>`
- `GET /api/events` SSE progreso

## Flujo de descarga (2 simultáneas)

```
Usuario pega 1-2 enlaces → Analizar → tarjetas
→ Descargar → showSaveFilePicker() (si Chromium) → usuario elige D:\Musica
→ backend prepara TEMP/<uuid> → yt-dlp → FFmpeg → stream → WritableStream → archivo local
→ fallback <a download> si no hay File System Access API
```

Cada tarea tiene `id, status, progress, speed, eta, bytes, abortController`. Cancelar una no afecta la otra. `MAX_GLOBAL=2` y `MAX_PER_IP=2`.

## Scripts

- `INICIAR.bat` / `iniciar.ps1` — menú [1]Desarrollo [2]Producción [3]Diagnóstico [4]Salir
- `DIAGNOSTICO.bat` — checks Node/yt-dlp/FFmpeg/cloudflared/TEMP/puerto/CORS
- `npm run dev` (root) → concurrently server+client
- `npm run build` → server+client
- `npm run start` → server compilado

## Seguridad

- `spawn` con array, nunca `exec(userInput)`
- `sanitizeFileName` + `safeResolveInDir` (TEMP_DIR jail)
- Allowlist YouTube (`youtube.com, youtu.be, music.youtube.com, m.youtube.com`)
- Rate limit por IP/endpoint (analyze 20/min, download 10/min)
- Validación URL, tamaño JSON 1mb, sin `*` CORS
- `API_KEY` opcional (no en `VITE_*`), recomendado **Cloudflare Access** para Quick Tunnel.

## Limitaciones conocidas

- File System Access API solo Chromium; Firefox/Safari usan fallback descarga estándar (no elige carpeta, usa Descargas).
- Dos `showSaveFilePicker` seguidos requieren dos gestos del usuario; `Descargar ambas` pide ubicación por archivo secuencialmente (evita bloqueo del navegador).
- Quick Tunnel URL cambia al reiniciar; requiere actualizar `VITE_API_URL` o `public/config.json` y redeploy.
- yt-dlp/FFmpeg deben estar actualizados; el progreso depende de parsear `yt-dlp` stdout.

## Licencias

Código propio bajo tu licencia. Dependencias mantienen sus licencias — ver `THIRD_PARTY_LICENSES.md`.
