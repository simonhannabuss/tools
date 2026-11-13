import { desc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { adapter } from "@/platforms";
import { env } from "@/lib/env";

const fmt = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("en-GB", { timeZone: env.DEFAULT_TIMEZONE, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d)
    : "Now";

const STATUS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  needs_user: "Needs you",
  failed: "Failed",
};

export default async function PostsPage() {
  const posts = await db.select().from(schema.posts).orderBy(desc(schema.posts.createdAt)).limit(50);
  const targets = posts.length
    ? await db.select().from(schema.postTargets).where(inArray(schema.postTargets.postId, posts.map((p) => p.id)))
    : [];
  const needsYou = targets.filter((t) => t.status === "needs_user");

  return (
    <>
      <h1>Calendar &amp; queue</h1>
      <p className="sub">Week and month calendar views come next — this is the queue.</p>

      {needsYou.length > 0 && (
        <div className="card">
          <h2>Needs you</h2>
          {needsYou.map((t) => {
            const post = posts.find((p) => p.id === t.postId)!;
            return (
              <div className="row" key={t.id}>
                <span className="grow">
                  <strong>{adapter(t.platform).name}</strong> — {post.title ?? post.body.slice(0, 60)}
                  <br />
                  <span className="muted">{t.error ?? "Ready for you to finish."}</span>
                </span>
                {t.handoffUrl && (
                  <a className="btn secondary" href={t.handoffUrl} target="_blank" rel="noreferrer">
                    Open {adapter(t.platform).name}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Post</th>
              <th>Platforms</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmt(p.scheduledFor ?? p.createdAt)}</td>
                <td>
                  <strong>{p.title ?? p.body.split("\n")[0].slice(0, 80)}</strong>
                  <br />
                  <span className="muted">{p.kind === "video" ? "Short video" : "Text post"}</span>
                </td>
                <td>
                  {targets
                    .filter((t) => t.postId === p.id)
                    .map((t) => (
                      <div key={t.id} className="row" style={{ padding: "2px 0" }}>
                        <span style={{ minWidth: 90 }}>{adapter(t.platform).name}</span>
                        <span className={`pill ${t.status}`}>{STATUS[t.status]}</span>
                        {t.remoteUrl && <a href={t.remoteUrl} target="_blank" rel="noreferrer">View</a>}
                        {t.status === "failed" && t.error && <span className="muted">{t.error}</span>}
                      </div>
                    ))}
                </td>
              </tr>
            ))}
            {!posts.length && (
              <tr>
                <td colSpan={3} className="muted">Nothing yet — make your first post.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

