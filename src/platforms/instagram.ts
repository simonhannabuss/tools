import { env } from "@/lib/env";
import type { Issue, PlatformAdapter, PublishInput, Stats, TokenSet } from "./types";

/**
 * Instagram API with Instagram Login (Business Login for Instagram).
 * No Facebook Page needed; the Instagram account must be Business or Creator.
 * Reels are published by giving Instagram a public link to the video (our expiring /media/s/ link);
 * Instagram downloads it, processes it, and then we publish.
 */
const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";
const VERSION = () => process.env.INSTAGRAM_API_VERSION || "v26.0";
const SCOPES = ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graph<T>(path: string, init: { method?: "GET" | "POST"; params: Record<string, string> }): Promise<T> {
  const url = new URL(`${GRAPH}/${VERSION()}/${path}`);
  const method = init.method ?? "GET";
  let body: URLSearchParams | undefined;
  if (method === "GET") for (const [k, v] of Object.entries(init.params)) url.searchParams.set(k, v);
  else body = new URLSearchParams(init.params);
  const res = await fetch(url, { method, body });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) throw new Error(`Instagram ${res.status}: ${json.error?.message ?? "request failed"}`);
  return json;
}

async function longLived(shortToken: string) {
  const u = new URL(`${GRAPH}/access_token`);
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", env.INSTAGRAM_APP_SECRET ?? "");
  u.searchParams.set("access_token", shortToken);
  const res = await fetch(u);
  if (!res.ok) throw new Error(`Instagram long-lived token error ${res.status}: ${await res.text()}`);
  return (await res.json()) as { access_token: string; expires_in: number };
}

export const instagram: PlatformAdapter = {
  id: "instagram",
  name: "Instagram",
  mode: "api",
  supports: { video: true, text: false },
  description: "Reels on your Business/Creator account · stats synced after publishing",

  oauth: {
    // Instagram tokens last 60 days and can only be refreshed while still valid, so refresh a week early.
    refreshWindowMs: 7 * 24 * 60 * 60 * 1000,

    authorizeUrl(state, redirectUri) {
      const p = new URLSearchParams({
        client_id: env.INSTAGRAM_APP_ID ?? "",
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES.join(","),
        state,
      });
      return `${AUTHORIZE_URL}?${p}`;
    },

    async exchangeCode(code, redirectUri): Promise<TokenSet> {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        body: new URLSearchParams({
          client_id: env.INSTAGRAM_APP_ID ?? "",
          client_secret: env.INSTAGRAM_APP_SECRET ?? "",
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code: code.replace(/#_$/, ""),
        }),
      });
      if (!res.ok) throw new Error(`Instagram token error ${res.status}: ${await res.text()}`);
      const short = (await res.json()) as { access_token: string; user_id?: number | string; permissions?: string[] | string };
      const long = await longLived(short.access_token);
      const me = await graph<{ user_id?: string; id?: string; username?: string }>("me", {
        params: { fields: "user_id,username", access_token: long.access_token },
      });
      return {
        accessToken: long.access_token,
        refreshToken: long.access_token, // Instagram refreshes the long-lived token itself
        expiresAt: new Date(Date.now() + long.expires_in * 1000),
        scopes: Array.isArray(short.permissions) ? short.permissions.join(",") : (short.permissions ?? SCOPES.join(",")),
        handle: me.username ? `@${me.username}` : null,
        remoteId: me.user_id ?? me.id ?? String(short.user_id ?? ""),
      };
    },

    async refresh(currentToken) {
      const u = new URL(`${GRAPH}/refresh_access_token`);
      u.searchParams.set("grant_type", "ig_refresh_token");
      u.searchParams.set("access_token", currentToken);
      const res = await fetch(u);
      if (!res.ok) throw new Error(`Instagram refresh error ${res.status}: ${await res.text()}`);
      const t = (await res.json()) as { access_token: string; expires_in: number };
      return { accessToken: t.access_token, refreshToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
    },
  },

  validate({ kind, media, caption }) {
    const issues: Issue[] = [];
    if (kind !== "video" || !media) issues.push({ level: "error", message: "Instagram needs a video." });
    if (media?.durationSec && media.durationSec < 3) issues.push({ level: "error", message: "Instagram Reels must be at least 3 seconds." });
    if (media?.durationSec && media.durationSec > 15 * 60) issues.push({ level: "error", message: "Instagram Reels can be up to 15 minutes." });
    if (media?.width && media?.height && media.width > media.height)
      issues.push({ level: "warning", message: "Horizontal video — Reels look best vertical (9:16)." });
    if (caption.length > 2200) issues.push({ level: "error", message: "Instagram captions are limited to 2,200 characters." });
    if ((caption.match(/#\w/g) ?? []).length > 30) issues.push({ level: "error", message: "Instagram allows up to 30 hashtags." });
    return issues;
  },

  async publish(input: PublishInput) {
    if (!input.accessToken || !input.accountRemoteId) throw new Error("Instagram isn't connected — reconnect it.");
    const igId = input.accountRemoteId;
    const tags = input.tags.filter((t) => !input.caption.includes(t)).join(" ");
    const caption = tags ? `${input.caption}\n\n${tags}` : input.caption;

    // 1. Create a Reels container from our public, expiring video link
    const container = await graph<{ id: string }>(`${igId}/media`, {
      method: "POST",
      params: {
        media_type: "REELS",
        video_url: input.publicMediaUrl(),
        caption,
        share_to_feed: "true",
        access_token: input.accessToken,
      },
    });

    // 2. Wait for Instagram to download and process it (check every 20s, up to 15 minutes)
    for (let i = 0; ; i++) {
      await sleep(20_000);
      const s = await graph<{ status_code: string; status?: string }>(container.id, {
        params: { fields: "status_code,status", access_token: input.accessToken },
      });
      if (s.status_code === "FINISHED") break;
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED")
        throw new Error(`Instagram couldn't process the video (${s.status_code}${s.status ? `: ${s.status}` : ""}).`);
      if (i >= 45) throw new Error("Instagram is still processing the video after 15 minutes — try again later.");
    }

    // 3. Publish, then look up the link
    const published = await graph<{ id: string }>(`${igId}/media_publish`, {
      method: "POST",
      params: { creation_id: container.id, access_token: input.accessToken },
    });
    const info = await graph<{ permalink?: string }>(published.id, {
      params: { fields: "permalink", access_token: input.accessToken },
    }).catch(() => ({}) as { permalink?: string });
    return { status: "published", remoteId: published.id, remoteUrl: info.permalink };
  },

  async fetchStats(remoteId, accessToken): Promise<Stats> {
    type Insights = { data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] };
    const read = (metrics: string) =>
      graph<Insights>(`${remoteId}/insights`, { params: { metric: metrics, access_token: accessToken } });
    // Some metrics aren't available for every reel; fall back to the core set if Instagram refuses.
    const r = await read("views,likes,comments,shares,saved,ig_reels_avg_watch_time,ig_reels_video_view_total_time").catch(() =>
      read("views,likes,comments,shares,saved"),
    );
    const v = (name: string) => {
      const m = r.data.find((d) => d.name === name);
      return m?.values?.[0]?.value ?? m?.total_value?.value;
    };
    const avgMs = v("ig_reels_avg_watch_time");
    const totalMs = v("ig_reels_video_view_total_time");
    return {
      views: v("views"),
      likes: v("likes"),
      comments: v("comments"),
      shares: v("shares"),
      avgViewDurationSec: avgMs !== undefined ? avgMs / 1000 : undefined,
      watchTimeSec: totalMs !== undefined ? totalMs / 1000 : undefined,
    };
  },
};
