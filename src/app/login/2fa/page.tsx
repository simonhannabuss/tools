import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { verifySecondFactor } from "../actions";

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.session.twoFactorPassed) redirect("/compose");
  const { e, s: secs } = await searchParams;
  const error = e === "wait" ? `Too many attempts — next try in ${secs ?? "a few"} seconds.` : e ? "That code didn't work." : null;

  return (
    <div className="auth">
      <div>
        <div className="brand">
          <span className="logo">S</span> Simon&apos;s Tools
        </div>
        <form className="box" action={verifySecondFactor}>
          <h1 style={{ fontSize: 22 }}>Two-step verification</h1>
          <p className="sub" style={{ marginBottom: 8 }}>Enter the 6-digit code from your authenticator app.</p>
          {error && <div className="error">{error}</div>}
          <input
            className="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            required
            autoFocus
          />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
            <input type="checkbox" name="trust" defaultChecked /> Trust this device for 30 days
          </label>
          <div style={{ height: 8 }} />
          <button className="btn block" type="submit">Verify</button>
          <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
            Lost your phone? Type one of your backup codes (like <code>k3f9-2mqp</code>) in the box instead.
          </p>
        </form>
      </div>
    </div>
  );
}
