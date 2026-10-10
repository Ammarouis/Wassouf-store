# Deployment guide — Render (web + API) or Cloudflare + MongoDB Atlas

> ملخص عربي سريع: **الأسهل هو نشر الويب والـ API معًا على Render** (راجع §2 و §2b وملف `render.yaml`). الـ API (NestJS) لا يمكن تشغيله على Cloudflare إطلاقًا لأنه يستخدم `sharp` وموديلات أصلية. تطبيق الويب يمكن نشره على Cloudflare **Workers** (وليس Pages لأنها تدعم المواقع الثابتة فقط). قاعدة البيانات تبقى على MongoDB Atlas، ونضع IP سيرفر الـ API فقط في قائمة السماح — **لا نضع IP الخاص بـ Cloudflare**.

---

## 0. Reality check (read this first)

This repository is a **monorepo with three parts**, and they do **not** all live in the same place:

| Part | What it is | Where it can run |
| --- | --- | --- |
| `apps/web` | Next.js 15 (SSR + server components) | **Render ✅** / Cloudflare Workers ✅ / any Node host ✅ |
| `apps/api` | NestJS + Mongoose + **`sharp`** | **Node host only** — Render / Railway / Fly.io / VPS |
| MongoDB | Atlas cluster (remote) | Atlas (managed) |

### ⚠️ Two things that will bite you

1. **Cloudflare _Pages_ cannot host this app.** Cloudflare Pages only supports Next.js as a **static export** (`output: 'export'`). This app uses server-side data fetching (`getProducts`, `getBrands`…) and a server-side `/api` proxy, so it is **not** static. Use **Render** (see §2b) or **Cloudflare Workers** (see §3).
2. **The API cannot run on Cloudflare at all.** `apps/api` depends on `sharp` (a native binary) and a long-running NestJS/Express server. Cloudflare Workers have no native modules and no long-running process. The API **must** go on a Node host.

> If you truly want everything on Cloudflare, the API would have to be rewritten to use the MongoDB **Atlas Data API** (HTTPS) instead of Mongoose. That is a large rewrite — not recommended.

---

## 1. Put the code on GitHub (private)

From this folder:

```bash
git init -b main
git add -A
git add -f .env          # .env is in .gitignore, so it needs -f (see the warning below)
git commit -m "Al-Wassouf store"
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

### 🔴 Important warning about committing `.env`

`.env` contains **real secrets**: the MongoDB password, `SESSION_SECRET`, and the admin password. Committing it means:

- anyone with repo access (now or later) has full production credentials;
- GitHub may **auto-revoke** leaked tokens via secret scanning;
- once pushed, it stays in git history — even if you delete the file later it is still recoverable.

**Safer approach (recommended):** commit `.env.example` with placeholder values, and set the real values in each host's dashboard:

- Render/Railway/Fly → **Environment Variables**
- Cloudflare Workers → **Settings → Variables and Secrets**

If you still want `.env` in the repo, rotate `SESSION_SECRET` and the DB/admin passwords **after** deploying, and keep the repo private forever.

Also add these to `.gitignore` if you do not want runtime media in the repo:

```gitignore
apps/api/uploads/
```

---

## 2. Option A — ONE Render service for both (recommended)

Both the API and the web app run inside a single service:

```
public  $PORT            -> Next.js  (apps/web)
loopback 127.0.0.1:4000  -> NestJS   (apps/api)
```

`next start` takes Render's public `PORT`, while the API is pinned to an internal loopback port. `scripts/start-all.sh` starts both and waits for the API before booting the web app. `render.yaml` already points at it.

Why one service: one thing to pay for, one public URL, no CORS, and `API_BASE_URL` is a fixed internal value — so there is **no manual wiring step**.

### 2.1 Create the service

**Blueprint (easiest):** Render → **New → Blueprint** → select this repo. Then fill in the `sync: false` values listed in §5.

**Manual:** Render → **New → Web Service**, then:

| Setting | Value |
| --- | --- |
| Root Directory | *(repo root — leave empty)* |
| Build Command | `npm ci && npm run build:shared && npm run build -w @wassouf/api && npm run build -w @wassouf/web` |
| Start Command | `bash scripts/start-all.sh` |
| Health Check Path | `/` |

> ℹ️ `@wassouf/shared` builds to `dist/`, so `npm run build:shared` must run before the app builds.

### 2.2 Environment variables (Render → Environment)

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | `mongodb+srv://…` (your Atlas string) |
| `SESSION_SECRET` | a long random string (`openssl rand -hex 32`) |
| `CORS_ORIGINS` | your public URL (comma-separated) |
| `MEDIA_DIR` | `/var/data/uploads` (see note below) |
| `API_BASE_URL` | `http://127.0.0.1:4000` — fixed, same service |
| `NEXT_PUBLIC_SITE_URL` | the public URL Render assigns (baked in at build time) |
| `DEFAULT_WHATSAPP_COUNTRY_CODE` | e.g. `963` |
| `BR_01_WHATSAPP_LOCAL`, `BR_01_WHATSAPP_COUNTRY_CODE` | branch WhatsApp numbers |
| `BR_02_WHATSAPP_LOCAL`, `BR_02_WHATSAPP_COUNTRY_CODE` | branch WhatsApp numbers |

Do **not** set `PORT` — Render injects it, and `scripts/start-all.sh` derives the API's internal port separately.

### 2.3 Persistent media (uploads)

Product images are written to `MEDIA_DIR` on local disk (`apps/api/uploads` by default).

- Render/Railway/Fly filesystems are **ephemeral** — uploads vanish on redeploy/restart.
- Fix: attach a **persistent disk** and set `MEDIA_DIR` to its mount path (e.g. `/var/data/uploads`), **or** move media to object storage (Cloudflare R2 / S3) later.

### 2.4 Seed the first owner account (one time)

```bash
npm run seed
```

Run it from a Render **Shell** (or locally with `MONGODB_URI` pointing at Atlas). It reads `ADMIN_USERNAME` / `ADMIN_PASSWORD` from the environment and creates the owner account.

---

## 2b. Option B — two separate services (stronger isolation)

If you would rather scale and redeploy the API and web independently, use two services instead of one. Trade-offs vs. Option A: two services to pay for, two URLs, and `API_BASE_URL` must be wired manually.

A `render.two-services.yaml` blueprint is included as a starting point (rename it to `render.yaml` to use it).

### Web service settings

| Setting | Value |
| --- | --- |
| Type | Web Service (Node) |
| Root Directory | *(repo root — leave empty)* |
| Build Command | `npm ci && npm run build:shared && npm run build -w @wassouf/web` |
| Start Command | `npm start -w @wassouf/web -- -H 0.0.0.0` |
| Env var `API_BASE_URL` | `https://al-wassouf-api.onrender.com` |
| Env var `NEXT_PUBLIC_SITE_URL` | `https://al-wassouf-web.onrender.com` |

### API service settings

| Setting | Value |
| --- | --- |
| Root Directory | *(repo root)* |
| Build Command | `npm ci && npm run build:shared && npm run build -w @wassouf/api` |
| Start Command | `node apps/api/dist/main.js` |
| Health Check Path | `/api/products` |

`next start` automatically uses the `PORT` Render injects, so do **not** set `PORT`.

### How the two services talk

```
Browser ──► WEB  (Next.js SSR)  ──► API (NestJS) ──► MongoDB Atlas
             apps/web                apps/api
```

- Server-rendered pages fetch `${API_BASE_URL}/api/...` **directly, server-to-server**.
- The browser's calls to `/api/*` are proxied by `next.config.ts` to `API_BASE_URL`.
- Because the proxy is server-side, normal usage is **not** subject to CORS — but still set the API's `CORS_ORIGINS` to the web URL for safety.

### Render gotchas (both options)

- **Two-service only: set `API_BASE_URL` on the web service *before* the first deploy.** If it is missing, the web falls back to `http://localhost:4000` and every page will fail.
- **`NEXT_PUBLIC_*` values are baked in at build time.** Changing `NEXT_PUBLIC_SITE_URL` later requires a **manual redeploy** (`Clear build cache & deploy`).
- **Free tier spins down** after ~15 min idle → the first request after a pause is slow (cold start).
- **Persistent disks need a paid instance.** On free tier, uploaded images disappear on every restart. Use a paid instance with the `disk` block, or move media to Cloudflare R2 / S3.
- **Two-service only: deploy the API first**, so `API_BASE_URL` is valid when the web builds.
- Optional: add a Cloudflare custom domain in front for CDN/DNS — but the app itself needs nothing from Cloudflare.

---

## 3. Option C — put the web app on Cloudflare Workers

Cloudflare's **Pages** product is for static sites only, so for this SSR app you deploy a **Worker** using the **OpenNext adapter**.

> Cloudflare now also offers **vinext** (beta) as the recommended path for *new* Next.js apps. OpenNext is the documented path for existing apps and is used here because it supports all the features this app needs.

### 3.1 Add the adapter (in `apps/web`)

```bash
npm i @opennextjs/cloudflare@latest
npm i -D wrangler@latest
```

### 3.2 Create `apps/web/wrangler.toml`

```toml
name = "al-wassouf-web"
main = ".open-next/worker.js"
# Use today's date, must be >= 2024-09-23
compatibility_date = "2026-10-10"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"

[observability]
enabled = true
```

### 3.3 Create `apps/web/open-next.config.ts`

```ts
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
```

### 3.4 Add scripts to `apps/web/package.json`

```json
{
  "scripts": {
    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    "cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
  }
}
```

### 3.5 Build & deploy

Because this is a workspace monorepo, the shared package must be built first:

```bash
cd <repo-root>
npm ci
npm run build:shared
npm run deploy -w @wassouf/web
```

For **Cloudflare Workers Builds** (CI), set:

- **Root directory:** repository root
- **Build command:**
  ```bash
  npm ci && npm run build:shared && npm run deploy -w @wassouf/web
  ```

### 3.6 Environment variables (Cloudflare → Settings → Variables and Secrets)

| Key | Value |
| --- | --- |
| `API_BASE_URL` | `https://your-api.onrender.com` |
| `NEXT_PUBLIC_API_BASE_URL` | `https://your-api.onrender.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://your-web-domain` |

`next.config.ts` proxies `/api/*` → `API_BASE_URL` **server-side**, so the browser never talks to the API directly and CORS is not involved for normal page loads.

### 3.7 Add your custom domain

Workers → your worker → **Settings → Domains & Routes** → add `shop.example.com`.
Then update the API's `CORS_ORIGINS` to include that exact origin, and set `NEXT_PUBLIC_SITE_URL` to it.

---

## 4. MongoDB Atlas — the "Cloudflare IP" question

**Short answer: you do not whitelist Cloudflare in MongoDB.**

Cloudflare Workers run across a huge, rotating pool of IPs. There is no small stable list you can add to Atlas, and whitelisting Cloudflare's published ranges would effectively open your database to a large part of the internet. Also — and this is the key architectural point — **the web app never connects to MongoDB.** Only the API does.

So the rule is:

> Whitelist the **API server's** IP in Atlas — not Cloudflare's.

### 4.1 Steps

1. Log in at https://cloud.mongodb.com
2. Select your project → **Security → Network Access**
3. **+ ADD IP ADDRESS**

Then choose one of:

| Situation | What to add | Notes |
| --- | --- | --- |
| API host has a **static IP** (Fly.io dedicated IP, VPS, Render paid) | that exact IP `x.x.x.x/32` | ✅ safest, recommended |
| API host has **dynamic IPs** (Render/Railway free tiers) | `0.0.0.0/0` (allow from anywhere) | ⚠️ works everywhere but weaker. Mitigate with a strong DB user + TLS (Atlas defaults to TLS) |
| You want no public exposure at all | **PrivateLink / VPC peering** | paid Atlas tiers + supported host |

4. Confirm. Changes take ~1 minute to apply.

### 4.2 Why your earlier connection failed (and what it means for production)

Your **local** network blocks outbound database ports. Verified with `portquiz.net` (which accepts every port):

```
443 ✅   80 ✅   22 ✅   8080 ✅   27015 ✅   27016 ✅   27020 ✅
25 ❌   3306 ❌   5432 ❌   27017 ❌   27018 ❌   27019 ❌
```

Because Atlas always listens on **27017**, your machine cannot reach it without a VPN — **no Atlas whitelist entry can fix a locally-blocked port**.

This only affects your home network. A cloud API host (Render/Railway/Fly) has normal outbound access, so **in production the problem disappears**. For local development you have two options:

- **VPN** — then Atlas works normally (remember to whitelist the VPN's exit IP).
- **Local MongoDB** — `docker compose up -d` (a `docker-compose.yml` with MongoDB 7 is included), then set:
  ```
  MONGODB_URI=mongodb://127.0.0.1:27017/al-wassouf
  ```
  Loopback is not affected by the egress filter. Seed it with `npm run seed`.

---

## 5. Environment variable reference

### API (`apps/api`)

| Variable | Required | Example |
| --- | --- | --- |
| `MONGODB_URI` | ✅ | `mongodb+srv://user:pass@cluster.mongodb.net/` |
| `SESSION_SECRET` | ✅ | 32+ random bytes |
| `PORT` | auto | set by the host |
| `CORS_ORIGINS` | ✅ in prod | `https://shop.example.com` |
| `MEDIA_DIR` | recommended | `/var/data/uploads` |
| `NODE_ENV` | ✅ | `production` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | seed only | owner login for `npm run seed` |
| `BR_*_WHATSAPP_*` | optional | branch contact numbers |

### Web (`apps/web`)

| Variable | Required | Example |
| --- | --- | --- |
| `API_BASE_URL` | ✅ | `https://your-api.onrender.com` |
| `NEXT_PUBLIC_API_BASE_URL` | ✅ | same as above |
| `NEXT_PUBLIC_SITE_URL` | ✅ | `https://shop.example.com` |

> Only `NEXT_PUBLIC_*` values are exposed to the browser. Never put secrets in them.

---

## 6. Post-deploy checklist

- [ ] API reachable: `curl https://<your-app>/api/products`
- [ ] Site reachable: open the public URL
- [ ] `/admin` loads and **login works** (proves the `/api` proxy → API → Atlas chain)
- [ ] Atlas allowlist contains the host's IP (not Cloudflare's)
- [ ] `CORS_ORIGINS` contains the real web origin
- [ ] `NEXT_PUBLIC_SITE_URL` / `API_BASE_URL` point at production URLs
- [ ] Media uses a persistent disk or object storage
- [ ] `SESSION_SECRET` and passwords rotated after any `.env` commit
- [ ] `0.0.0.0/0` removed from Atlas if you used it temporarily

---

## 7. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Failed to proxy http://localhost:4000/api/... ECONNREFUSED` | The API isn't running on :4000. Check the API process/logs, and that `API_BASE_URL` is set. |
| API exits with `Cannot read properties of undefined (reading 'resolve')` | `esModuleInterop` is missing from `apps/api/tsconfig.json`. Default imports (`sharp`, `path`, `multer`) then compile to `.default` and crash. Keep `"esModuleInterop": true`. |
| `Cannot find module '/app/apps/api/dist/main.js'` | The API output path moved. `apps/api/tsconfig.json` maps `@wassouf/shared` to `../../packages/shared/dist/index.d.ts`. If it points at the shared **`.ts` source** instead, TypeScript widens `rootDir` and emits `dist/apps/api/src/main.js`. Keep the `.d.ts` mapping so the entry stays `dist/main.js`. |
| Build fails with `Cannot find module .../packages/shared/dist/index.d.ts` | `npm run build:shared` must run **before** the API build — it is included in the build commands above. |
| Mongo timeouts / `MongooseServerSelectionError` | The host's IP isn't allowed in Atlas, or the local network blocks port 27017 (see §4.2). Locally use a VPN or the bundled `docker-compose.yml`. |
| Uploaded images vanish after a restart | The host filesystem is ephemeral. Attach a persistent disk and set `MEDIA_DIR`, or move to object storage. |
| `NEXT_PUBLIC_SITE_URL` change has no effect | `NEXT_PUBLIC_*` is baked in at build time — redeploy with a cleared build cache. |

### Verified facts used above

- `next start` **does** honour the `PORT` environment variable and the `-H 0.0.0.0` flag.
- `apps/api` builds to `apps/api/dist/main.js` and starts with `node apps/api/dist/main.js`.
- With both processes in one service, the layout is `public $PORT` → web and `127.0.0.1:4000` → API.
