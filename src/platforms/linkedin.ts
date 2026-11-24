import { env } from "@/lib/env";
import type { Issue, PlatformAdapter, PublishInput, TokenSet } from "./types";
import { toLittleText } from "./little-text";

// Posts as your personal profile ("Share on LinkedIn" product, w_member_social).
// The "Sign In with LinkedIn using OpenID Connect" product is used to learn your member ID.
const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const POSTS_URL = "https://api.linkedin.com/rest/posts";
const SCOPES = ["openid", "profile", "w_member_social"];
// LinkedIn's API is versioned by month (YYYYMM); old versions are retired after about a year.
const API_VERSION = () => process.env.LINKEDIN_API_VERSION || "202611";

export const linkedin: PlatformAdapter = {
  id: "linkedin",
  name: "LinkedIn",
  mode: "api",
  supports: { video: false, text: true },
  description: "Text posts to your personal profile · reconnect every 60 days",

  oauth: {
    authorizeUrl(state, redirectUri) {
      const p = new URLSearchParams({
        response_type: "code",
        client_id: env.LINKEDIN_CLIENT_ID ?? "",
        redirect_uri: redirectUri,
        state,
        scope: SCOPES.join(" "),
      });
      return `${AUTH_URL}?${p}`;
    },
    async exchangeCode(code, redirectUri): Promise<TokenSet> {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: env.LINKEDIN_CLIENT_ID ?? "",
          client_secret: env.LINKEDIN_CLIENT_SECRET ?? "",
        }),
      });
      if (!res.ok) throw new Error(`LinkedIn token error ${res.status}: ${await res.text()}`);
      const t = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };

      const me = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${t.access_token}` } });
      if (!me.ok) throw new Error(`LinkedIn profile error ${me.status}: ${await me.text()}`);
      const u = (await me.json()) as { sub: string; name?: string };

      return {
        accessToken: t.access_token,
        refreshToken: t.refresh_token ?? null, // only partner apps get refresh tokens
        expiresAt: new Date(Date.now() + t.expires_in * 1000), // usually 60 days
        scopes: t.scope ?? SCOPES.join(" "),
        handle: u.name ?? null,
        remoteId: u.sub, // member ID → author urn:li:person:<sub>
      };
    },
  },

  validate({ kind, caption }) {
    const issues: Issue[] = [];
    if (kind !== "text") issues.push({ level: "error", message: "LinkedIn is set up for text posts." });
    if (!caption.trim()) issues.push({ level: "error", message: "LinkedIn post is empty." });
    if (caption.length > 3000) issues.push({ level: "error", message: "LinkedIn posts are limited to 3,000 characters." });
    return issues;
  },

  async publish(input: PublishInput) {
    if (!input.accessToken || !input.accountRemoteId) throw new Error("LinkedIn isn't connected — reconnect it.");
    const tags = input.tags.filter((t) => !input.caption.includes(t)).join(" ");
    const text = tags ? `${input.caption}\n\n${tags}` : input.caption;

    const res = await fetch(POSTS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "linkedin-version": API_VERSION(),
        "x-restli-protocol-version": "2.0.0",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        author: `urn:li:person:${input.accountRemoteId}`,
        commentary: toLittleText(text),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    if (res.status !== 201) throw new Error(`LinkedIn post failed ${res.status}: ${await res.text()}`);
    const urn = res.headers.get("x-restli-id") ?? "";
    return { status: "published", remoteId: urn, remoteUrl: urn ? `https://www.linkedin.com/feed/update/${urn}/` : undefined };
  },
  // No fetchStats: reading member post stats is a restricted LinkedIn permission.
};
