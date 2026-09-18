const processStartTime = Date.now();
const processStartIso = new Date(processStartTime).toISOString();
const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const TimerEngine = require('./timerEngine');
const createRoutes = require('./routes');
const db = require('./db');

// Cold-Start & Restart Observability Tracking (Safe, zero-credential tracking)
let isRestart = false;
const restartMarkerFile = path.join(os.tmpdir(), 'hirebyminutes-boot.marker');

try {
  if (fs.existsSync(restartMarkerFile)) {
    isRestart = true;
  }
  fs.writeFileSync(restartMarkerFile, processStartIso);
} catch (e) {
  // Ignore filesystem permission errors in restricted environments
}

try {
  const bootSetting = db.prepare("SELECT value FROM platform_settings WHERE key = 'last_server_boot'").get();
  if (bootSetting && bootSetting.value) {
    isRestart = true;
  }
  db.prepare(`
    INSERT OR REPLACE INTO platform_settings (key, value, description)
    VALUES ('last_server_boot', ?, 'Timestamp of the last server startup')
  `).run(processStartIso);
} catch (e) {
  // Database table might be initializing or under custom test harnesses
}

const app = express();
const server = http.createServer(app);

// Trust proxy for Render load balancers & reverse proxies (ensures accurate client IP detection)
app.set('trust proxy', 1);

// CORS configuration (Hardened for production security while preserving dev flexibility)
const isProduction = process.env.NODE_ENV === 'production';

const rawOrigins = [
  process.env.CLIENT_ORIGIN,
  process.env.ALLOWED_ORIGINS
].filter(Boolean).join(',');

const configuredOrigins = rawOrigins
  ? rawOrigins.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean)
  : [];

// Safe development defaults (strictly disabled in production)
const devDefaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
];

function isOriginAllowed(origin) {
  if (!origin) return true; // Allow non-browser, server-to-server, or mobile requests without Origin header
  const cleanOrigin = origin.replace(/\/$/, '');

  if (isProduction) {
    // IN PRODUCTION:
    // 1. If no custom origin configured, allow same-origin requests
    if (configuredOrigins.length === 0) return true;
    // 2. Otherwise ONLY allow explicitly configured origins in CLIENT_ORIGIN / ALLOWED_ORIGINS
    return configuredOrigins.includes(cleanOrigin);
  } else {
    // IN DEVELOPMENT:
    // Allow explicitly configured origins OR standard dev ports OR any localhost/127.0.0.1 port
    if (configuredOrigins.includes(cleanOrigin) || devDefaultOrigins.includes(cleanOrigin)) {
      return true;
    }
    const localhostRegex = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
    return localhostRegex.test(cleanOrigin);
  }
}

function validateOrigin(origin, callback) {
  if (isOriginAllowed(origin)) {
    callback(null, true);
  } else {
    callback(null, false);
  }
}

const corsOptions = {
  origin: validateOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// =============================================================================
// SEO & CANONICAL DOMAIN ENFORCEMENT
// =============================================================================
// Canonical Production Domain: 301 Permanent Redirect www.hirebyminute.com -> https://hirebyminute.com
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();
  if (host.startsWith('www.hirebyminute.com')) {
    const canonicalUrl = `https://hirebyminute.com${req.originalUrl}`;
    return res.redirect(301, canonicalUrl);
  }
  next();
});

// Search Indexing Protection: Set noindex on administrative panels, private dashboards, sessions, auth, and APIs
const PRIVATE_INDEXING_PREFIXES = [
  '/admin',
  '/client',
  '/provider',
  '/session',
  '/profile',
  '/auth',
  '/login',
  '/signup',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/api'
];

app.use((req, res, next) => {
  const isPrivate = PRIVATE_INDEXING_PREFIXES.some(prefix => req.path === prefix || req.path.startsWith(prefix + '/'));
  if (isPrivate) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  next();
});

// HTTP Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Lightweight In-Memory Rate Limiter for sensitive endpoints
const rateLimitMap = new Map();
function rateLimiter(limit = 60, windowMs = 60000) {
  const effectiveLimit = process.env.NODE_ENV === 'production' ? limit : Math.max(limit, 200);
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const record = rateLimitMap.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count++;
    }
    rateLimitMap.set(key, record);

    if (record.count > effectiveLimit) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment before trying again.' });
    }
    next();
  };
}

// Clean up stale rate limiter entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 300000);

app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Uploads directory setup (supports Render persistent disk path via UPLOADS_PATH)
const uploadsDir = process.env.UPLOADS_PATH
  ? path.resolve(process.env.UPLOADS_PATH)
  : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Socket.io initialization with CORS
const io = new Server(server, {
  cors: {
    origin: validateOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Initialize Timer Engine
const timerEngine = new TimerEngine(io);
timerEngine.start();

// Mount Routes with Rate Limiting on Auth/Creation endpoints
app.use('/api/auth/login', rateLimiter(20, 60000));
app.use('/api/auth/register', rateLimiter(15, 60000));
app.use('/api/bookings', rateLimiter(30, 60000));
app.use('/api/admin/change-password', rateLimiter(10, 60000));

app.use('/api', createRoutes(timerEngine, io));

// =============================================================================
// PRODUCTION HEALTH MONITORING ENDPOINTS (/api/health & /health)
// Extremely lightweight: returns HTTP 200 quickly without auth, no external APIs,
// and no expensive database queries on basic uptime probes.
// Compatible with Render Health Checks, UptimeRobot, BetterStack, Pingdom, HEAD/GET
// =============================================================================
const handleHealthCheck = (req, res) => {
  // Deep connectivity check only when explicitly requested (e.g., ?deep=1 or ?checkDb=true)
  if (req.query && (req.query.deep === '1' || req.query.checkDb === 'true')) {
    try {
      const dbProbe = db.prepare('SELECT 1 as alive').get();
      const isDbAlive = Boolean(dbProbe && (dbProbe.alive === 1 || dbProbe.alive === '1' || dbProbe.alive === true));
      if (!isDbAlive) {
        return res.status(503).json({
          status: 'unhealthy',
          database: 'disconnected',
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      return res.status(503).json({
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Lightweight check: verify db module is initialized without firing synchronous queries
  const isDbReady = Boolean(db);
  if (!isDbReady) {
    return res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString()
    });
  }

  // If HEAD request, respond 200 OK immediately without a body
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  const memoryUsage = process.memoryUsage();

  res.status(200).json({
    status: 'healthy',
    platform: 'HireByMinute',
    version: '2.4.0',
    environment: process.env.NODE_ENV || 'development',
    database: 'connected',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: {
      rssMb: Math.round(memoryUsage.rss / (1024 * 1024)),
      heapUsedMb: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(memoryUsage.heapTotal / (1024 * 1024))
    }
  });
};

app.get('/api/health', handleHealthCheck);
app.head('/api/health', handleHealthCheck);
app.get('/health', handleHealthCheck);
app.head('/health', handleHealthCheck);

// =============================================================================
// PRODUCTION SEARCH ENGINE OPTIMIZATION (SEO) & CRAWLER DIRECTIVES
// =============================================================================

// Dedicated robots.txt endpoint (strictly returns text/plain with crawler directives)
const handleRobotsTxt = (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  if (req.method === 'HEAD') return res.status(200).end();

  const robotsFilePath = path.join(__dirname, '..', 'client', 'public', 'robots.txt');
  if (fs.existsSync(robotsFilePath)) {
    return res.sendFile(robotsFilePath);
  }

  const fallbackRobots = [
    '# https://hirebyminute.com/robots.txt',
    'User-agent: *',
    'Allow: /',
    'Allow: /services',
    'Allow: /opportunities',
    'Allow: /about',
    'Allow: /how-it-works',
    'Allow: /contact',
    'Allow: /terms',
    'Allow: /privacy',
    'Allow: /refund-policy',
    'Allow: /expert-policy',
    'Allow: /acceptable-use',
    'Allow: /p/',
    'Allow: /sitemap.xml',
    'Allow: /favicon.svg',
    'Allow: /og-image.png',
    '',
    '# Disallow private dashboards, admin areas, sessions, and internal APIs',
    'Disallow: /admin',
    'Disallow: /admin/',
    'Disallow: /client',
    'Disallow: /client/',
    'Disallow: /provider',
    'Disallow: /provider/',
    'Disallow: /session/',
    'Disallow: /profile',
    'Disallow: /profile/',
    'Disallow: /auth',
    'Disallow: /login',
    'Disallow: /signup',
    'Disallow: /register',
    'Disallow: /forgot-password',
    'Disallow: /reset-password',
    'Disallow: /api/',
    '',
    'Sitemap: https://hirebyminute.com/sitemap.xml'
  ].join('\n');

  return res.send(fallbackRobots);
};

app.get('/robots.txt', handleRobotsTxt);
app.head('/robots.txt', handleRobotsTxt);

// Dedicated sitemap.xml endpoint (strictly returns application/xml with real indexable URLs)
const handleSitemapXml = (req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (req.method === 'HEAD') return res.status(200).end();

  // Core verified public indexable pages
  const coreUrls = [
    { loc: 'https://hirebyminute.com/', priority: '1.0', changefreq: 'daily' },
    { loc: 'https://hirebyminute.com/services', priority: '0.9', changefreq: 'daily' },
    { loc: 'https://hirebyminute.com/jobs', priority: '0.9', changefreq: 'daily' },
    { loc: 'https://hirebyminute.com/opportunities', priority: '0.8', changefreq: 'daily' },
    { loc: 'https://hirebyminute.com/how-it-works', priority: '0.8', changefreq: 'weekly' },
    { loc: 'https://hirebyminute.com/about', priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://hirebyminute.com/contact', priority: '0.7', changefreq: 'monthly' },
    { loc: 'https://hirebyminute.com/terms', priority: '0.5', changefreq: 'monthly' },
    { loc: 'https://hirebyminute.com/privacy', priority: '0.5', changefreq: 'monthly' },
    { loc: 'https://hirebyminute.com/refund-policy', priority: '0.5', changefreq: 'monthly' },
    { loc: 'https://hirebyminute.com/expert-policy', priority: '0.5', changefreq: 'monthly' },
    { loc: 'https://hirebyminute.com/acceptable-use', priority: '0.5', changefreq: 'monthly' }
  ];

  const dynamicUrls = [];
  try {
    if (db) {
      // Include active published services
      const activeServices = db.prepare("SELECT id, updated_at FROM services WHERE listing_status = 'active' LIMIT 500").all();
      if (Array.isArray(activeServices)) {
        for (const s of activeServices) {
          dynamicUrls.push({
            loc: `https://hirebyminute.com/services/${s.id}`,
            priority: '0.7',
            changefreq: 'weekly',
            lastmod: s.updated_at ? new Date(s.updated_at).toISOString().split('T')[0] : undefined
          });
        }
      }

      // Include active published jobs
      const publishedJobs = db.prepare("SELECT id, slug, updated_at FROM jobs WHERE status = 'published' AND (application_deadline IS NULL OR application_deadline >= CURRENT_TIMESTAMP) LIMIT 500").all();
      if (Array.isArray(publishedJobs)) {
        for (const j of publishedJobs) {
          dynamicUrls.push({
            loc: `https://hirebyminute.com/jobs/${j.slug || j.id}`,
            priority: '0.8',
            changefreq: 'daily',
            lastmod: j.updated_at ? new Date(j.updated_at).toISOString().split('T')[0] : undefined
          });
        }
      }

      // Include published custom CMS pages
      const publishedCms = db.prepare("SELECT slug, updated_at FROM cms_pages WHERE status = 'published' LIMIT 100").all();
      if (Array.isArray(publishedCms)) {
        const reservedSlugs = ['about', 'contact', 'terms', 'privacy', 'refund-policy', 'expert-policy', 'acceptable-use', 'faq'];
        for (const p of publishedCms) {
          if (!reservedSlugs.includes(p.slug)) {
            dynamicUrls.push({
              loc: `https://hirebyminute.com/p/${p.slug}`,
              priority: '0.6',
              changefreq: 'monthly',
              lastmod: p.updated_at ? new Date(p.updated_at).toISOString().split('T')[0] : undefined
            });
          }
        }
      }
    }
  } catch (err) {
    // Graceful fallback to coreUrls
  }

  const allUrls = [...coreUrls, ...dynamicUrls];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return res.send(xml);
};

app.get('/sitemap.xml', handleSitemapXml);
app.head('/sitemap.xml', handleSitemapXml);

// Google Search Console file verification route
app.get('/google:hash.html', (req, res, next) => {
  const hash = req.params.hash;
  if (/^[a-f0-9]+$/i.test(hash)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`google-site-verification: google${hash}.html`);
  }
  next();
});

// =============================================================================
// PRODUCTION CLIENT STATIC SERVING & SEO SPA FALLBACK
// Injects exact canonical URLs, title, description, and OpenGraph/Twitter tags
// into HTML for Googlebot, social crawlers, and first-paint browsers.
// =============================================================================
const PUBLIC_ROUTE_METADATA = {
  '/': {
    title: 'HireByMinute — Hire Experts by the Minute',
    description: 'Find the right expert and hire them by the minute. Get real-time help from skilled professionals and pay only for the time you need.',
    canonical: 'https://hirebyminute.com/'
  },
  '/services': {
    title: 'Browse Expert Services — HireByMinute',
    description: 'Discover vetted specialists across tech, design, marketing, and business. Pay only for the minutes you use.',
    canonical: 'https://hirebyminute.com/services'
  },
  '/opportunities': {
    title: 'Consultation Opportunities — HireByMinute',
    description: 'Browse active consultation requests and opportunities posted by clients seeking specialized expertise.',
    canonical: 'https://hirebyminute.com/opportunities'
  },
  '/how-it-works': {
    title: 'How It Works — HireByMinute',
    description: 'Learn how HireByMinute works. Book vetted professionals for precision consultations with real-time per-minute billing.',
    canonical: 'https://hirebyminute.com/how-it-works'
  },
  '/about': {
    title: 'About Us — HireByMinute',
    description: 'HireByMinute is the on-demand marketplace connecting individuals and teams with specialized experts for precision consultations.',
    canonical: 'https://hirebyminute.com/about'
  },
  '/contact': {
    title: 'Contact & Support — HireByMinute',
    description: 'Get in touch with the HireByMinute team for questions, assistance, or partnership inquiries.',
    canonical: 'https://hirebyminute.com/contact'
  },
  '/terms': {
    title: 'Terms of Service — HireByMinute',
    description: 'Read the Terms of Service governing your use of the HireByMinute consultation platform.',
    canonical: 'https://hirebyminute.com/terms'
  },
  '/privacy': {
    title: 'Privacy Policy — HireByMinute',
    description: 'Read the Privacy Policy to understand how HireByMinute collects, uses, and protects your data.',
    canonical: 'https://hirebyminute.com/privacy'
  },
  '/refund-policy': {
    title: 'Refund & Cancellation Policy — HireByMinute',
    description: 'Review our clear policies on refunds, session cancellations, and technical dispute mediation.',
    canonical: 'https://hirebyminute.com/refund-policy'
  },
  '/expert-policy': {
    title: 'Expert Quality Standards & Policy — HireByMinute',
    description: 'Quality standards, conduct requirements, and verification guidelines for verified experts on HireByMinute.',
    canonical: 'https://hirebyminute.com/expert-policy'
  },
  '/acceptable-use': {
    title: 'Acceptable Use Policy — HireByMinute',
    description: 'Platform rules and acceptable use guidelines for all users and service providers.',
    canonical: 'https://hirebyminute.com/acceptable-use'
  }
};

function renderSeoHtml(templateHtml, reqPath) {
  let html = templateHtml;
  const cleanPath = reqPath.split('?')[0].replace(/\/$/, '') || '/';
  let meta = PUBLIC_ROUTE_METADATA[cleanPath];

  // Dynamic route lookup for services: /services/:id
  if (!meta && cleanPath.startsWith('/services/')) {
    const serviceId = cleanPath.replace('/services/', '').trim();
    if (serviceId && db) {
      try {
        const s = db.prepare('SELECT title, description FROM services WHERE id = ?').get(serviceId);
        if (s) {
          meta = {
            title: `${s.title} — HireByMinute`,
            description: (s.description || '').replace(/[#*`_~]/g, '').slice(0, 160),
            canonical: `https://hirebyminute.com/services/${serviceId}`
          };
        }
      } catch (e) {
        // Fallback to default
      }
    }
  }

  // Dynamic route lookup for CMS pages: /p/:slug
  if (!meta && cleanPath.startsWith('/p/')) {
    const slug = cleanPath.replace('/p/', '').trim();
    if (slug && db) {
      try {
        const page = db.prepare("SELECT title, meta_title, meta_description FROM cms_pages WHERE slug = ? AND status = 'published'").get(slug);
        if (page) {
          meta = {
            title: page.meta_title || `${page.title} — HireByMinute`,
            description: page.meta_description || `Read ${page.title} on HireByMinute.`,
            canonical: `https://hirebyminute.com/p/${slug}`
          };
        }
      } catch (e) {
        // Fallback to default
      }
    }
  }

  if (meta) {
    html = html.replace(/<title>.*?<\/title>/i, `<title>${meta.title}</title>`);
    html = html.replace(/<meta\s+name="title"\s+content=".*?"\s*\/?>/i, `<meta name="title" content="${meta.title}" />`);
    html = html.replace(/<meta\s+name="description"\s+content=".*?"\s*\/?>/i, `<meta name="description" content="${meta.description}" />`);
    html = html.replace(/<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i, `<link rel="canonical" href="${meta.canonical}" />`);
    html = html.replace(/<meta\s+property="og:title"\s+content=".*?"\s*\/?>/i, `<meta property="og:title" content="${meta.title}" />`);
    html = html.replace(/<meta\s+property="og:description"\s+content=".*?"\s*\/?>/i, `<meta property="og:description" content="${meta.description}" />`);
    html = html.replace(/<meta\s+property="og:url"\s+content=".*?"\s*\/?>/i, `<meta property="og:url" content="${meta.canonical}" />`);
    html = html.replace(/<meta\s+name="twitter:title"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:title" content="${meta.title}" />`);
    html = html.replace(/<meta\s+name="twitter:description"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:description" content="${meta.description}" />`);
    html = html.replace(/<meta\s+name="twitter:url"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:url" content="${meta.canonical}" />`);
  }

  // Inject Google Site Verification code if present in environment
  const gscCode = process.env.GOOGLE_SITE_VERIFICATION;
  if (gscCode) {
    html = html.replace(/<meta\s+name="google-site-verification"\s+content=".*?"\s*\/?>/i, `<meta name="google-site-verification" content="${gscCode}" />`);
  }

  return html;
}

const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
const clientPublicPath = path.join(__dirname, '..', 'client', 'public');

// Serve static assets from client/dist (production build) and client/public
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath, {
    index: false,
    maxAge: isProduction ? '1y' : 0
  }));
}
if (fs.existsSync(clientPublicPath)) {
  app.use(express.static(clientPublicPath, {
    index: false,
    maxAge: isProduction ? '1d' : 0
  }));
}

// In-memory cache for index.html template
let cachedIndexHtml = null;
let lastIndexMtime = 0;

function getIndexTemplate() {
  const indexPath = path.join(clientDistPath, 'index.html');
  if (!fs.existsSync(indexPath)) return null;
  try {
    const stats = fs.statSync(indexPath);
    if (!cachedIndexHtml || stats.mtimeMs > lastIndexMtime) {
      cachedIndexHtml = fs.readFileSync(indexPath, 'utf8');
      lastIndexMtime = stats.mtimeMs;
    }
    return cachedIndexHtml;
  } catch (err) {
    return null;
  }
}

// SPA fallback for all client GET & HEAD routes (excluding /health, /api, /uploads, /socket.io)
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (
    req.path === '/health' ||
    req.path.startsWith('/health/') ||
    req.path.startsWith('/api') ||
    req.path.startsWith('/uploads') ||
    req.path.startsWith('/socket.io')
  ) {
    return next();
  }

  const template = getIndexTemplate();
  if (!template) {
    return res.status(404).send('Application build not found. Please run npm run build.');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  const rendered = renderSeoHtml(template, req.path);
  return res.status(200).send(rendered);
});

// Socket.io JWT authentication middleware
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-jwt-secret-hirebyminutes-key' : null);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || 
                (socket.handshake.headers?.authorization ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '') : null) ||
                socket.handshake.query?.token;

  if (!token) {
    return next(new Error('Authentication error: Token required'));
  }

  if (!JWT_SECRET) {
    return next(new Error('Server configuration error: JWT_SECRET missing'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || !decoded.id) {
      return next(new Error('Authentication error: Invalid token payload'));
    }

    const user = db.prepare('SELECT id, full_name, role, is_suspended FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return next(new Error('Authentication error: User account not found'));
    }
    if (user.is_suspended) {
      return next(new Error('Authentication error: User account is suspended'));
    }

    socket.user = user;
    next();
  } catch (err) {
    return next(new Error('Authentication error: Invalid or expired token'));
  }
});

// Real-time WebSocket connection handling
io.on('connection', (socket) => {
  // Automatically join the authenticated user's private room
  socket.join(`user_${socket.user.id}`);

  // Safe join_user: strictly joins authenticated user's own room, ignoring any spoofed userId
  socket.on('join_user', () => {
    socket.join(`user_${socket.user.id}`);
  });

  // Join live session room - strictly verified
  socket.on('join_session', ({ sessionId }) => {
    if (!sessionId) return;

    // Authorization check: Verify authenticated user is client, provider, or admin of this session
    const session = db.prepare('SELECT client_id, provider_id, status FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return;
    if (session.client_id !== socket.user.id && session.provider_id !== socket.user.id && socket.user.role !== 'admin') {
      return; // Unauthorized: Not a participant in this session
    }

    const room = `session_${sessionId}`;
    socket.join(room);

    // Notify other participant using server-verified authenticated identity
    socket.to(room).emit('user_joined_session', {
      userId: socket.user.id,
      userName: socket.user.full_name,
      timestamp: new Date().toISOString()
    });

    // Send immediate session status to joining user
    const details = timerEngine.getSessionDetails(sessionId);
    if (details) {
      socket.emit('session_state_sync', details);
    }
  });

  // Leave live session room
  socket.on('leave_session', ({ sessionId }) => {
    if (!sessionId) return;
    const room = `session_${sessionId}`;
    socket.leave(room);
    socket.to(room).emit('user_left_session', { userId: socket.user.id });
  });

  // WebRTC Audio/Video Signaling during active session
  socket.on('webrtc_offer', ({ sessionId, offer }) => {
    if (!timerEngine.isCommunicationAllowed(sessionId, socket.user.id)) return;
    socket.to(`session_${sessionId}`).emit('webrtc_offer', { offer, senderId: socket.user.id });
  });

  socket.on('webrtc_answer', ({ sessionId, answer }) => {
    if (!timerEngine.isCommunicationAllowed(sessionId, socket.user.id)) return;
    socket.to(`session_${sessionId}`).emit('webrtc_answer', { answer, senderId: socket.user.id });
  });

  socket.on('webrtc_ice_candidate', ({ sessionId, candidate }) => {
    if (!timerEngine.isCommunicationAllowed(sessionId, socket.user.id)) return;
    socket.to(`session_${sessionId}`).emit('webrtc_ice_candidate', { candidate, senderId: socket.user.id });
  });

  // Call status toggles (audio on/off, video on/off, screen sharing)
  socket.on('call_media_state', ({ sessionId, audio, video, screenSharing }) => {
    if (!timerEngine.isCommunicationAllowed(sessionId, socket.user.id)) return;
    socket.to(`session_${sessionId}`).emit('call_media_state', { 
      senderId: socket.user.id, 
      audio, 
      video, 
      screenSharing 
    });
  });

  socket.on('disconnect', () => {
    // Socket automatically leaves rooms
  });
});

// Graceful Process Lifecycle & Error Handling
process.on('uncaughtException', (err) => {
  console.error('[HireByMinutes Server] Uncaught Exception:', err.message, err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[HireByMinutes Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

let isShuttingDown = false;
const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[HireByMinutes Server] Received ${signal}. Starting graceful shutdown...`);

  // 1. Stop timer engine intervals (preserves database session records)
  try {
    timerEngine.stop();
  } catch (err) {
    console.error('[HireByMinutes Server] Error stopping TimerEngine:', err.message);
  }

  // 2. Cleanly close Socket.IO server
  try {
    io.close(() => {
      console.log('[HireByMinutes Server] Socket.IO connections closed cleanly.');
    });
  } catch (err) {
    console.error('[HireByMinutes Server] Error closing Socket.IO:', err.message);
  }

  // 3. Stop accepting new HTTP connections and close HTTP server
  server.close(() => {
    console.log('[HireByMinutes Server] HTTP server closed.');
    try {
      if (typeof db.close === 'function') {
        db.close();
        console.log('[HireByMinutes Server] Database connections closed cleanly.');
      }
    } catch (e) {
      console.error('[HireByMinutes Server] Error closing database:', e.message);
    }
    process.exit(0);
  });

  // Force exit after 10 seconds if hanging
  setTimeout(() => {
    console.error('[HireByMinutes Server] Forcing exit after timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const PORT = parseInt(process.env.PORT, 10) || 5000;
const HOST = '0.0.0.0';

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ [HireByMinutes Server] Port Conflict: Port ${PORT} is already in use.`);
    console.error(`   Another instance of HireByMinutes or another application is currently listening on port ${PORT}.`);
    console.error(`   Troubleshooting & Resolution:`);
    console.error(`   1. Terminate the existing process on port ${PORT}:`);
    console.error(`      - Windows (PowerShell): Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force`);
    console.error(`      - macOS / Linux:        kill -9 $(lsof -ti :${PORT})  [or disable AirPlay Receiver in macOS System Settings]`);
    console.error(`   2. Or start the server on another port:`);
    console.error(`      PORT=${PORT === 5000 ? 5001 : 5000} npm run dev\n`);
    process.exit(1);
  } else {
    console.error('[HireByMinutes Server] Server error:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, HOST, () => {
  const serverListenTime = Date.now();
  const serverListenIso = new Date(serverListenTime).toISOString();
  const startupDurationMs = serverListenTime - processStartTime;

  console.log(`[HireByMinutes Server] Listening on ${HOST}:${PORT} (NODE_ENV: ${process.env.NODE_ENV || 'development'})`);
  console.log(`[HireByMinutes Cold-Start Observability]`);
  console.log(`  - Process Startup: ${processStartIso}`);
  console.log(`  - Server Listening: ${serverListenIso}`);
  console.log(`  - Startup Duration: ${startupDurationMs}ms`);
  console.log(`  - Restart Detected: ${isRestart ? 'Yes (starting after container wake / restart)' : 'No (initial clean boot)'}`);
});

module.exports = { app, server };
