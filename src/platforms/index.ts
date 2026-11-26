import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Platform } from "@/db/schema";
import { decryptOrNull, encrypt, encryptOrNull } from "@/lib/crypto";
import { youtube } from "./youtube";
import { bitchute, rumble, substack, tiktok } from "./others";
import { facebook } from "./facebook";
import { instagram } from "./instagram";
import { linkedin } from "./linkedin";
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

export async function accountRemoteId(platform: Platform): Promise<string | null> {
  const st = adapter(platform).settingsToken;
  const fixed = st?.accountId?.();
  const [acc] = await db
    .select({ remoteId: schema.accounts.remoteId, handle: schema.accounts.handle })
    .from(schema.accounts)
    .where(eq(schema.accounts.platform, platform))
    .limit(1);
  if (fixed) {
    // ID is set in .env — still look up the account name once, for the Connected accounts page.
    const token = st?.token();
    if (st && token && (!acc || !acc.handle)) {
      try {
        const found = await st.discover(token);
        await saveTokens(platform, { accessToken: token, remoteId: fixed, handle: found.handle });
      } catch {
        // Name lookup is cosmetic; posting uses the fixed ID.
      }
    }
    return fixed;
  }
  if (acc?.remoteId) return acc.remoteId;
  // Key from settings: look the account up once and remember it.
  const token = st?.token();
  if (st && token) {
    const found = await st.discover(token);
    await saveTokens(platform, { accessToken: token, remoteId: found.remoteId, handle: found.handle });
    return found.remoteId;
  }
  return null;
}

/** Returns a valid access token, refreshing it if it expires within 5 minutes. Null if not connected. */
export async function accessTokenFor(platform: Platform): Promise<string | null> {
  const fromSettings = adapter(platform).settingsToken?.token();
  if (fromSettings) return fromSettings;
  const [acc] = await db.select().from(schema.accounts).where(eq(schema.accounts.platform, platform)).limit(1);
  if (!acc?.accessTokenEnc) return null;
  const soon = Date.now() + (adapter(platform).oauth?.refreshWindowMs ?? 5 * 60 * 1000);
  if (acc.expiresAt && acc.expiresAt.getTime() < soon) {
    const refreshToken = decryptOrNull(acc.refreshTokenEnc);
    const refresh = adapter(platform).oauth?.refresh;
    if (!refreshToken || !refresh) return null; // needs reconnecting
    try {
      const t = await refresh(refreshToken);
      await saveTokens(platform, { ...t, handle: acc.handle, remoteId: acc.remoteId });
      return t.accessToken;
    } catch (err) {
      // Refresh failed: keep using the current token while it's still valid.
      if (acc.expiresAt.getTime() > Date.now() + 60_000) return decryptOrNull(acc.accessTokenEnc);
      throw err;
    }
  }
  return decryptOrNull(acc.accessTokenEnc);
}
