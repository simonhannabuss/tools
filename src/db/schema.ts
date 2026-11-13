import {
  pgTable,
  pgEnum,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  uuid,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const platformEnum = pgEnum("platform", [
  "youtube",
  "instagram",
  "tiktok",
  "facebook",
  "linkedin",
  "rumble",
  "bitchute",
  "substack",
]);

export const postKindEnum = pgEnum("post_kind", ["video", "text"]);

export const targetStatusEnum = pgEnum("target_status", [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "needs_user", // assisted platforms, TikTok inbox drafts, expired tokens
  "failed",
]);

// ---------------------------------------------------------------- auth

export const users = pgTable("users", {
  id: id(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // Argon2id
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
  totpSecretEnc: text("totp_secret_enc"), // encrypted with ENCRYPTION_KEY
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(), // sha256 of the cookie value
    twoFactorPassed: boolean("two_factor_passed").notNull().default(false),
    trusted: boolean("trusted").notNull().default(false),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const backupCodes = pgTable("backup_codes", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Every sign-in attempt and security event — powers rate limiting and the activity list. */
export const securityEvents = pgTable(
  "security_events",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(), // login_ok | login_failed | 2fa_ok | 2fa_failed | blocked | backup_code_used | ...
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("security_events_ip_time_idx").on(t.ip, t.createdAt)],
);

// ---------------------------------------------------------------- platforms

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    platform: platformEnum("platform").notNull(),
    handle: text("handle"),
    remoteId: text("remote_id"),
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes"),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_platform_idx").on(t.platform)],
);

// ---------------------------------------------------------------- content

export const media = pgTable("media", {
  id: id(),
  originalName: text("original_name").notNull(),
  path: text("path").notNull(), // relative to MEDIA_DIR
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  durationSec: doublePrecision("duration_sec"),
  width: integer("width"),
  height: integer("height"),
  thumbnailPath: text("thumbnail_path"),
  deleteAfter: timestamp("delete_after", { withTimezone: true }), // set once every target has published
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const posts = pgTable("posts", {
  id: id(),
  kind: postKindEnum("kind").notNull(),
  title: text("title"),
  body: text("body").notNull().default(""),
  tags: text("tags").array().notNull().default([]),
  mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }), // null = post now
  timezone: text("timezone").notNull().default("Europe/Madrid"),
  // Where it was posted from — used by the astrology lane (planetary hours etc.)
  locationName: text("location_name"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  createdAt: createdAt(),
});

export type PracticalFactors = {
  weekday: number; // 0 = Sunday, in post timezone
  hour: number; // 0–23, in post timezone
  slot: string; // e.g. "tue-18-21"
  platform: string;
  kind: "video" | "text";
  durationSec?: number;
  aspect?: "vertical" | "square" | "horizontal";
  hasCaptions?: boolean;
  hookLength?: number;
  topics?: string[];
};

export type AstroFactors = {
  planetaryHour?: string; // e.g. "Venus"
  dayRuler?: string;
  moonSign?: string;
  moonPhase?: string;
  moonVoidOfCourse?: boolean;
  mercuryRetrograde?: boolean;
  transits?: string[]; // e.g. ["Moon trine natal Sun"]
  favourable?: boolean; // the astrology lane's own verdict for this time
};

/** One row per platform a post goes to. Practical and astrological factors are stored apart on purpose. */
export const postTargets = pgTable(
  "post_targets",
  {
    id: id(),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    status: targetStatusEnum("status").notNull().default("draft"),
    captionOverride: text("caption_override"),
    options: jsonb("options").$type<Record<string, unknown>>().default({}),
    remoteId: text("remote_id"),
    remoteUrl: text("remote_url"),
    handoffUrl: text("handoff_url"), // where to finish an assisted upload
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    practicalFactors: jsonb("practical_factors").$type<PracticalFactors>(),
    astroFactors: jsonb("astro_factors").$type<AstroFactors>(),
    createdAt: createdAt(),
  },
  (t) => [index("post_targets_post_idx").on(t.postId), index("post_targets_status_idx").on(t.status)],
);

/** Stats pulled at fixed ages so posts are always compared like-for-like. */
export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: id(),
    targetId: uuid("target_id").notNull().references(() => postTargets.id, { onDelete: "cascade" }),
    checkpoint: text("checkpoint").notNull(), // "1h" | "24h" | "48h" | "7d"
    views: bigint("views", { mode: "number" }),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    shares: bigint("shares", { mode: "number" }),
    watchTimeSec: doublePrecision("watch_time_sec"),
    avgViewDurationSec: doublePrecision("avg_view_duration_sec"),
    followers: bigint("followers", { mode: "number" }),
    source: text("source").notNull().default("api"), // api | public_page | manual
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("metric_snapshots_target_checkpoint_idx").on(t.targetId, t.checkpoint)],
);

// ---------------------------------------------------------------- astrology profile

export const astroProfile = pgTable("astro_profile", {
  id: id(),
  birthDate: text("birth_date"), // YYYY-MM-DD
  birthTime: text("birth_time"), // HH:mm (local)
  birthPlace: text("birth_place"),
  birthLatitude: doublePrecision("birth_latitude"),
  birthLongitude: doublePrecision("birth_longitude"),
  birthTimezone: text("birth_timezone"),
  locationMode: text("location_mode").notNull().default("current"), // current | fixed | audience
  fixedPlace: text("fixed_place"),
  fixedLatitude: doublePrecision("fixed_latitude"),
  fixedLongitude: doublePrecision("fixed_longitude"),
  factors: jsonb("factors").$type<Record<string, boolean>>().default({
    planetaryHours: true,
    moonSignPhase: true,
    transits: true,
    moonVoidOfCourse: true,
    mercuryRetrograde: true,
    eclipses: false,
  }),
  usage: text("usage").notNull().default("separate"), // separate | tiebreak | hidden
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Platform = (typeof platformEnum.enumValues)[number];
