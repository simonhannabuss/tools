"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { enqueuePublish } from "@/lib/queue";
import { env } from "@/lib/env";
import { adapter, isPlatform } from "@/platforms";

const input = z.object({
  kind: z.enum(["video", "text"]),
  title: z.string().max(200).optional(),
  body: z.string().max(10_000).default(""),
  tags: z.string().default(""),
  mediaId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  platforms: z.array(z.string()).min(1, "Pick at least one platform"),
  scheduledFor: z.string().optional(), // ISO string from the browser, empty = now
  locationName: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});

export type CreatePostResult = { error: string } | undefined;

export async function createPost(formData: FormData): Promise<CreatePostResult> {
  await requireUser();
  const parsed = input.safeParse({
    ...Object.fromEntries(formData),
    platforms: formData.getAll("platforms").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(" ") };
  const d = parsed.data;

  const platforms = d.platforms.filter(isPlatform);
  if (d.kind === "video" && !d.mediaId) return { error: "Upload a video first." };
  const unsupported = platforms.filter((p) => !adapter(p).supports[d.kind]);
  if (unsupported.length) return { error: `Not available for ${d.kind} posts: ${unsupported.join(", ")}` };

  const scheduledFor = d.scheduledFor ? new Date(d.scheduledFor) : null;
  if (scheduledFor && Number.isNaN(scheduledFor.getTime())) return { error: "Invalid date." };

  const [post] = await db
    .insert(schema.posts)
    .values({
      kind: d.kind,
      title: d.title || null,
      body: d.body,
      tags: d.tags.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`)),
      mediaId: d.mediaId ?? null,
      scheduledFor,
      timezone: env.DEFAULT_TIMEZONE,
      locationName: d.locationName || null,
      latitude: Number.isFinite(d.latitude) ? d.latitude : null,
      longitude: Number.isFinite(d.longitude) ? d.longitude : null,
    })
    .returning();

  const targets = await db
    .insert(schema.postTargets)
    .values(platforms.map((platform) => ({ postId: post.id, platform, status: "scheduled" as const })))
    .returning();

  for (const t of targets) await enqueuePublish(t.id, scheduledFor);
  redirect("/posts");
}
