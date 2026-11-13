import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyMediaToken } from "@/lib/media/signed-links";
import { absolutePath, openMedia } from "@/lib/media/storage";

export const dynamic = "force-dynamic";

/** Public, expiring link that Instagram / TikTok download videos from. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const mediaId = verifyMediaToken(token);
  if (!mediaId) return new Response("Not found", { status: 404 });

  const [m] = await db.select().from(schema.media).where(eq(schema.media.id, mediaId)).limit(1);
  if (!m || m.deletedAt) return new Response("Not found", { status: 404 });

  const { size } = await stat(absolutePath(m.path));
  return new Response(Readable.toWeb(openMedia(m.path)) as ReadableStream, {
    headers: {
      "content-type": m.mimeType,
      "content-length": String(size),
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
