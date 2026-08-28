// HireByMinutes — SQLite to PostgreSQL Data Migration Script
// Deterministically migrates all rows from local SQLite database into remote PostgreSQL instance

const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

async function migrateData() {
  const sqliteDbPath = path.join(__dirname, '..', 'hirebyminutes.db');
  if (!fs.existsSync(sqliteDbPath)) {
    console.error(`[Error] SQLite database not found at ${sqliteDbPath}`);
    process.exit(1);
  }

  const postgresUrl = process.env.DATABASE_URL;
  if (!postgresUrl || (!postgresUrl.startsWith('postgres://') && !postgresUrl.startsWith('postgresql://'))) {
    console.error('[Error] Valid PostgreSQL DATABASE_URL required in .env');
    process.exit(1);
  }

  console.log(`[Migration] Reading from SQLite: ${sqliteDbPath}`);
  console.log(`[Migration] Target PostgreSQL: ${postgresUrl.split('@')[1] || postgresUrl}`);

  const sqlite = new Database(sqliteDbPath, { readonly: true });
  const pool = new Pool({
    connectionString: postgresUrl,
    ssl: postgresUrl.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const pg = await pool.connect();

  const tables = [
    'categories',
    'users',
    'services',
    'provider_availability',
    'consultation_requests',
    'bookings',
    'sessions',
    'messages',
    'reviews',
    'payments',
    'opportunities',
    'applications',
    'notifications',
    'audit_logs',
    'reports',
    'platform_settings',
    'email_verification_tokens',
    'password_reset_tokens',
    'email_logs',
    'profile_visits'
  ];

  try {
    await pg.query('BEGIN');

    for (const table of tables) {
      // Check if table exists in SQLite
      const tableExists = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (!tableExists) continue;

      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      if (rows.length === 0) continue;

      console.log(`[Migration] Migrating ${rows.length} rows for table "${table}"...`);

      const columns = Object.keys(rows[0]);
      const colNames = columns.join(', ');
      const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');

      const insertSql = `
        INSERT INTO ${table} (${colNames})
        VALUES (${placeholders})
        ON CONFLICT DO NOTHING
      `;

      for (const row of rows) {
        const values = columns.map(col => row[col]);
        await pg.query(insertSql, values);
      }
    }

    await pg.query('COMMIT');
    console.log('✅ [Migration] All SQLite data migrated to PostgreSQL successfully!');
  } catch (err) {
    await pg.query('ROLLBACK');
    console.error('❌ [Migration] Error migrating data:', err.message);
    process.exit(1);
  } finally {
    sqlite.close();
    pg.release();
    await pool.end();
  }
}

if (require.main === module) {
  migrateData().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { migrateData };
