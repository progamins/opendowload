import { api } from "../api";
import type { MediaInfo } from "../types";

// Estados centralizados — un único estado, no booleanos contradictorios
export type DownloadStatus =
  | "IDLE"
  | "VALIDATING"
  | "ANALYZING"
  | "READY"
  | "WAITING_FOR_DESTINATION"
  | "DOWNLOADING"
  | "COMPLETED"
  | "CANCELLED"
  | "ERROR"
  | "RETRYING";

export interface DownloadTask {
  id: string;
  url: string;
  title: string | null;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  mediaInfo: MediaInfo | null;
  formatId: string | null;
  targetExt: string;
  quality: string;
  status: DownloadStatus;
  progress: number; // 0-100
  downloadedBytes: number;
  totalBytes: number | null;
  speed: string | null; // e.g. "2.1 MB/s"
  eta: string | null;
  error: string | null;
  abortController: AbortController | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  backendId: string | null; // id en servidor queue
}

type Listener = (tasks: DownloadTask[]) => void;

const MAX_CONCURRENT = 2;

class DownloadManager {
  private tasks: DownloadTask[] = [];
  private listeners: Set<Listener> = new Set();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn([...this.tasks]);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    const snap = [...this.tasks];
    for (const fn of this.listeners) fn(snap);
  }

  getTasks(): DownloadTask[] {
    return [...this.tasks];
  }

  getActiveCount(): number {
    return this.tasks.filter((t) => t.status === "DOWNLOADING" || t.status === "ANALYZING" || t.status === "WAITING_FOR_DESTINATION").length;
  }

  canAdd(): boolean {
    return this.tasks.filter((t) => ["DOWNLOADING", "ANALYZING", "WAITING_FOR_DESTINATION", "READY"].includes(t.status)).length < MAX_CONCURRENT + 2; // permitir cola corta
  }

  getTask(id: string): DownloadTask | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  // Crea tarea en IDLE, luego valida y analiza
  async addAndAnalyze(url: string): Promise<DownloadTask> {
    const id = crypto.randomUUID();
    const task: DownloadTask = {
      id,
      url: url.trim(),
      title: null,
      thumbnail: null,
      duration: null,
      uploader: null,
      mediaInfo: null,
      formatId: null,
      targetExt: "mp3",
      quality: "320",
      status: "IDLE",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: null,
      speed: null,
      eta: null,
      error: null,
      abortController: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      backendId: null,
    };
    this.tasks.push(task);
    this.notify();

    // VALIDATING
    this.update(id, { status: "VALIDATING" });
    const isValid = this.isValidYouTubeUrl(task.url);
    if (!isValid) {
      this.update(id, { status: "ERROR", error: "El enlace no es válido o no es de YouTube." });
      return task;
    }

    // ANALYZING
    this.update(id, { status: "ANALYZING" });
    try {
      const info = await api.analyze(task.url);
      this.update(id, {
        mediaInfo: info,
        title: info.title,
        thumbnail: info.thumbnailUrl,
        duration: info.durationSeconds,
        uploader: info.uploader,
        formatId: info.audioFormats[0]?.formatId ?? info.videoFormats[0]?.formatId ?? null,
        status: "READY",
        error: null,
      });
    } catch (e: any) {
      const msg = e?.message ?? "No se pudo obtener información del vídeo.";
      this.update(id, { status: "ERROR", error: this.humanizeError(msg) });
    }
    return this.getTask(id)!;
  }

  private isValidYouTubeUrl(raw: string): boolean {
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:" && u.protocol !== "http:") return false;
      const h = u.hostname.toLowerCase();
      const allowed = ["youtube.com", "youtu.be", "music.youtube.com", "m.youtube.com", "youtube-nocookie.com"];
      return allowed.some((s) => h === s || h.endsWith(`.${s}`));
    } catch {
      return false;
    }
  }

  private humanizeError(msg: string): string {
    if (msg.includes("Failed to fetch") || msg.includes("No se pudo conectar")) return "El servidor no pudo preparar esta descarga. Verifica que el backend esté en ejecución.";
    if (msg.toLowerCase().includes("sign in to confirm") || msg.toLowerCase().includes("not a bot")) return "YouTube pide verificación anti-bot para este video. Prueba otro enlace (ej: https://www.youtube.com/watch?v=dQw4w9WgXcQ), actualiza yt-dlp o reintenta en unos minutos.";
    if (msg.includes("isSupportedUrl") || msg.includes("no es válido")) return "El enlace no es válido.";
    if (msg.includes("No se pudo obtener")) return "No se pudo obtener información del vídeo. Puede ser privado o no disponible.";
    if (msg.includes("429")) return "Se alcanzó el límite de descargas simultáneas (2). Espera o cancela una.";
    return msg;
  }

  update(id: string, patch: Partial<DownloadTask>) {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return;
    this.tasks[idx] = { ...this.tasks[idx]!, ...patch };
    this.notify();
  }

  async startDownload(id: string, opts?: { targetExt?: string; quality?: string }) {
    const task = this.getTask(id);
    if (!task) return;
    if (task.status === "DOWNLOADING") return; // prevenir doble clic
    if (this.getActiveCount() > MAX_CONCURRENT) {
      this.update(id, { status: "ERROR", error: `Ya hay ${MAX_CONCURRENT} descargas activas.` });
      return;
    }
    if (!task.mediaInfo || !task.formatId) {
      this.update(id, { status: "ERROR", error: "La canción no está lista. Analiza de nuevo." });
      return;
    }

    const targetExt = opts?.targetExt ?? task.targetExt;
    const quality = opts?.quality ?? task.quality;

    this.update(id, { status: "WAITING_FOR_DESTINATION", targetExt, quality, error: null });

    // 1) Solicitar destino con File System Access API si está disponible
    const supportsFS = typeof window !== "undefined" && "showSaveFilePicker" in window;
    let fileHandle: any = null;

    if (supportsFS) {
      try {
        const suggested = this.sanitizeFileName(`${task.title ?? "audio"}.${targetExt}`);
        // @ts-ignore
        fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: suggested,
          types: [{ description: "Audio", accept: { "audio/mpeg": [`.${targetExt}`], "audio/*": [`.${targetExt}`] } }],
        });
      } catch (e: any) {
        if (e?.name === "AbortError") {
          this.update(id, { status: "READY" });
          return;
        }
        this.update(id, { status: "READY", error: "No se pudo abrir el selector. Se usará descarga estándar." });
        return;
      }
    }

    // 2) Preparar backend: encolar descarga (usa TEMP, no permanente)
    const abort = new AbortController();
    this.update(id, { status: "DOWNLOADING", progress: 0, downloadedBytes: 0, speed: null, eta: null, abortController: abort, startedAt: new Date().toISOString() });

    let backendId: string | null = null;
    try {
      // Encolar en servidor (con temp)
      const kind = task.mediaInfo!.audioFormats.some((f) => f.formatId === task.formatId) ? "audio" : "video";
      const rec: any = await api.download({
        url: task.mediaInfo!.sourceUrl,
        kind: kind as any,
        formatId: task.formatId!,
        targetExt,
        embedThumbnail: true,
        audioQuality: kind === "audio" ? quality : undefined,
        // downloadDir no se envía -> backend usa TEMP
        downloadDir: undefined as any,
      });
      backendId = rec.id;
      this.update(id, { backendId });

      // 3) Esperar a que el backend termine de preparar el archivo (polling)
      const completed = await this.waitForBackend(backendId!, abort.signal);
      if (!completed || !completed.filePath) throw new Error("La descarga fue interrumpida o no se completó.");

      // 4) Stream del archivo al destino elegido
      const fileUrl = api.downloadFileUrl(backendId!);
      const res = await fetch(fileUrl, { signal: abort.signal });
      if (!res.ok) {
        if (res.status === 404) throw new Error("El archivo ya no existe en disco (404). La descarga pudo haber sido limpiada tras 10 min o el nombre contenía caracteres especiales. Reintenta la descarga.");
        throw new Error(`El servidor no pudo proporcionar el archivo (HTTP ${res.status})`);
      }
      const total = res.headers.get("Content-Length") ? Number(res.headers.get("Content-Length")) : completed.fileSize ?? null;
      if (total) this.update(id, { totalBytes: total });

      if (fileHandle) {
        // File System Access API — streaming con WritableStream
        const writable = await fileHandle.createWritable();
        const reader = res.body!.getReader();
        let received = 0;
        const samples: { time: number; bytes: number }[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writable.write(value);
          received += value.length;
          const now = Date.now();
          samples.push({ time: now, bytes: received });
          // ventana de 2s para velocidad
          while (samples.length > 1 && now - samples[0]!.time > 2000) samples.shift();
          let speed: string | null = null;
          let eta: string | null = null;
          if (samples.length >= 2) {
            const first = samples[0]!, last = samples[samples.length - 1]!;
            const deltaBytes = last.bytes - first.bytes;
            const deltaTime = (last.time - first.time) / 1000;
            const bps = deltaTime > 0 ? deltaBytes / deltaTime : 0;
            speed = this.formatSpeed(bps);
            if (total && bps > 0) {
              const remain = total - received;
              const sec = remain / bps;
              eta = sec < 60 ? `${Math.round(sec)}s` : `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
            }
          }
          const pct = total ? Math.round((received / total) * 100) : 0;
          this.update(id, { downloadedBytes: received, progress: pct, speed, eta, totalBytes: total });
        }
        await writable.close();
      } else {
        // Fallback: descarga clásica via blob
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = this.sanitizeFileName(`${task.title ?? "audio"}.${targetExt}`);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        this.update(id, { progress: 100, downloadedBytes: blob.size, totalBytes: blob.size });
      }

      this.update(id, { status: "COMPLETED", progress: 100, completedAt: new Date().toISOString(), abortController: null });
    } catch (e: any) {
      if (e?.name === "AbortError" || abort.signal.aborted) {
        // Intentar cancelar en backend
        if (backendId) try { await api.cancelDownload(backendId); } catch {}
        this.update(id, { status: "CANCELLED", error: "Descarga cancelada", abortController: null });
      } else {
        const msg = e?.message ?? "Error desconocido";
        this.update(id, { status: "ERROR", error: this.humanizeError(msg), abortController: null });
      }
    }
  }

  private async waitForBackend(backendId: string, signal: AbortSignal): Promise<any | null> {
    const start = Date.now();
    while (Date.now() - start < 5 * 60 * 1000) {
      if (signal.aborted) return null;
      try {
        const rec: any = await api.getDownload(backendId);
        if (rec.status === "completed") return rec;
        if (rec.status === "error" || rec.status === "cancelled") throw new Error(rec.errorMessage ?? "Error en servidor");
        // actualizar progreso espejo
        const task = this.tasks.find((t) => t.backendId === backendId);
        if (task && rec) {
          this.update(task.id, { progress: rec.progress ?? 0, speed: rec.speed, eta: rec.eta });
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1200));
    }
    throw new Error("Timeout esperando al servidor");
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "audio.mp3";
  }

  private formatSpeed(bps: number): string {
    if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    if (bps >= 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    return `${Math.round(bps)} B/s`;
  }

  cancel(id: string) {
    const task = this.getTask(id);
    if (!task) return;
    if (task.abortController) task.abortController.abort();
    if (task.backendId) api.cancelDownload(task.backendId).catch(() => {});
    this.update(id, { status: "CANCELLED", error: "Descarga cancelada", abortController: null });
  }

  retry(id: string) {
    const task = this.getTask(id);
    if (!task) return;
    this.update(id, { status: "RETRYING", error: null, progress: 0, downloadedBytes: 0 });
    setTimeout(() => {
      this.update(id, { status: "READY" });
      this.startDownload(id);
    }, 500);
  }

  remove(id: string) {
    const task = this.getTask(id);
    if (task?.status === "DOWNLOADING") this.cancel(id);
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.notify();
  }

  clearHistory() {
    this.tasks = this.tasks.filter((t) => t.status === "DOWNLOADING" || t.status === "ANALYZING" || t.status === "WAITING_FOR_DESTINATION");
    this.notify();
  }
}

export const downloadManager = new DownloadManager();
