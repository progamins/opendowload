import type { MediaInfo } from "../types/index.js";

interface Entry {
  info: MediaInfo;
  expiresAt: number;
}

const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, Entry>();

export function cacheMediaInfo(info: MediaInfo): void {
  cache.set(info.sourceUrl, { info, expiresAt: Date.now() + TTL_MS });
}

export function getCachedMediaInfo(url: string): MediaInfo | null {
  const entry = cache.get(url);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(url);
    return null;
  }
  return entry.info;
}
