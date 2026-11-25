import { env } from "@/lib/env";
import type { Issue, PlatformAdapter, PublishInput, Stats } from "./types";

/**
 * Posts to a Facebook Page you admin (not a personal profile — Meta doesn't allow that).
 * Uses a Page access token that doesn't expire (made from a long-lived user token via /me/accounts),
 * set in .env as FACEBOOK_PAGE_TOKEN. Needs pages_show_list, pages_read_engagement, pages_manage_posts
 * (and read_insights for stats).
 *
 * - Vertical videos up to 90s → Reels (upload by URL from our expiring /media/s/ link)
 * - Other videos → regular Page video (Facebook downloads it from the same link)
 * - Text → Page post
 */
const GRAPH = "https://graph.facebook.com";
const VERSION = () => process.env.FACEBOOK_API_VERSION || "v26.0";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graph<T>(path: string, init: { method?: "GET" | "POST"; params: Record<string, string> }): Promise<T> {
  const url = new URL(path.startsWith("https://") ? path : `${GRAPH}/${VERSION()}/${path}`);
  const method = init.method ?? "GET";
  let body: URLSearchParams | undefined;
  if (method === "GET") for (const [k, v] of Object.entries(init.params)) url.searchParams.set(k, v);
  else body = new URLSearchParams(init.params);
  const res = await fetch(url, { method, body });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(`Facebook ${res.status}: ${json.error?.message ?? "request failed"}`);
  return json;
}

const isReel = (m: PublishInput["media"]) =>
  Boolean(m && m.width && m.height && m.height > m.width && (m.durationSec ?? 0) <= 90 && (m.durationSec ?? 0) >= 3);

function withTags(input: PublishInput) {
  const tags = input.tags.filter((t) => !input.caption.includes(t)).join(" ");
  return tags ? `${input.caption}\n\n${tags}` : input.caption;
}

export const facebook: PlatformAdapter = {
  id: "facebook",
  name: "Facebook",
  mode: "api",
  supports: { video: true, text: true },
  description: "Reels, videos and posts on your Page",

  settingsToken: {
    token: () => env.FACEBOOK_PAGE_TOKEN || undefined,
    accountId: () => env.FACEBOOK_PAGE_ID || undefined,
    async discover(token) {
      // With a Page token, /me is the Page itself.
      const me = await graph<{ id: string; name?: string }>("me", { params: { fields: "id,name", access_token: token } });
      return { remoteId: env.FACEBOOK_PAGE_ID || me.id, handle: me.name ?? null };
    },
  },

  validate({ kind, media, caption }) {
    const issues: Issue[] = [];
    if (kind === "video" && !media) issues.push({ level: "error", message: "Facebook needs a video." });
    if (kind === "text" && !caption.trim()) issues.push({ level: "error", message: "Facebook post is empty." });
    if (kind === "video" && media && !isReel(media))
      issues.push({ level: "warning", message: "Not vertical and ≤ 90s, so it posts as a regular Page video, not a Reel." });
    return issues;
  },

  async publish(input: PublishInput) {
    const token = input.accessToken;
    const pageId = input.accountRemoteId;
    if (!token || !pageId) throw new Error("Facebook isn't set up — add FACEBOOK_PAGE_TOKEN to .env.");
    const text = withTags(input);

    // Text post
    if (input.kind === "text" || !input.media) {
      const post = await graph<{ id: string }>(`${pageId}/feed`, { method: "POST", params: { message: text, access_token: token } });
      return { status: "published", remoteId: post.id, remoteUrl: `https://www.facebook.com/${post.id}` };
    }

    // Reel
    if (isReel(input.media)) {
      const start = await graph<{ video_id: string; upload_url: string }>(`${pageId}/video_reels`, {
        method: "POST",
        params: { upload_phase: "start", access_token: token },
      });
      const up = await fetch(start.upload_url, {
        method: "POST",
        headers: { authorization: `OAuth ${token}`, file_url: input.publicMediaUrl() },
      });
      if (!up.ok) throw new Error(`Facebook Reel upload failed ${up.status}: ${await up.text()}`);

      await graph(`${pageId}/video_reels`, {
        method: "POST",
        params: { upload_phase: "finish", video_id: start.video_id, video_state: "PUBLISHED", description: text, access_token: token },
      });

      // Wait until Facebook has processed and published it (up to ~10 minutes).
      for (let i = 0; i < 30; i++) {
        await sleep(20_000);
        const s = await graph<{ status?: { video_status?: string; publishing_phase?: { status?: string }; processing_phase?: { status?: string; errors?: { message?: string }[] } } }>(
          start.video_id,
          { params: { fields: "status", access_token: token } },
        ).catch(() => ({}) as { status?: undefined });
        const st = s.status;
        if (st?.video_status === "error" || st?.processing_phase?.status === "error")
          throw new Error(`Facebook couldn't process the Reel${st.processing_phase?.errors?.[0]?.message ? `: ${st.processing_phase.errors[0].message}` : "."}`);
        if (st?.publishing_phase?.status === "complete" || st?.video_status === "ready") break;
      }
      return { status: "published", remoteId: `video:${start.video_id}`, remoteUrl: `https://www.facebook.com/reel/${start.video_id}` };
    }

    // Regular Page video (Facebook downloads it from our link)
    const v = await graph<{ id: string }>(`${pageId}/videos`, {
      method: "POST",
      params: {
        file_url: input.publicMediaUrl(),
        title: (input.title ?? "").slice(0, 255),
        description: text,
        published: "true",
        access_token: token,
      },
    });
    return { status: "published", remoteId: `video:${v.id}`, remoteUrl: `https://www.facebook.com/${pageId}/videos/${v.id}` };
  },

  async fetchStats(remoteId, accessToken): Promise<Stats> {
    if (!remoteId.startsWith("video:")) return {}; // text posts: no stats for now
    const id = remoteId.slice("video:".length);
    const stats: Stats = {};

    // Likes and comments (needs pages_read_engagement)
    const counts = await graph<{ likes?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } }>(id, {
      params: { fields: "likes.summary(true).limit(0),comments.summary(true).limit(0)", access_token: accessToken },
    }).catch(() => undefined);
    stats.likes = counts?.likes?.summary?.total_count;
    stats.comments = counts?.comments?.summary?.total_count;

    // Views and watch time (needs read_insights). Names differ for Reels and regular videos.
    type Insight = { name: string; values?: { value: number | Record<string, number> }[] };
    const ins = await graph<{ data: Insight[] }>(`${id}/video_insights`, { params: { access_token: accessToken } }).catch(() => undefined);
    const num = (name: string) => {
      const v = ins?.data.find((d) => d.name === name)?.values?.[0]?.value;
      return typeof v === "number" ? v : undefined;
    };
    stats.views = num("blue_reels_play_count") ?? num("fb_reels_total_plays") ?? num("total_video_views");
    const avgMs = num("post_video_avg_time_watched") ?? num("total_video_avg_time_watched");
    const totalMs = num("post_video_view_time") ?? num("total_video_view_total_time");
    if (avgMs !== undefined) stats.avgViewDurationSec = avgMs / 1000;
    if (totalMs !== undefined) stats.watchTimeSec = totalMs / 1000;
    return stats;
  },
};
