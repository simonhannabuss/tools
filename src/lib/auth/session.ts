import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { randomToken, sha256 } from "../crypto";
import { BASE_PATH } from "../base-path";

export const SESSION_COOKIE = "st_session";

const PENDING_2FA_MS = 10 * 60 * 1000; // password ok, waiting for code
const UNTRUSTED_MS = 12 * 60 * 60 * 1000;
const TRUSTED_MS = 30 * 24 * 60 * 60 * 1000;

export async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  return { ip, userAgent: h.get("user-agent") ?? "" };
}

async function setCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: BASE_PATH || "/", // only sent to /tools, not the rest of the website
    expires,
  });
}

/** Called after a correct password. The session is not usable until 2FA passes. */
export async function startPendingSession(userId: string) {
  const { ip, userAgent } = await requestMeta();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + PENDING_2FA_MS);
  await db.insert(schema.sessions).values({ userId, tokenHash: sha256(token), ip, userAgent, expiresAt });
  await setCookie(token, expiresAt);
}

export async function completeTwoFactor(sessionId: string, trusted: boolean) {
  const expiresAt = new Date(Date.now() + (trusted ? TRUSTED_MS : UNTRUSTED_MS));
  // Rotate the token on privilege change.
  const token = randomToken();
  await db
    .update(schema.sessions)
    .set({ twoFactorPassed: true, trusted, expiresAt, tokenHash: sha256(token), lastSeenAt: new Date() })
    .where(eq(schema.sessions.id, sessionId));
  await setCookie(token, expiresAt);
}

export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

/** Use at the top of every protected page / action. */
export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.session.twoFactorPassed) redirect("/login/2fa");
  return s;
}

export async function signOut() {
  const s = await getSession();
  if (s) await db.delete(schema.sessions).where(eq(schema.sessions.id, s.session.id));
  (await cookies()).delete({ name: SESSION_COOKIE, path: BASE_PATH || "/" });
}

export async function signOutEverywhere(userId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  (await cookies()).delete({ name: SESSION_COOKIE, path: BASE_PATH || "/" });
}
