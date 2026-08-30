// HireByMinutes — PostgreSQL Synchronous Database Driver Adapter
// Emulates the better-sqlite3 prepared statement interface on top of worker_threads & pg.Pool

const { Worker } = require('worker_threads');
const path = require('path');

function createPostgresDb(connectionString) {
  // Allocate 16MB shared memory buffer for synchronous IPC between main thread and PG worker
  const sab = new SharedArrayBuffer(1024 * 1024 * 16);
  const int32 = new Int32Array(sab, 0, 4);
  const uint8 = new Uint8Array(sab, 16);
  const textDecoder = new TextDecoder();

  const workerPath = path.join(__dirname, 'pgWorker.js');
  const worker = new Worker(workerPath, {
    workerData: {
      connectionString,
      sab
    }
  });

  function sendSync(type, sql = '', params = []) {
    int32[0] = 0; // RESET STATUS_WAITING
    worker.postMessage({ type, sql, params });

    // Synchronously block main thread until worker finishes and notifies
    Atomics.wait(int32, 0, 0);

    const status = int32[0];
    const len = int32[1];
    const jsonStr = textDecoder.decode(uint8.subarray(0, len));
    const response = JSON.parse(jsonStr);

    if (status === 2 || response.error) {
      throw new Error(response.error || 'PostgreSQL database error');
    }

    return response.data;
  }

  // Test connection immediately
  try {
    sendSync('ping');
    console.log('✅ [PostgreSQL Driver] Synchronous PostgreSQL driver connected successfully.');
  } catch (err) {
    console.error('❌ [PostgreSQL Driver Connection Error]', err.message);
    throw err;
  }

  return {
    isPostgres: true,

    prepare(sql) {
      return {
        get(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return sendSync('get', sql, flatParams);
        },
        all(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return sendSync('all', sql, flatParams);
        },
        run(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return sendSync('run', sql, flatParams);
        }
      };
    },

    exec(sql) {
      return sendSync('exec', sql);
    },

    pragma(str) {
      // Pragmas are SQLite specific; no-op in PostgreSQL
      return {};
    },

    close() {
      worker.terminate();
    }
  };
}

module.exports = { createPostgresDb };
