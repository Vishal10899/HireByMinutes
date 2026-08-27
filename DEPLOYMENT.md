# HireByMinutes — Production & Render Deployment Guide

**Product Version:** v2.4 (Production Release)  
**Lead Designer & Developer:** Vishal Chaudhary  
**Last Updated:** August 28, 2026  

---

## 1. Quick Deploy on Render (Recommended)

HireByMinutes is fully configured for **1-Click Render Blueprint Deployment** using [`render.yaml`](file:///D:/Hirebyminutes/render.yaml).

### Option A: 1-Click Blueprint Deploy (Single Web Service with Persistent Disk)
1. Push your repository to GitHub / GitLab.
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** → **Blueprint**.
3. Connect your repository. Render will automatically parse `render.yaml` and configure:
   * **Node.js Web Service** (compiles React frontend + starts Express backend).
   * **Persistent Disk (`/var/data`, 10GB)** (persists SQLite database `hirebyminutes.db` & uploads).
   * **Health Check Path** (`/api/health`).
4. Set your production secrets in the Render Environment Variables tab:
   * `ADMIN_PASSWORD`: Your chosen strong master admin password.
   * `JWT_SECRET`: Random 64-character secret key.
   * `EMAIL_API_KEY`: API key for Resend or SendGrid (optional in dev, required for live transactional emails).

---

## 2. Manual Render Web Service Setup

If you prefer setting up manually without a Blueprint:

| Setting | Value |
| :--- | :--- |
| **Service Type** | **Web Service** |
| **Environment** | `Node` |
| **Region** | Any (e.g. `Oregon (US West)` or `Frankfurt (EU)`) |
| **Branch** | `main` |
| **Build Command** | `npm install && npm --prefix client install && npm run build` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/api/health` |
| **Auto-Deploy** | `Yes` |

### Adding Persistent Disk on Render:
1. Under your Web Service settings, scroll to **Disks** → click **Add Disk**.
2. **Name**: `hirebyminutes-data`
3. **Mount Path**: `/var/data`
4. **Size**: `10 GB` (or larger based on expected consultation file uploads)
5. Add Environment Variables:
   * `DATABASE_PATH`: `/var/data/hirebyminutes.db`
   * `UPLOADS_PATH`: `/var/data/uploads`

---

## 3. Production Environment Variables Reference

| Variable | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Enables production security, strips dev origins, disables test fixtures. |
| `PORT` | Yes | `5000` | Server listening port (Render automatically provides `PORT=10000`). |
| `CLIENT_ORIGIN` | Optional | `https://hirebyminutes.onrender.com` | Allowed frontend origin for CORS (defaults to same-origin in single service). |
| `ALLOWED_ORIGINS` | Optional | `https://hirebyminutes.com,https://www.hirebyminutes.com` | Comma-separated list of additional allowed CORS domains. |
| `DATABASE_PATH` | Recommended | `/var/data/hirebyminutes.db` | Absolute path to SQLite database on persistent disk. |
| `UPLOADS_PATH` | Recommended | `/var/data/uploads` | Directory for avatar photos and consultation attachments. |
| `JWT_SECRET` | Yes | `7b612c0985f1...` (64 hex chars) | Secret key for signing session tokens and password reset hashes. |
| `ADMIN_EMAIL` | Yes | `vishalkumar75912@gmail.com` | Master administrative user email. |
| `ADMIN_PASSWORD` | Yes | `1Agust@1999` (Use strong secret) | Master administrative user password. |
| `PLATFORM_NAME` | No | `HireByMinutes` | Brand name displayed across receipts and emails. |
| `LISTING_FEE_USD` | No | `2.00` | One-time service listing catalog activation fee. |
| `PLATFORM_FEE_PERCENT` | No | `15` | Percentage commission on completed consultation sessions (85% to provider). |
| `EMAIL_ENABLED` | No | `true` | Enables transactional email notifications. |
| `EMAIL_PROVIDER` | No | `resend` (or `sendgrid` / `smtp` / `development_console`) | Email delivery provider adapter. |
| `EMAIL_API_KEY` | Optional | `re_...` | API key for Resend or SendGrid. |
| `EMAIL_FROM` | No | `HireByMinutes <no-reply@hirebyminutes.com>` | Sender identity. |
| `EMAIL_REPLY_TO` | No | `support@hirebyminutes.com` | Reply-to address for user inquiries. |

---

## 4. External Health Monitoring Setup

HireByMinutes provides a high-throughput, low-latency health monitoring endpoint supporting both **GET** and **HEAD** requests:

* **Primary Endpoint**: `https://your-app.onrender.com/api/health`
* **Alternative Root Endpoint**: `https://your-app.onrender.com/health`

### Expected HTTP 200 OK Response Payload:
```json
{
  "status": "healthy",
  "platform": "HireByMinutes",
  "version": "2.4.0",
  "environment": "production",
  "database": "connected",
  "uptimeSeconds": 8420,
  "timestamp": "2026-08-28T05:00:00.000Z",
  "memory": {
    "rssMb": 48,
    "heapUsedMb": 24,
    "heapTotalMb": 32
  }
}
```

### Configuring External Monitors:

#### 1. UptimeRobot (Free / 5-min intervals)
* **Monitor Type**: `HTTP(s)`
* **Friendly Name**: `HireByMinutes Production Health`
* **URL (or IP)**: `https://your-app.onrender.com/api/health`
* **Monitoring Interval**: `5 minutes`
* **HTTP Method**: `HEAD` (or `GET`)
* **Expected Status**: `200`

#### 2. BetterStack (Better Uptime)
* **URL to monitor**: `https://your-app.onrender.com/api/health`
* **Check frequency**: `3 minutes`
* **Keyword to look for**: `"status":"healthy"`

#### 3. Render Built-in Health Checks
* In your Web Service dashboard → **Settings** → **Health Check Path** → Set to `/api/health`.
* Render automatically pings this endpoint before shifting live traffic during zero-downtime deploys.

---

## 5. Reverse Proxy & Standalone VPS Deployment (Alternative to Render)

If deploying to a self-hosted Ubuntu/Debian VPS with Nginx and PM2:

```bash
# 1. Clone and install
git clone https://github.com/your-org/hirebyminutes.git /var/www/hirebyminutes
cd /var/www/hirebyminutes
npm install --omit=dev
npm --prefix client install
npm --prefix client run build

# 2. Start daemon with PM2
npm install -g pm2
pm2 start server/index.js --name "hirebyminutes"
pm2 save
pm2 startup
```

---

## 6. Live Verification & Smoke Testing Checklist

After deployment to Render or your production server:
1. Verify `/api/health` returns `200 OK` and `"database": "connected"`.
2. Open `https://yourdomain.com/` in a browser. Confirm layout renders cleanly with Alice Blue background and Deep Midnight typography.
3. Browse `https://yourdomain.com/services` and test language/country/skill filters.
4. Log in as Administrator at `https://yourdomain.com/auth` and verify access to `https://yourdomain.com/admin`.
5. Verify public legal routes: `/about`, `/how-it-works`, `/terms`, `/privacy`, `/refund-policy`, `/expert-policy`, `/acceptable-use`, `/contact`.
