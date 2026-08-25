import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { isSupportedUrl } from "../utils/validation.js";
import { analyzeUrl, YtDlpError, getYtDlpVersion } from "../services/ytdlp.js";
import { pickFolderNative } from "../services/dialog.js";
import { getQueueStats, getPerIpCount, MAX_CONCURRENT, MAX_PER_IP } from "../services/queue.js";
import { cacheMediaInfo, getCachedMediaInfo } from "../services/analyzeCache.js";
import { cancelDownload, enqueueDownload } from "../services/queue.js";
import {
  deleteDownload,
  clearDownloads,
  getDownload,
  getSettings,
  listDownloads,
  saveSettings,
} from "../database/db.js";
import { runDiagnostics } from "../services/diagnostics.js";
import { logger } from "../utils/logger.js";
import type { DownloadRequest } from "../types/index.js";

function userMessage(err: unknown): { message: string; technical: string } {
  const technical = err instanceof Error ? err.stack ?? err.message : String(err);
  return {
    message:
      "No se pudo procesar este enlace. El contenido puede no estar disponible, requerir acceso o no ser compatible actualmente.",
    technical,
  };
}

export async function analyzeController(req: Request, res: Response): Promise<void> {
  const rawUrl = req.body?.url;
  const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!url || !isSupportedUrl(url)) {
    res.status(400).json({
      message: "El enlace no es válido o no es un enlace de YouTube compatible. Asegúrate de pegar la URL completa (ej: https://www.youtube.com/watch?v=... o https://youtu.be/...).",
      technical: `isSupportedUrl=false for "${String(rawUrl).slice(0, 200)}"`,
    });
    return;
  }

  // Strip playlist params for single-video analysis to avoid timeouts on &list=...
  // yt-dlp with --no-playlist already ignores it, but we keep the original url for caching
  try {
    const info = await analyzeUrl(url);
    cacheMediaInfo(info);
    res.json(info);
  } catch (err) {
    const { message, technical } = userMessage(err);
    const stderr = err instanceof YtDlpError ? err.stderr : technical;
    const isTimeout = stderr.includes("timed out") || technical.includes("timed out");
    const isBot = stderr.toLowerCase().includes("sign in to confirm") || stderr.includes("not a bot") || stderr.includes("Use --cookies");
    logger.error(`analyze failed for ${url}: ${technical} | stderr: ${stderr.slice(0, 2000)}`);
    res.status(422).json({
      message: isBot
        ? "YouTube está pidiendo verificación anti-bot para este video. Prueba con otro enlace más popular (ej: https://www.youtube.com/watch?v=dQw4w9WgXcQ), actualiza yt-dlp (pip install -U yt-dlp) o reintenta en unos minutos. Si persiste, es una limitación temporal de YouTube."
        : isTimeout
          ? "El análisis tardó demasiado (timeout). Reintenta, o usa el enlace directo del video sin parámetro &list=."
          : message,
      technical: stderr || technical,
    });
  }
}

export function downloadController(req: Request, res: Response): void {
  const body = req.body as Partial<DownloadRequest>;
  const { url, kind, formatId, targetExt, embedThumbnail, audioQuality, customSubdir, downloadDir } = body;

  if (
    typeof url !== "string" ||
    !isSupportedUrl(url) ||
    (kind !== "audio" && kind !== "video") ||
    typeof formatId !== "string" ||
    typeof targetExt !== "string"
  ) {
    res.status(400).json({ message: "Solicitud de descarga inválida." });
    return;
  }

  // Master: máximo 2 simultáneas global y por IP
  const stats = getQueueStats();
  if (stats.active + stats.pending >= MAX_CONCURRENT) {
    res.status(429).json({ error: { code: "DOWNLOAD_LIMIT_REACHED", message: `Ya hay ${MAX_CONCURRENT} descargas activas (global). Espera o cancela.` } });
    return;
  }
  const ip = req.ip ?? (req.socket.remoteAddress as string | undefined) ?? "unknown";
  if (getPerIpCount(ip) >= MAX_PER_IP) {
    res.status(429).json({ error: { code: "PER_IP_LIMIT", message: `Ya tienes ${MAX_PER_IP} descargas activas. Cancela una para continuar.` } });
    return;
  }

  // downloadDir es OPCIONAL en el nuevo flujo (File System Access API).
  // Si viene (compatibilidad Windows picker antiguo), lo validamos. Si no, se usará TEMP efímero.
  let resolvedDir: string | undefined = undefined;
  if (typeof downloadDir === "string" && downloadDir.trim()) {
    resolvedDir = path.resolve(downloadDir.trim());
    if (!path.isAbsolute(resolvedDir)) {
      res.status(400).json({ message: "La carpeta de destino debe ser una ruta absoluta." });
      return;
    }
    try {
      fs.mkdirSync(resolvedDir, { recursive: true });
      const test = path.join(resolvedDir, ".omd_write_test");
      fs.writeFileSync(test, "ok");
      fs.rmSync(test);
    } catch (e: any) {
      res.status(400).json({ message: `No se puede escribir en la carpeta seleccionada: ${resolvedDir}` });
      return;
    }
  }

  // Validar calidad de audio si viene
  const ALLOWED_QUALITIES = new Set(["0", "128", "192", "256", "320"]);
  if (audioQuality !== undefined && audioQuality !== null && audioQuality !== "" && !ALLOWED_QUALITIES.has(String(audioQuality))) {
    res.status(400).json({ message: "Calidad de audio no soportada." });
    return;
  }
  if (customSubdir !== undefined && customSubdir !== null && typeof customSubdir !== "string") {
    res.status(400).json({ message: "Subcarpeta inválida." });
    return;
  }
  if (customSubdir && (customSubdir.includes("..") || customSubdir.length > 200)) {
    res.status(400).json({ message: "Subcarpeta inválida (no se permite ..)." });
    return;
  }

  const info = getCachedMediaInfo(url);
  if (!info) {
    res.status(409).json({
      message: "Este enlace debe analizarse de nuevo antes de descargar (la información expiró).",
    });
    return;
  }

  const validFormats = kind === "audio" ? info.audioFormats : info.videoFormats;
  const formatExists = validFormats.some((f) => f.formatId === formatId);
  if (!formatExists) {
    res.status(400).json({ message: "El formato seleccionado ya no está disponible." });
    return;
  }

  const ALLOWED_AUDIO_EXT = new Set(["mp3", "m4a", "opus", "wav"]);
  const ALLOWED_VIDEO_EXT = new Set(["mp4", "webm"]);
  const allowedSet = kind === "audio" ? ALLOWED_AUDIO_EXT : ALLOWED_VIDEO_EXT;
  if (!allowedSet.has(targetExt)) {
    res.status(400).json({ message: "Formato de salida no soportado." });
    return;
  }

  try {
    const record = enqueueDownload(
      {
        url,
        kind,
        formatId,
        targetExt,
        embedThumbnail: Boolean(embedThumbnail),
        audioQuality: audioQuality ? String(audioQuality) : undefined,
        customSubdir: customSubdir ? String(customSubdir).trim() : undefined,
        downloadDir: resolvedDir,
      },
      info,
      ip
    );
    res.status(201).json(record);
  } catch (e: any) {
    res.status(400).json({ message: e?.message ?? "No se pudo encolar la descarga." });
  }
}

export function listDownloadsController(_req: Request, res: Response): void {
  res.json(listDownloads());
}

export function getDownloadController(req: Request, res: Response): void {
  const record = getDownload(req.params.id ?? "");
  if (!record) {
    res.status(404).json({ message: "Descarga no encontrada." });
    return;
  }
  res.json(record);
}

export function cancelDownloadController(req: Request, res: Response): void {
  const ok = cancelDownload(req.params.id ?? "");
  if (!ok) {
    res.status(404).json({ message: "No se pudo cancelar (no está activa o no existe)." });
    return;
  }
  res.json({ cancelled: true });
}

export function deleteDownloadController(req: Request, res: Response): void {
  deleteDownload(req.params.id ?? "");
  res.status(204).send();
}

export function clearDownloadsController(_req: Request, res: Response): void {
  clearDownloads();
  res.status(204).send();
}

export function getSettingsController(_req: Request, res: Response): void {
  res.json(getSettings());
}

export function putSettingsController(req: Request, res: Response): void {
  const patch = req.body ?? {};
  // Clamp master: máximo 2 concurrentes
  if (typeof patch.maxConcurrentDownloads === "number") {
    patch.maxConcurrentDownloads = Math.max(1, Math.min(2, Math.round(patch.maxConcurrentDownloads)));
  }
  const updated = saveSettings(patch);
  res.json(updated);
}

export async function systemStatusController(req: Request, res: Response): Promise<void> {
  const settings = getSettings();
  const checks = await runDiagnostics({
    ytdlpPath: process.env.YTDLP_PATH ?? "yt-dlp",
    ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
    downloadDir: settings.downloadDir,
  });
  res.json({ checks, allOk: checks.every((c) => c.ok) });
}

export async function systemVersionsController(_req: Request, res: Response): Promise<void> {
  const version = await getYtDlpVersion();
  res.json({ ytdlpVersion: version });
}

export async function analyzeBatchController(req: Request, res: Response): Promise<void> {
  const { urls } = req.body ?? {};
  if (!Array.isArray(urls) || urls.length === 0 || urls.length > 2) {
    res.status(400).json({ message: "Envía entre 1 y 2 URLs. Máximo 2 para esta plataforma." });
    return;
  }
  const results: Array<{ url: string; ok: true; data: unknown } | { url: string; ok: false; error: string; technical?: string }> = [];
  for (const raw of urls) {
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!url || !isSupportedUrl(url)) {
      results.push({ url: String(raw), ok: false, error: "URL no compatible con YouTube" });
      continue;
    }
    try {
      const info = await analyzeUrl(url);
      cacheMediaInfo(info);
      results.push({ url, ok: true, data: info });
    } catch (err) {
      const { message, technical } = userMessage(err);
      const stderr = err instanceof YtDlpError ? err.stderr : technical;
      results.push({ url, ok: false, error: message, technical: stderr.slice(0, 1500) });
    }
  }
  res.json(results);
}

export function downloadFileController(req: Request, res: Response): void {
  const record = getDownload(req.params.id ?? "");
  if (!record) {
    res.status(404).json({ message: "Descarga no encontrada." });
    return;
  }
  let filePath = record.filePath;

  // Fallback: si filePath no existe (encoding á→? ), buscar en temp/<id>
  if (!filePath || !fs.existsSync(filePath)) {
    try {
      const base = path.resolve(process.env.TEMP_DIR ?? "../temp");
      const byId = path.join(base, record.id);
      const candidates: string[] = [];
      const walk = (dir: string) => {
        try {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.isFile()) candidates.push(p);
          }
        } catch {}
      };
      if (fs.existsSync(byId)) walk(byId);
      // También probar el directorio padre del filePath si existe
      if (candidates.length === 0 && filePath) {
        try { const d = path.dirname(filePath); if (fs.existsSync(d)) walk(d); } catch {}
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          try { const sa = fs.statSync(a), sb = fs.statSync(b); return sb.mtimeMs - sa.mtimeMs; } catch { return 0; }
        });
        filePath = candidates[0]!;
        logger.info(`downloadFile fallback for ${record.id} -> ${filePath}`);
      }
    } catch {}
  }

  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ message: "El archivo ya no existe en disco. Puede haber sido limpiado tras 10 min o el nombre contenía caracteres especiales. Reintenta la descarga." });
    return;
  }
  const fileName = path.basename(filePath);
  const stat = fs.statSync(filePath);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader("Cache-Control", "no-store");

  const stream = fs.createReadStream(filePath);
  let finished = false;
  const cleanup = (isError: boolean) => {
    if (finished) return;
    finished = true;
    try { stream.destroy(); } catch {}
    // No borrar inmediatamente si es error y el cliente puede reintentar; borrar solo tras éxito o cancel
    if (!isError) {
      const tempRoot = path.resolve(process.env.TEMP_DIR ?? "../temp");
      if (filePath!.startsWith(tempRoot)) {
        // Borrar el directorio temp/<id> tras servir correctamente (grace period 5s)
        setTimeout(() => {
          try {
            const dir = path.dirname(filePath!);
            if (fs.existsSync(dir) && dir.includes(record.id)) {
              fs.rmSync(dir, { recursive: true, force: true });
              logger.download(`CLEANED after stream ${dir}`);
            }
          } catch {}
        }, 5000);
      }
    }
  };

  stream.on("error", (err) => {
    logger.error(`stream error ${record.id}: ${String(err)}`);
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
    cleanup(true);
  });
  res.on("close", () => {
    // Cliente cerró conexión (cancel) — limpiar si no completó
    if (!finished) cleanup(true);
  });
  res.on("finish", () => cleanup(false));
  stream.pipe(res);
}

export function openFolderController(req: Request, res: Response): void {
  const record = getDownload(req.params.id ?? "");
  if (!record || !record.filePath) {
    res.status(404).json({ message: "Ruta no disponible." });
    return;
  }
  res.json({ folder: path.dirname(record.filePath), file: record.filePath });
}

export async function openFolderDialogController(req: Request, res: Response): Promise<void> {
  const { initialDir } = req.body ?? {};
  const hint = typeof initialDir === "string" && initialDir.trim() ? initialDir.trim() : getSettings().downloadDir || os.homedir();
  try {
    const picked = await pickFolderNative(hint);
    if (!picked) {
      // cancelado -> 204 sin contenido, el frontend lo interpreta como cancelación
      res.status(204).send();
      return;
    }
    res.json({ path: picked });
  } catch (e: any) {
    logger.error(`openFolderDialog failed: ${e?.message ?? String(e)}`);
    res.status(500).json({ message: "No se pudo abrir el diálogo de carpeta." });
  }
}
