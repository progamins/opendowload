import { Plus, Download, History, Music2, MessageCircle } from "lucide-react";

type Tab = "download" | "history";

interface SidebarProps {
  tab: Tab;
  activeDownloads: number;
  onTabChange: (t: Tab) => void;
  onNewDownload: () => void;
}

export function Sidebar({ tab, activeDownloads, onTabChange, onNewDownload }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-white/[0.06] bg-graphite-900/50 backdrop-blur lg:flex">
        <div className="p-5">
          <button
            onClick={onNewDownload}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 py-3 text-sm font-black tracking-wide text-graphite-950 shadow-lg shadow-amber-500/20 hover:brightness-[1.03] active:scale-[0.98] transition"
          >
            <Plus size={16} strokeWidth={2.8} /> Nueva descarga
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          <button
            onClick={() => onTabChange("download")}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === "download" ? "bg-white text-graphite-950 shadow" : "text-ink-400 hover:bg-white/[0.06] hover:text-ink-50"}`}
          >
            <Music2 size={16} /> Descargar
          </button>

          <button
            onClick={() => onTabChange("download")}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === "download" && activeDownloads > 0 ? "bg-white text-graphite-950" : "text-ink-400 hover:bg-white/[0.06] hover:text-ink-50"}`}
          >
            <span className="flex items-center gap-3"><Download size={16} /> Descargas</span>
            {activeDownloads > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-black text-graphite-950">{activeDownloads}</span>}
          </button>

          <button
            onClick={() => onTabChange("history")}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === "history" ? "bg-white text-graphite-950 shadow" : "text-ink-400 hover:bg-white/[0.06] hover:text-ink-50"}`}
          >
            <History size={16} /> Historial
          </button>
        </nav>

        <div className="space-y-3 p-4">
          <div className="rounded-2xl bg-gradient-to-br from-amber-500/15 to-teal-500/10 p-4 ring-1 ring-white/[0.06]">
            <p className="text-xs font-bold text-ink-50">Hasta 2 simultáneas</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-400">Pega 1 o 2 URLs. Elige calidad y guarda donde quieras.</p>
          </div>
          <a href="https://wa.me/506902568187" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-2xl bg-teal-500/10 p-3 ring-1 ring-teal-500/20 hover:bg-teal-500/20 transition">
            <MessageCircle size={16} className="shrink-0 text-teal-400" />
            <div>
              <p className="text-xs font-bold text-teal-300">Contáctame para tener la API</p>
              <p className="text-[10px] text-ink-400">WhatsApp: 9025 68187</p>
            </div>
          </a>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around border-t border-white/[0.06] bg-graphite-900/95 px-2 py-2 backdrop-blur-xl lg:hidden">
        <button onClick={onNewDownload} className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-graphite-950 shadow"><Plus size={18} /></button>
        <button onClick={() => onTabChange("download")} className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 ${tab === "download" ? "bg-white text-graphite-950" : "text-ink-400"}`}><Download size={16} /><span className="text-[10px] font-bold">Descargas</span></button>
        <button onClick={() => onTabChange("history")} className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 ${tab === "history" ? "bg-white text-graphite-950" : "text-ink-400"}`}><History size={16} /><span className="text-[10px] font-bold">Historial</span></button>
        <a href="https://wa.me/506902568187" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-teal-400"><MessageCircle size={16} /><span className="text-[10px] font-bold">API</span></a>
      </nav>
    </>
  );
}
