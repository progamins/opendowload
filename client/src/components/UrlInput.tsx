import { ClipboardPaste, Link2, Loader2, Sparkles, X } from "lucide-react";
import { useState } from "react";

interface UrlInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function UrlInput({ value, onChange, onSubmit, loading }: UrlInputProps) {
  const [focused, setFocused] = useState(false);
  const count = value.split(/\s+/).filter(Boolean).length;

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text.trim());
    } catch {}
  };

  return (
    <div className="space-y-3">
      <div
        className={`group relative flex items-start gap-3 rounded-[20px] border bg-graphite-800/80 p-1.5 pl-4 pr-1.5 shadow-xl backdrop-blur transition-all ${
          focused ? "border-amber-500/50 shadow-amber-500/10 ring-4 ring-amber-500/10" : "border-white/[0.08] hover:border-white/[0.12]"
        }`}
      >
        <div className={`mt-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${focused ? "bg-amber-500 text-white" : "bg-graphite-700 text-ink-400"}`}>
          <Link2 size={14} strokeWidth={2.5} />
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !loading) onSubmit();
          }}
          placeholder="Pega uno o varios enlaces de YouTube, ej: https://youtu.be/..."
          rows={value.includes("\n") || count > 1 ? 3 : 1}
          className="min-w-0 flex-1 resize-none bg-transparent py-3 text-[14px] font-medium leading-relaxed text-ink-50 placeholder:text-ink-600 focus:outline-none"
        />
        <div className="flex shrink-0 items-center gap-1.5 self-start pt-1.5">
          {value && (
            <button
              aria-label="Limpiar"
              onClick={() => onChange("")}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-graphite-700 text-ink-400 transition hover:bg-graphite-600 hover:text-ink-50"
            >
              <X size={14} />
            </button>
          )}
          <button
            onClick={handlePaste}
            className="hidden items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-bold tracking-wide text-graphite-950 shadow-md transition hover:bg-ink-50 sm:flex"
          >
            <ClipboardPaste size={14} /> Pegar
          </button>
        </div>
      </div>

      <button
        onClick={onSubmit}
        disabled={loading || !value.trim()}
        className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-full bg-gradient-to-r from-amber-500 to-amber-400 px-6 py-3.5 text-[14px] font-bold tracking-wide text-graphite-950 shadow-lg shadow-amber-500/20 transition hover:shadow-amber-500/30 hover:brightness-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 opacity-0 transition group-hover:opacity-100" />
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
        {loading ? "Analizando..." : count > 1 ? `Analizar ${count} enlaces` : "Analizar enlace"}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-500">
        <span className="h-1 w-1 rounded-full bg-teal-500" /> Soporta lote: pega varios separados por espacio o salto de línea
      </p>
    </div>
  );
}
