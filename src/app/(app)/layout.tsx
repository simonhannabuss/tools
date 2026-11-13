import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="shell">
      <nav className="side">
        <div className="brand">
          <span className="logo">S</span> Simon&apos;s Tools
        </div>
        <div className="group">PUBLISHER</div>
        <Link href="/compose">Compose</Link>
        <Link href="/posts">Calendar &amp; queue</Link>
        <Link href="/insights">Insights</Link>
        <div className="group">ANALYTICS</div>
        <span style={{ padding: "8px 12px", color: "#475569" }}>Website (soon)</span>
        <div className="group">SETTINGS</div>
        <Link href="/accounts">Connected accounts</Link>
        <Link href="/security">Security</Link>
        <div className="spacer" />
        <form action={logout} style={{ padding: "0 12px" }}>
          <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{user.username}</div>
          <button type="submit" style={{ background: "none", border: 0, color: "#94a3b8", padding: 0, cursor: "pointer", font: "inherit", fontSize: 12 }}>
            Sign out
          </button>
        </form>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
