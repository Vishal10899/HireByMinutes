# HireByMinutes — External Uptime Monitoring Guide

This document outlines how to set up an **external** uptime monitor for HireByMinutes when deployed on the Render Free web service tier.

---

## 1. Important Operating Context (Render Free Tier)

- **Render Free Web Service Lifecycle**: On Render's Free tier, instances spin down (sleep) after 15 minutes of inbound HTTP inactivity. When a new incoming request arrives, Render spins up the container, causing a temporary cold start (typically 15–40 seconds).
- **No Internal Keep-Alives**: The application **does not** contain self-ping loops, cron jobs, background workers, or continuous polling tasks to keep itself awake. Self-ping loops are fragile, breach cloud provider fair-use patterns, and can cause restart loops or unexpected resource starvation.
- **Render Free Pool**: Render provides 750 free instance hours per calendar month across all free services on an account. An external monitor helps keep the service warm during expected peak hours, but Render Free should **not** be considered permanently 100% always-on. For mission-critical 24/7 zero-spin-down operation without reliance on external monitors, upgrading to Render's Starter tier ($7/month) is the official solution.

---

## 2. Recommended External Health Check URL

Configure your external monitoring provider to periodically request the lightweight health endpoint:

```
https://hirebyminute.com/health
```

*(Alternative valid path: `https://hirebyminute.com/api/health`)*

### Endpoint Properties
- **Method**: `GET` or `HEAD`
- **Response**: HTTP `200 OK`
- **Authentication**: None (publicly accessible, safe)
- **Database Overhead**: Zero synchronous database queries on basic health probes. Returns in `< 1ms`.
- **External Dependencies**: Zero third-party API dependencies (no Razorpay, Resend, or S3 calls).
- **Payload**: Tiny JSON payload (< 300 bytes) containing status, uptime, version, and memory statistics.

---

## 3. Recommended External Monitoring Services

You can use any standard free external HTTP monitor:

| Service | Free Tier Allowance | Recommended Frequency |
| :--- | :--- | :--- |
| [UptimeRobot](https://uptimerobot.com) | Up to 50 monitors, 5-min intervals | Every 5 to 10 minutes |
| [BetterStack](https://betterstack.com) | 10 monitors, 3-min intervals | Every 5 to 10 minutes |
| [Cron-Job.org](https://cron-job.org) | Unlimited jobs, custom intervals | Every 10 minutes |
| [Pingdom](https://www.pingdom.com) | Standard HTTP probes | Every 5 to 10 minutes |

---

## 4. Setting Up UptimeRobot (Step-by-Step)

1. Sign in to your account at [UptimeRobot](https://uptimerobot.com).
2. Click **+ Add New Monitor**.
3. Fill in the monitor details:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `HireByMinutes Production Health`
   - **URL (or IP)**: `https://hirebyminute.com/health`
   - **Monitoring Interval**: `5 minutes` (or `10 minutes`)
   - **Monitor Timeout**: `30 seconds` (to accommodate cold-start latency if waking from sleep)
   - **HTTP Method**: `HEAD` (lightest) or `GET`
4. Click **Create Monitor**.

---

## 5. Expected Response

### Successful Health Probe (HTTP 200 OK)
```json
{
  "status": "healthy",
  "platform": "HireByMinutes",
  "version": "2.4.0",
  "environment": "production",
  "database": "connected",
  "uptimeSeconds": 1420,
  "timestamp": "2026-09-11T19:00:00.000Z",
  "memory": {
    "rssMb": 48,
    "heapUsedMb": 24,
    "heapTotalMb": 32
  }
}
```

### Deep Database Connectivity Probe (Optional Diagnostic)
If you wish to actively test the live database connection (e.g. Neon PostgreSQL roundtrip) in an internal test harness, append `?deep=1`:
```
https://hirebyminute.com/health?deep=1
```
