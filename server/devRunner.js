// =============================================================================
// HireByMinutes — Intelligent Development Server Runner
// Avoids EADDRINUSE port conflicts during 'npm run dev'
// If an existing HireByMinutes backend is already active on port 5000,
// it reuses it smoothly without crashing concurrently.
// If port 5000 is free, it launches the Express backend in-process.
// =============================================================================

const http = require('http');
const net = require('net');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PORT = parseInt(process.env.PORT, 10) || 5000;

function checkPortInUse(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true); // Port is occupied
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false); // Port is free
    });
    socket.connect(port, '127.0.0.1');
  });
}

function checkHireByMinutesHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (res.statusCode === 200 && data.platform === 'HireByMinutes') {
            resolve(true);
          } else {
            resolve(false);
          }
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const isPortBusy = await checkPortInUse(PORT);

  if (isPortBusy) {
    const isHireByMinutes = await checkHireByMinutesHealth(PORT);
    if (isHireByMinutes) {
      console.log(`\n======================================================================`);
      console.log(`✅ [HireByMinutes Dev] Backend is already running on http://localhost:${PORT}`);
      console.log(`   Reusing existing server instance (health check verified).`);
      console.log(`   Vite frontend (5173) will connect to this backend via proxy.`);
      console.log(`======================================================================\n`);

      // Keep this sub-process alive so concurrently does not terminate dev:client
      const keepAlive = setInterval(() => {}, 60000);
      const cleanExit = () => {
        clearInterval(keepAlive);
        process.exit(0);
      };
      process.on('SIGINT', cleanExit);
      process.on('SIGTERM', cleanExit);
      return;
    } else {
      console.error(`\n❌ [HireByMinutes Dev] Port Conflict: Port ${PORT} is occupied by another application.`);
      console.error(`   The process listening on port ${PORT} is not a healthy HireByMinutes server.`);
      console.error(`   Troubleshooting & Resolution:`);
      console.error(`   1. Terminate the conflicting application on port ${PORT}`);
      console.error(`   2. Or start on another port: PORT=5001 npm run dev\n`);
      process.exit(1);
    }
  }

  // Port is completely free: boot up the backend server directly
  console.log(`[HireByMinutes Dev] Port ${PORT} is free. Starting backend server...`);
  require('./index.js');
}

main().catch((err) => {
  console.error('[HireByMinutes Dev] Startup failure:', err);
  process.exit(1);
});
