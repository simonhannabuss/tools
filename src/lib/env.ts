import { z } from "zod";

const schema = z.object({
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(40, "ENCRYPTION_KEY must be 32 random bytes, base64 (openssl rand -base64 32)"),
  MEDIA_LINK_SECRET: z.string().min(32),
  MEDIA_DIR: z.string().default("/data/media"),
  MEDIA_RETENTION_DAYS: z.coerce.number().int().min(0).default(30),
  DEFAULT_TIMEZONE: z.string().default("Europe/Madrid"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  INSTAGRAM_ACCOUNT_ID: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment. Parsed lazily so `next build` works without secrets present. */
export const env: Env = new Proxy({} as Env, {
  get(_t, key: string) {
    cached ??= schema.parse(process.env);
    return cached[key as keyof Env];
  },
});
