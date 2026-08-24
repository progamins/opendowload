import { Check, Copy, RotateCcw, Trash2, X, Download, FolderOpen, Music2, Film, Clock } from "lucide-react";
import type { DownloadRecord } from "../types";
import { formatBytes, formatDate, STATUS_LABEL } from "../format";
import { WaveformProgress } from "./WaveformProgress";
import { useState } from "react";

interface DownloadItemProps {
  record: DownloadRecord;
  onCancel?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRetry?: (record: DownloadRecord) => void;
  onSaveFile?: (record: DownloadRecord) => void;
}

export function DownloadItem({ record, onCancel, onDelete, onRetry, onSaveFile }: DownloadItemProps) {
  const [copied, setCopied] = useState(false);
  const isActive = ["queued", "analyzing", "preparing", "downloading", "converting", "finalizing"].includes(record.status);
  const isCompleted = record.status === "completed";

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(record.url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className={`group relative overflow-hidden rounded-[20px] border bg-graphite-800/80 p-4 backdrop-blur transition hover:bg-graphite-800 ${isCompleted ? "border-teal-500/20" : isActive ? "border-amber-500/20" : record.status === "error" ? "border-danger-500/20" : "border-white/[0.06]"}`}>
      <div className={`absolute left-0 top-0 h-full w-1 ${isCompleted ? "bg-teal-500" : isActive ? "bg-amber-500" : record.status === "error" ? "bg-danger-500" : "bg-transparent"}`} />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="flex gap-3 min-w-0 flex-1">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${record.kind === "audio" ? "bg-amber-500/15 text-amber-500" : "bg-teal-500/15 text-teal-400"}`}>
            {record.kind === "audio" ? <Music2 size={16} /> : <Film size={16} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-bold leading-tight text-ink-50">{record.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-graphite-900">{record.format}</span>
              {record.quality && <span className="rounded-full bg-graphite-700 px-2 py-0.5 text-[11px] font-medium text-ink-300">{record.quality}</span>}
              {record.fileSize && <span className="text-xs text-ink-400">{formatBytes(record.fileSize)}</span>}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-500"><Clock size={10} />{formatDate(record.createdAt)}</div>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide ${isCompleted ? "bg-teal-500 text-white" : record.status === "error" ? "bg-danger-500 text-white" : record.status === "cancelled" ? "bg-graphite-600 text-ink-300" : "bg-amber-500 text-graphite-950 animate-pulse"}`}>
          {STATUS_LABEL[record.status] ?? record.status}
        </span>
      </div>

      {(isActive || record.status === "error") && (
        <div className="mt-4 pl-2">
          <WaveformProgress percent={record.progress} active={isActive} tone={record.status === "error" ? "danger" : record.status === "completed" ? "teal" : "amber"} />
          <div className="mt-1.5 flex items-center justify-between font-data text-[11px] font-bold">
            <span className={isActive ? "text-amber-400" : "text-ink-400"}>{Math.round(record.progress)}%</span>
            <span className="text-ink-400">{record.speed ? `${record.speed} · ` : ""}{record.eta ? `ETA ${record.eta}` : isActive ? "procesando..." : ""}</span>
          </div>
          {record.status === "error" && record.errorMessage && <p className="mt-2 rounded-lg bg-danger-500/10 px-3 py-2 text-xs text-danger-300">{record.errorMessage}</p>}
        </div>
      )}

      {isCompleted && record.filePath && (
        <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-graphite-950 px-3 py-2 pl-2">
          <FolderOpen size={12} className="shrink-0 text-ink-500" />
          <p className="truncate font-data text-xs text-ink-400" title={record.filePath}>{record.filePath}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5 pl-2">
        {isActive && onCancel && (
          <button onClick={() => onCancel(record.id)} className="flex items-center gap-1 rounded-full bg-danger-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-danger-400"><X size={12} /> Cancelar</button>
        )}
        <button onClick={copyUrl} className="flex items-center gap-1 rounded-full bg-graphite-700 px-3 py-1.5 text-xs font-bold text-ink-300 hover:bg-graphite-600 hover:text-white">
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copiado" : "URL"}
        </button>
        {onRetry && (record.status === "error" || record.status === "cancelled" || isCompleted) && (
          <button onClick={() => onRetry(record)} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-graphite-900 hover:bg-ink-50"><RotateCcw size={12} /> Repetir</button>
        )}
        {onSaveFile && isCompleted && record.filePath && (
          <button onClick={() => onSaveFile(record)} className="flex items-center gap-1 rounded-full bg-teal-500 px-3 py-1.5 text-xs font-bold text-graphite-950 hover:bg-teal-400"><Download size={12} /> Guardar</button>
        )}
        {onDelete && !isActive && (
          <button onClick={() => onDelete(record.id)} className="flex items-center gap-1 rounded-full border border-white/[0.08] px-3 py-1.5 text-xs font-bold text-ink-400 hover:border-danger-500/30 hover:text-danger-400"><Trash2 size={12} /> Quitar</button>
        )}
      </div>
    </div>
  );
}
