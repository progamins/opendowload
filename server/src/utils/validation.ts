import path from "node:path";

/**
 * Only accept http(s) URLs from a small allow-list of hosts that yt-dlp is
 * commonly used with in a legitimate, permission-respecting way. This is not
 * an attempt to bypass anything -- it simply keeps the app scoped to what it
 * claims to do and rejects garbage / local / file:// URLs early.
 */
const ALLOWED_HOST_SUFFIXES = [
  "youtube.com",
  "youtu.be",
  "music.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtube.googleapis.com",
];

export function isSupportedUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  // Also accept with www prefix by checking original suffix logic
  const rawHost = parsed.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => rawHost === suffix || rawHost.endsWith(`.${suffix}`) || host === suffix || host.endsWith(`.${suffix}`)
  );
}

export function normalizeUrl(raw: string): string {
  return raw.trim();
}

/** Extract candidate URLs (one per line/whitespace chunk) from pasted text. */
export function extractUrls(raw: string): string[] {
  const candidates = raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (isSupportedUrl(c) && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

const WINDOWS_INVALID_CHARS = /[\\/:*?"<>|]/g;
const WINDOWS_RESERVED_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

/** Sanitize a single filename component. Never returns a path, only a name. */
export function sanitizeFilename(raw: string, maxLength = 150): string {
  let name = raw
    .replace(WINDOWS_INVALID_CHARS, "_")
    .replace(/\.+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) name = "download";

  const upper = name.toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(upper)) {
    name = `_${name}`;
  }

  if (name.length > maxLength) {
    name = name.slice(0, maxLength).trim();
  }

  return name;
}

/**
 * Resolve a user-configured download directory and a generated filename into
 * a final absolute path, guaranteeing the result stays inside baseDir
 * (prevents path traversal via a malicious/odd title or pattern).
 */
export function safeResolveInDir(baseDir: string, relative: string): string {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error("Resolved path escapes the configured download directory");
  }
  return target;
}
