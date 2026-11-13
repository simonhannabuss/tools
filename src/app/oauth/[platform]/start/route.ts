import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { randomToken } from "@/lib/crypto";
import { withBase } from "@/lib/base-path";
import { env } from "@/lib/env";
import { adapter, isPlatform } from "@/platforms";

export const dynamic = "force-dynamic";

const redirectUri = (platform: string) => `${env.APP_URL.replace(/\/$/, "")}/oauth/callback/${platform}`;

/** Starts "Connect YouTube" etc. Only for a signed-in user; sets a one-time state cookie. */
export async function GET(_req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const s = await getSession();
  if (!s?.session.twoFactorPassed) return Response.redirect(`${env.APP_URL.replace(/\/$/, "")}/login`);
  const { platform } = await params;
  if (!isPlatform(platform) || !adapter(platform).oauth) return new Response("Unknown platform", { status: 404 });

  const state = randomToken(24);
  (await cookies()).set(`oauth_state_${platform}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: withBase("/oauth/callback"),
    maxAge: 600,
  });
  return Response.redirect(adapter(platform).oauth!.authorizeUrl(state, redirectUri(platform)));
}
