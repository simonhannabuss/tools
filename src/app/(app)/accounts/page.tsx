import { db, schema } from "@/db";
import { accountRemoteId, adapters, platformOrder } from "@/platforms";
import { withBase } from "@/lib/base-path";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { connected, error } = await searchParams;
  // Platforms connected with a key in .env (Instagram): check the key works and find the account.
  const settingsErrors: Record<string, string> = {};
  for (const id of platformOrder) {
    if (!adapters[id].settingsToken?.token()) continue;
    try {
      await accountRemoteId(id);
    } catch (err) {
      settingsErrors[id] = err instanceof Error ? err.message : String(err);
    }
  }
  const accounts = await db.select().from(schema.accounts);

  return (
    <>
      <h1>Connected accounts</h1>
      <p className="sub">Where your posts go, and how each one is published.</p>
      {connected && <div className="card" style={{ background: "#f0fdf4" }}>✓ Connected {adapters[connected as keyof typeof adapters]?.name ?? connected}.</div>}
      {error && <div className="error">{error}</div>}

      {platformOrder.map((id) => {
        const a = adapters[id];
        const acc = accounts.find((x) => x.platform === id);
        const expiresSoon = acc?.expiresAt && !acc.refreshTokenEnc && acc.expiresAt.getTime() - Date.now() < 7 * 86_400_000;
        const fromSettings = a.settingsToken ? Boolean(a.settingsToken.token()) : false;
        const settingsError = settingsErrors[id];
        const status =
          a.mode === "assisted"
            ? "Ready"
            : a.settingsToken
              ? !fromSettings
                ? "Not set up"
                : settingsError
                  ? "Key problem"
                  : "Connected"
              : !acc
                ? "Not connected"
                : expiresSoon
                  ? "Expires soon"
                  : "Connected";
        return (
          <div className="card row" key={id} style={{ padding: "14px 18px" }}>
            <strong style={{ width: 120 }}>{a.name}</strong>
            <span className="grow">
              {acc?.handle ?? (a.mode === "assisted" ? "No connection needed" : "—")}
              <br />
              <span className="muted">{settingsError ?? a.description}</span>
            </span>
            <span className={`pill ${a.mode}`}>{a.mode === "api" ? "API" : "Assisted"}</span>
            <span className={`pill ${status === "Connected" || status === "Ready" ? "ok" : status === "Expires soon" || status === "Key problem" ? "warn" : ""}`}>{status}</span>
            {a.oauth ? (
              <a className={`btn ${acc && !expiresSoon ? "secondary" : ""}`} href={withBase(`/oauth/${id}/start`)}>
                {acc ? "Reconnect" : "Connect"}
              </a>
            ) : a.settingsToken ? (
              <span className="muted" style={{ width: 90 }}>{fromSettings ? "Key in settings" : "Add key to .env"}</span>
            ) : a.mode === "api" ? (
              <span className="muted" style={{ width: 90 }}>Coming soon</span>
            ) : null}
          </div>
        );
      })}

      <div className="card" style={{ background: "var(--accent-soft)" }}>
        <strong>Coming next: Website analytics</strong>
        <p className="muted">A lightweight, cookie-free tracking script for your site, or a Google Analytics connection.</p>
      </div>
    </>
  );
}
