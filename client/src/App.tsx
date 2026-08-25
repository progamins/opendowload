import { useEffect, useState } from "react";
import { Trash2, Download, Music2, AlertCircle, CheckCircle2, Loader2, X, FolderDown, Sparkles } from "lucide-react";
import { api } from "./api";
import { downloadManager, type DownloadTask } from "./services/downloadManager";
import type { AppSettings, DiagnosticCheck } from "./types";
import { Header } from "./components/Header";
import { DiagnosticsBanner } from "./components/DiagnosticsBanner";
import { SettingsPanel } from "./components/SettingsPanel";

type Tab = "download" | "history" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("download");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [url1, setUrl1] = useState("");
  const [url2, setUrl2] = useState("");
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [checks, setChecks] = useState<DiagnosticCheck[] | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ytdlpVersion, setYtdlpVersion] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    const unsub = downloadManager.subscribe(setTasks);
    api.systemStatus().then((r) => setChecks(r.checks)).catch(() => setChecks(null));
    api.systemVersions().then((r) => setYtdlpVersion(r.ytdlpVersion)).catch(() => {});
    api.getSettings().then((s) => { setSettings(s); setTheme(s.theme === "light" ? "light" : "dark"); }).catch(() => {});
    return unsub;
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const handleAnalyze = async () => {
    const urls = [url1.trim(), url2.trim()].filter(Boolean).slice(0, 2);
    if (urls.length === 0) return;
    setAnalyzing(true);
    // Limpiar completadas previas si hay 2 nuevas, mantener historial pero no bloquear
    for (const u of urls) {
      // eslint-disable-next-line no-await-in-loop
      await downloadManager.addAndAnalyze(u);
    }
    setAnalyzing(false);
  };

  const handleDownloadAll = async () => {
    const ready = tasks.filter((t) => t.status === "READY");
    for (const t of ready.slice(0, 2)) {
      // no await para paralelizar, pero respetando MAX 2
      downloadManager.startDownload(t.id);
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  const supportsFS = typeof window !== "undefined" && "showSaveFilePicker" in window;
  const active = tasks.filter((t) => ["DOWNLOADING", "ANALYZING", "WAITING_FOR_DESTINATION"].includes(t.status));
  const readyCount = tasks.filter((t) => t.status === "READY").length;

  return (
    <div className="min-h-screen bg-graphite-950">
      <Header tab={tab} onTabChange={setTab} theme={theme} onToggleTheme={() => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); api.saveSettings({ theme: next }).catch(() => {}); }} checks={checks} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        {checks && <DiagnosticsBanner checks={checks} />}

        {tab === "download" && (
          <div className="space-y-8">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-to-br from-amber-500 via-amber-500 to-amber-600 text-white shadow-xl shadow-amber-500/25 ring-1 ring-white/10">
                <Music2 size={24} strokeWidth={2} />
              </div>
              <h2 className="font-display text-4xl font-black tracking-tighter text-ink-50">
                Descarga tu <span className="bg-gradient-to-r from-amber-400 to-amber-500 bg-clip-text text-transparent">música</span>
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink-400">
                Gestor profesional hasta <span className="font-bold text-ink-200">2 canciones simultáneas</span> — elige la carpeta con el explorador nativo y guarda directo en tu PC.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${supportsFS ? "bg-teal-500/10 text-teal-400 ring-teal-500/20" : "bg-amber-500/10 text-amber-400 ring-amber-500/20"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${supportsFS ? "bg-teal-500" : "bg-amber-500"} animate-pulse`} />
                  {supportsFS ? "Explorador nativo listo" : "Fallback estándar activo"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-black text-graphite-900">MAX 2</span>
              </div>
            </div>

            <div className="mx-auto max-w-2xl space-y-4 rounded-[24px] border border-white/[0.06] bg-graphite-800/80 p-5 shadow-2xl backdrop-blur">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold tracking-wide text-ink-400"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-graphite-950">1</span> Enlace 1</label>
                <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-graphite-950 px-4 py-2.5">
                  <Music2 size={14} className="text-ink-500" />
                  <input value={url1} onChange={(e) => setUrl1(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="flex-1 bg-transparent text-sm font-medium text-ink-50 placeholder:text-ink-600 focus:outline-none" />
                  {url1 && <button onClick={() => setUrl1("")} className="text-ink-500 hover:text-ink-300"><X size={14} /></button>}
                </div>
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold tracking-wide text-ink-400"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500 text-xs font-black text-white">2</span> Enlace 2 <span className="text-ink-600">· opcional</span></label>
                <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-graphite-950 px-4 py-2.5">
                  <Music2 size={14} className="text-ink-500" />
                  <input value={url2} onChange={(e) => setUrl2(e.target.value)} placeholder="https://youtu.be/..." className="flex-1 bg-transparent text-sm font-medium text-ink-50 placeholder:text-ink-600 focus:outline-none" />
                  {url2 && <button onClick={() => setUrl2("")} className="text-ink-500 hover:text-ink-300"><X size={14} /></button>}
                </div>
              </div>
              <button onClick={handleAnalyze} disabled={analyzing || (!url1.trim() && !url2.trim())} className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 py-3.5 text-sm font-black tracking-wide text-graphite-950 shadow-lg shadow-amber-500/20 hover:brightness-[1.02] disabled:opacity-60">
                {analyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} {analyzing ? "Analizando..." : "Analizar enlaces"}
              </button>
            </div>

            {tasks.length > 0 && (
              <div className="mx-auto max-w-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold tracking-wide text-ink-200">Descargas {active.length > 0 && `· ${active.length} activas`}</h3>
                  {readyCount === 2 && (
                    <button onClick={handleDownloadAll} className="flex items-center gap-1.5 rounded-full bg-teal-500 px-4 py-2 text-xs font-black text-graphite-950 hover:bg-teal-400">
                      <FolderDown size={14} /> Descargar ambas
                    </button>
                  )}
                  <button onClick={() => downloadManager.clearHistory()} className="text-xs font-bold text-ink-500 hover:text-ink-300">Limpiar</button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {tasks.map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "history" && <HistoryTab />}
        {tab === "settings" && settings && (
          <div className="mx-auto max-w-xl">
            <h2 className="mb-4 font-display text-xl font-bold tracking-tight">Configuración</h2>
            <SettingsPanel settings={settings} onSave={async (p) => { const u = await api.saveSettings(p); setSettings(u); }} ytdlpVersion={ytdlpVersion} logDirHint="./logs" />
          </div>
        )}
      </main>
      <footer className="mt-12 border-t border-white/[0.04] py-6 text-center text-xs text-ink-600">OpenMedia Downloader · 100% local · Máx 2 simultáneas · File System Access API con fallback</footer>
    </div>
  );
}

function TaskCard({ task }: { task: DownloadTask }) {
  const isReady = task.status === "READY";
  const isDownloading = task.status === "DOWNLOADING";
  const isCompleted = task.status === "COMPLETED";
  const isError = task.status === "ERROR";
  const isWaiting = task.status === "WAITING_FOR_DESTINATION";

  return (
    <div className="overflow-hidden rounded-[20px] border border-white/[0.06] bg-graphite-800 shadow-xl">
      <div className="relative h-28 overflow-hidden bg-graphite-700">
        {task.thumbnail ? <img src={task.thumbnail} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-ink-600">Sin miniatura</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute bottom-2 left-3 right-3">
          <p className="line-clamp-1 text-sm font-bold text-white">{task.title ?? "Analizando..."}</p>
          <p className="text-xs text-white/70">{task.uploader ?? ""} {task.duration ? `· ${Math.floor(task.duration/60)}:${String(task.duration%60).padStart(2,"0")}` : ""}</p>
        </div>
        <div className={`absolute right-2 top-2 rounded-full px-2 py-1 text-[11px] font-black ${isCompleted ? "bg-teal-500 text-white" : isError ? "bg-danger-500 text-white" : isDownloading ? "bg-amber-500 text-graphite-950" : "bg-black/60 text-white backdrop-blur"}`}>
          {task.status}
        </div>
      </div>
      <div className="space-y-3 p-4">
        {isReady && <p className="text-xs font-bold text-teal-400">✓ Lista para descargar · {task.formatId} · MP3 320 kbps</p>}
        {isWaiting && <p className="flex items-center gap-1.5 text-xs font-bold text-amber-400"><Loader2 size={12} className="animate-spin" /> Esperando selección de carpeta...</p>}
        {(isDownloading || isWaiting) && (
          <div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-graphite-700"><div className="h-full bg-gradient-to-r from-amber-500 to-teal-500 transition-all" style={{ width: `${task.progress}%` }} /></div>
            <div className="mt-1 flex justify-between font-data text-[11px] text-ink-400">
              <span>{task.progress}%</span><span>{task.downloadedBytes ? `${(task.downloadedBytes/1024/1024).toFixed(1)} MB` : ""} {task.totalBytes ? `/ ${(task.totalBytes/1024/1024).toFixed(1)} MB` : ""}</span>
            </div>
            <div className="text-[11px] text-ink-500">{task.speed ?? ""} {task.eta ? `· ETA ${task.eta}` : ""}</div>
          </div>
        )}
        {isCompleted && <p className="flex items-center gap-1.5 rounded-lg bg-teal-500/10 px-3 py-2 text-xs font-bold text-teal-400"><CheckCircle2 size={14} /> Descarga completada</p>}
        {isError && <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-xs font-bold text-danger-400"><AlertCircle size={12} className="inline" /> {task.error}</p>}

        <div className="flex gap-2">
          {isReady && <button onClick={() => downloadManager.startDownload(task.id)} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-teal-500 py-2.5 text-xs font-black text-graphite-950 hover:bg-teal-400"><Download size={14} /> Descargar</button>}
          {isDownloading && <button onClick={() => downloadManager.cancel(task.id)} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-danger-500 py-2.5 text-xs font-black text-white hover:bg-danger-400"><X size={14} /> Cancelar</button>}
          {isError && <button onClick={() => downloadManager.retry(task.id)} className="flex-1 rounded-full bg-white py-2.5 text-xs font-black text-graphite-900">Reintentar</button>}
          {isCompleted && <button onClick={() => downloadManager.startDownload(task.id)} className="flex-1 rounded-full bg-white py-2.5 text-xs font-black text-graphite-900">Descargar de nuevo</button>}
          <button onClick={() => downloadManager.remove(task.id)} className="rounded-full border border-white/[0.08] px-3 py-2.5 text-xs font-bold text-ink-400 hover:text-ink-200"><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  );
}

function HistoryTab() {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { fetch("http://127.0.0.1:3001/api/downloads").then((r) => r.json()).then(setList).catch(() => {}); }, []);
  if (list.length === 0) return <p className="text-center text-sm text-ink-500">Sin historial en servidor (los archivos no se almacenan permanentemente).</p>;
  return (
    <div className="space-y-3">
      {list.map((r: any) => (
        <div key={r.id} className="rounded-xl border border-white/[0.06] bg-graphite-800 p-4">
          <p className="text-sm font-bold">{r.title}</p>
          <p className="text-xs text-ink-400">{r.status} · {r.format} · {r.quality ?? ""}</p>
        </div>
      ))}
    </div>
  );
}
