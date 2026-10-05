# =============================================================================
# HIREBYMINUTES — PRODUCTION DEPLOYMENT & OPERATION GUIDE
# =============================================================================
# Production Architecture:
# - Frontend & Backend: Unified Web Service on Render (hirebyminute.com)
#   - Backend: Node.js 20+ / Express 5 API & Socket.IO Signaling Server
#   - Frontend: React 19 / Vite SPA built and served directly via Express (client/dist)
# - Database: External Managed PostgreSQL (Neon PostgreSQL)
# - Object Storage: External S3/R2 Storage (Cloudflare R2, AWS S3)
# - Real-Time: Socket.IO WebSockets & WebRTC Signaling
# - Payments: Razorpay (INR standard, server order creation & HMAC-SHA256 verification)
# - Email: Resend HTTPS API (Transactional verification & notifications)
# =============================================================================

## 1. Production Architecture Overview

HireByMinute is deployed as an authoritative unified web service on **Render**, serving both the REST/WebSocket backend and the compiled React SPA from a single production origin (`hirebyminute.com`):

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PRODUCTION CLOUD ARCHITECTURE                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   Client Browser / Mobile PWA                                         │
│        │                                                               │
│        ▼ (HTTPS / WSS)                                                 │
│   [ hirebyminute.com ]                                                 │
│   Render Web Service (Node.js 20 / Express 5)                          │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ • Static SPA Serving: client/dist/ (HTML, JS, CSS, Assets)     │   │
│   │ • SPA Fallback: Dynamic SEO OpenGraph tag injection for deep   │   │
│   │   links (/, /services, /jobs, /opportunities, /how-it-works)   │   │
│   │ • REST API: /api/* endpoints (Same-origin, zero CORS latency)  │   │
│   │ • Health Probes: /api/health and /health (< 1ms, no DB query)  │   │
│   │ • Real-Time Engine: Socket.IO / WebRTC Signaling               │   │
│   └───────────────┬────────────────┬────────────────┬──────────────┘   │
│                   │                │                │                  │
│                   ▼                ▼                ▼                  │
│              Neon PG           S3 / R2          Razorpay / Resend      │
│             PostgreSQL        Object Storage    Payments & Email API   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Benefits:
1. **Single-Origin Simplicity**: Because both Express and the SPA run on `hirebyminute.com`, client API calls use relative paths (`/api/*`), eliminating cross-origin latency and unnecessary CORS preflight requests in production.
2. **Dynamic SEO Open Graph Tags**: Express dynamically injects route-specific `<title>`, `<meta description>`, and `<meta property="og:*">` tags into `index.html` on direct page requests before serving HTML to social crawlers and search bots.
3. **Resilient Client Architecture**: The client UI mounts instantly, features automatic exponential retries for transient gateway hiccups, and informs users when the backend is waking up or performing tasks.

---

## 2. Prerequisites & Accounts

1. **GitHub Repository**: Connected to your Render account.
2. **Neon.tech**: Managed PostgreSQL instance (`neondb?sslmode=require`).
3. **Render Account**: Web Service host ([render.com](https://render.com)).
4. **Custom Domain**: DNS provider configured with CNAME/A records pointing `hirebyminute.com` and `www.hirebyminute.com` to Render.
5. **Razorpay Account**: Indian Rupees (INR) payments ([dashboard.razorpay.com](https://dashboard.razorpay.com)).
6. **Resend Account**: Transactional emails ([resend.com](https://resend.com)).
7. **External Monitor**: UptimeRobot or BetterStack for health pings ([uptimerobot.com](https://uptimerobot.com)).

---

## 3. Step-by-Step Deployment Instructions

### Step A: Database Schema Initialization (Neon PostgreSQL)

1. Obtain your PostgreSQL connection string from Neon:
   `postgresql://user:password@ep-sample-123456.us-east-2.aws.neon.tech/neondb?sslmode=require`

2. Initialize all tables, categories, and administrator account:
   ```bash
   # Run locally with DATABASE_URL in .env:
   node server/scripts/initPostgres.js
   ```

*(Optional) To migrate local development SQLite records into PostgreSQL:*
```bash
node server/scripts/migrateSqliteToPostgres.js
```

---

### Step B: Service Deployment on Render

#### Option 1: Automatic Blueprint Deployment (Recommended)
1. In the [Render Dashboard](https://dashboard.render.com/), click **New +** ➔ **Blueprint**.
2. Select your repository. Render automatically reads `render.yaml` and provisions the web service with:
   - **Build Command**: `npm install && npm --prefix client install --include=dev && npm --prefix client run build`
   - **Start Command**: `node server/index.js`
   - **Health Check Path**: `/api/health`
3. Enter required environment secret values when prompted (DATABASE_URL, RAZORPAY keys, RESEND keys, ADMIN credentials).
4. Click **Apply**.

#### Option 2: Manual Web Service Setup
1. In the [Render Dashboard](https://dashboard.render.com/), click **New +** ➔ **Web Service**.
2. Connect your GitHub repository.
3. Configure settings:
   - **Name**: `hirebyminutes`
   - **Runtime**: `Node`
   - **Plan**: `Free` (or `Starter`)
   - **Build Command**: `npm install && npm --prefix client install --include=dev && npm --prefix client run build`
   - **Start Command**: `node server/index.js`
   - **Health Check Path**: `/api/health`
4. Add the environment variables specified in Section 4.
5. Click **Create Web Service**.

---

### Step C: Custom Domain Configuration

1. In your Render Web Service settings, navigate to **Settings** ➔ **Custom Domains**.
2. Add:
   - `hirebyminute.com`
   - `www.hirebyminute.com`
3. In your DNS provider (Cloudflare, GoDaddy, Namecheap, etc.), create the DNS records specified by Render:
   - CNAME `www` pointing to `hirebyminutes.onrender.com`
   - ANAME / ALIAS or A records for root `@` pointing to Render's IP address.
4. Render automatically provisions and renews free Let's Encrypt SSL/TLS certificates.

---

## 4. Production Environment Variables Reference

Configure these environment variables in your Render Web Service dashboard:

| Variable | Example Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production mode, security headers, and static caching |
| `PORT` | `5000` | Server listening port (Render sets this dynamically) |
| `DATABASE_URL` | `postgresql://user:pass@host/neondb?sslmode=require` | Remote Neon PostgreSQL connection string |
| `JWT_SECRET` | *(64-char random hex string)* | Cryptographic token signing secret |
| `ADMIN_EMAIL` | `vishalkumar75912@gmail.com` | Master administrator email |
| `ADMIN_PASSWORD` | *(Secure password)* | Master administrator password |
| `CLIENT_ORIGIN` | `https://hirebyminute.com` | Primary production domain |
| `ALLOWED_ORIGINS` | `https://hirebyminute.com,https://www.hirebyminute.com` | Allowed domains for CORS validation |
| `PLATFORM_NAME` | `HireByMinute` | Official platform display name |
| `LISTING_FEE_INR` | `2.00` | Fixed job listing fee in INR |
| `PLATFORM_FEE_PERCENT` | `15` | Platform commission percentage |
| `STORAGE_PROVIDER` | `s3` (or `r2`, `local`) | External object storage provider |
| `STORAGE_BUCKET` | `hirebyminutes-uploads` | S3 / R2 bucket name |
| `STORAGE_ACCESS_KEY`| *(Access Key)* | S3 / R2 access key ID |
| `STORAGE_SECRET_KEY`| *(Secret Key)* | S3 / R2 secret access key |
| `STORAGE_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` | Custom endpoint for Cloudflare R2 |
| `STORAGE_PUBLIC_URL`| `https://pub-<id>.r2.dev` | Public URL prefix for uploaded assets |
| `RAZORPAY_KEY_ID` | `rzp_live_xxxxxxxxxxxxxxxx` | Live Razorpay Key ID |
| `RAZORPAY_KEY_SECRET`| *(Razorpay Secret)* | Live Razorpay Secret Key |
| `RAZORPAY_WEBHOOK_SECRET`| *(Webhook Secret)* | Razorpay Webhook verification secret |
| `EMAIL_ENABLED` | `true` | Enables transactional emails |
| `EMAIL_PROVIDER` | `resend` | HTTPS transactional email provider |
| `RESEND_API_KEY` | `re_123456789_abcdef...` | Resend API key |
| `EMAIL_FROM` | `HireByMinute <no-reply@hirebyminute.com>` | Verified sender address |
| `EMAIL_FROM_NAME` | `HireByMinute` | Sender display name |
| `EMAIL_REPLY_TO` | `support@hirebyminute.com` | Support reply-to address |
| `OTP_EXPIRY_MINUTES` | `10` | Email verification OTP expiry window |
| `OTP_MAX_ATTEMPTS` | `5` | Maximum OTP attempts allowed |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | Cooldown period before resending OTP |
| `PASSWORD_RESET_EXPIRY_MINUTES` | `30` | Password reset link validity window |

---

## 5. Cold-Start Handling & Frontend Resilience

When deployed on Render's Free tier, backend containers enter a low-power sleep state after 15 minutes of inactivity:

1. **Self-Contained SPA Bundle**: The client application bundle is compiled into `client/dist` during the Render build. When the container wakes, Express serves the SPA with 1-year cache headers for immutable assets and 0-cache for `index.html`.
2. **Cold-Start Detection**: If a client request encounters latency during server spin-up, the UI displays a clean status indicator ("Connecting to secure servers... ~30s") rather than an unresponsive blank screen.
3. **Automatic Exponential Retries**: The frontend API client automatically retries transient 502/503/504 gateway errors up to 3 times before displaying a retry action button.
4. **Resilient Consultation Timers**: Session durations are computed from authoritative database start timestamps (`Date.now() - session.actual_start`), making active consultations unaffected by container restarts.

---

## 6. Render Free Tier Keep-Alive Monitoring

When hosted on Render's Free tier, the web service automatically spins down into an idle sleep state after **15 minutes of inactivity** (no inbound HTTP requests). The next incoming visitor experiences a 30–45 second cold start while the container provisions and boots.

To eliminate this cold start, use an external uptime monitoring service (such as [UptimeRobot](https://uptimerobot.com/), [BetterStack](https://betterstack.com/), or [Cron-Job.org](https://cron-job.org/)) to send periodic lightweight HTTP probes to keep the service warm.

> [!IMPORTANT]
> **No Internal Self-Pings**: Do NOT implement an internal `setInterval` or self-ping loop inside the backend. Internal loops consume CPU cycles, cannot wake an already-sleeping container, and waste instance resources. An external monitor provides reliable inbound traffic that keeps Render warm legitimately.

### Recommended Monitor Configuration

| Parameter | Recommended Setting | Description |
| :--- | :--- | :--- |
| **Monitor Type** | `HTTP(s)` | Standard web probe |
| **Friendly Name** | `HireByMinute Production Health` | Descriptive identifier in dashboard |
| **URL (Primary)** | `https://hirebyminute.com/api/health` | Authoritative custom production domain |
| **URL (Direct Fallback)** | `https://hirebyminutes.onrender.com/api/health` | Direct Render service URL (if DNS is ever updating) |
| **HTTP Method** | `GET` (or `HEAD`) | Both return HTTP 200 with zero database writes |
| **Monitoring Interval** | `Every 5 minutes` | Well within Render's 15-minute sleep threshold |
| **Expected HTTP Status** | `200` | Indicates healthy application process |
| **Request Timeout** | `30 seconds` | Accommodates initial cold boot latency if service was stopped |

### Verified Production Endpoints

The backend provides four dedicated, unauthenticated, non-blocking monitoring endpoints:

1. **`GET /api/health`** (Standard): Returns JSON payload (< 1ms execution, no database queries on routine pings):
   ```json
   {
     "status": "healthy",
     "ok": true,
     "platform": "HireByMinute",
     "version": "2.4.0",
     "environment": "production",
     "database": "connected",
     "uptimeSeconds": 1420,
     "timestamp": "2026-10-05T14:12:26.511Z",
     "memory": {
       "rssMb": 45,
       "heapUsedMb": 28,
       "heapTotalMb": 35
     }
   }
   ```
2. **`HEAD /api/health`** or **`HEAD /health`**: Returns HTTP 200 immediately without body bytes.
3. **`GET /health`**: Root alias for `/api/health`.
4. **`GET /api/ping`** or **`GET /ping`**: Ultra-lightweight endpoint returning plain text `pong`.

### Cache Prevention Guaranteed
All health and ping endpoints strictly emit:
```http
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
Pragma: no-cache
Expires: 0
Surrogate-Control: no-store
```
This guarantees that intermediate edge caches, Cloudflare, and CDN proxies never serve a cached 200 to the monitoring service — every probe reaches the running Render Node.js container.

### Render Free Tier Quota Consideration
- Render Free tier accounts receive **750 free instance hours per calendar month**.
- A 31-day month contains 744 hours (24 × 31).
- **Single Service**: If HireByMinute is the only free service on your Render account, 5-minute keep-alive pings keep it 100% warm 24/7 without exceeding your 750 free monthly hours.
- **Multiple Services**: If your Render account hosts multiple free services sharing the 750-hour pool, configure your monitor (e.g. in Cron-Job.org or UptimeRobot schedules) to ping during peak business hours (e.g., 08:00–23:00) to conserve pooled hours.

---

## 7. Automated Verification Suite

Run the full production verification suite locally or in CI:

```bash
# Run all test suites: PostgreSQL schema, Jobs marketplace, Razorpay INR, Render deployment
npm test

# Build the frontend bundle
npm run build
```
