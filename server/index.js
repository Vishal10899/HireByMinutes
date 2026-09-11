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
    platform: 'HireByMinutes',
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
// PRODUCTION CLIENT STATIC SERVING & SPA FALLBACK
// Enables 1-click single service deployment on Render Web Services
// =============================================================================
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  // SPA fallback for all client GET routes (excluding /health, /api, /uploads, /socket.io)
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
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

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
