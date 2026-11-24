import { env } from "@/lib/env";
import type { Issue, PlatformAdapter, PublishInput, Stats } from "./types";

/**
 * Instagram API with Unified Login (what Meta gives new apps since late October 2026).
 * For your own account: generate a system-user access token in the Meta app dashboard
 * (Use cases → Instagram API → API setup with Unified login → Generate access tokens) and put it in .env
 * as INSTAGRAM_ACCESS_TOKEN. It doesn't expire. No Facebook Page needed; the Instagram account must be
 * Business/Creator and in your business portfolio.
 *
 * Reels are published by giving Instagram a public link to the video (our expiring /media/s/ link);
 * Instagram downloads it, processes it, and then we publish.
 */
const GRAPH = "https://graph.facebook.com";
const VERSION = () => process.env.INSTAGRAM_API_VERSION || "v26.0";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graph<T>(path: string, init: { method?: "GET" | "POST"; params: Record<string, string> }): Promise<T> {
  const url = new URL(`${GRAPH}/${VERSION()}/${path}`);
  const method = init.method ?? "GET";
  let body: URLSearchParams | undefined;
  if (method === "GET") for (const [k, v] of Object.entries(init.params)) url.searchParams.set(k, v);
  else body = new URLSearchParams(init.params);
  const res = await fetch(url, { method, body });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(`Instagram ${res.status}: ${json.error?.message ?? "request failed"}`);
  return json;
}

export const instagram: PlatformAdapter = {
  id: "instagram",
  name: "Instagram",
  mode: "api",
  supports: { video: true, text: false },
  description: "Reels on your Business/Creator account · stats synced after publishing",

  settingsToken: {
    token: () => env.INSTAGRAM_ACCESS_TOKEN || undefined,
    accountId: () => env.INSTAGRAM_ACCOUNT_ID || undefined,
    /** Finds the Instagram account the token was issued for. */
    async discover(token) {
      const fixedId = env.INSTAGRAM_ACCOUNT_ID;
      if (fixedId) {
        const me = await graph<{ username?: string }>(fixedId, { params: { fields: "username", access_token: token } });
        return { remoteId: fixedId, handle: me.username ? `@${me.username}` : null };
      }
      const r = await graph<{ data?: { id: string; username?: string }[] }>("me/assigned_instagram_accounts", {
        params: { fields: "id,username", access_token: token },
      });
      const acc = r.data?.[0];
      if (!acc?.id) throw new Error("No Instagram account found for this token — set INSTAGRAM_ACCOUNT_ID in .env.");
      let handle = acc.username ? `@${acc.username}` : null;
      if (!handle) {
        const me = await graph<{ username?: string }>(acc.id, { params: { fields: "username", access_token: token } }).catch(() => ({}) as { username?: string });
        handle = me.username ? `@${me.username}` : null;
      }
      return { remoteId: acc.id, handle };
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
    if (!input.accessToken || !input.accountRemoteId)
      throw new Error("Instagram isn't set up — add INSTAGRAM_ACCESS_TOKEN to .env.");
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
