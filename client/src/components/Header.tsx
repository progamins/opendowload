import { AudioWaveform, Moon, Sun } from "lucide-react";

interface HeaderProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function Header({ theme, onToggleTheme }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-[56px] items-center justify-between border-b border-white/[0.06] bg-graphite-950/80 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-graphite-950 shadow">
          <AudioWaveform size={16} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="font-display text-sm font-black tracking-tight leading-none">OpenMedia</h1>
          <p className="flex items-center gap-1 text-[11px] font-bold tracking-widest text-ink-400"><span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" /> LOCAL</p>
        </div>
      </div>
      <button
        aria-label="Cambiar tema"
        onClick={onToggleTheme}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-graphite-800 text-ink-400 ring-1 ring-white/[0.06] hover:bg-graphite-700 hover:text-ink-50 transition"
      >
        {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </header>
  );
}
