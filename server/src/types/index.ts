export type DownloadKind = "audio" | "video";

export type DownloadStatus =
  | "queued"
  | "analyzing"
  | "preparing"
  | "downloading"
  | "converting"
  | "finalizing"
  | "completed"
  | "error"
  | "cancelled";

export interface FormatOption {
  formatId: string;
  ext: string;
  kind: DownloadKind;
  /** e.g. "128 kbps" or "1080p" */
  label: string;
  /** bytes, when known from source metadata */
  approxSizeBytes: number | null;
}

export interface MediaInfo {
  sourceUrl: string;
  id: string;
  title: string;
  uploader: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  uploadDate: string | null;
  isPlaylist: boolean;
  playlistCount: number | null;
  audioFormats: FormatOption[];
  videoFormats: FormatOption[];
}

export interface DownloadRequest {
  url: string;
  kind: DownloadKind;
  formatId: string;
  /** target container/codec requested by the user, e.g. mp3, m4a, opus, wav, mp4, webm */
  targetExt: string;
  embedThumbnail: boolean;
  /** requested output audio bitrate, e.g. "320" (kbps), "0" = best, undefined = original */
  audioQuality?: string;
  /** subcarpeta opcional dentro del downloadDir */
  customSubdir?: string;
  /** carpeta base elegida por el usuario vía diálogo nativo de Windows (obligatoria ahora) */
  downloadDir?: string;
}

export interface DownloadRecord {
  id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  kind: DownloadKind;
  format: string;
  quality: string | null;
  duration: number | null;
  filePath: string | null;
  fileSize: number | null;
  status: DownloadStatus;
  progress: number;
  speed: string | null;
  eta: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ProgressEvent {
  downloadId: string;
  status: DownloadStatus;
  progress: number;
  speed: string | null;
  eta: string | null;
  totalBytes: number | null;
  downloadedBytes: number | null;
}

export interface AppSettings {
  downloadDir: string;
  defaultKind: DownloadKind;
  defaultAudioFormat: string;
  defaultAudioQuality: string;
  defaultVideoFormat: string;
  overwriteExisting: boolean;
  createSubfolders: boolean;
  filenamePattern: string;
  maxConcurrentDownloads: number;
  embedThumbnailByDefault: boolean;
  notificationsEnabled: boolean;
  theme: "light" | "dark" | "system";
}
