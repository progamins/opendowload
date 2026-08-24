import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { AppSettings, DownloadRecord, DownloadStatus } from "../types/index.js";

let db: DatabaseSync | null = null;

export function initDatabase(databasePath: string): DatabaseSync {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  db = new DatabaseSync(databasePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      thumbnail TEXT,
      kind TEXT NOT NULL,
      format TEXT NOT NULL,
      quality TEXT,
      duration INTEGER,
      file_path TEXT,
      file_size INTEGER,
      status TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      speed TEXT,
      eta TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error("Database not initialized");
  return db;
}

function rowToRecord(row: any): DownloadRecord {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    thumbnail: row.thumbnail,
    kind: row.kind,
    format: row.format,
    quality: row.quality,
    duration: row.duration,
    filePath: row.file_path,
    fileSize: row.file_size,
    status: row.status as DownloadStatus,
    progress: row.progress,
    speed: row.speed,
    eta: row.eta,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function insertDownload(record: DownloadRecord): void {
  getDb()
    .prepare(
      `INSERT INTO downloads
        (id, url, title, thumbnail, kind, format, quality, duration, file_path,
         file_size, status, progress, speed, eta, error_message, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      record.id,
      record.url,
      record.title,
      record.thumbnail,
      record.kind,
      record.format,
      record.quality,
      record.duration,
      record.filePath,
      record.fileSize,
      record.status,
      record.progress,
      record.speed,
      record.eta,
      record.errorMessage,
      record.createdAt,
      record.completedAt
    );
}

export function updateDownload(id: string, patch: Partial<DownloadRecord>): void {
  const current = getDownload(id);
  if (!current) return;
  const next: DownloadRecord = { ...current, ...patch };
  getDb()
    .prepare(
      `UPDATE downloads SET
        title = ?, thumbnail = ?, format = ?, quality = ?, duration = ?,
        file_path = ?, file_size = ?, status = ?, progress = ?, speed = ?,
        eta = ?, error_message = ?, completed_at = ?
       WHERE id = ?`
    )
    .run(
      next.title,
      next.thumbnail,
      next.format,
      next.quality,
      next.duration,
      next.filePath,
      next.fileSize,
      next.status,
      next.progress,
      next.speed,
      next.eta,
      next.errorMessage,
      next.completedAt,
      id
    );
}

export function getDownload(id: string): DownloadRecord | null {
  const row = getDb().prepare(`SELECT * FROM downloads WHERE id = ?`).get(id);
  return row ? rowToRecord(row) : null;
}

export function listDownloads(): DownloadRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM downloads ORDER BY created_at DESC`)
    .all();
  return rows.map(rowToRecord);
}

export function deleteDownload(id: string): void {
  getDb().prepare(`DELETE FROM downloads WHERE id = ?`).run(id);
}

export function clearDownloads(): void {
  getDb().exec(`DELETE FROM downloads`);
}

const DEFAULT_SETTINGS: AppSettings = {
  downloadDir: "",
  defaultKind: "audio",
  defaultAudioFormat: "mp3",
  defaultAudioQuality: "320",
  defaultVideoFormat: "mp4",
  overwriteExisting: false,
  createSubfolders: false,
  filenamePattern: "%(title)s.%(ext)s",
  maxConcurrentDownloads: 3,
  embedThumbnailByDefault: true,
  notificationsEnabled: true,
  theme: "dark",
};

export function getSettings(): AppSettings {
  const rows = getDb().prepare(`SELECT key, value FROM settings`).all() as {
    key: string;
    value: string;
  }[];
  const stored: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      stored[row.key] = JSON.parse(row.value);
    } catch {
      stored[row.key] = row.value;
    }
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const stmt = getDb().prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  for (const [key, value] of Object.entries(patch)) {
    stmt.run(key, JSON.stringify(value));
  }
  return getSettings();
}
