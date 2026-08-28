# =============================================================================
# HIREBYMINUTES — FREE RENDER PRODUCTION DEPLOYMENT GUIDE
# =============================================================================
# Architecture: Node.js 20+ / Express 5 API + React 19 SPA on Render Free Web Service
# Database: External Persistent PostgreSQL (e.g. Neon, Supabase, Aiven)
# Storage: External S3/R2 Object Storage (e.g. Cloudflare R2, AWS S3, Supabase)
# Real-Time: Socket.IO WebSockets & WebRTC Signaling
# Payments: Razorpay (Server-Side Order Creation & HMAC SHA-256 Verification)
# Email: Resend HTTPS API (Ports 25/465/587 are blocked on Render Free)
# Monitoring: External Uptime Monitor pinging GET /api/health every 5 minutes
# =============================================================================

## 1. Architecture Overview (Render Free Safe)

Because Render Free Web Services feature an **ephemeral filesystem** that resets on container sleep and redeployments, the application is engineered for zero-local-state persistence:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   RENDER FREE CLOUD TOPOLOGY                          │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   Client Browser / Mobile PWA                                         │
│        │                                                               │
│        ▼                                                               │
│   [ Render Free Web Service (Node.js 20 / Express 5) ]                │
│        │                 │                  │                          │
│        ▼                 ▼                  ▼                          │
│   External PG      External S3/R2      Razorpay & Resend              │
│   (Neon / Supabase) (Cloudflare R2)    (Payments & Transactional)      │
│   [All Tables]      [Avatars/Files]    [HMAC & HTTPS APIs]             │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Prerequisites & Free Service Accounts

1. **GitHub / GitLab Repository**: Push the HireByMinutes codebase to a private/public repo.
2. **Render Account**: [https://render.com](https://render.com) (Free tier).
3. **Free PostgreSQL Database**:
   - [Neon.tech](https://neon.tech) (Free 0.5GB compute & storage, instant setup)
   - [Supabase](https://supabase.com) (Free tier PostgreSQL)
   - [Aiven](https://aiven.io) (Free tier PostgreSQL)
4. **Free S3-Compatible Storage (Optional but Recommended for persistent avatars)**:
   - [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/) (Free 10GB storage/month, 0 egress fees)
   - [AWS S3](https://aws.amazon.com/s3/) (Free 5GB tier)
5. **Razorpay Account**: [https://dashboard.razorpay.com](https://dashboard.razorpay.com)
6. **Resend Email Account**: [https://resend.com](https://resend.com) (Free 3,000 emails/month)
7. **External Health Monitor**: [UptimeRobot](https://uptimerobot.com) or [BetterStack](https://betterstack.com) (Free 5-minute HTTP monitors).

---

## 3. Step-by-Step Deployment Instructions

### Step A: Initialize PostgreSQL Schema
Obtain your PostgreSQL connection string from Neon, Supabase, or Aiven:
`postgresql://user:password@ep-sample-123456.us-east-2.aws.neon.tech/neondb?sslmode=require`

Initialize all tables, categories, and master admin account by running locally:
```bash
# Set DATABASE_URL and ADMIN credentials in .env, then run:
node server/scripts/initPostgres.js
```
*(Optional) If you have existing local SQLite data you wish to migrate to PostgreSQL, run:*
```bash
node server/scripts/migrateSqliteToPostgres.js
```

### Step B: Deploy on Render via Blueprint (Recommended)
1. Go to [Render Dashboard](https://dashboard.render.com/) ➔ **New +** ➔ **Blueprint**.
2. Connect your GitHub repository.
3. Render will read `render.yaml` and configure the **Free Web Service**.
4. In the environment configuration step, input your environment variables (see Section 4).
5. Click **Apply**. Render will run `npm install && npm --prefix client install && npm run build` and launch the service.

---

## 4. Required Production Environment Variables

Configure these in Render Dashboard ➔ **Environment**:

| Variable | Recommended / Example Value | Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production security & optimizations |
| `PORT` | `5000` (or `10000`) | Listening port |
| `DATABASE_URL` | `postgresql://user:pass@host/db?sslmode=require` | **Required**: Remote PostgreSQL connection |
| `JWT_SECRET` | *(64-char random string)* | Cryptographic signing key |
| `ADMIN_EMAIL` | `vishalkumar75912@gmail.com` | Master admin email |
| `ADMIN_PASSWORD` | *(Your secure password)* | Master admin initial password |
| `CLIENT_ORIGIN` | `https://hirebyminutes.onrender.com` | CORS origin protection |
| `STORAGE_PROVIDER` | `s3` (or `r2`) | External object storage type |
| `STORAGE_BUCKET` | `hirebyminutes-uploads` | S3 / R2 bucket name |
| `STORAGE_ACCESS_KEY`| *(Your Access Key ID)* | Object storage access key |
| `STORAGE_SECRET_KEY`| *(Your Secret Access Key)* | Object storage secret key |
| `STORAGE_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` | Custom endpoint for R2/Supabase |
| `STORAGE_PUBLIC_URL`| `https://pub-<id>.r2.dev` | Public URL prefix for uploaded files |
| `RAZORPAY_KEY_ID` | `rzp_live_xxxxxxxxxxxxxxxx` | Live Razorpay Key ID |
| `RAZORPAY_KEY_SECRET`| *(Your Razorpay Secret Key)* | Live Razorpay Secret |
| `EMAIL_ENABLED` | `true` | Enables transactional email |
| `EMAIL_PROVIDER` | `resend` | HTTPS API email provider |
| `RESEND_API_KEY` | `re_123456789_abcdef...` | Resend API key |
| `EMAIL_FROM` | `HireByMinutes <no-reply@yourdomain.com>` | Verified sender domain |

---

## 5. Health Monitoring & External Keep-Alive Setup

Render Free Web Services spin down after 15 minutes of inbound inactivity. To keep the service responsive:

1. Create a free account at [UptimeRobot](https://uptimerobot.com/).
2. Click **Add New Monitor**:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `HireByMinutes Production API`
   - **URL:** `https://your-service.onrender.com/api/health`
   - **Monitoring Interval:** `5 minutes`
3. Save the monitor.
4. **Behavior**:
   - UptimeRobot will ping `GET /api/health` every 5 minutes.
   - Endpoint returns HTTP `200 OK` with `{ status: "healthy", database: "connected" }`.
   - If the database is disconnected or unreachable, the endpoint returns HTTP `503 Service Unavailable`.
   - UptimeRobot alerts you immediately if the service goes down.

---

## 6. Cold Start & Restart Tolerant Design

- The frontend (`api.ts`) contains built-in bounded retries for transient 502/503 responses during container wakeups.
- Timers in `TimerEngine` store timestamps in ISO 8601 strings and dynamically calculate elapsed minutes based on `Date.now() - session.actual_start`, making session tracking resilient to container restarts.
- Session states are persisted in PostgreSQL, ensuring zero data loss across container lifecycle events.
