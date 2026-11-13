import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

export const QUEUE = { publish: "publish", metrics: "metrics", maintenance: "maintenance" } as const;

export const CHECKPOINTS = { "1h": 3_600_000, "24h": 86_400_000, "48h": 172_800_000, "7d": 604_800_000 } as const;
export type Checkpoint = keyof typeof CHECKPOINTS;

let connection: IORedis | undefined;
export function redis(): IORedis {
  // BullMQ workers require maxRetriesPerRequest: null
  connection ??= new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return connection;
}

const queues = new Map<string, Queue>();
function queue(name: string): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: redis() });
    queues.set(name, q);
  }
  return q;
}

/** Publish one platform target, now or at its scheduled time. */
export async function enqueuePublish(targetId: string, runAt?: Date | null) {
  const delay = runAt ? Math.max(0, runAt.getTime() - Date.now()) : 0;
  // Rescheduling: drop any earlier job for this target so the new time wins.
  const existing = await queue(QUEUE.publish).getJob(`publish-${targetId}`);
  if (existing) await existing.remove().catch(() => undefined);
  await queue(QUEUE.publish).add(
    "publish",
    { targetId },
    { jobId: `publish-${targetId}`, delay, attempts: 3, backoff: { type: "exponential", delay: 60_000 }, removeOnComplete: 500 },
  );
}

/** Schedule stats pulls at 1h / 24h / 48h / 7d after publishing. */
export async function enqueueMetricCheckpoints(targetId: string) {
  for (const [checkpoint, delay] of Object.entries(CHECKPOINTS)) {
    await queue(QUEUE.metrics).add(
      "snapshot",
      { targetId, checkpoint },
      { jobId: `metrics-${targetId}-${checkpoint}`, delay, attempts: 5, backoff: { type: "exponential", delay: 300_000 }, removeOnComplete: 1000 },
    );
  }
}

export async function scheduleMaintenance() {
  await queue(QUEUE.maintenance).upsertJobScheduler("nightly", { pattern: "15 3 * * *", tz: env.DEFAULT_TIMEZONE }, { name: "nightly" });
}
