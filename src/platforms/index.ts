import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Platform } from "@/db/schema";
import { decryptOrNull, encrypt, encryptOrNull } from "@/lib/crypto";
import { youtube } from "./youtube";
import { bitchute, facebook, instagram, linkedin, rumble, substack, tiktok } from "./others";
import type { PlatformAdapter, TokenSet } from "./types";

export const adapters: Record<Platform, PlatformAdapter> = {
  youtube,
  instagram,
  tiktok,
  facebook,
  linkedin,
  rumble,
  bitchute,
  substack,
};

export const platformOrder: Platform[] = ["youtube", "instagram", "tiktok", "facebook", "linkedin", "rumble", "bitchute", "substack"];

export function adapter(p: Platform): PlatformAdapter {
  return adapters[p];
}

export function isPlatform(v: string): v is Platform {
  return v in adapters;
}

export async function saveTokens(platform: Platform, t: TokenSet) {
  const values = {
    platform,
    handle: t.handle ?? null,
    remoteId: t.remoteId ?? null,
    accessTokenEnc: encrypt(t.accessToken),
    refreshTokenEnc: encryptOrNull(t.refreshToken),
    expiresAt: t.expiresAt ?? null,
    scopes: t.scopes ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.accounts)
    .values(values)
    .onConflictDoUpdate({
      target: schema.accounts.platform,
      set: { ...values, refreshTokenEnc: values.refreshTokenEnc ?? undefined, handle: values.handle ?? undefined },
    });
}

/** Returns a valid access token, refreshing it if it expires within 5 minutes. Null if not connected. */
export async function accessTokenFor(platform: Platform): Promise<string | null> {
  const [acc] = await db.select().from(schema.accounts).where(eq(schema.accounts.platform, platform)).limit(1);
  if (!acc?.accessTokenEnc) return null;
  const soon = Date.now() + 5 * 60 * 1000;
  if (acc.expiresAt && acc.expiresAt.getTime() < soon) {
    const refreshToken = decryptOrNull(acc.refreshTokenEnc);
    const refresh = adapter(platform).oauth?.refresh;
    if (!refreshToken || !refresh) return null; // needs reconnecting
    const t = await refresh(refreshToken);
    await saveTokens(platform, { ...t, handle: acc.handle, remoteId: acc.remoteId });
    return t.accessToken;
  }
  return decryptOrNull(acc.accessTokenEnc);
}
