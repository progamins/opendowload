# Tutorial — Poner en marcha OpenMedia Downloader en Vercel + Cloudflare Tunnel (backend en tu PC)

> **Objetivo:** Frontend en `https://tu-app.vercel.app` (Vercel) y backend (Express + yt-dlp + FFmpeg) en tu PC, puenteado por **Cloudflare Tunnel** (`https://xxxxx.trycloudflare.com`). Los MP3 **no** se suben a Vercel: se procesan en `TEMP/` de tu PC y se hacen `stream` directo al navegador del usuario (File System Access API).

---

## 1) Qué vas a montar

```
Vercel (React) --HTTPS--> Cloudflare Tunnel (cloudflared) --HTTPS--> tu PC :3001 --yt-dlp/FFmpeg--> TEMP --stream--> navegador → C:\Usuario\Musica
```

- **Vercel** solo compila React. No necesita tu PC encendida para el *build*.
- **Tu PC** debe estar encendida + `INICIAR.bat → [2] Producción` para que las descargas funcionen. Si se apaga, la web sigue visible pero muestra `Backend offline`.

---

## 2) Requisitos previos (en tu PC)

- **Node.js 22.5+** (por `node:sqlite`): https://nodejs.org → `node -v`
- **yt-dlp**: `pip install -U yt-dlp` → `yt-dlp --version`
- **FFmpeg**: portable ya incluido en `tools/ffmpeg` (se descarga solo sin admin). O global: https://ffmpeg.org
- **cloudflared**: https://developers.cloudflare.com/cloudflare-one/connections/connect/downloads/
  - Windows x64: `cloudflared-windows-amd64.exe` → renombrar a `cloudflared.exe` y añadir a `PATH` (`C:\Program Files\cloudflared\`)
  - Verificar: `cloudflared --version`
- **Git** (ya lo tienes) para subir a Vercel via GitHub.

Comprueba todo con doble clic en **`DIAGNOSTICO.bat`** (Node, yt-dlp, FFmpeg, cloudflared, TEMP, puerto 3001, /health, CORS).

---

## 3) Preparar el backend (.env)

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Edita **`server/.env`** (usa Notepad):

```env
PORT=3001
HOST=127.0.0.1
TEMP_DIR=../temp
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,https://TU-APP.vercel.app,https://*.vercel.app
# Opcional: si quieres proteger la API (no va en VITE_*)
API_KEY=
```

> `ALLOWED_ORIGINS` **obligatorio** para producción: pon tu URL real de Vercel (`https://openmedia-xxxxx.vercel.app`). Sin esto el navegador bloqueará el `fetch` por CORS.
> `MAX_CONCURRENT` ya está fijo a `2` (global y por IP) — no lo subas en `SettingsPanel`.

---

## 4) Probar en local (antes de Vercel)

```bash
npm run install:all   # o doble clic INICIAR.bat → [1] Desarrollo
npm run dev
# API http://127.0.0.1:3001/health → {"ok":true,"queue":{"max":2}}
# WEB http://127.0.0.1:5173
```

Pega 1-2 enlaces → Analizar → Descargar → debe abrir el selector nativo (Chromium) y guardar el MP3 con streaming `TEMP`.

---

## 5) Subir el frontend a Vercel

### 5.1 Crear repo GitHub (ya lo tienes en `https://github.com/progamins/opendowload`)

```bash
git add .
git commit -m "feat: ready for vercel"
git push origin main
```

### 5.2 Importar en Vercel

1. Entra en https://vercel.com → **New Project → Import Git Repository** → elige `progamins/opendowload`.
2. **Configure Project:**
   - **Framework Preset:** `Vite`
   - **Root Directory:** `client`  (¡importante! No `server/`)
   - **Build Command:** `npm run build` (ya está en `client/package.json`)
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
3. **Environment Variables** → Add:
   - `VITE_API_URL` = `https://xxxxx.trycloudflare.com/api`  ← por ahora pon `http://127.0.0.1:3001/api` para que el build no falle, luego lo cambias al URL real del túnel (ver paso 6).
   - Scope: `Production` + `Preview` (Development puede quedarse con localhost)
   - **Nunca** pongas `API_KEY` ni secretos en `VITE_*` (son públicos).
4. **Deploy** → Vercel compila solo React (`vite build`). No necesita tu PC encendida. Obtendrás `https://tu-app-xxxxx.vercel.app`.

> Si ves `Framework not detected`, asegúrate de que Root Directory sea `client` (contiene `vite.config.ts`).

### 5.3 Runtime config sin rebuild (opcional pero recomendado)

Como `VITE_API_URL` es **build-time** (requiere redeploy si cambia la URL del túnel), el proyecto incluye `client/public/config.json`:

```json
{ "apiUrl": "https://xxxxx.trycloudflare.com/api" }
```

El frontend carga `/config.json` al iniciar (`client/src/config/api.ts` → `loadRuntimeConfig()` → `window.__API_URL`) y tiene prioridad sobre `VITE_API_URL`. Así puedes cambiar la URL del túnel editando solo ese JSON y redeployando sin recompilar.

Para producción, deja `VITE_API_URL` vacío en Vercel y edita `client/public/config.json` antes de deploy, o genera el `config.json` dinámicamente con un script.

---

## 6) Puente con Cloudflare Tunnel (Quick Tunnel sin dominio)

> Sin dominio, la URL `https://xxxxx.trycloudflare.com` **cambia cada vez que reinicias el túnel**. Para producción estable con dominio propio, usa un Named Tunnel (`cloudflared tunnel create`).

### 6.1 Opción A: con `INICIAR.bat` (recomendado)

1. Doble clic **`INICIAR.bat` → [2] Producción local**
2. El script hace:
   - Checks Node/yt-dlp/FFmpeg/**cloudflared**
   - Crea/limpia `temp`
   - Inicia `Express` (`npm run start --prefix server`) en ventana minimizada
   - Espera `http://127.0.0.1:3001/health` (15s)
   - Lanza `cloudflared tunnel --url http://127.0.0.1:3001 --no-autoupdate > %TEMP%\cf.log`
   - Captura la URL `https://xxxxx.trycloudflare.com` y la muestra:
     ```
     ====================================
      OPENMEDIA SERVER ONLINE
     ====================================
      Local:  http://127.0.0.1:3001
      Tunnel: https://abc-123.trycloudflare.com
      Frontend Vercel debe usar:
      VITE_API_URL=https://abc-123.trycloudflare.com/api
     ```
   - Verifica `curl https://.../health` → `{ok:true}`
3. **Copia esa URL** y ponla en Vercel → Settings → Environment Variables → `VITE_API_URL` → **Redeploy** (o actualiza `public/config.json`).

Deja las dos ventanas minimizadas abiertas (Express + cloudflared). **Si las cierras, el backend queda offline** y Vercel mostrará `Backend offline` (la web no se rompe).

### 6.2 Opción B: manual

```bash
# Terminal 1: backend
npm run build --prefix server
npm run start --prefix server # :3001

# Terminal 2: tunnel
cloudflared tunnel --url http://127.0.0.1:3001
# Copia la URL https://xxxxx.trycloudflare.com que aparece en los logs
```

Verifica: `curl https://xxxxx.trycloudflare.com/health` → `{ok:true, service:"openmedia", queue:{max:2}}`

---

## 7) Configurar CORS para Vercel

Si olvidas `ALLOWED_ORIGINS`, el navegador bloqueará con `CORS: origin https://tu-app.vercel.app no permitido`.

Edita `server/.env`:

```env
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,https://tu-app-xxxxx.vercel.app,https://*.vercel.app
```

Reinicia el backend (cierra y vuelve a `INICIAR.bat → 2`).

---

## 8) Probar el flujo completo (Vercel + tu PC)

1. Abre `https://tu-app.vercel.app` (Vercel ONLINE, incluso con PC apagada).
2. Enciende tu PC y `INICIAR.bat → 2` → debe mostrar `Backend: ● Online` (Header) y `DiagnosticsBanner` en verde `Sistema listo`.
3. Pega 1 enlace → Analizar → tarjeta con miniatura/título → Descargar → **selector nativo de Windows** (Chromium) → elige `D:\Musica` → `yt-dlp → TEMP/<uuid> → stream → WritableStream` → archivo en tu PC. En Firefox verás descarga clásica en `Descargas`.
4. Pega 2 enlaces → Analizar (batch `POST /analyze/batch` máx 2) → `Descargar ambas` → pide carpeta **una sola vez** (lote) → dos barras `72%` y `43%` simultáneas → `MAX_GLOBAL=2` (tercera da `429`).
5. Cancela una → `POST /downloads/:id/cancel` → `SIGTERM` + `rm -rf temp/<id>` → la otra sigue.
6. Apaga tu PC → Vercel sigue mostrando web pero `Backend offline` (no crash).

---

## 9) Mantener el túnel vivo y actualizar la URL

- **Quick Tunnel** es efímero. Cada `INICIAR.bat → 2` genera una URL nueva. Debes actualizar `VITE_API_URL` en Vercel y hacer **Redeploy** (o solo `public/config.json` si usas runtime).
- Para no redeployar, usa `public/config.json` como fuente de verdad: el backend podría escribir la URL en ese JSON y Vercel lo sirve estático.
- **Futuro con dominio propio:** `cloudflared tunnel create openmedia` + `cloudflared tunnel route dns openmedia api.tuapp.com` + `ALLOWED_ORIGINS=https://tuapp.com,https://api.tuapp.com` — solo cambias URLs, sin reescribir código.

Para que el túnel sobreviva reinicios, crea una tarea programada o servicio que ejecute `cloudflared tunnel --url http://127.0.0.1:3001` al iniciar Windows.

---

## 10) Comandos útiles

```bash
# Desarrollo
npm run dev                  # Vite + Express con recarga
# Producción local
npm run build                # server + client
npm run start --prefix server
cloudflared tunnel --url http://127.0.0.1:3001

# Vercel (solo frontend)
npm run build --prefix client  # genera client/dist
# Health
curl http://127.0.0.1:3001/health
curl https://xxxxx.trycloudflare.com/health
curl https://xxxxx.trycloudflare.com/api/health
```

## 11) Solución de problemas

| Síntoma | Causa | Solución |
|---|---|---|
| `Failed to fetch` en Vercel | `VITE_API_URL` apunta a `127.0.0.1` | Cambia a `https://xxxxx.trycloudflare.com/api` y redeploy |
| `CORS: origin no permitido` | Falta tu dominio en `ALLOWED_ORIGINS` | Añade `https://tu-app.vercel.app` y reinicia backend |
| `429 Ya hay 2 descargas activas` | `MAX_GLOBAL=2` alcanzado | Cancela una o espera |
| `El archivo ya no existe en disco (404)` | `TEMP` limpiado tras 10 min o acento `á→?` | Reintenta; el backend tiene fallback que busca en `temp/<id>` |
| `400 Envía entre 1 y 2 URLs` | Batch con 3+ enlaces | La UI solo permite 2, el backend valida |
| `yt-dlp exited with code 1` | YouTube cambió o video privado | `pip install -U yt-dlp`, revisa `Ver detalles técnicos` |
| `cloudflared no instalado` | Falta binario | Descarga de https://developers.cloudflare.com/cloudflare-one/connections/connect/downloads/ |

---

## 12) Seguridad y privacidad

- `spawn` con array, nunca `exec(userInput)`; `sanitizeFileName` + `safeResolveInDir` (jail en `TEMP_DIR`); allowlist YouTube; rate-limit por IP/endpoint; `TEMP` por `uuid` con `finish/close/error` cleanup (no `setTimeout` fijo).
- `API_KEY` es opcional y **nunca** en `VITE_*`. Para Quick Tunnel, rate-limit es suficiente; para dominio, usa **Cloudflare Access**.
- No se guarda historial con IPs más de lo necesario; `TEMP` se borra tras servir.

---

**¡Listo!** Con `INICIAR.bat → 2` y Vercel con `VITE_API_URL` apuntando al túnel, tienes la arquitectura híbrida profesional funcionando aunque no tengas dominio.
