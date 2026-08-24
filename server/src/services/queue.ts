import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { getDownload, getSettings, insertDownload, updateDownload } from "../database/db.js";
import { emitProgress } from "./events.js";
import { logger } from "../utils/logger.js";
import { sanitizeFilename } from "../utils/validation.js";
import { startDownload, type DownloadHandle } from "./ytdlp.js";
import type { DownloadRecord, DownloadRequest, MediaInfo } from "../types/index.js";

const activeHandles = new Map<string, DownloadHandle>();
const pendingQueue: string[] = [];
const pendingRequests = new Map<string, DownloadRequest & { effectiveDir: string; filenamePattern: string; createSubfolders: boolean }>();
let activeCount = 0;

export const MAX_CONCURRENT = 2;
export const MAX_PER_IP = 2;
const TEMP_TTL_MS = 10 * 60 * 1000; // 10 min auto-borra temp

function getTempBase(): string {
  const envDir = process.env.TEMP_DIR;
  if (envDir) return path.resolve(envDir);
  return path.join(os.tmpdir(), "openmedia-downloader");
}

const perIpActive = new Map<string, number>();

export function getQueueStats() {
  return { active: activeCount, pending: pendingQueue.length, max: MAX_CONCURRENT };
}
export function getPerIpCount(ip: string): number {
  return perIpActive.get(ip) ?? 0;
}
function incPerIp(ip: string) {
  perIpActive.set(ip, (perIpActive.get(ip) ?? 0) + 1);
}
function decPerIp(ip: string) {
  const c = perIpActive.get(ip) ?? 0;
  if (c <= 1) perIpActive.delete(ip);
  else perIpActive.set(ip, c - 1);
}

function formatSelectorFor(req: DownloadRequest): string {
  // formatId comes from a real, previously-listed yt-dlp format id -- never
  // free text from the client is passed straight through without this
  // lookup existing in the analyzed format list (enforced by the controller).
  if (req.kind === "audio") {
    return `${req.formatId}/bestaudio/best`;
  }
  return `${req.formatId}+bestaudio/best`;
}

export function enqueueDownload(req: DownloadRequest, info: MediaInfo, ip?: string): DownloadRecord {
  const settings = getSettings();
  const id = crypto.randomUUID();
  const clientIp = ip ?? "unknown";

  // MASTER PROMPT: no almacenamiento permanente. Usar TEMP base efímero.
  // Ignorar downloadDir del picker Windows antiguo; el destino final lo elige el navegador (File System Access API).
  // Si el cliente envía downloadDir lo respetamos solo si es temp? Para compatibilidad, si viene lo usamos, sino temp.
  const useTemp = !req.downloadDir; // nuevo flujo = sin downloadDir
  const rawDir = useTemp ? path.join(getTempBase(), id) : path.resolve(req.downloadDir!.trim());
  const effectiveDir = rawDir;
  try {
    fs.mkdirSync(effectiveDir, { recursive: true });
  } catch (e: any) {
    throw new Error(`No se pudo preparar carpeta temporal: ${effectiveDir} (${e?.message ?? String(e)})`);
  }

  // Si el usuario eligió calidad custom, la guardamos en quality para historial
  const qualityLabel = req.kind === "audio" && req.audioQuality
    ? (req.audioQuality === "0" ? "Máxima (V0)" : `${req.audioQuality} kbps (${req.targetExt})`)
    : (req.kind === "audio" ? extractQualityLabel(req, info) : null);

  const record: DownloadRecord = {
    id,
    url: req.url,
    title: info.title,
    thumbnail: info.thumbnailUrl,
    kind: req.kind,
    format: req.targetExt,
    quality: qualityLabel,
    duration: info.durationSeconds,
    filePath: null,
    fileSize: null,
    status: "queued",
    progress: 0,
    speed: null,
    eta: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  insertDownload(record);
  pendingQueue.push(id);
  pendingRequests.set(id, { ...req, effectiveDir, filenamePattern: settings.filenamePattern, createSubfolders: settings.createSubfolders, _ip: clientIp } as any);
  incPerIp(clientIp);
  logger.download(`QUEUED ${id} "${info.title}" (${req.kind}/${req.targetExt} q=${req.audioQuality ?? "auto"}) <- ${req.url} dir=${effectiveDir} ip=${clientIp}`);
  processQueue();
  return record;
}

function extractQualityLabel(req: DownloadRequest, info: MediaInfo): string | null {
  const match = info.audioFormats.find((f) => f.formatId === req.formatId);
  return match?.label ?? null;
}

function processQueue(): void {
  const maxConcurrent = MAX_CONCURRENT;
  if (activeCount >= maxConcurrent) return;
  const nextId = pendingQueue.shift();
  if (!nextId) return;
  const req = pendingRequests.get(nextId);
  if (!req) return;

  activeCount += 1;
  const ipForJob = (req as any)._ip as string | undefined;
  runJob(nextId, req, req.effectiveDir, req.filenamePattern, req.createSubfolders).finally(() => {
    activeCount -= 1;
    if (ipForJob) decPerIp(ipForJob);
    pendingRequests.delete(nextId);
    processQueue();
  });
}

function scheduleTempCleanup(dir: string) {
  const base = getTempBase();
  if (!dir.startsWith(base)) return; // solo temporales
  setTimeout(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      logger.download(`CLEANED temp ${dir}`);
    } catch {}
  }, TEMP_TTL_MS);
}

function isTempDir(dir: string): boolean {
  return dir.startsWith(getTempBase());
}

async function runJob(
  id: string,
  req: DownloadRequest,
  downloadDir: string,
  filenamePattern: string,
  createSubfolders: boolean
): Promise<void> {
  const record = getDownload(id);
  if (!record || record.status === "cancelled") return;

  try {
    fs.mkdirSync(downloadDir, { recursive: true });

    let targetDir: string;
    if (isTempDir(downloadDir)) {
      // Flujo nuevo: temp/id → guardar directo, sin subcarpetas anidadas
      targetDir = downloadDir;
    } else if (req.customSubdir && req.customSubdir.trim()) {
      const clean = req.customSubdir.split(/[/\\]/).map(s => sanitizeFilename(s)).filter(Boolean).join(path.sep);
      // safeResolveInDir inline para evitar import extra
      const base = path.resolve(downloadDir);
      const target = path.resolve(base, clean);
      if (target !== base && !target.startsWith(base + path.sep)) throw new Error("Ruta no permitida");
      targetDir = target;
    } else if (createSubfolders) {
      const subDir = sanitizeFilename(record.title);
      const base = path.resolve(downloadDir);
      const target = path.resolve(base, subDir);
      if (target !== base && !target.startsWith(base + path.sep)) throw new Error("Ruta no permitida");
      targetDir = target;
    } else {
      targetDir = path.resolve(downloadDir);
    }
    fs.mkdirSync(targetDir, { recursive: true });

    // yt-dlp expands its own template placeholders; we only control the
    // directory portion, which is always confined to the configured folder.
    const outputTemplate = path.join(targetDir, filenamePattern);

    setStatus(id, "preparing", 0);

    // Priorizar calidad elegida por usuario, fallback a la del formato
    const audioQ = req.kind === "audio" ? (req.audioQuality ?? qualityFromFormatLabel(record.quality)) : undefined;
    // "0" = mejor para yt-dlp; si no, pasar kbps; para wav no re-encodear si coincide
    const effectiveAudioQ = audioQ === "0" ? "0" : audioQ;
    const handle = startDownload({
      url: req.url,
      formatSelector: formatSelectorFor(req),
      outputTemplate,
      kind: req.kind,
      targetExt: req.targetExt,
      embedThumbnail: req.embedThumbnail,
      audioQualityKbps: effectiveAudioQ,
      onProgress: (p) => {
        const status = p.percent !== null && p.percent < 100 ? "downloading" : "finalizing";
        setStatus(id, status, p.percent ?? record.progress, p.speed, p.eta);
      },
    });

    activeHandles.set(id, handle);
    const result = await handle.done;
    activeHandles.delete(id);

    let finalPath = result.finalPath;
    // Fallback robusto: si el parsing falló por encoding (á → ?) o no existe, buscar el archivo real en el temp
    if (!finalPath || !fs.existsSync(finalPath)) {
      try {
        const candidates: string[] = [];
        const walk = (dir: string) => {
          try {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
              const p = path.join(dir, e.name);
              if (e.isDirectory()) walk(p);
              else if (e.isFile() && e.name.toLowerCase().endsWith(`.${req.targetExt.toLowerCase()}`)) candidates.push(p);
            }
          } catch {}
        };
        walk(targetDir);
        // Si no hay por extensión, tomar cualquier archivo no vacío
        if (candidates.length === 0) {
          const walkAny = (dir: string) => {
            try {
              for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) walkAny(p);
                else if (e.isFile()) candidates.push(p);
              }
            } catch {}
          };
          walkAny(targetDir);
        }
        if (candidates.length > 0) {
          // elegir el más reciente / grande
          candidates.sort((a, b) => {
            try {
              const sa = fs.statSync(a), sb = fs.statSync(b);
              return sb.mtimeMs - sa.mtimeMs || sb.size - sa.size;
            } catch { return 0; }
          });
          finalPath = candidates[0]!;
          logger.download(`FALLBACK path for ${id}: ${finalPath}`);
        }
      } catch {}
    }

    let fileSize: number | null = null;
    if (finalPath && fs.existsSync(finalPath)) {
      try { fileSize = fs.statSync(finalPath).size; } catch {}
    } else {
      finalPath = null;
    }

    updateDownload(id, {
      status: finalPath ? "completed" : "error",
      progress: finalPath ? 100 : 0,
      filePath: finalPath,
      fileSize,
      errorMessage: finalPath ? null : "No se encontró el archivo generado",
      completedAt: new Date().toISOString(),
      speed: null,
      eta: null,
    });
    emitProgress({
      downloadId: id,
      status: "completed",
      progress: 100,
      speed: null,
      eta: null,
      totalBytes: null,
      downloadedBytes: null,
    });
    logger.download(`COMPLETED ${id} -> ${result.finalPath ?? "unknown path"}`);
    if (isTempDir(downloadDir)) scheduleTempCleanup(downloadDir);
  } catch (err) {
    // Limpiar temp en error/cancel
    if (isTempDir(downloadDir)) {
      try { fs.rmSync(downloadDir, { recursive: true, force: true }); } catch {}
    }
    activeHandles.delete(id);
    const current = getDownload(id);
    const cancelled = current?.status === "cancelled";
    const message = err instanceof Error ? err.message : String(err);

    updateDownload(id, {
      status: cancelled ? "cancelled" : "error",
      errorMessage: cancelled ? null : message,
      completedAt: new Date().toISOString(),
    });
    emitProgress({
      downloadId: id,
      status: cancelled ? "cancelled" : "error",
      progress: current?.progress ?? 0,
      speed: null,
      eta: null,
      totalBytes: null,
      downloadedBytes: null,
    });
    logger.error(`DOWNLOAD ${id} failed: ${message}`);
  }
}

function qualityFromFormatLabel(label: string | null): string | undefined {
  if (!label) return undefined;
  const match = label.match(/(\d+)\s*kbps/);
  return match ? match[1] : undefined;
}

function setStatus(
  id: string,
  status: DownloadRecord["status"],
  progress: number,
  speed: string | null = null,
  eta: string | null = null
): void {
  updateDownload(id, { status, progress, speed, eta });
  emitProgress({
    downloadId: id,
    status,
    progress,
    speed,
    eta,
    totalBytes: null,
    downloadedBytes: null,
  });
}

export function cancelDownload(id: string): boolean {
  const ip = (pendingRequests.get(id) as any)?._ip as string | undefined;
  const handle = activeHandles.get(id);
  if (handle) {
    updateDownload(id, { status: "cancelled", completedAt: new Date().toISOString() });
    handle.cancel();
    // decPerIp se hará en finally de runJob; no duplicar
    return true;
  }
  const idx = pendingQueue.indexOf(id);
  if (idx >= 0) {
    pendingQueue.splice(idx, 1);
    if (ip) decPerIp(ip);
    pendingRequests.delete(id);
    updateDownload(id, { status: "cancelled", completedAt: new Date().toISOString() });
    return true;
  }
  if (pendingRequests.has(id)) {
    if (ip) decPerIp(ip);
    pendingRequests.delete(id);
    updateDownload(id, { status: "cancelled", completedAt: new Date().toISOString() });
    return true;
  }
  return false;
}
