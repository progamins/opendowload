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
  label: string;
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

export interface DiagnosticCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  installHint?: string;
}

export interface ApiErrorBody {
  message: string;
  technical?: string;
}
