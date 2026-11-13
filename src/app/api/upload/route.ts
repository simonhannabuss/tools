import { db, schema } from "@/db";
import { getSession } from "@/lib/auth/session";
import { isAllowedType, saveUpload } from "@/lib/media/storage";
import { makeThumbnail, probeVideo } from "@/lib/media/probe";

export const dynamic = "force-dynamic";

/**
 * PUT /api/upload — body is the raw file, streamed straight to disk.
 * Headers: content-type (e.g. video/mp4), x-filename (original name, URI-encoded).
 */
export async function PUT(req: Request) {
  const s = await getSession();
  if (!s?.session.twoFactorPassed) return Response.json({ error: "Not signed in" }, { status: 401 });

  const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!isAllowedType(mime)) return Response.json({ error: `Unsupported file type: ${mime || "unknown"}` }, { status: 415 });
  if (!req.body) return Response.json({ error: "Empty body" }, { status: 400 });

  const originalName = decodeURIComponent(req.headers.get("x-filename") ?? "upload");
  const { relPath, sizeBytes } = await saveUpload(req.body, mime);

  let probe = { durationSec: null as number | null, width: null as number | null, height: null as number | null };
  let thumbnailPath: string | null = null;
  if (mime.startsWith("video/")) {
    try {
      probe = await probeVideo(relPath);
      thumbnailPath = await makeThumbnail(relPath, Math.min(1, (probe.durationSec ?? 2) / 2));
    } catch (err) {
      console.error("ffprobe/ffmpeg failed", err);
    }
  }

  const [m] = await db
    .insert(schema.media)
    .values({ originalName, path: relPath, mimeType: mime, sizeBytes, thumbnailPath, ...probe })
    .returning();

  return Response.json({
    id: m.id,
    originalName,
    sizeBytes,
    durationSec: probe.durationSec,
    width: probe.width,
    height: probe.height,
  });
}
