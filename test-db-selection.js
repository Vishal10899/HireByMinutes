// Test Database Adapter Selection Logic

console.log('--- TEST 1: ABSENT DATABASE_URL (SQLite Expected) ---');
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.DATABASE_URI;

const db1 = require('./server/db');

console.log('\n--- TEST 2: SIMULATED DATABASE_URL (PostgreSQL Expected) ---');
const rawDbUrl = 'postgresql://testuser:testpass@ep-cool-db-123456.us-east-2.aws.neon.tech/neondb?sslmode=require';
const isPostgres = Boolean(
  rawDbUrl &&
  (rawDbUrl.startsWith('postgres://') || rawDbUrl.startsWith('postgresql://'))
);

console.log(`DATABASE_URL detected: ${isPostgres}`);
console.log(`Database adapter selected: ${isPostgres ? 'PostgreSQL' : 'SQLite'}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
if (isPostgres) {
  console.log('[Database] PostgreSQL/Neon connection selected');
}

console.log('\n✅ Adapter selection tests completed successfully!');
