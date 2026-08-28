import { useState } from "react";
import { getStoredApiUrl, setStoredApiUrl, clearStoredApiUrl, getApiBaseUrl } from "../config/api";

export function ApiConfigBanner() {
  const [value, setValue] = useState(() => getStoredApiUrl() ?? "");
  const [saved, setSaved] = useState(false);
  const current = (() => {
    try { return getApiBaseUrl(); } catch { return null; }
  })();

  const isProd = !(import.meta as any).env?.DEV;
  const hasStored = !!getStoredApiUrl();

  if (!isProd) return null; // solo en producción Vercel tiene sentido configurarlo

  return (
    <div className="mx-auto mb-4 max-w-[720px] rounded-[16px] border border-amber-500/30 bg-amber-500/10 p-4">
      <p className="text-sm font-bold text-amber-400">🔒 Solo administrador — Conexión al backend</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-400">
        Esta URL <b className="text-amber-300">solo la proporciona el administrador</b>. No la edites si no eres admin. Se obtiene ejecutando <span className="font-mono text-ink-200">INICIAR.bat → [2] Producción</span> en el PC servidor y copiando el enlace <span className="font-mono">https://xxxxx.trycloudflare.com</span>. Se guarda solo en este navegador y tiene prioridad sobre <span className="font-mono">VITE_API_URL</span>.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://xxxxx.trycloudflare.com"
          className="flex-1 rounded-full border border-white/[0.06] bg-graphite-950 px-4 py-2.5 text-sm text-ink-50 placeholder:text-ink-600 focus:border-amber-500 focus:outline-none"
        />
        <button
          onClick={() => {
            if (!value.trim()) return;
            // normaliza y guarda
            setStoredApiUrl(value.trim());
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            // recargar para que toda la app use la nueva URL
            setTimeout(() => location.reload(), 500);
          }}
          className="shrink-0 rounded-full bg-amber-500 px-4 py-2.5 text-xs font-black text-graphite-950 hover:brightness-[1.02]"
        >{saved ? "Guardado ✓" : "Guardar"}</button>
        {hasStored && (
          <button
            onClick={() => { clearStoredApiUrl(); setValue(""); location.reload(); }}
            className="shrink-0 rounded-full border border-white/[0.06] px-3 py-2.5 text-xs font-bold text-ink-400 hover:text-ink-200"
          >Quitar</button>
        )}
      </div>
      <p className="mt-2 font-data text-xs text-ink-500">Actual: {current ?? "no configurada"} {hasStored && "(desde este navegador)"}</p>
    </div>
  );
}
