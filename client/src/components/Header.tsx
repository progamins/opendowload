import { AudioWaveform, Moon, Settings as SettingsIcon, Sun, Sparkles } from "lucide-react";
import type { DiagnosticCheck } from "../types";

interface HeaderProps {
  tab: "download" | "history" | "settings";
  onTabChange: (tab: "download" | "history" | "settings") => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  checks: DiagnosticCheck[] | null;
}

export function Header({ tab, onTabChange, theme, onToggleTheme, checks }: HeaderProps) {
  const allOk = checks ? checks.every((c) => c.ok) : null;

  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-graphite-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/20">
            <AudioWaveform size={20} strokeWidth={2.4} />
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
          </div>
          <div>
            <h1 className="flex items-center gap-1.5 font-display text-[15px] font-bold leading-none tracking-tight">
              OpenMedia
              <span className="rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-extrabold tracking-widest text-graphite-950">DL</span>
            </h1>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium tracking-wide text-ink-400">
              <Sparkles size={10} className="text-amber-500/70" /> Local • privado • sin nube
            </p>
          </div>
        </div>

        <nav className="hidden items-center gap-1 rounded-full bg-graphite-800/80 p-1 ring-1 ring-white/[0.06] backdrop-blur sm:flex">
          {(
            [
              ["download", "Descargar"],
              ["history", "Historial"],
              ["settings", "Ajustes"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold tracking-wide transition-all ${
                tab === id
                  ? "bg-white text-graphite-950 shadow-md"
                  : "text-ink-400 hover:bg-white/[0.06] hover:text-ink-50"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div
            className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-graphite-800/60 px-3 py-1.5 text-xs font-medium backdrop-blur sm:flex"
            title={checks ? checks.map((c) => `${c.label}: ${c.detail}`).join("\n") : "Comprobando..."}
          >
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${allOk ? "animate-ping bg-teal-500" : allOk === null ? "bg-ink-600" : "bg-danger-500"} `} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${allOk === null ? "bg-ink-600" : allOk ? "bg-teal-500" : "bg-danger-500"}`} />
            </span>
            <span className={allOk ? "text-teal-400" : allOk === null ? "text-ink-400" : "text-danger-400"}>
              {allOk === null ? "Comprobando" : allOk ? "Listo" : "Revisar"}
            </span>
          </div>
          <button
            aria-label="Cambiar tema"
            onClick={onToggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-graphite-800 text-ink-400 ring-1 ring-white/[0.06] transition hover:bg-graphite-700 hover:text-ink-50"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            aria-label="Configuración"
            onClick={() => onTabChange("settings")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-graphite-800 text-ink-400 ring-1 ring-white/[0.06] hover:text-ink-50 sm:hidden"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </div>

      <nav className="flex items-center gap-1 border-t border-white/[0.04] bg-graphite-900/50 px-3 py-2 backdrop-blur sm:hidden">
        {(
          [
            ["download", "Descargar"],
            ["history", "Historial"],
            ["settings", "Ajustes"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`flex-1 rounded-full py-2 text-xs font-semibold ${tab === id ? "bg-white text-graphite-950" : "text-ink-400"}`}
          >
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}
