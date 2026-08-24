import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { router } from "./routes.js";
import { initDatabase, getSettings, saveSettings } from "./database/db.js";
import { configureLogger, logger } from "./utils/logger.js";
import { configureYtDlp } from "./services/ytdlp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3001);
const DOWNLOAD_DIR = path.resolve(__dirname, "..", process.env.DOWNLOAD_DIR ?? "../downloads");
const TEMP_DIR = path.resolve(__dirname, "..", process.env.TEMP_DIR ?? "../temp");
const LOG_DIR = path.resolve(__dirname, "..", process.env.LOG_DIR ?? "../logs");
const DATABASE_PATH = path.resolve(__dirname, "..", process.env.DATABASE_PATH ?? "../data/app.db");
const YTDLP_PATH = process.env.YTDLP_PATH ?? "yt-dlp";
const FFMPEG_PATH = process.env.FFMPEG_PATH ?? "ffmpeg";

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });
// Limpieza de temporales huérfanos al iniciar (archivos >1h)
try {
  const now = Date.now();
  for (const entry of fs.readdirSync(TEMP_DIR)) {
    const p = path.join(TEMP_DIR, entry);
    try {
      const stat = fs.statSync(p);
      if (now - stat.mtimeMs > 60 * 60 * 1000) {
        fs.rmSync(p, { recursive: true, force: true });
        logger.info(`Cleaned orphan temp ${p}`);
      }
    } catch {}
  }
} catch {}
configureLogger(LOG_DIR);
initDatabase(DATABASE_PATH);
configureYtDlp({ ytdlpPath: YTDLP_PATH, ffmpegPath: FFMPEG_PATH });

// Ensure a download directory is always set (solo como hint inicial para el diálogo, no como destino obligatorio)
const settings = getSettings();
if (!settings.downloadDir) {
  saveSettings({ downloadDir: DOWNLOAD_DIR });
}
// Clamp maxConcurrent a 2 (master prompt)
if (settings.maxConcurrentDownloads > 2) {
  saveSettings({ maxConcurrentDownloads: 2 });
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin / curl / health checks
  if (ALLOWED_ORIGINS.length === 0) {
    // default: localhost + vercel preview (*.vercel.app) — no wildcard permanente sin config
    if (/^https?:\/\/localhost:\d+$/.test(origin)) return true;
    if (/^https?:\/\/127\.0\.0\.1:\d+$/.test(origin)) return true;
    if (/^https?:\/\/\[::1\]:\d+$/.test(origin)) return true;
    // permitir cualquier vercel.app si no hay lista explícita (para pruebas iniciales)
    if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return true;
    return false;
  }
  // lista explícita + regex para vercel preview
  return ALLOWED_ORIGINS.some((allowed) => {
    if (allowed === origin) return true;
    if (allowed.includes("*")) {
      const re = new RegExp("^" + allowed.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
      return re.test(origin);
    }
    return false;
  });
}

const app = express();
app.use(
  cors({
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin)) cb(null, true);
      else cb(new Error(`CORS: origin ${origin} no permitido`));
    },
    credentials: false,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Rate limiting por endpoint (memoria, suficiente para 1 PC)
const rateMap = new Map<string, number[]>();
const rateLimits: Record<string, number> = {
  "/api/analyze": 20, // 20/min
  "/api/analyze/batch": 10,
  "/api/download": 10,
  "/api/downloads/:id/cancel": 20,
  default: 60,
};
app.use((req, res, next) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const key = `${ip}:${req.path}`;
  const limit = (Object.entries(rateLimits).find(([p]) => req.path.startsWith(p))?.[1] ?? rateLimits.default)!;
  const now = Date.now();
  const arr = rateMap.get(key) ?? [];
  const recent = arr.filter((t) => now - t < 60_000);
  recent.push(now);
  rateMap.set(key, recent);
  if (recent.length > limit) {
    res.status(429).json({ error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Espera un momento." } });
    return;
  }
  next();
});

// Auth ligera opcional: si API_KEY está configurado, exigir X-API-Key en mutaciones
const API_KEY = process.env.API_KEY?.trim();
app.use((req, res, next) => {
  if (!API_KEY) return next();
  // Rutas públicas sin auth
  if (req.path === "/health" || req.path === "/api/health" || req.path === "/api/system/status" || req.path === "/api/system/versions") return next();
  // En dev, permitir localhost sin key para no romper flujo local
  const origin = req.headers.origin as string | undefined;
  const isLocal = origin && (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin) || origin === `http://${HOST}:${PORT}`);
  if (isLocal && process.env.NODE_ENV !== "production") return next();
  const provided = (req.headers["x-api-key"] as string | undefined) ?? (req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "");
  if (provided && provided === API_KEY) return next();
  // Si no hay key y es Quick Tunnel, permitir pero con rate-limit ya aplicado; para producción con dominio, se recomienda Cloudflare Access
  // Aquí devolvemos 401 solo si el frontend envió explícitamente un header incorrecto, no bloqueamos por defecto para no romper Quick Tunnel sin config
  // Descomenta la siguiente línea para forzar auth estricta:
  // return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "API key requerida" } });
  return next();
});

// Health check sin prefijo para diagnóstico rápido (sin secretos)
app.get("/health", async (_req, res) => {
  const { getQueueStats } = await import("./services/queue.js");
  const queue = getQueueStats();
  // No exponer rutas absolutas, solo booleans
  let ytDlp = false, ffmpeg = false;
  try {
    const { spawn } = await import("node:child_process");
    const check = (bin: string, args: string[]) =>
      new Promise<boolean>((resolve) => {
        const c = spawn(bin, args, { windowsHide: true });
        c.on("error", () => resolve(false));
        c.on("close", (code) => resolve(code === 0));
        setTimeout(() => { try { c.kill(); } catch {} resolve(false); }, 3000);
      });
    ytDlp = await check(YTDLP_PATH, ["--version"]);
    ffmpeg = await check(FFMPEG_PATH, ["-version"]);
  } catch {}
  res.json({ ok: true, service: "openmedia", ytDlp, ffmpeg, queue });
});
app.get("/api/health", async (_req, res) => {
  const { getQueueStats } = await import("./services/queue.js");
  res.json({ ok: true, service: "openmedia", queue: getQueueStats() });
});
app.use("/api", router);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`Unhandled error: ${err instanceof Error ? err.stack : String(err)}`);
  res.status(500).json({ message: "Ocurrió un error inesperado en el servidor local." });
});

app.listen(PORT, HOST, () => {
  logger.info(`OpenMedia Downloader server listening on http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`OpenMedia Downloader server running at http://${HOST}:${PORT}`);
});
