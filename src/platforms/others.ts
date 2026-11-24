import type { Issue, PlatformAdapter, PublishInput } from "./types";
import { NotImplementedYet } from "./types";

const needVideo = (name: string, maxSec?: number) =>
  ({ kind, media }: Pick<PublishInput, "kind" | "media">): Issue[] => {
    const issues: Issue[] = [];
    if (kind !== "video" || !media) issues.push({ level: "error", message: `${name} needs a video.` });
    if (maxSec && media?.durationSec && media.durationSec > maxSec)
      issues.push({ level: "error", message: `${name}: video is longer than ${Math.round(maxSec / 60)} min.` });
    return issues;
  };

// ---------------------------------------------------------------- API platforms (next to build)

export const tiktok: PlatformAdapter = {
  id: "tiktok",
  name: "TikTok",
  mode: "api",
  supports: { video: true, text: false },
  description: "Videos arrive as drafts in your TikTok inbox — tap publish in the app",
  validate: needVideo("TikTok", 10 * 60),
  async publish() {
    // Plan: Content Posting API, "upload to inbox" flow (no app audit needed for drafts).
    // Uses PULL_FROM_URL with input.publicMediaUrl() (domain must be verified with TikTok) or FILE_UPLOAD chunks.
    // Returns { status: "needs_user", handoffUrl: "https://www.tiktok.com/" } once the draft is in the inbox.
    throw new NotImplementedYet("TikTok", "inbox upload is the next adapter to build");
  },
};

export const instagram: PlatformAdapter = {
  id: "instagram",
  name: "Instagram",
  mode: "api",
  supports: { video: true, text: false },
  description: "Business/Creator account · Reels & carousels",
  validate: needVideo("Instagram", 15 * 60),
  async publish() {
    // Plan: Instagram Graph API — create a REELS media container with video_url = input.publicMediaUrl(),
    // poll status_code until FINISHED, then media_publish.
    throw new NotImplementedYet("Instagram", "needs Meta app review first");
  },
};

export const facebook: PlatformAdapter = {
  id: "facebook",
  name: "Facebook",
  mode: "api",
  supports: { video: true, text: true },
  description: "Page Reels & posts",
  validate({ kind, media }) {
    if (kind === "video" && media?.durationSec && media.durationSec > 90)
      return [{ level: "warning", message: "Over 90s: posts as a regular video, not a Reel." }];
    return [];
  },
  async publish() {
    // Plan: Page access token; Reels via /{page-id}/video_reels (start → upload → finish), text via /{page-id}/feed.
    throw new NotImplementedYet("Facebook", "needs Meta app setup");
  },
};

// ---------------------------------------------------------------- Assisted platforms (no posting API)

function assisted(id: "rumble" | "bitchute" | "substack", name: string, handoffUrl: string, description: string, kinds: { video: boolean; text: boolean }): PlatformAdapter {
  return {
    id,
    name,
    mode: "assisted",
    supports: kinds,
    description,
    validate({ kind, media }) {
      if (kind === "video" && !kinds.video) return [{ level: "error", message: `${name} is set up for text here.` }];
      if (kind === "video" && !media) return [{ level: "error", message: `${name} needs a video.` }];
      return [];
    },
    async publish() {
      // Nothing to call — the post shows in "Needs you" with the file, title and caption ready to copy.
      return { status: "needs_user", handoffUrl, note: "Prepared — finish the upload on the site." };
    },
  };
}

export const rumble = assisted("rumble", "Rumble", "https://rumble.com/upload.php", "We prepare files + metadata, you confirm upload", { video: true, text: false });
export const bitchute = assisted("bitchute", "BitChute", "https://www.bitchute.com/", "We prepare files + metadata, you confirm upload", { video: true, text: false });
export const substack = assisted("substack", "Substack", "https://substack.com/home", "Notes & posts copied for you to publish", { video: true, text: true });
