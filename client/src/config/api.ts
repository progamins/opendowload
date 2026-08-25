// Capa única de configuración de API — nunca hardcodear localhost en componentes
// Prioridad: 1) runtime window.__API_URL (inyectado por /config.json), 2) VITE_API_URL (build-time), 3) dev fallback

declare global {
  interface Window {
    __API_URL?: string;
  }
}

let runtimeLoaded = false;

function normalizeBase(url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  // Si ya termina en /api, mantenerlo; si no, añadir /api
  if (!u.endsWith("/api")) u = `${u}/api`;
  return u;
}

export function getApiBaseUrl(): string {
  // 1) Runtime (inyectado vía public/config.json o window.__API_URL) — tiene prioridad para Quick Tunnel dinámico
  const runtime = typeof window !== "undefined" ? window.__API_URL : undefined;
  if (runtime && runtime.trim()) return normalizeBase(runtime);

  // 2) Build-time Vite env
  const vite = (import.meta as any).env?.VITE_API_URL as string | undefined;
  if (vite && vite.trim()) return normalizeBase(vite);

  // 3) Fallback SOLO en desarrollo. En producción, nunca usar localhost silenciosamente.
  const isDev = (import.meta as any).env?.DEV === true;
  if (isDev) return "http://127.0.0.1:3001/api";

  // Producción sin VITE_API_URL configurado → error visible, no localhost
  const msg = "La API de producción no está configurada. Configura VITE_API_URL en Vercel (ej: https://xxxxx.trycloudflare.com/api) y vuelve a desplegar.";
  // Mostrar en consola y en UI si es posible
  console.error(msg);
  // Lanzar para que el llamador lo capture y muestre un toast/dialog en lugar de fetch a localhost
  throw new Error(msg);
}

// Carga runtime opcional desde /config.json (generado por backend o deploy)
// Llamar una vez al iniciar la app; no bloquea si falla
export async function loadRuntimeConfig(): Promise<void> {
  if (runtimeLoaded) return;
  runtimeLoaded = true;
  try {
    const res = await fetch("/config.json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data?.apiUrl && typeof data.apiUrl === "string" && data.apiUrl.trim()) {
        window.__API_URL = data.apiUrl.trim();
      }
    }
  } catch {
    // silencio: usará VITE_API_URL
  }
}
