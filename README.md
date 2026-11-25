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

**Where data lives:** code is in git. The database (Postgres), queue (Redis) and uploaded videos (`media` volume) live on the VPS, in Docker volumes, not in your website folder. Secrets live only in `.env` on the server. Platform tokens and the 2FA secret are encrypted in the database with `ENCRYPTION_KEY`.

**Practical vs astrology:** each published post stores `practical_factors` and `astro_factors` in separate columns. The practical model learns from results. Astrology is only calculated, then tested against what the practical model *didn't* explain (`src/insights/astro-experiment.ts`).

## Put it on the server (simonhannabuss.co.uk/tools)

The app runs on your EuroVPS server in Docker. Your existing website stays as it is, and its web server (Apache or Nginx) forwards `/tools` to the app.

> Keep the code **outside** your website's public folder (not in `public_html`). Only the forwarding rule makes it visible at `/tools`. That way `.env` and the database can never be downloaded.

### First time

1. **Connect to the server** with SSH (Terminal on Mac): `ssh youruser@your-server-ip`
2. **Check Docker is installed:** `docker compose version`. You need root for this.
   - **cPanel on AlmaLinux:** the server already has Podman, which cPanel uses (`ea-podman`). Don't remove it. Add compose support instead:
     `dnf -y install epel-release && dnf -y install podman-compose && systemctl enable --now podman-restart.service`.
     After that, the `docker compose …` commands below work through Podman.
   - **Other servers:** install Docker Engine (docs.docker.com/engine/install).
3. **Download the code:**
   ```bash
   sudo mkdir -p /opt/tools && sudo chown $USER /opt/tools
   git clone https://github.com/simonhannabuss/tools.git /opt/tools
   cd /opt/tools
   ```
4. **Fill in the settings:**
   ```bash
   cp .env.example .env
   openssl rand -base64 32   # copy into ENCRYPTION_KEY
   openssl rand -base64 32   # copy into MEDIA_LINK_SECRET
   nano .env                 # also set POSTGRES_PASSWORD (same password inside DATABASE_URL)
   ```
5. **Start it:**
   ```bash
   docker compose up -d --build
   docker compose exec web npm run db:push          # creates the database tables
   docker compose exec web npm run user:create      # your username + password
   docker compose exec web npm run user:setup-2fa   # scan the QR code, save the backup codes
   ```
   Check it's running: `curl http://127.0.0.1:3000/tools/health` should say `"ok":true`.
6. **Point /tools at it:** add the forwarding rule to your website's config:
   - Apache, cPanel or Plesk: `deploy/apache-tools.conf`
   - Nginx: `deploy/nginx-tools.conf`

   Then reload the web server.
7. Open **https://simonhannabuss.co.uk/tools** and sign in.

### Updating after new code is pushed to GitHub

```bash
cd /opt/tools
git pull
docker compose up -d --build
docker compose exec web npm run db:push   # only needed if the database changed
```

### Useful commands

- See what's happening: `docker compose logs -f web worker`
- Restart: `docker compose restart`
- Stop: `docker compose down` (your data is kept in Docker volumes)

**Backups:** back up the database nightly, e.g. a cron job running
`cd /opt/tools && docker compose exec -T postgres pg_dump -U tools tools | gzip > /backups/tools-$(date +%F).sql.gz`, then copy it off the server.

**Tailscale (later):** uncomment the marked lines in the Apache or Nginx snippet. The dashboard is then only reachable from your own devices, while the platform callbacks, media links and `/health` stay public.

## Connecting YouTube

1. In [Google Cloud console](https://console.cloud.google.com/), create a project and enable **YouTube Data API v3**.
2. Set up the OAuth consent screen (External, add yourself as a test user).
3. Create an OAuth client ID (**Web application**) with redirect URI `https://simonhannabuss.co.uk/tools/oauth/callback/youtube`.
4. Put the ID and secret in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), then run `docker compose up -d`.
5. In the app: Connected accounts → YouTube → Connect.

Note: until Google verifies your app, videos uploaded through the API may be locked to private, and the daily upload quota is limited. For a personal tool you can request an audit or quota increase in the console.

## Connecting Facebook (your Page)

Facebook only lets apps post to **Pages**, not personal profiles. The app uses a Page access token that doesn't expire.

1. In the Meta app (developers.facebook.com → Simon's Tools), click **Add use cases** and add **Manage everything on your Page**.
2. Open the **Graph API Explorer** (developers.facebook.com/tools/explorer). Choose **Meta App: Simon's Tools**, then **Get User Access Token**, and tick `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` and `read_insights`. Click **Generate Access Token**, log in, and choose your Page.
3. Click the **ⓘ** next to the token → **Open in Access Token Tool** → **Extend Access Token**. Copy the long-lived token.
4. Back in the Explorer, paste the long-lived token into the token box, then run `GET me/accounts?fields=name,id,access_token`.
5. Copy your Page's `access_token` and `id`. Check the token in the **Access Token Debugger**: it should say **Expires: Never**.
6. Add both to `.env`:
   ```
   FACEBOOK_PAGE_TOKEN=...
   FACEBOOK_PAGE_ID=...
   ```
   Then run `docker compose down && docker compose up -d`.

The token stops working if you change your Facebook password, stop being an admin of the Page, or remove the app. If that happens, repeat steps 2–6.

## Local development

```bash
npm install
cp .env.example .env    # point DATABASE_URL/REDIS_URL at local services
npm run db:push
npm run dev             # web on http://localhost:3000/tools
npm run worker:dev      # in a second terminal
npm test                # model + planetary-hours tests
```
