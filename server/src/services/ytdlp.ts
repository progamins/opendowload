import { spawn } from "node:child_process";
import type { FormatOption, MediaInfo } from "../types/index.js";

export interface YtDlpConfig {
  ytdlpPath: string;
  ffmpegPath: string;
}

let config: YtDlpConfig = { ytdlpPath: "yt-dlp", ffmpegPath: "ffmpeg" };

export function configureYtDlp(next: YtDlpConfig): void {
  config = next;
}

export class YtDlpError extends Error {
  constructor(message: string, public readonly stderr: string) {
    super(message);
    this.name = "YtDlpError";
  }
}

/**
 * IMPORTANT: we always spawn with an argv array (never a shell string), so
 * the user-provided URL can never be interpreted by a shell. `shell` stays
 * false (the Node default for spawn) on purpose -- do not change this.
 */
function run(args: string[], timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ytdlpPath, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new YtDlpError("yt-dlp timed out", stderr));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new YtDlpError(`Failed to start yt-dlp: ${err.message}`, stderr));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new YtDlpError(`yt-dlp exited with code ${code}`, stderr));
    });
  });
}

export async function getYtDlpVersion(): Promise<string | null> {
  try {
    const out = await run(["--version"], 10_000);
    return out.trim();
  } catch {
    return null;
  }
}

interface RawFormat {
  format_id: string;
  ext: string;
  vcodec?: string;
  acodec?: string;
  abr?: number | null;
  tbr?: number | null;
  height?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
}

function toFormatOptions(rawFormats: RawFormat[]): {
  audio: FormatOption[];
  video: FormatOption[];
} {
  const audio: FormatOption[] = [];
  const video: FormatOption[] = [];

  for (const f of rawFormats ?? []) {
    const isAudioOnly = f.vcodec === "none" && f.acodec && f.acodec !== "none";
    const isVideo = f.vcodec && f.vcodec !== "none";
    const size = f.filesize ?? f.filesize_approx ?? null;

    if (isAudioOnly) {
      const kbps = f.abr ? Math.round(f.abr) : f.tbr ? Math.round(f.tbr) : null;
      audio.push({
        formatId: f.format_id,
        ext: f.ext,
        kind: "audio",
        label: kbps ? `${kbps} kbps (${f.ext})` : f.ext,
        approxSizeBytes: size,
      });
    } else if (isVideo) {
      video.push({
        formatId: f.format_id,
        ext: f.ext,
        kind: "video",
        label: f.height ? `${f.height}p (${f.ext})` : f.ext,
        approxSizeBytes: size,
      });
    }
  }

  // Only show real, distinct options -- never invented resolutions/bitrates.
  const dedupe = (arr: FormatOption[]) => {
    const seen = new Set<string>();
    return arr.filter((o) => {
      if (seen.has(o.label)) return false;
      seen.add(o.label);
      return true;
    });
  };

  // Ordenar por calidad descendente: audio por kbps, video por altura
  const parseKbps = (label?: string) => {
    const m = (label ?? "").match(/(\d+)\s*kbps/);
    return m ? parseInt(m[1]!, 10) : 0;
  };
  const parseHeight = (label?: string) => {
    const m = (label ?? "").match(/(\d+)p/);
    return m ? parseInt(m[1]!, 10) : 0;
  };
  audio.sort((a, b) => parseKbps(b.label) - parseKbps(a.label));
  video.sort((a, b) => parseHeight(b.label) - parseHeight(a.label));

  return { audio: dedupe(audio), video: dedupe(video) };
}

export async function analyzeUrl(url: string): Promise<MediaInfo> {
  const stdout = await run(
    ["-J", "--no-warnings", "--skip-download", "--no-playlist", url],
    60_000
  );
  const data = JSON.parse(stdout);

  const isPlaylist = data._type === "playlist";

  if (isPlaylist) {
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const first = entries[0] ?? {};
    return {
      sourceUrl: url,
      id: data.id ?? "playlist",
      title: data.title ?? "Playlist",
      uploader: data.uploader ?? data.channel ?? null,
      durationSeconds: null,
      thumbnailUrl: first.thumbnail ?? data.thumbnails?.[0]?.url ?? null,
      uploadDate: null,
      isPlaylist: true,
      playlistCount: entries.length,
      audioFormats: [],
      videoFormats: [],
    };
  }

  const { audio, video } = toFormatOptions(data.formats ?? []);

  return {
    sourceUrl: url,
    id: data.id,
    title: data.title ?? "Untitled",
    uploader: data.uploader ?? data.channel ?? null,
    durationSeconds: data.duration ?? null,
    thumbnailUrl: data.thumbnail ?? null,
    uploadDate: data.upload_date ?? null,
    isPlaylist: false,
    playlistCount: null,
    audioFormats: audio,
    videoFormats: video,
  };
}

export interface DownloadProgress {
  percent: number | null;
  speed: string | null;
  eta: string | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
}

export interface DownloadHandle {
  cancel: () => void;
  done: Promise<{ finalPath: string | null }>;
}

const PROGRESS_RE =
  /\[download\]\s+(\d+(?:\.\d+)?)% of\s+(?:~?([\d.]+\w+))?.*?at\s+([\d.]+\w+\/s|Unknown speed).*?ETA\s+([\d:]+|Unknown)/;
const DEST_RE = /\[(?:download|ExtractAudio|Merger|ffmpeg|Metadata)\]\s+(?:Destination:\s+)?(.+)$/;

export function startDownload(params: {
  url: string;
  formatSelector: string;
  outputTemplate: string;
  kind: "audio" | "video";
  targetExt: string;
  embedThumbnail: boolean;
  audioQualityKbps?: string;
  onProgress: (p: DownloadProgress) => void;
}): DownloadHandle {
  const args: string[] = [
    "--newline",
    "--no-warnings",
    "--no-playlist",
    "--ffmpeg-location",
    config.ffmpegPath,
    "-f",
    params.formatSelector,
    "-o",
    params.outputTemplate,
  ];

  if (params.kind === "audio") {
    args.push("-x", "--audio-format", params.targetExt);
    if (params.audioQualityKbps) {
      const q = params.audioQualityKbps === "0" ? "0" : `${params.audioQualityKbps}K`;
      // wav no necesita calidad, pero no hace daño ignorarlo
      if (params.targetExt !== "wav") args.push("--audio-quality", q);
    } else if (params.targetExt === "mp3") {
      // por defecto alta calidad si no se especifica
      args.push("--audio-quality", "320K");
    }
  } else {
    args.push("--merge-output-format", params.targetExt);
  }

  if (params.embedThumbnail) {
    args.push("--embed-thumbnail");
  }

  args.push(params.url);

  const child = spawn(config.ytdlpPath, args, { windowsHide: true });
  let lastDestination: string | null = null;
  let stderrTail = "";

  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      const progressMatch = line.match(PROGRESS_RE);
      if (progressMatch) {
        params.onProgress({
          percent: Number(progressMatch[1]),
          speed: progressMatch[3] === "Unknown speed" ? null : progressMatch[3] ?? null,
          eta: progressMatch[4] === "Unknown" ? null : progressMatch[4] ?? null,
          downloadedBytes: null,
          totalBytes: null,
        });
        continue;
      }
      const destMatch = line.match(DEST_RE);
      if (destMatch && destMatch[1]) {
        lastDestination = destMatch[1].trim();
      }
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-4000);
  });

  const done = new Promise<{ finalPath: string | null }>((resolve, reject) => {
    child.on("error", (err) => {
      reject(new YtDlpError(`Failed to start yt-dlp: ${err.message}`, stderrTail));
    });
    child.on("close", (code, signal) => {
      if (signal === "SIGTERM" || signal === "SIGINT") {
        reject(new YtDlpError("cancelled", stderrTail));
        return;
      }
      if (code === 0) {
        resolve({ finalPath: lastDestination });
      } else {
        reject(new YtDlpError(`yt-dlp exited with code ${code}`, stderrTail));
      }
    });
  });

  return {
    cancel: () => child.kill("SIGTERM"),
    done,
  };
}
