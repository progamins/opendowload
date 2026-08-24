import { useState } from "react";
import type { AppSettings } from "../types";
import { Palette, Sliders, Bell, Monitor, Save, Check } from "lucide-react";

interface SettingsPanelProps {
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => Promise<void>;
  ytdlpVersion: string | null;
  logDirHint: string;
}

export function SettingsPanel({ settings, onSave, ytdlpVersion, logDirHint }: SettingsPanelProps) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const patch = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const save = async () => {
    setSaving(true);
    try { await onSave(draft); setSaved(true); setTimeout(() => setSaved(false), 2000); } finally { setSaving(false); }
  };
  return (
    <div className="space-y-5">
      <Section title="Experiencia" icon={<Palette size={14} />} desc="Cómo se nombran y organizan los archivos en la carpeta que elijas">
        <Field label="Patrón de nombres" hint='Ejemplo: %(uploader)s - %(title)s.%(ext)s'>
          <input value={draft.filenamePattern} onChange={(e) => patch("filenamePattern", e.target.value)} className="w-full rounded-xl border border-white/[0.06] bg-graphite-950 px-3 py-2.5 text-sm font-data text-ink-50 focus:border-amber-500 focus:outline-none" />
        </Field>
        <ToggleRow label="Crear subcarpetas por título" desc="D:\Musica\Artista - Canción\canción.mp3" checked={draft.createSubfolders} onChange={(v) => patch("createSubfolders", v)} />
        <ToggleRow label="Sobrescribir si ya existe" checked={draft.overwriteExisting} onChange={(v) => patch("overwriteExisting", v)} />
        <ToggleRow label="Incrustar portada automáticamente" checked={draft.embedThumbnailByDefault} onChange={(v) => patch("embedThumbnailByDefault", v)} />
      </Section>

      <Section title="Calidad por defecto" icon={<Sliders size={14} />} desc="Se usa cuando descargas sin cambiar opciones">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Calidad">
            <select value={draft.defaultAudioQuality} onChange={(e) => patch("defaultAudioQuality", e.target.value)} className="w-full rounded-xl border border-white/[0.06] bg-graphite-950 px-3 py-2.5 text-sm text-ink-50">
              <option value="320">320 kbps · Máxima</option>
              <option value="256">256 kbps · Alta</option>
              <option value="192">192 kbps · Estándar</option>
              <option value="128">128 kbps · Ahorro</option>
              <option value="0">Original</option>
            </select>
          </Field>
          <Field label="Formato">
            <select value={draft.defaultAudioFormat} onChange={(e) => patch("defaultAudioFormat", e.target.value)} className="w-full rounded-xl border border-white/[0.06] bg-graphite-950 px-3 py-2.5 text-sm text-ink-50">
              <option value="mp3">MP3</option><option value="m4a">M4A</option><option value="opus">Opus</option><option value="wav">WAV</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Rendimiento" icon={<Monitor size={14} />}>
        <Field label="Descargas simultáneas" hint="Recomendado 3 para lotes">
          <div className="flex items-center gap-3">
            <input type="range" min={1} max={5} value={draft.maxConcurrentDownloads} onChange={(e) => patch("maxConcurrentDownloads", Number(e.target.value))} className="flex-1 accent-amber-500" />
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-graphite-950">{draft.maxConcurrentDownloads}</span>
          </div>
        </Field>
      </Section>

      <Section title="Notificaciones" icon={<Bell size={14} />}>
        <ToggleRow label="Notificar al completar" checked={draft.notificationsEnabled} onChange={(v) => patch("notificationsEnabled", v)} />
      </Section>

      <Section title="Sistema" icon={<Monitor size={14} />}>
        <div className="space-y-2 rounded-xl bg-graphite-950 p-3">
          <Row label="yt-dlp" value={ytdlpVersion ?? "No detectada"} />
          <Row label="Logs" value={logDirHint} />
          <Row label="Ubicación" value="Se elige con el explorador de Windows al descargar" />
        </div>
      </Section>

      <button onClick={save} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 py-3 text-sm font-bold text-graphite-950 shadow-lg shadow-amber-500/20 hover:brightness-[1.02] disabled:opacity-60">
        {saved ? <Check size={16} /> : <Save size={16} />}{saving ? "Guardando..." : saved ? "Guardado ✓" : "Guardar cambios"}
      </button>
    </div>
  );
}

function Section({ title, icon, desc, children }: { title: string; icon?: React.ReactNode; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border border-white/[0.06] bg-graphite-800/80 p-5 backdrop-blur">
      <h3 className="flex items-center gap-2 font-display text-sm font-bold tracking-wide text-ink-50">{icon && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-graphite-700 text-ink-400">{icon}</span>}{title}</h3>
      {desc && <p className="mt-1 text-xs leading-relaxed text-ink-500">{desc}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold tracking-wide text-ink-400">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}
function ToggleRow({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-graphite-950 px-3 py-3 ring-1 ring-white/[0.04] hover:ring-white/[0.08]">
      <div><p className="text-sm font-medium text-ink-200">{label}</p>{desc && <p className="text-xs text-ink-500">{desc}</p>}</div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-9 appearance-none rounded-full bg-graphite-700 p-0.5 accent-amber-500 transition checked:bg-amber-500" />
    </label>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-2 last:border-0 text-sm">
      <span className="text-ink-500">{label}</span><span className="max-w-[200px] truncate font-data text-xs font-bold text-ink-200">{value}</span>
    </div>
  );
}
