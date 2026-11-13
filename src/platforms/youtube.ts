import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { env } from "@/lib/env";
import type { Issue, PlatformAdapter, PublishInput, Stats, TokenSet } from "./types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`YouTube token error ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? null,
    expiresAt: new Date(Date.now() + j.expires_in * 1000),
    scopes: j.scope ?? null,
  };
}

async function channelInfo(accessToken: string) {
  const res = await fetch(`${API}/channels?part=snippet&mine=true`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { handle: null, remoteId: null };
  const j = (await res.json()) as { items?: { id: string; snippet?: { customUrl?: string; title?: string } }[] };
  const c = j.items?.[0];
  return { handle: c?.snippet?.customUrl ?? c?.snippet?.title ?? null, remoteId: c?.id ?? null };
}

export const youtube: PlatformAdapter = {
  id: "youtube",
  name: "YouTube",
  mode: "api",
  supports: { video: true, text: false },
  description: "Shorts + long-form · stats synced after publishing",

  oauth: {
    authorizeUrl(state, redirectUri) {
      const p = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID ?? "",
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent", // always return a refresh token
        include_granted_scopes: "true",
        state,
      });
      return `${AUTH_URL}?${p}`;
    },
    async exchangeCode(code, redirectUri) {
      const t = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
      return { ...t, ...(await channelInfo(t.accessToken)) };
    },
    async refresh(refreshToken) {
      const t = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
      return { ...t, refreshToken }; // Google doesn't always return a new refresh token
    },
  },

  validate({ kind, title, media }) {
    const issues: Issue[] = [];
    if (kind !== "video" || !media) issues.push({ level: "error", message: "YouTube needs a video." });
    if (!title?.trim()) issues.push({ level: "error", message: "YouTube needs a title." });
    if ((title?.length ?? 0) > 100) issues.push({ level: "error", message: "YouTube titles are limited to 100 characters." });
    if (media?.durationSec && media.width && media.height) {
      const vertical = media.height >= media.width;
      if (vertical && media.durationSec <= 180) issues.push({ level: "warning", message: "Will appear as a Short." });
    }
    return issues;
  },

  async publish(input: PublishInput) {
    if (!input.media || !input.accessToken) throw new Error("YouTube publish needs media and an access token");
    const metadata = {
      snippet: {
        title: (input.title ?? "").slice(0, 100),
        description: input.caption,
        tags: input.tags.map((t) => t.replace(/^#/, "")),
        categoryId: String(input.options.categoryId ?? "22"), // People & Blogs
      },
      status: {
        privacyStatus: String(input.options.privacy ?? "public"),
        selfDeclaredMadeForKids: Boolean(input.options.madeForKids ?? false),
      },
    };

    // 1. Start a resumable upload session
    const init = await fetch(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-length": String(input.media.sizeBytes),
        "x-upload-content-type": input.media.mimeType,
      },
      body: JSON.stringify(metadata),
    });
    const sessionUrl = init.headers.get("location");
    if (!init.ok || !sessionUrl) throw new Error(`YouTube upload init failed ${init.status}: ${await init.text()}`);

    // 2. Stream the file. (Single PUT; resuming after a dropped connection is a TODO.)
    const putInit = {
      method: "PUT",
      headers: { "content-length": String(input.media.sizeBytes), "content-type": input.media.mimeType },
      body: Readable.toWeb(createReadStream(input.media.absPath)) as ReadableStream,
      duplex: "half", // Node fetch needs this for streamed bodies
    } as RequestInit & { duplex: "half" };
    const put = await fetch(sessionUrl, putInit);
    if (!put.ok) throw new Error(`YouTube upload failed ${put.status}: ${await put.text()}`);
    const video = (await put.json()) as { id: string };
    return { status: "published", remoteId: video.id, remoteUrl: `https://www.youtube.com/watch?v=${video.id}` };
  },

  async fetchStats(remoteId, accessToken): Promise<Stats> {
    const res = await fetch(`${API}/videos?part=statistics&id=${encodeURIComponent(remoteId)}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`YouTube stats failed ${res.status}`);
    const j = (await res.json()) as { items?: { statistics?: Record<string, string> }[] };
    const s = j.items?.[0]?.statistics ?? {};
    const n = (k: string) => (s[k] !== undefined ? Number(s[k]) : undefined);
    // Watch time needs the YouTube Analytics API (separate scope) — TODO.
    return { views: n("viewCount"), likes: n("likeCount"), comments: n("commentCount") };
  },
};
