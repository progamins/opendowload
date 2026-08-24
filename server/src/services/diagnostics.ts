import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface DiagnosticCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  installHint?: string | undefined;
}

function runVersion(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? out.trim() : null));
  });
}

export async function runDiagnostics(opts: {
  ytdlpPath: string;
  ffmpegPath: string;
  downloadDir: string;
}): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  checks.push({
    id: "node",
    label: "Node.js",
    ok: true,
    detail: process.version,
  });

  const ytdlpVersion = await runVersion(opts.ytdlpPath, ["--version"]);
  checks.push({
    id: "ytdlp",
    label: "yt-dlp",
    ok: ytdlpVersion !== null,
    detail: ytdlpVersion ?? "No encontrado",
    installHint:
      ytdlpVersion === null
        ? "Instala yt-dlp: pip install -U yt-dlp  (o descarga el binario oficial desde https://github.com/yt-dlp/yt-dlp/releases)"
        : undefined,
  });

  const ffmpegVersion = await runVersion(opts.ffmpegPath, ["-version"]);
  checks.push({
    id: "ffmpeg",
    label: "FFmpeg",
    ok: ffmpegVersion !== null,
    detail: ffmpegVersion ? (ffmpegVersion.split("\n")[0] ?? ffmpegVersion) : "No encontrado",
    installHint:
      ffmpegVersion === null
        ? "Instala FFmpeg desde https://ffmpeg.org/download.html o mediante tu gestor de paquetes (choco install ffmpeg / brew install ffmpeg / apt install ffmpeg)"
        : undefined,
  });

  let writable = false;
  let detail = "";
  try {
    fs.mkdirSync(opts.downloadDir, { recursive: true });
    const testFile = path.join(opts.downloadDir, ".omd_write_test");
    fs.writeFileSync(testFile, "ok");
    fs.rmSync(testFile);
    writable = true;
    detail = opts.downloadDir;
  } catch (err) {
    detail = err instanceof Error ? err.message : "Error desconocido";
  }
  checks.push({
    id: "downloadDir",
    label: "Carpeta de descargas",
    ok: writable,
    detail,
  });

  let spaceOk = true;
  let spaceDetail = "No se pudo determinar";
  try {
    const stat = fs.statfsSync(opts.downloadDir);
    const freeBytes = stat.bavail * stat.bsize;
    const freeGb = freeBytes / 1024 ** 3;
    spaceOk = freeGb > 0.5;
    spaceDetail = `${freeGb.toFixed(1)} GB libres`;
  } catch {
    // statfsSync not available on all platforms; not fatal.
  }
  checks.push({
    id: "diskSpace",
    label: "Espacio disponible",
    ok: spaceOk,
    detail: spaceDetail,
  });

  return checks;
}
