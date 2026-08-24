import type {
  ApiErrorBody,
  AppSettings,
  DiagnosticCheck,
  DownloadKind,
  DownloadRecord,
  MediaInfo,
} from "./types";
import { getApiBaseUrl } from "./config/api";

const getBase = () => getApiBaseUrl();

export class ApiError extends Error {
  technical?: string;
  status?: number;
  constructor(body: ApiErrorBody, status?: number) {
    super(body.message);
    this.technical = body.technical;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const base = getBase();
  try {
    res = await fetch(`${base}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError({
      message:
        "No se pudo conectar con el servidor local. Comprueba que OpenMedia Downloader esté en ejecución.",
    });
  }

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const errorBody = (body as ApiErrorBody) ?? { message: `Error ${res.status} del servidor.` };
    throw new ApiError(errorBody, res.status);
  }

  return body as T;
}

export type BatchAnalyzeResult =
  | { url: string; ok: true; data: MediaInfo }
  | { url: string; ok: false; error: string; technical?: string };

export const api = {
  analyze: (url: string) => request<MediaInfo>("/analyze", { method: "POST", body: JSON.stringify({ url }) }),

  analyzeBatch: (urls: string[]) => request<BatchAnalyzeResult[]>("/analyze/batch", { method: "POST", body: JSON.stringify({ urls }) }),

  download: (params: {
    url: string;
    kind: DownloadKind;
    formatId: string;
    targetExt: string;
    embedThumbnail: boolean;
    audioQuality?: string;
    customSubdir?: string;
    downloadDir?: string;
  }) => request<DownloadRecord>("/download", { method: "POST", body: JSON.stringify(params) }),

  pickFolder: async (initialDir?: string): Promise<string | null> => {
    const base = getBase();
    const res = await fetch(`${base}/dialog/open-folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initialDir }),
    });
    if (res.status === 204) return null; // cancelado
    if (!res.ok) {
      const text = await res.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch {}
      throw new ApiError(body ?? { message: `Error ${res.status}` }, res.status);
    }
    const data = (await res.json()) as { path: string };
    return data.path;
  },

  listDownloads: () => request<DownloadRecord[]>("/downloads"),

  getDownload: (id: string) => request<DownloadRecord>(`/downloads/${id}`),

  cancelDownload: (id: string) => request<{ cancelled: boolean }>(`/downloads/${id}/cancel`, { method: "POST" }),

  deleteDownload: (id: string) => request<void>(`/downloads/${id}`, { method: "DELETE" }),

  clearHistory: () => request<void>("/downloads", { method: "DELETE" }),

  getSettings: () => request<AppSettings>("/settings"),

  saveSettings: (patch: Partial<AppSettings>) =>
    request<AppSettings>("/settings", { method: "PUT", body: JSON.stringify(patch) }),

  systemStatus: () => request<{ checks: DiagnosticCheck[]; allOk: boolean }>("/system/status"),

  systemVersions: () => request<{ ytdlpVersion: string | null }>("/system/versions"),

  downloadFileUrl: (id: string) => `${getBase()}/downloads/${id}/file`,

  getDownloadFolder: (id: string) => request<{ folder: string; file: string }>(`/downloads/${id}/folder`),
};

export function subscribeToProgress(onEvent: (event: unknown) => void): () => void {
  const base = getBase();
  const source = new EventSource(`${base}/events`);
  source.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data));
    } catch {
      // ignore malformed frames
    }
  };
  return () => source.close();
}
