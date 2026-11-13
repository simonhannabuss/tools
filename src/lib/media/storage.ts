import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { env } from "../env";

export const MAX_UPLOAD_BYTES = 4 * 1024 ** 3; // 4 GB, matches deploy/nginx-tools.conf

const ALLOWED = new Set(["video/mp4", "video/quicktime", "video/webm", "image/jpeg", "image/png"]);

export function isAllowedType(mime: string) {
  return ALLOWED.has(mime);
}

/** Absolute path for a stored relative path, refusing anything that escapes MEDIA_DIR. */
export function absolutePath(rel: string): string {
  const root = path.resolve(env.MEDIA_DIR);
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) throw new Error("Invalid media path");
  return abs;
}

const EXT: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

/** Streams an upload to disk under MEDIA_DIR/YYYY/MM/<uuid>.<ext>. Never buffers the whole file. */
export async function saveUpload(body: ReadableStream<Uint8Array>, mime: string) {
  const now = new Date();
  const rel = path.join(
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    `${randomUUID()}${EXT[mime] ?? ""}`,
  );
  const abs = absolutePath(rel);
  await mkdir(path.dirname(abs), { recursive: true });

  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) cb(new Error("File too large"));
      else cb(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(body as never), limiter, createWriteStream(abs));
  } catch (err) {
    await rm(abs, { force: true });
    throw err;
  }
  return { relPath: rel, sizeBytes: (await stat(abs)).size };
}

export function openMedia(rel: string) {
  return createReadStream(absolutePath(rel));
}

export async function deleteMediaFile(rel: string) {
  await rm(absolutePath(rel), { force: true });
}
