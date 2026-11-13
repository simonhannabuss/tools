import { env } from "../env";
import { hmac, safeEqual } from "../crypto";

/**
 * Short-lived public links so Instagram / TikTok can download a video from us.
 * Format: /media/s/<base64url(json)>.<signature>
 */
export function createMediaLink(mediaId: string, ttlSeconds = 6 * 60 * 60): string {
  const payload = Buffer.from(JSON.stringify({ m: mediaId, e: Math.floor(Date.now() / 1000) + ttlSeconds })).toString(
    "base64url",
  );
  const sig = hmac(env.MEDIA_LINK_SECRET, payload);
  return `${env.APP_URL.replace(/\/$/, "")}/media/s/${payload}.${sig}`;
}

export function verifyMediaToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sig, hmac(env.MEDIA_LINK_SECRET, payload))) return null;
  try {
    const { m, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { m: string; e: number };
    if (typeof m !== "string" || typeof e !== "number" || e < Date.now() / 1000) return null;
    return m;
  } catch {
    return null;
  }
}
