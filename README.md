# Simon's Tools

A personal social media publisher: upload once, post to YouTube, Instagram, TikTok, Facebook, LinkedIn, Rumble, BitChute and Substack. It also learns when your posts do best, with practical data and astrology kept separate. Built so more tools (website analytics next) can be added alongside.

Designs: Figma, *Simons-tools*, section "Social Uploader — v1 designs".

## What's in this first version

| Area | Status |
|---|---|
| Sign in: username + password (Argon2id) + authenticator app codes, backup codes, rate limiting, sessions, security page | ✅ |
| Database schema (posts, per-platform targets, media, metrics, astrology profile, security events) | ✅ |
| Video upload (streamed to disk, ffprobe + thumbnail), expiring public media links | ✅ |
| Background worker: publish at scheduled time, stats at 1h / 24h / 48h / 7d, nightly cleanup | ✅ |
| YouTube: connect, upload (Shorts happen automatically for vertical ≤ 3 min), stats | ✅ |
| Rumble, BitChute, Substack: "assisted" (file + text prepared, you finish on the site) | ✅ |
| TikTok (inbox drafts), Instagram, Facebook, LinkedIn | ⏳ adapters stubbed with the plan in comments |
| Insights: best-times model (benchmarks → your data), astrology experiment | ✅ logic, basic page |
| Astrology: planetary hours from your location | ✅ (Moon sign/phase, transits etc. need an ephemeris — TODO) |
| Calendar view, heatmap, Timing screen, per-platform preview | ⏳ next |

## How it's laid out

```
src/
  app/                 Next.js pages and routes
    (app)/             signed-in pages: compose, posts, insights, accounts, security
    login/             sign in + 2FA
    api/upload/        video upload (PUT, streamed)
    media/s/[token]/   public, expiring video links (Instagram/TikTok download from here)
    oauth/             connect a platform (start + callback)
    health/            uptime check
  db/schema.ts         all tables
  lib/                 env, encryption, auth, media storage, queue
  platforms/           one adapter per platform (youtube.ts is the full example)
  worker/              background jobs
  insights/            best-times model + astrology experiment
  astrology/           sunrise/sunset + planetary hours
scripts/               server commands: create user, reset password, set up 2FA
```

**Where data lives:** code is in git. The database (Postgres), queue (Redis) and uploaded videos (`media` volume) live on the VPS. Secrets live only in `.env` on the server. Platform tokens and the 2FA secret are encrypted in the database with `ENCRYPTION_KEY`.

**Practical vs astrology:** each published post stores `practical_factors` and `astro_factors` in separate columns. The practical model learns from results. Astrology is only calculated, then tested against what the practical model *didn't* explain (`src/insights/astro-experiment.ts`).

## Deploy on the VPS

Needs Docker with the Compose plugin, and a domain pointing at the server (ports 80/443 open).

```bash
git clone https://github.com/simonhannabuss/tools.git && cd tools
cp .env.example .env
# fill in APP_URL, APP_DOMAIN, POSTGRES_PASSWORD (and the same password in DATABASE_URL)
# generate secrets:
openssl rand -base64 32   # → ENCRYPTION_KEY
openssl rand -base64 32   # → MEDIA_LINK_SECRET
nano .env

docker compose up -d --build
docker compose exec web npm run db:push          # create tables
docker compose exec web npm run user:create      # your username + password
docker compose exec web npm run user:setup-2fa   # scan QR, save backup codes
```

Then open `https://your-domain` and sign in.

**Updating:** `git pull && docker compose up -d --build` (run `npm run db:push` again if the schema changed).

**Backups:** back up the database nightly, e.g. a cron job running
`docker compose exec -T postgres pg_dump -U tools tools | gzip > /backups/tools-$(date +%F).sql.gz`, then copy it off the server.

**fail2ban (recommended):** the app slows down repeated failed sign-ins itself. fail2ban on the host adds IP blocking at the firewall.

**Tailscale (later):** uncomment the two lines in `Caddyfile` and the dashboard is only reachable from your own devices. The platform callbacks, media links and `/health` stay public.

## Connecting YouTube

1. In [Google Cloud console](https://console.cloud.google.com/), create a project and enable **YouTube Data API v3**.
2. Set up the OAuth consent screen (External, add yourself as a test user).
3. Create an OAuth client ID (**Web application**) with redirect URI `https://your-domain/oauth/callback/youtube`.
4. Put the ID and secret in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), then run `docker compose up -d`.
5. In the app: Connected accounts → YouTube → Connect.

Note: until Google verifies your app, videos uploaded through the API may be locked to private, and the daily upload quota is limited. For a personal tool you can request an audit or quota increase in the console.

## Local development

```bash
npm install
cp .env.example .env    # point DATABASE_URL/REDIS_URL at local services
npm run db:push
npm run dev             # web on http://localhost:3000
npm run worker:dev      # in a second terminal
npm test                # model + planetary-hours tests
```
