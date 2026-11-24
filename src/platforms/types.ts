import type { Platform } from "@/db/schema";

export type TokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string | null;
  handle?: string | null;
  remoteId?: string | null;
};

export type MediaInfo = {
  id: string;
  absPath: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
};

export type PublishInput = {
  kind: "video" | "text";
  title: string | null;
  caption: string; // body or per-platform override
  tags: string[];
  options: Record<string, unknown>;
  media: MediaInfo | null;
  accessToken: string | null; // null for assisted platforms
  accountRemoteId: string | null; // your ID on the platform (e.g. LinkedIn member ID)
  /** A short-lived public URL for platforms that download the file themselves (Instagram, TikTok). */
  publicMediaUrl: () => string;
};

export type PublishResult =
  | { status: "published"; remoteId: string; remoteUrl?: string }
  | { status: "needs_user"; handoffUrl: string; remoteId?: string; note?: string };

export type Stats = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  watchTimeSec?: number;
  avgViewDurationSec?: number;
  followers?: number;
};

export type Issue = { level: "error" | "warning"; message: string };

export interface PlatformAdapter {
  id: Platform;
  name: string;
  /** "api" posts for you; "assisted" prepares everything and you finish on the site. */
  mode: "api" | "assisted";
  supports: { video: boolean; text: boolean };
  /** Shown on the Connected accounts screen. */
  description: string;

  oauth?: {
    authorizeUrl(state: string, redirectUri: string): string;
    exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
    refresh?(refreshToken: string): Promise<TokenSet>;
  };

  validate(input: Pick<PublishInput, "kind" | "caption" | "title" | "media">): Issue[];
  publish(input: PublishInput): Promise<PublishResult>;
  fetchStats?(remoteId: string, accessToken: string): Promise<Stats>;
}

export class NotImplementedYet extends Error {
  constructor(platform: string, detail: string) {
    super(`${platform}: not implemented yet — ${detail}`);
    this.name = "NotImplementedYet";
  }
}
