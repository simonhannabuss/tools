/**
 * Background worker: publishes posts, pulls stats at fixed checkpoints, cleans up old media.
 * Run with `npm run worker` (its own container in docker-compose).
 */
import { UnrecoverableError, Worker, type Job } from "bullmq";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PracticalFactors } from "@/db/schema";
import { env } from "@/lib/env";
import { QUEUE, enqueueMetricCheckpoints, redis, scheduleMaintenance, type Checkpoint } from "@/lib/queue";
import { absolutePath, deleteMediaFile } from "@/lib/media/storage";
import { aspectOf } from "@/lib/media/probe";
import { createMediaLink } from "@/lib/media/signed-links";
import { accessTokenFor, accountRemoteId, adapter } from "@/platforms";
import { NotImplementedYet } from "@/platforms/types";
import { computeAstroFactors } from "@/astrology";
import { localParts, slotOf } from "@/insights/time";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

// ---------------------------------------------------------------- publish

async function publish(job: Job<{ targetId: string }>) {
  const [row] = await db
    .select({ target: schema.postTargets, post: schema.posts, media: schema.media })
    .from(schema.postTargets)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.postTargets.postId))
    .leftJoin(schema.media, eq(schema.media.id, schema.posts.mediaId))
    .where(eq(schema.postTargets.id, job.data.targetId))
    .limit(1);
  if (!row) throw new UnrecoverableError("target not found");
  const { target, post, media } = row;
  if (target.status === "published") return;

  const a = adapter(target.platform);
  const when = new Date();
  const local = localParts(when, post.timezone);

  // Practical and astrological factors, recorded separately at the moment of posting.
  const practical: PracticalFactors = {
    weekday: local.weekday,
    hour: local.hour,
    slot: slotOf(local.weekday, local.hour),
    platform: target.platform,
    kind: post.kind,
    durationSec: media?.durationSec ?? undefined,
    aspect: aspectOf(media?.width, media?.height),
    hookLength: post.body.split("\n")[0]?.length,
    topics: post.tags,
  };
  const [profile] = await db.select().from(schema.astroProfile).limit(1);
  const astro =
    post.latitude != null && post.longitude != null && profile?.usage !== "hidden"
      ? computeAstroFactors(when, { lat: post.latitude, lng: post.longitude, timeZone: post.timezone }, profile?.factors ?? undefined)
      : null;

  await db
    .update(schema.postTargets)
    .set({ status: "publishing", attempts: target.attempts + 1, practicalFactors: practical, astroFactors: astro, error: null })
    .where(eq(schema.postTargets.id, target.id));

  const input = {
    kind: post.kind,
    title: post.title,
    caption: target.captionOverride ?? post.body,
    tags: post.tags,
    options: target.options ?? {},
    media: media
      ? {
          id: media.id,
          absPath: absolutePath(media.path),
          mimeType: media.mimeType,
          sizeBytes: media.sizeBytes,
          durationSec: media.durationSec,
          width: media.width,
          height: media.height,
        }
      : null,
    accessToken: a.mode === "api" ? await accessTokenFor(target.platform) : null,
    accountRemoteId: a.mode === "api" ? await accountRemoteId(target.platform) : null,
    publicMediaUrl: () => (media ? createMediaLink(media.id) : ""),
  };

  const errors = a.validate(input).filter((i) => i.level === "error");
  if (errors.length) return fail(target.id, errors.map((e) => e.message).join(" "));
  if (a.mode === "api" && !input.accessToken) {
    await db
      .update(schema.postTargets)
      .set({ status: "needs_user", error: `${a.name} isn't connected (or the connection expired). Reconnect it.` })
      .where(eq(schema.postTargets.id, target.id));
    return;
  }

  try {
    const res = await a.publish(input);
    if (res.status === "published") {
      await db
        .update(schema.postTargets)
        .set({ status: "published", remoteId: res.remoteId, remoteUrl: res.remoteUrl ?? null, publishedAt: new Date() })
        .where(eq(schema.postTargets.id, target.id));
      await enqueueMetricCheckpoints(target.id);
      log("published", a.name, res.remoteUrl ?? res.remoteId);
    } else {
      await db
        .update(schema.postTargets)
        .set({ status: "needs_user", handoffUrl: res.handoffUrl, remoteId: res.remoteId ?? null, error: res.note ?? null })
        .where(eq(schema.postTargets.id, target.id));
      log("needs user", a.name);
    }
    await maybeScheduleMediaDeletion(post.id);
  } catch (err) {
    if (err instanceof NotImplementedYet) return fail(target.id, err.message);
    const last = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await db
      .update(schema.postTargets)
      .set({ status: last ? "failed" : "scheduled", error: String(err instanceof Error ? err.message : err) })
      .where(eq(schema.postTargets.id, target.id));
    throw err; // BullMQ retries with backoff
  }
}

async function fail(targetId: string, message: string) {
  await db.update(schema.postTargets).set({ status: "failed", error: message }).where(eq(schema.postTargets.id, targetId));
  throw new UnrecoverableError(message);
}

/** Once every target is published (or handed to you), start the retention clock on the original file. */
async function maybeScheduleMediaDeletion(postId: string) {
  if (env.MEDIA_RETENTION_DAYS === 0) return;
  const targets = await db.select().from(schema.postTargets).where(eq(schema.postTargets.postId, postId));
  const done = targets.every((t) => t.status === "published" || t.status === "failed");
  if (!done) return; // assisted uploads keep the file until you've finished them
  const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, postId));
  if (!post?.mediaId) return;
  const deleteAfter = new Date(Date.now() + env.MEDIA_RETENTION_DAYS * 86_400_000);
  await db.update(schema.media).set({ deleteAfter }).where(and(eq(schema.media.id, post.mediaId), isNull(schema.media.deleteAfter)));
}

// ---------------------------------------------------------------- metrics

async function snapshot(job: Job<{ targetId: string; checkpoint: Checkpoint }>) {
  const [target] = await db.select().from(schema.postTargets).where(eq(schema.postTargets.id, job.data.targetId));
  if (!target?.remoteId) return;
  const a = adapter(target.platform);
  if (!a.fetchStats) return; // assisted platforms: public-page reader is a TODO
  const token = await accessTokenFor(target.platform);
  if (!token) throw new Error(`${a.name} not connected`);
  const s = await a.fetchStats(target.remoteId, token);
  await db
    .insert(schema.metricSnapshots)
    .values({ targetId: target.id, checkpoint: job.data.checkpoint, ...s })
    .onConflictDoUpdate({
      target: [schema.metricSnapshots.targetId, schema.metricSnapshots.checkpoint],
      set: { ...s, takenAt: new Date() },
    });
  log("stats", a.name, job.data.checkpoint, s.views ?? "?", "views");
}

// ---------------------------------------------------------------- maintenance

async function nightly() {
  const expired = await db
    .select()
    .from(schema.media)
    .where(and(lt(schema.media.deleteAfter, new Date()), isNull(schema.media.deletedAt)));
  for (const m of expired) {
    await deleteMediaFile(m.path);
    if (m.thumbnailPath) await deleteMediaFile(m.thumbnailPath);
    await db.update(schema.media).set({ deletedAt: new Date() }).where(eq(schema.media.id, m.id));
  }
  // Pending-2FA and expired sessions
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  log("nightly: deleted", expired.length, "expired media files");
}

// ---------------------------------------------------------------- start

const connection = redis();
const workers = [
  new Worker(QUEUE.publish, publish, { connection, concurrency: 2 }),
  new Worker(QUEUE.metrics, snapshot, { connection, concurrency: 4 }),
  new Worker(QUEUE.maintenance, nightly, { connection }),
];
for (const w of workers) w.on("failed", (job, err) => log("job failed", w.name, job?.id, err.message));

await scheduleMaintenance();
log("worker started");

const shutdown = async () => {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

