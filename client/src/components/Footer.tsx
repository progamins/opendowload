import { Heart, Shield } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-white/[0.04] bg-graphite-900/30 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-6 sm:flex-row">
        <p className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
          Hecho con <Heart size={12} className="text-danger-400" /> para uso local y responsable
        </p>
        <div className="flex items-center gap-3 text-xs text-ink-500">
          <span className="flex items-center gap-1"><Shield size={12} className="text-teal-400" /> 100% offline</span>
          <span className="h-3 w-px bg-white/[0.08]" />
          <span className="inline-flex items-center gap-1">yt-dlp</span>
          <span className="h-3 w-px bg-white/[0.08]" />
          <span className="font-data">v0.1.0</span>
        </div>
      </div>
    </footer>
  );
}
