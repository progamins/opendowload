// Capa única de configuración de API — nunca hardcodear localhost en componentes
// Prioridad: 1) localStorage (usuario pega URL del tunnel en UI), 2) runtime window.__API_URL (/config.json), 3) VITE_API_URL (build-time), 4) dev fallback

declare global {
  interface Window {
    __API_URL?: string;
  }
}

const LS_KEY = "openmedia_api_url";
let runtimeLoaded = false;

function normalizeBase(url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  if (!u.endsWith("/api")) u = `${u}/api`;
  return u;
}

export function getStoredApiUrl(): string | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setStoredApiUrl(url: string): void {
  try {
    if (!url.trim()) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, url.trim());
    // también reflejar en window para que getApiBaseUrl lo lea sin reload
    window.__API_URL = url.trim();
  } catch {}
}

export function clearStoredApiUrl(): void {
  try {
    localStorage.removeItem(LS_KEY);
    delete window.__API_URL;
  } catch {}
}

export function getApiBaseUrl(): string {
  // 1) Usuario configuró manualmente en la web (localStorage) — máxima prioridad, permite cambiar Quick Tunnel sin redeploy
  const stored = typeof window !== "undefined" ? getStoredApiUrl() : null;
  if (stored) return normalizeBase(stored);

  // 2) Runtime inyectado vía public/config.json o window.__API_URL
  const runtime = typeof window !== "undefined" ? window.__API_URL : undefined;
  if (runtime && runtime.trim()) return normalizeBase(runtime);

  // 3) Build-time Vite env
  const vite = (import.meta as any).env?.VITE_API_URL as string | undefined;
  if (vite && vite.trim()) return normalizeBase(vite);

  // 4) Fallback SOLO en desarrollo
  const isDev = (import.meta as any).env?.DEV === true;
  if (isDev) return "http://127.0.0.1:3001/api";

  const msg = "API de producción no configurada. Pega la URL del Tunnel arriba (ej: https://xxxxx.trycloudflare.com) o configura VITE_API_URL en Vercel y redeploy.";
  console.error(msg);
  throw new Error(msg);
}

// Carga runtime opcional desde /config.json (generado por backend o deploy)
// Llamar una vez al iniciar la app; no bloquea si falla.
// Si config.json no tiene apiUrl, intenta auto-descubrir vía /api/tunnel-info
// (funciona cuando el frontend se sirve desde el mismo servidor o tunnel).
export async function loadRuntimeConfig(): Promise<void> {
  if (runtimeLoaded) return;
  runtimeLoaded = true;
  try {
    const res = await fetch("/config.json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data?.apiUrl && typeof data.apiUrl === "string" && data.apiUrl.trim()) {
        window.__API_URL = data.apiUrl.trim();
        return; // encontrado, no necesita auto-discovery
      }
    }
  } catch {
    // silencio
  }

  // Auto-discovery: si no hay apiUrl en config.json, intentar /api/tunnel-info
  // Esto funciona cuando el frontend se sirve desde el mismo origen que el backend
  // (ej: directamente desde el tunnel, o en desarrollo local)
  try {
    const res = await fetch("/api/tunnel-info", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data?.tunnelUrl && typeof data.tunnelUrl === "string") {
        window.__API_URL = data.tunnelUrl; // tunnelUrl ya incluye el dominio, normalizeBase agregará /api
        console.info("[OpenMedia] API auto-descubierta desde tunnel-info:", data.tunnelUrl);
      }
    }
  } catch {
    // silencio: usará VITE_API_URL o fallback
  }
}
