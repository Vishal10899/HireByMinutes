// HireByMinutes — PostgreSQL Worker Thread
// Handles persistent connection pooling and executes queries synchronously for the main thread

const { parentPort, workerData } = require('worker_threads');
const { Pool } = require('pg');

const connectionString = workerData.connectionString;
const sab = workerData.sab;
const int32 = new Int32Array(sab, 0, 4);
const uint8 = new Uint8Array(sab, 16);

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const { normalizeRow, translateSql } = require('./pgUtils');

async function handleMessage(msg) {
  const { type, sql, params } = msg;

  if (type === 'ping') {
    const res = await pool.query('SELECT 1 as alive');
    return { alive: res.rows[0]?.alive === 1 };
  }

  if (type === 'exec') {
    await pool.query(sql);
    return { success: true };
  }

  const { translated, isPragma } = translateSql(sql);

  if (isPragma) {
    if (type === 'get') return {};
    if (type === 'all') return [];
    return { changes: 0 };
  }

  // Flatten parameters if nested array passed
  const flatParams = Array.isArray(params) ? params : [];

  const res = await pool.query(translated, flatParams);

  if (type === 'get') {
    const row = res.rows[0];
    return row ? normalizeRow(row) : undefined;
  }

  if (type === 'all') {
    return res.rows.map(normalizeRow);
  }

  if (type === 'run') {
    return {
      changes: res.rowCount || 0,
      lastInsertRowid: 0
    };
  }

  throw new Error(`Unknown query type: ${type}`);
}

parentPort.on('message', async (msg) => {
  try {
    const result = await handleMessage(msg);
    const payload = JSON.stringify({ data: result });
    const encoded = new TextEncoder().encode(payload);

    if (encoded.length > uint8.length) {
      throw new Error(`Query result size (${encoded.length} bytes) exceeds shared buffer limit.`);
    }

    uint8.set(encoded, 0);
    int32[1] = encoded.length;
    int32[0] = 1; // STATUS_OK
    Atomics.notify(int32, 0, 1);
  } catch (err) {
    const payload = JSON.stringify({ error: err.message });
    const encoded = new TextEncoder().encode(payload);
    uint8.set(encoded, 0);
    int32[1] = encoded.length;
    int32[0] = 2; // STATUS_ERROR
    Atomics.notify(int32, 0, 1);
  }
});
