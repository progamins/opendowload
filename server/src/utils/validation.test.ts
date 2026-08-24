import { test } from "node:test";
import assert from "node:assert/strict";
import { extractUrls, isSupportedUrl, safeResolveInDir, sanitizeFilename } from "./validation.js";

test("isSupportedUrl accepts youtube hosts", () => {
  assert.equal(isSupportedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), true);
  assert.equal(isSupportedUrl("https://youtu.be/dQw4w9WgXcQ"), true);
  assert.equal(isSupportedUrl("https://music.youtube.com/watch?v=abc"), true);
});

test("isSupportedUrl rejects everything else", () => {
  assert.equal(isSupportedUrl("javascript:alert(1)"), false);
  assert.equal(isSupportedUrl("file:///etc/passwd"), false);
  assert.equal(isSupportedUrl("https://evil.com/youtube.com"), false);
  assert.equal(isSupportedUrl("not a url"), false);
});

test("sanitizeFilename strips characters invalid on Windows", () => {
  assert.equal(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j'), "a_b_c_d_e_f_g_h_i_j");
});

test("sanitizeFilename escapes Windows reserved device names", () => {
  assert.equal(sanitizeFilename("CON"), "_CON");
  assert.equal(sanitizeFilename("com1"), "_com1");
});

test("safeResolveInDir throws on path traversal attempts", () => {
  assert.throws(() => safeResolveInDir("/tmp/downloads", "../../etc/passwd"));
});

test("safeResolveInDir allows normal relative paths", () => {
  const base = "/tmp/downloads";
  const resolved = safeResolveInDir(base, "My Song.mp3");
  // platform-agnostic: debe terminar con My Song.mp3 y estar dentro de base
  assert.ok(resolved.endsWith("My Song.mp3"));
  assert.ok(resolved.length > base.length);
});

test("extractUrls only keeps supported, deduplicated URLs", () => {
  const urls = extractUrls(
    "https://www.youtube.com/watch?v=a\nhttps://evil.com/x\nhttps://youtu.be/b\nhttps://www.youtube.com/watch?v=a"
  );
  assert.deepEqual(urls, ["https://www.youtube.com/watch?v=a", "https://youtu.be/b"]);
});
