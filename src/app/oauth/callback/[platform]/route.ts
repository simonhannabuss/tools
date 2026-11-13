import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { safeEqual } from "@/lib/crypto";
import { withBase } from "@/lib/base-path";
import { env } from "@/lib/env";
import { adapter, isPlatform, saveTokens } from "@/platforms";

export const dynamic = "force-dynamic";

const back = (query: string) => Response.redirect(`${env.APP_URL.replace(/\/$/, "")}/accounts?${query}`);

/** Platforms send you back here after you approve access. Public URL, but checks state + your session. */
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isPlatform(platform) || !adapter(platform).oauth) return new Response("Unknown platform", { status: 404 });

  const s = await getSession();
  if (!s?.session.twoFactorPassed) return new Response("Sign in first", { status: 401 });

  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get(`oauth_state_${platform}`)?.value;
  jar.delete({ name: `oauth_state_${platform}`, path: withBase("/oauth/callback") });
  const state = url.searchParams.get("state") ?? "";
  if (!expected || !safeEqual(state, expected)) return back("error=" + encodeURIComponent("Connection expired — try again."));

  const denied = url.searchParams.get("error");
  if (denied) return back("error=" + encodeURIComponent(`${adapter(platform).name}: ${denied}`));

  const code = url.searchParams.get("code");
  if (!code) return back("error=" + encodeURIComponent("No authorisation code returned."));

  try {
    const redirectUri = `${env.APP_URL.replace(/\/$/, "")}/oauth/callback/${platform}`;
    const tokens = await adapter(platform).oauth!.exchangeCode(code, redirectUri);
    await saveTokens(platform, tokens);
    return back(`connected=${platform}`);
  } catch (err) {
    console.error("OAuth exchange failed", platform, err);
    return back("error=" + encodeURIComponent(`Couldn't connect ${adapter(platform).name}. Check the server logs.`));
  }
}
