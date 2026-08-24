import { AlertTriangle, Wrench, ShieldCheck } from "lucide-react";
import type { DiagnosticCheck } from "../types";

export function DiagnosticsBanner({ checks }: { checks: DiagnosticCheck[] }) {
  const failing = checks.filter((c) => !c.ok);
  const passing = checks.filter((c) => c.ok);
  if (failing.length === 0) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-teal-500/20 bg-teal-500/10 px-4 py-3 backdrop-blur">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500 text-white"><ShieldCheck size={16} /></div>
        <div>
          <p className="text-sm font-bold text-teal-400">Sistema listo</p>
          <p className="text-xs text-ink-400">{passing.length} comprobaciones OK · yt-dlp + FFmpeg operativos</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-danger-500/20 bg-gradient-to-br from-danger-500/10 to-danger-500/[0.04] p-5 backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-500 text-white shadow-md"><AlertTriangle size={18} /></div>
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm font-bold text-ink-50">Acción requerida</p>
            <p className="text-xs leading-relaxed text-ink-400">Instala las dependencias faltantes para que la descarga sea 100% local y privada.</p>
          </div>
          {failing.map((c) => (
            <div key={c.id} className="rounded-xl bg-graphite-950/50 px-3 py-2.5 ring-1 ring-white/[0.04]">
              <p className="flex items-center gap-1.5 text-sm font-bold text-danger-400"><Wrench size={12} />{c.label} no detectado</p>
              {c.installHint && <p className="mt-1 font-data text-xs leading-relaxed text-ink-400">{c.installHint}</p>}
              <p className="mt-1 text-xs text-ink-600">{c.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
