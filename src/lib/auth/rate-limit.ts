import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export async function logSecurityEvent(type: string, meta: { ip: string; userAgent: string; userId?: string | null }) {
  await db.insert(schema.securityEvents).values({ type, ip: meta.ip, userAgent: meta.userAgent, userId: meta.userId ?? null });
}

/** Returns seconds to wait, or 0 if the IP may try again. Backs off after 5 failures in 15 minutes. */
export async function retryAfterSeconds(ip: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int`, last: sql<Date | null>`max(${schema.securityEvents.createdAt})` })
    .from(schema.securityEvents)
    .where(
      and(
        eq(schema.securityEvents.ip, ip),
        inArray(schema.securityEvents.type, ["login_failed", "2fa_failed"]),
        gt(schema.securityEvents.createdAt, since),
      ),
    );
  const n = row?.n ?? 0;
  if (n < MAX_FAILURES || !row?.last) return 0;
  // 30s, 60s, 120s ... capped at 15 minutes
  const wait = Math.min(30 * 2 ** (n - MAX_FAILURES), 15 * 60);
  const elapsed = (Date.now() - new Date(row.last).getTime()) / 1000;
  return Math.max(0, Math.ceil(wait - elapsed));
}
