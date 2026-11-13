import { login } from "./actions";

const MESSAGES: Record<string, string> = {
  bad: "Wrong username or password.",
  no2fa: "Two-factor isn't set up yet. On the server run: npm run user:setup-2fa",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { e, s } = await searchParams;
  const error = e === "wait" ? `Too many attempts — try again in ${s ?? "a few"} seconds.` : e ? MESSAGES[e] : null;

  return (
    <div className="auth">
      <div>
        <div className="brand">
          <span className="logo">S</span> Simon&apos;s Tools
        </div>
        <form className="box" action={login}>
          <h1 style={{ fontSize: 22 }}>Sign in</h1>
          <p className="sub" style={{ marginBottom: 8 }}>Welcome back, Simon.</p>
          {error && <div className="error">{error}</div>}
          <label htmlFor="username">Username</label>
          <input id="username" name="username" type="text" autoComplete="username" required autoFocus />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <div style={{ height: 18 }} />
          <button className="btn block" type="submit">Sign in</button>
          <p className="muted" style={{ marginTop: 16 }}>
            <strong>Forgot your password?</strong> Reset it on the server: <code>npm run user:reset-password</code>
          </p>
        </form>
        <p className="muted" style={{ textAlign: "center", marginTop: 16 }}>Private app · no public sign-up</p>
      </div>
    </div>
  );
}
