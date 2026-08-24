import { useMemo, useState } from "react";
import { Download, Image as ImageIcon, ListMusic, FolderOpen, Music2, Video, Crown, HardDrive } from "lucide-react";
import type { DownloadKind, MediaInfo } from "../types";
import { formatDuration } from "../format";

interface PreviewCardProps {
  info: MediaInfo;
  onDownload: (params: { kind: DownloadKind; formatId: string; targetExt: string; embedThumbnail: boolean; audioQuality?: string; customSubdir?: string }) => void;
  submitting: boolean;
  defaultQuality?: string;
}

const AUDIO_CONTAINERS = ["mp3", "m4a", "opus", "wav"];
const VIDEO_CONTAINERS = ["mp4", "webm"];
const AUDIO_QUALITIES = [
  { value: "320", label: "Máxima · 320 kbps", badge: "HQ" },
  { value: "256", label: "Alta · 256 kbps", badge: "" },
  { value: "192", label: "Estándar · 192 kbps", badge: "" },
  { value: "128", label: "Ahorro · 128 kbps", badge: "" },
  { value: "0", label: "Original sin recompresión", badge: "BEST" },
];

export function PreviewCard({ info, onDownload, submitting, defaultQuality = "320" }: PreviewCardProps) {
  const [kind, setKind] = useState<DownloadKind>(info.audioFormats.length > 0 ? "audio" : "video");
  const formats = kind === "audio" ? info.audioFormats : info.videoFormats;
  const [formatId, setFormatId] = useState<string>(formats[0]?.formatId ?? "");
  const [targetExt, setTargetExt] = useState<string>(kind === "audio" ? "mp3" : "mp4");
  const [embedThumbnail, setEmbedThumbnail] = useState(true);
  const [audioQuality, setAudioQuality] = useState(defaultQuality);
  const [customSubdir, setCustomSubdir] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const currentFormats = useMemo(() => (kind === "audio" ? info.audioFormats : info.videoFormats), [kind, info]);

  function switchKind(next: DownloadKind) {
    setKind(next);
    const list = next === "audio" ? info.audioFormats : info.videoFormats;
    setFormatId(list[0]?.formatId ?? "");
    setTargetExt(next === "audio" ? "mp3" : "mp4");
  }

  if (info.isPlaylist) {
    return (
      <div className="rounded-[20px] border border-white/[0.06] bg-graphite-800/80 p-6 backdrop-blur">
        <div className="flex items-center gap-2 text-teal-400">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/15"><ListMusic size={16} /></div>
          <p className="text-sm font-bold">Playlist detectada</p>
        </div>
        <p className="mt-2 text-sm font-medium text-ink-50">{info.title}</p>
        <p className="mt-1 text-xs text-ink-400">{info.playlistCount ?? "?"} elementos</p>
        <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300">La descarga de playlists completas aún no está implementada. Pega el enlace directo del video.</p>
      </div>
    );
  }

  return (
    <div className="animate-in overflow-hidden rounded-[24px] border border-white/[0.06] bg-gradient-to-b from-graphite-800 to-graphite-800/80 shadow-2xl backdrop-blur">
      {/* header media */}
      <div className="relative flex gap-4 p-5">
        <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-2xl bg-graphite-700 shadow-inner">
          {info.thumbnailUrl ? (
            <img src={info.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-ink-600"><ImageIcon size={24} /></div>
          )}
          <div className="absolute bottom-1.5 right-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">
            {formatDuration(info.durationSeconds)}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-display text-[15px] font-bold leading-snug text-ink-50">{info.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-ink-400"><span className="h-1 w-1 rounded-full bg-ink-600" />{info.uploader ?? "Canal desconocido"}</p>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[11px] font-bold text-teal-400">{info.audioFormats.length} audios</span>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-400">{info.videoFormats.length} videos</span>
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t border-white/[0.06] bg-graphite-900/30 p-5">
        {/* kind switch */}
        <div className="flex gap-1 rounded-full bg-graphite-950 p-1">
          <button onClick={() => switchKind("audio")} disabled={info.audioFormats.length === 0}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-bold transition ${kind === "audio" ? "bg-white text-graphite-950 shadow" : "text-ink-400 hover:text-ink-200"}`}>
            <Music2 size={14} /> Audio
          </button>
          <button onClick={() => switchKind("video")} disabled={info.videoFormats.length === 0}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-bold transition ${kind === "video" ? "bg-white text-graphite-950 shadow" : "text-ink-400 hover:text-ink-200"}`}>
            <Video size={14} /> Video
          </button>
        </div>

        {currentFormats.length === 0 ? (
          <p className="rounded-xl bg-danger-500/10 px-3 py-3 text-center text-sm text-danger-400">No hay formatos disponibles</p>
        ) : (
          <div>
            <label className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-ink-400"><Crown size={12} className="text-amber-500" /> Calidad de origen</label>
            <select value={formatId} onChange={(e) => setFormatId(e.target.value)}
              className="w-full rounded-xl border border-white/[0.06] bg-graphite-800 px-3 py-2.5 text-sm font-medium text-ink-50 focus:border-amber-500 focus:outline-none">
              {currentFormats.map((f) => (
                <option key={f.formatId} value={f.formatId}>{f.label} {f.approxSizeBytes ? `· ${(f.approxSizeBytes/1024/1024).toFixed(1)} MB` : ""}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-2 block text-xs font-bold tracking-wide text-ink-400">Formato de salida</label>
          <div className="flex flex-wrap gap-1.5">
            {(kind === "audio" ? AUDIO_CONTAINERS : VIDEO_CONTAINERS).map((ext) => (
              <button key={ext} onClick={() => setTargetExt(ext)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition ${targetExt === ext ? "bg-amber-500 text-graphite-950 shadow" : "bg-graphite-800 text-ink-400 ring-1 ring-white/[0.06] hover:bg-graphite-700 hover:text-ink-50"}`}>
                {ext}
              </button>
            ))}
          </div>
        </div>

        {kind === "audio" && (
          <div>
            <label className="mb-2 block text-xs font-bold tracking-wide text-ink-400">Calidad de salida</label>
            <select value={audioQuality} onChange={(e) => setAudioQuality(e.target.value)}
              className="w-full rounded-xl border border-white/[0.06] bg-graphite-800 px-3 py-2.5 text-sm font-medium text-ink-50 focus:border-amber-500 focus:outline-none">
              {AUDIO_QUALITIES.map((q) => (
                <option key={q.value} value={q.value}>{q.label} {q.badge ? `· ${q.badge}` : ""}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">320 kbps = máxima calidad MP3. “Original” evita recompresión.</p>
          </div>
        )}

        {kind === "audio" && info.thumbnailUrl && (
          <label className="flex items-center gap-2 rounded-xl bg-graphite-800 px-3 py-2.5 text-sm font-medium text-ink-200 ring-1 ring-white/[0.04]">
            <input type="checkbox" checked={embedThumbnail} onChange={(e) => setEmbedThumbnail(e.target.checked)} className="h-4 w-4 rounded border-white/10 bg-graphite-700 accent-amber-500" />
            Incrustar portada en el archivo
          </label>
        )}

        <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.08] py-2 text-xs font-semibold text-ink-400 hover:border-white/[0.14] hover:text-ink-200">
          <FolderOpen size={12} /> {showAdvanced ? "Ocultar opciones" : "Opciones de carpeta"}
        </button>
        {showAdvanced && (
          <div className="rounded-2xl border border-white/[0.06] bg-graphite-800 p-4">
            <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink-400"><HardDrive size={12} /> Subcarpeta dentro de la elegida</label>
            <input type="text" value={customSubdir} onChange={(e) => setCustomSubdir(e.target.value)} placeholder="Ej: Música / Favoritas"
              className="w-full rounded-xl border border-white/[0.06] bg-graphite-950 px-3 py-2.5 text-sm text-ink-50 placeholder:text-ink-600 focus:border-amber-500 focus:outline-none" />
            <p className="mt-2 text-[11px] text-ink-500">Se creará dentro de la carpeta que elijas en el diálogo nativo de Windows.</p>
          </div>
        )}

        <button disabled={!formatId || submitting} onClick={() => onDownload({ kind, formatId, targetExt, embedThumbnail, audioQuality: kind === "audio" ? audioQuality : undefined, customSubdir: customSubdir.trim() || undefined })}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-teal-500 to-teal-400 py-3.5 text-sm font-extrabold tracking-wide text-graphite-950 shadow-lg shadow-teal-500/20 transition hover:brightness-[1.05] disabled:opacity-50">
          <Download size={16} strokeWidth={2.5} />{submitting ? "Preparando..." : `Descargar ${kind === "audio" ? "audio" : "video"}`}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-ink-500"><span className="h-1 w-1 rounded-full bg-teal-500 animate-pulse" /> Se abrirá el explorador de Windows para elegir la carpeta</p>
      </div>
    </div>
  );
}
