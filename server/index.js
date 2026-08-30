const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const TimerEngine = require('./timerEngine');
const createRoutes = require('./routes');
const db = require('./db');

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

app.use(express.json({ limit: '10mb' }));

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
// Compatible with Render Health Checks, UptimeRobot, BetterStack, Pingdom, HEAD/GET
// =============================================================================
const handleHealthCheck = (req, res) => {
  try {
    // Perform active SQLite database connectivity verification
    const dbProbe = db.prepare('SELECT 1 as alive').get();
    const isDbAlive = Boolean(dbProbe && dbProbe.alive === 1);

    if (!isDbAlive) {
      return res.status(503).json({
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString()
      });
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
  } catch (err) {
    console.error('[Health Check Failure]', err.message);
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString()
    });
  }
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

// SPA fallback for all client GET routes (excluding /api, /uploads, /socket.io)
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Real-time WebSocket connection handling
io.on('connection', (socket) => {
  // Join user room for personal notifications
  socket.on('join_user', (userId) => {
    if (userId) {
      socket.join(`user_${userId}`);
    }
  });

  // Join live session room
  socket.on('join_session', ({ sessionId, userId, userName }) => {
    if (!sessionId) return;
    const room = `session_${sessionId}`;
    socket.join(room);

    // Notify other participant that a user joined the session
    socket.to(room).emit('user_joined_session', {
      userId,
      userName,
      timestamp: new Date().toISOString()
    });

    // Send immediate session status to joining user
    const details = timerEngine.getSessionDetails(sessionId);
    if (details) {
      socket.emit('session_state_sync', details);
    }
  });

  // Leave live session room
  socket.on('leave_session', ({ sessionId, userId }) => {
    if (!sessionId) return;
    const room = `session_${sessionId}`;
    socket.leave(room);
    socket.to(room).emit('user_left_session', { userId });
  });

  // WebRTC Audio/Video Signaling during active session
  socket.on('webrtc_offer', ({ sessionId, offer, senderId }) => {
    if (!timerEngine.isCommunicationAllowed(sessionId, senderId)) return;
    socket.to(`session_${sessionId}`).emit('webrtc_offer', { offer, senderId });
  });

  socket.on('webrtc_answer', ({ sessionId, answer, senderId }) => {
    if (!timerEngine.isCommunicationAllowed(sessionId, senderId)) return;
    socket.to(`session_${sessionId}`).emit('webrtc_answer', { answer, senderId });
  });

  socket.on('webrtc_ice_candidate', ({ sessionId, candidate, senderId }) => {
    if (!timerEngine.isCommunicationAllowed(sessionId, senderId)) return;
    socket.to(`session_${sessionId}`).emit('webrtc_ice_candidate', { candidate, senderId });
  });

  // Call status toggles (audio on/off, video on/off, screen sharing)
  socket.on('call_media_state', ({ sessionId, senderId, audio, video, screenSharing }) => {
    if (!timerEngine.isCommunicationAllowed(sessionId, senderId)) return;
    socket.to(`session_${sessionId}`).emit('call_media_state', { senderId, audio, video, screenSharing });
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

const gracefulShutdown = (signal) => {
  console.log(`[HireByMinutes Server] Received ${signal}. Starting graceful shutdown...`);
  timerEngine.stop();
  server.close(() => {
    console.log('[HireByMinutes Server] HTTP and WebSocket server closed.');
    try {
      db.close();
      console.log('[HireByMinutes Server] SQLite database connection closed.');
    } catch (e) {
      console.error('[HireByMinutes Server] Error closing database:', e.message);
    }
    process.exit(0);
  });

  // Force exit after 10 seconds if hanging
  setTimeout(() => {
    console.error('[HireByMinutes Server] Forcing exit after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const PORT = parseInt(process.env.PORT, 10) || 5000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`[HireByMinutes Server] Listening on ${HOST}:${PORT} (NODE_ENV: ${process.env.NODE_ENV || 'development'})`);
});

module.exports = { app, server };
