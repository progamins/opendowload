import { useEffect, useState } from "react";
import { Download, Music2, AlertCircle, CheckCircle2, Loader2, X, FolderDown, Sparkles, Clock, Link2 } from "lucide-react";
import { api } from "./api";
import { downloadManager, type DownloadTask } from "./services/downloadManager";
import type { AppSettings, DiagnosticCheck } from "./types";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { SettingsPanel } from "./components/SettingsPanel";
import { ApiConfigBanner } from "./components/ApiConfigBanner";

type Tab = "download" | "history" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("download");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [url1, setUrl1] = useState("");
  const [url2, setUrl2] = useState("");
  const [showSecond, setShowSecond] = useState(false);
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
    for (const u of urls) {
      // eslint-disable-next-line no-await-in-loop
      await downloadManager.addAndAnalyze(u);
    }
    setAnalyzing(false);
  };

  const handleDownloadAll = async () => {
    const ready = tasks.filter((t) => t.status === "READY");
    for (const t of ready.slice(0, 2)) {
      downloadManager.startDownload(t.id);
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  const supportsFS = typeof window !== "undefined" && "showSaveFilePicker" in window;
  const active = tasks.filter((t) => ["DOWNLOADING", "ANALYZING", "WAITING_FOR_DESTINATION"].includes(t.status));
  const readyCount = tasks.filter((t) => t.status === "READY").length;
  const hasUrls = url1.trim() || url2.trim();

  const scrollToDownload = () => {
    setTab("download");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-graphite-950">
      <Header theme={theme} onToggleTheme={() => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); api.saveSettings({ theme: next }).catch(() => {}); }} />
      <div className="mx-auto flex max-w-[1280px]">
        <Sidebar tab={tab} activeDownloads={active.length} onTabChange={setTab} onNewDownload={scrollToDownload} />

        <main className="min-w-0 flex-1 px-4 py-6 pb-20 lg:px-8 lg:py-8">
          {tab === "download" && (
            <div className="mx-auto max-w-[720px] space-y-6">
              <ApiConfigBanner />
              {/* Hero */}
              <div className="text-center">
                <h2 className="font-display text-3xl font-black tracking-tighter">Descargar música</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-400">Pega la URL de la canción que quieres descargar. Hasta <span className="font-bold text-ink-200">2 simultáneas</span>.</p>
              </div>

              {/* URL Inputs Card */}
              <div className="rounded-[24px] border border-white/[0.06] bg-graphite-900 p-5 shadow-xl">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold tracking-widest text-ink-400">ENLACES</span>
                    <span className="text-xs text-ink-600">{[url1, url2].filter(Boolean).length}/2</span>
                  </div>

                  <div className="relative flex items-center gap-3 rounded-full border border-white/[0.06] bg-graphite-950 px-4 py-3 focus-within:border-amber-500/50 focus-within:ring-4 focus-within:ring-amber-500/10">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-graphite-800 text-xs font-black text-ink-400">01</span>
                    <Link2 size={14} className="shrink-0 text-ink-600" />
                    <input value={url1} onChange={(e) => setUrl1(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="flex-1 bg-transparent text-sm font-medium text-ink-50 placeholder:text-ink-600 focus:outline-none" />
                    {url1 && <button onClick={() => setUrl1("")} className="text-ink-500 hover:text-ink-300"><X size={14} /></button>}
                  </div>

                  {showSecond ? (
                    <div className="relative flex items-center gap-3 rounded-full border border-white/[0.06] bg-graphite-950 px-4 py-3 focus-within:border-amber-500/50 focus-within:ring-4 focus-within:ring-amber-500/10 animate-in">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-graphite-800 text-xs font-black text-ink-400">02</span>
                      <Link2 size={14} className="shrink-0 text-ink-600" />
                      <input value={url2} onChange={(e) => setUrl2(e.target.value)} placeholder="https://youtu.be/..." className="flex-1 bg-transparent text-sm font-medium text-ink-50 placeholder:text-ink-600 focus:outline-none" />
                      <button onClick={() => { setUrl2(""); setShowSecond(false); }} className="text-ink-500 hover:text-ink-300"><X size={14} /></button>
                    </div>
                  ) : (
                    <button onClick={() => setShowSecond(true)} className="mx-auto flex items-center gap-1.5 text-xs font-bold text-ink-400 hover:text-ink-200">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-graphite-950">+</span> Añadir otra URL
                    </button>
                  )}
                </div>

                <button onClick={handleAnalyze} disabled={analyzing || !hasUrls} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 py-3.5 text-sm font-black tracking-wide text-graphite-950 shadow-lg shadow-amber-500/20 hover:brightness-[1.02] disabled:opacity-50 btn-press">
                  {analyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} {analyzing ? "Analizando..." : hasUrls && [url1, url2].filter(Boolean).length > 1 ? "Analizar enlaces" : "Analizar enlace"}
                </button>
                <p className={`mt-3 text-center text-xs ${supportsFS ? "text-teal-400" : "text-amber-400"}`}>{supportsFS ? "✓ Tu navegador permite elegir carpeta" : "Usará descarga estándar"}</p>
              </div>

              {/* Analyzing skeleton */}
              {analyzing && (
                <div className="rounded-[20px] border border-white/[0.06] bg-graphite-900 p-5">
                  <div className="flex items-center gap-3">
                    <Loader2 size={18} className="animate-spin text-amber-500" />
                    <div>
                      <p className="text-sm font-bold">Analizando enlace...</p>
                      <p className="text-xs text-ink-500">Obteniendo información del audio</p>
                    </div>
                  </div>
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-graphite-800"><div className="h-full w-1/3 animate-pulse bg-amber-500" /></div>
                </div>
              )}

              {/* Ready tasks */}
              {tasks.filter((t) => t.status === "READY").length > 0 && (
                <div className="space-y-3">
                  {tasks.filter((t) => t.status === "READY").map((t) => (
                    <MediaCard key={t.id} task={t} />
                  ))}
                  {readyCount === 2 && (
                    <button onClick={handleDownloadAll} className="flex w-full items-center justify-center gap-2 rounded-full bg-teal-500 py-3 text-sm font-black text-graphite-950 hover:bg-teal-400">
                      <FolderDown size={16} /> Descargar ambas
                    </button>
                  )}
                </div>
              )}

              {/* Active downloads */}
              {tasks.filter((t) => ["DOWNLOADING", "WAITING_FOR_DESTINATION", "ANALYZING"].includes(t.status)).length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold tracking-widest text-ink-400">DESCARGANDO</h3>
                  {tasks.filter((t) => ["DOWNLOADING", "WAITING_FOR_DESTINATION", "ANALYZING"].includes(t.status)).map((t) => (
                    <DownloadCard key={t.id} task={t} />
                  ))}
                </div>
              )}

              {/* Completed recent */}
              {tasks.filter((t) => t.status === "COMPLETED").length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold tracking-widest text-ink-400">COMPLETADAS RECIENTEMENTE</h3>
                  {tasks.filter((t) => t.status === "COMPLETED").slice(0, 3).map((t) => (
                    <CompletedCard key={t.id} task={t} />
                  ))}
                </div>
              )}

              {/* Error */}
              {tasks.filter((t) => t.status === "ERROR").map((t) => (
                <div key={t.id} className="rounded-[20px] border border-danger-500/20 bg-danger-500/10 p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-danger-400"><AlertCircle size={16} /> No se pudo descargar</p>
                  <p className="mt-1 text-xs text-ink-400">{t.error}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => downloadManager.retry(t.id)} className="rounded-full bg-white px-4 py-2 text-xs font-black text-graphite-950">Intentar nuevamente</button>
                    <button onClick={() => downloadManager.remove(t.id)} className="text-xs font-bold text-ink-400">Descartar</button>
                  </div>
                </div>
              ))}

              {/* Empty recent */}
              {tasks.length === 0 && !analyzing && (
                <div className="rounded-[20px] border border-dashed border-white/[0.06] bg-graphite-900/50 p-8 text-center">
                  <Music2 size={24} className="mx-auto text-ink-600" />
                  <p className="mt-3 text-sm font-bold">Aún no tienes descargas</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-ink-500">Pega una URL arriba para comenzar. Hasta 2 a la vez, directo a tu PC.</p>
                </div>
              )}

              {/* Recent completed from manager */}
              {tasks.filter((t) => t.status === "COMPLETED").length === 0 && tasks.filter((t) => t.status === "READY").length === 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold tracking-widest text-ink-400">DESCARGAS RECIENTES</h3>
                  <div className="rounded-[16px] border border-white/[0.04] bg-graphite-900 p-4 text-center text-xs text-ink-500">Las canciones que descargues aparecerán aquí.</div>
                </div>
              )}
            </div>
          )}

          {tab === "history" && <HistoryView />}
          {tab === "settings" && (
            <div className="mx-auto max-w-[720px]">
              <h2 className="mb-4 font-display text-xl font-black">Ajustes</h2>
              <SettingsPanel settings={settings!} onSave={async (p) => { const u = await api.saveSettings(p); setSettings(u); }} ytdlpVersion={ytdlpVersion} logDirHint="./logs" />
              {checks && (
                <div className="mt-6 rounded-[16px] border border-white/[0.06] bg-graphite-900 p-4">
                  <h3 className="text-sm font-bold">Diagnóstico</h3>
                  <div className="mt-3 space-y-2">
                    {checks.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-xl bg-graphite-950 px-3 py-2">
                        <span className="text-xs font-bold">{c.label}</span>
                        <span className={`text-xs font-black ${c.ok ? "text-teal-400" : "text-danger-400"}`}>{c.ok ? "✓" : "✗"} {c.detail.slice(0, 40)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function MediaCard({ task }: { task: DownloadTask }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-white/[0.06] bg-graphite-900 shadow-xl">
      <div className="flex gap-4 p-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-graphite-800">
          {task.thumbnail ? <img src={task.thumbnail} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-ink-600"><Music2 size={18} /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-bold leading-tight">{task.title ?? "Audio"}</p>
          <p className="text-xs text-ink-500">{task.uploader ?? ""} {task.duration ? `· ${Math.floor(task.duration / 60)}:${String(task.duration % 60).padStart(2, "0")}` : ""}</p>
          <p className="mt-1 text-xs font-bold text-ink-400">Audio disponible · MP3 · 320 kbps</p>
        </div>
      </div>
      <div className="border-t border-white/[0.06] p-4">
        <button onClick={() => downloadManager.startDownload(task.id)} className="flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 py-3 text-sm font-black text-graphite-950 hover:brightness-[1.02] btn-press">
          <Download size={16} /> Descargar
        </button>
        <button onClick={() => downloadManager.remove(task.id)} className="mx-auto mt-2 text-xs font-bold text-ink-500 hover:text-ink-300">Descartar</button>
      </div>
    </div>
  );
}

function DownloadCard({ task }: { task: DownloadTask }) {
  return (
    <div className="rounded-[20px] border border-amber-500/20 bg-graphite-900 p-4">
      <div className="flex items-center justify-between">
        <p className="line-clamp-1 flex-1 text-sm font-bold">{task.title}</p>
        <button onClick={() => downloadManager.cancel(task.id)} className="rounded-full bg-graphite-800 px-3 py-1.5 text-xs font-bold text-ink-300 hover:bg-danger-500 hover:text-white">Cancelar</button>
      </div>
      <p className="text-xs text-ink-500">{task.uploader}</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-graphite-800"><div className="h-full bg-amber-500 transition-all" style={{ width: `${task.progress}%` }} /></div>
      <div className="mt-1 flex justify-between font-data text-xs">
        <span className="font-bold text-amber-400">{task.progress}%</span>
        <span className="text-ink-500">{task.downloadedBytes ? `${(task.downloadedBytes / 1024 / 1024).toFixed(1)} MB` : ""} {task.totalBytes ? `/ ${(task.totalBytes / 1024 / 1024).toFixed(1)} MB` : ""} {task.speed ? `· ${task.speed}` : ""} {task.eta ? `· ${task.eta}` : ""}</span>
      </div>
    </div>
  );
}

function CompletedCard({ task }: { task: DownloadTask }) {
  return (
    <div className="flex items-center justify-between rounded-[20px] border border-teal-500/20 bg-teal-500/10 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-500 text-white"><CheckCircle2 size={16} /></div>
        <div>
          <p className="text-sm font-bold">{task.title}</p>
          <p className="text-xs text-ink-500">MP3 · 320 kbps · Completado</p>
        </div>
      </div>
      <span className="rounded-full bg-teal-500 px-3 py-1 text-xs font-black text-white">Completado</span>
    </div>
  );
}

function HistoryView() {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { api.listDownloads().then(setList).catch(() => {}); }, []);
  if (list.length === 0) return <div className="mx-auto max-w-[720px] rounded-[20px] border border-dashed border-white/[0.06] p-8 text-center"><HistoryIcon /><p className="mt-3 text-sm font-bold">Tu historial está vacío</p><p className="text-xs text-ink-500">Las canciones que descargues aparecerán aquí.</p></div>;
  return (
    <div className="mx-auto max-w-[720px] space-y-3">
      <h3 className="text-xs font-bold tracking-widest text-ink-400">HISTORIAL</h3>
      {list.map((r: any) => (
        <div key={r.id} className="flex items-center justify-between rounded-[16px] border border-white/[0.06] bg-graphite-900 p-4">
          <div className="flex items-center gap-3">
            <Music2 size={16} className="text-ink-500" />
            <div>
              <p className="text-sm font-bold">{r.title}</p>
              <p className="text-xs text-ink-500">MP3 · 320 kbps · {new Date(r.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          <span className="text-xs font-bold text-teal-400">✓ Completada</span>
        </div>
      ))}
    </div>
  );
}

function HistoryIcon() {
  return <Clock size={24} className="mx-auto text-ink-600" />;
}
