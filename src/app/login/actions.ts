"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hashBackupCode, verifyTotp } from "@/lib/auth/totp";
import { completeTwoFactor, getSession, requestMeta, signOut, startPendingSession } from "@/lib/auth/session";
import { logSecurityEvent, retryAfterSeconds } from "@/lib/auth/rate-limit";

// Used to keep response time the same whether or not the username exists.
let dummyHash: Promise<string> | undefined;

export async function login(formData: FormData) {
  const meta = await requestMeta();
  const wait = await retryAfterSeconds(meta.ip);
  if (wait) redirect(`/login?e=wait&s=${wait}`);

  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);

  let ok = false;
  if (user) ok = await verifyPassword(user.passwordHash, password);
  else await verifyPassword(await (dummyHash ??= hashPassword("not-a-real-password")), password);

  if (!user || !ok) {
    await logSecurityEvent("login_failed", { ...meta, userId: user?.id });
    redirect("/login?e=bad");
  }
  if (!user.totpSecretEnc || !user.totpEnabledAt) redirect("/login?e=no2fa");

  await logSecurityEvent("password_ok", { ...meta, userId: user.id });
  await startPendingSession(user.id);
  redirect("/login/2fa");
}

export async function verifySecondFactor(formData: FormData) {
  const s = await getSession();
  if (!s) redirect("/login");
  const meta = await requestMeta();
  const wait = await retryAfterSeconds(meta.ip);
  if (wait) redirect(`/login/2fa?e=wait&s=${wait}`);

  const code = String(formData.get("code") ?? "").trim();
  const trust = formData.get("trust") === "on";
  let ok = false;
  let usedBackup = false;

  if (/^\d{6}$/.test(code.replace(/\s/g, "")) && s.user.totpSecretEnc) {
    ok = verifyTotp(decrypt(s.user.totpSecretEnc), code);
  } else if (code.length >= 8) {
    const [match] = await db
      .update(schema.backupCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.backupCodes.userId, s.user.id),
          eq(schema.backupCodes.codeHash, hashBackupCode(code)),
          isNull(schema.backupCodes.usedAt),
        ),
      )
      .returning({ id: schema.backupCodes.id });
    ok = Boolean(match);
    usedBackup = ok;
  }

  if (!ok) {
    await logSecurityEvent("2fa_failed", { ...meta, userId: s.user.id });
    redirect("/login/2fa?e=bad");
  }
  await logSecurityEvent(usedBackup ? "backup_code_used" : "login_ok", { ...meta, userId: s.user.id });
  await completeTwoFactor(s.session.id, trust);
  redirect("/compose");
}

export async function logout() {
  await signOut();
  redirect("/login");
}
