// HireByMinutes — SQLite to PostgreSQL Data Migration Script
// Deterministically and safely migrates real rows from local SQLite database into PostgreSQL instance
// Preserves existing production records with ON CONFLICT DO NOTHING and filters synthetic test accounts

const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const fakeUserIds = new Set(['usr-arjun', 'usr-elena', 'usr-marcus', 'usr-priya', 'usr-david', 'usr-sarah', 'usr-admin']);

function isSyntheticTestUser(user) {
  if (!user) return true;
  if (fakeUserIds.has(user.id)) return true;
  const email = (user.email || '').toLowerCase();
  const id = (user.id || '').toLowerCase();
  if (email.includes('@test.local') || email.includes('@example.com') || email.includes('@hardened.test') || email.includes('@t.local')) return true;
  if (email.includes('client_tester_') || email.includes('client_179') || id.startsWith('client-test-') || id.startsWith('test-client-')) return true;
  return false;
}

async function migrateData(customPool = null) {
  const sqliteDbPath = path.join(__dirname, '..', 'hirebyminutes.db');
  if (!fs.existsSync(sqliteDbPath)) {
    console.error(`[Error] SQLite database not found at ${sqliteDbPath}`);
    process.exit(1);
  }

  let pool = customPool;
  let shouldClosePool = false;

  if (!pool) {
    const postgresUrl = process.env.DATABASE_URL;
    if (!postgresUrl || (!postgresUrl.startsWith('postgres://') && !postgresUrl.startsWith('postgresql://'))) {
      console.error('[Error] Valid PostgreSQL DATABASE_URL required in .env or environment');
      process.exit(1);
    }
    const sanitizedHost = postgresUrl.split('@')[1] ? postgresUrl.split('@')[1].split('/')[0] : 'remote-postgres';
    console.log(`[Migration] Reading from SQLite: ${sqliteDbPath}`);
    console.log(`[Migration] Target PostgreSQL host: ${sanitizedHost}`);

    pool = new Pool({
      connectionString: postgresUrl,
      ssl: postgresUrl.includes('localhost') || postgresUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
    });
    shouldClosePool = true;
  }

  const sqlite = new Database(sqliteDbPath, { readonly: true });
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
    'platform_settings',
    'cms_pages',
    'faqs',
    'registration_campaigns',
    'verification_requests'
  ];

  try {
    // 1. Audit and filter users
    const rawUsers = sqlite.prepare('SELECT * FROM users').all();
    const eligibleUsers = rawUsers.filter(u => !isSyntheticTestUser(u));
    const validUserIds = new Set(eligibleUsers.map(u => u.id));

    console.log(`[Audit] Total SQLite users: ${rawUsers.length}, synthetic test excluded: ${rawUsers.length - eligibleUsers.length}, eligible real: ${eligibleUsers.length}`);

    await pg.query('BEGIN');

    for (const table of tables) {
      const tableExists = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (!tableExists) continue;

      let rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      if (rows.length === 0) continue;

      // Filter rows based on referential integrity to legitimate users
      if (table === 'users') {
        rows = eligibleUsers;
      } else if (table === 'services') {
        rows = rows.filter(r => validUserIds.has(r.provider_id));
      } else if (table === 'provider_availability') {
        rows = rows.filter(r => validUserIds.has(r.provider_id));
      } else if (table === 'opportunities') {
        rows = rows.filter(r => validUserIds.has(r.creator_id) && !['opp-1', 'opp-2', 'opp-3'].includes(r.id));
      } else if (table === 'bookings') {
        rows = rows.filter(r => validUserIds.has(r.client_id) && validUserIds.has(r.provider_id));
      } else if (table === 'sessions') {
        rows = rows.filter(r => validUserIds.has(r.client_id) && validUserIds.has(r.provider_id));
      } else if (table === 'reviews') {
        rows = rows.filter(r => validUserIds.has(r.client_id) && validUserIds.has(r.provider_id));
      } else if (table === 'payments') {
        rows = rows.filter(r => validUserIds.has(r.user_id));
      } else if (table === 'notifications') {
        rows = rows.filter(r => validUserIds.has(r.user_id));
      } else if (table === 'verification_requests') {
        rows = rows.filter(r => validUserIds.has(r.provider_id));
      }

      if (rows.length === 0) continue;

      // Get target columns in PostgreSQL to ensure matching columns only
      const targetColsRes = await pg.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [table]);
      const targetCols = new Set(targetColsRes.rows.map(r => r.column_name));

      const sourceCols = Object.keys(rows[0]);
      const validCols = sourceCols.filter(c => targetCols.has(c));
      const colNames = validCols.join(', ');
      const placeholders = validCols.map((_, idx) => `$${idx + 1}`).join(', ');

      const insertSql = `
        INSERT INTO ${table} (${colNames})
        VALUES (${placeholders})
        ON CONFLICT DO NOTHING
      `;

      let insertedCount = 0;
      for (const row of rows) {
        const values = validCols.map(col => row[col]);
        const res = await pg.query(insertSql, values);
        if (res.rowCount > 0) insertedCount++;
      }

      console.log(`[Migration] Table "${table}": migrated ${insertedCount} new rows (of ${rows.length} eligible).`);
    }

    // Recalculate category service counts to accurately reflect all active published services
    await pg.query(`
      UPDATE categories 
      SET service_count = (
        SELECT COUNT(*) FROM services 
        WHERE services.category_id = categories.id AND LOWER(services.listing_status) IN ('active', 'published')
      )
    `);

    await pg.query('COMMIT');
    console.log('✅ [Migration] All SQLite real data migrated to PostgreSQL successfully!');
  } catch (err) {
    await pg.query('ROLLBACK');
    console.error('❌ [Migration] Error migrating data:', err.message);
    throw err;
  } finally {
    sqlite.close();
    pg.release();
    if (shouldClosePool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  migrateData().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { migrateData };
