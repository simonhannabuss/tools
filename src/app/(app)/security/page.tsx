import { desc, eq, and, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { getSession, requireUser, signOutEverywhere } from "@/lib/auth/session";
import { env } from "@/lib/env";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: env.DEFAULT_TIMEZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);

const LABEL: Record<string, string> = {
  login_ok: "Signed in · password + 2FA",
  backup_code_used: "Signed in · backup code",
  password_ok: "Password accepted, waiting for code",
  login_failed: "Failed · wrong password",
  "2fa_failed": "Failed · wrong code",
};

async function signOutAll() {
  "use server";
  const { user } = await requireUser();
  await signOutEverywhere(user.id);
  redirect("/login");
}

async function endSession(formData: FormData) {
  "use server";
  const { user } = await requireUser();
  const id = String(formData.get("id"));
  await db.delete(schema.sessions).where(and(eq(schema.sessions.id, id), eq(schema.sessions.userId, user.id)));
  redirect("/security");
}

export default async function SecurityPage() {
  const { user } = await requireUser();
  const current = await getSession();
  const sessions = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, user.id), eq(schema.sessions.twoFactorPassed, true)))
    .orderBy(desc(schema.sessions.lastSeenAt));
  const events = await db.select().from(schema.securityEvents).orderBy(desc(schema.securityEvents.createdAt)).limit(20);
  const [{ unused }] = await db
    .select({ unused: sql<number>`count(*)::int` })
    .from(schema.backupCodes)
    .where(and(eq(schema.backupCodes.userId, user.id), isNull(schema.backupCodes.usedAt)));

  return (
    <>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow">
          <h1>Security</h1>
          <p className="sub">Who can get in, and how.</p>
        </div>
        <form action={signOutAll}>
          <button className="btn secondary">Sign out everywhere</button>
        </form>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <div className="card">
            <h2>Password</h2>
            <div className="row">
              <span className="grow">
                Username: {user.username}
                <br />
                <span className="muted">Last changed {fmt(user.passwordChangedAt)} · stored as an Argon2id hash</span>
              </span>
            </div>
            <p className="muted">Change it on the server: <code>npm run user:reset-password</code></p>
          </div>
          <div className="card">
            <h2>Two-factor authentication <span className={`pill ${user.totpEnabledAt ? "ok" : "warn"}`}>{user.totpEnabledAt ? "On" : "Off"}</span></h2>
            <p className="muted">
              Authenticator app{user.totpEnabledAt ? ` added ${fmt(user.totpEnabledAt)}` : " not set up"} · {unused} of 10 backup codes unused.
            </p>
            <p className="muted">Replace the app or get new backup codes on the server: <code>npm run user:setup-2fa</code></p>
          </div>
          <div className="card">
            <h2>Network access <span className="pill">Later</span></h2>
            <p className="muted">
              Only allow my devices (Tailscale): set in the Caddyfile on the server. These stay public because platforms need them:
            </p>
            <p className="muted">
              <code>/oauth/callback/*</code> — account connections
              <br />
              <code>/media/s/&lt;token&gt;</code> — expiring video links
              <br />
              <code>/health</code> — uptime check
            </p>
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Active sessions</h2>
            {sessions.map((s) => (
              <div className="row" key={s.id}>
                <span className="grow">
                  {s.userAgent?.slice(0, 60) || "Unknown device"}
                  <br />
                  <span className="muted">
                    {s.ip} · last seen {fmt(s.lastSeenAt)}
                    {s.trusted ? ` · trusted until ${fmt(s.expiresAt)}` : ""}
                  </span>
                </span>
                {s.id === current?.session.id ? (
                  <span className="pill scheduled">This device</span>
                ) : (
                  <form action={endSession}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="btn secondary" style={{ color: "var(--bad)" }}>Sign out</button>
                  </form>
                )}
              </div>
            ))}
          </div>
          <div className="card">
            <h2>Recent sign-in activity</h2>
            {events.map((e) => (
              <div className="row" key={e.id}>
                <span style={{ color: e.type.includes("failed") || e.type === "blocked" ? "var(--bad)" : "var(--ok)" }}>●</span>
                <span className="grow">
                  {LABEL[e.type] ?? e.type}
                  <br />
                  <span className="muted">{e.ip}</span>
                </span>
                <span className="muted">{fmt(e.createdAt)}</span>
              </div>
            ))}
            <p className="muted">IP addresses that keep failing are slowed down automatically (and blocked by fail2ban on the server).</p>
          </div>
        </div>
      </div>
    </>
  );
}
