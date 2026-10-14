const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const src = path.join(__dirname, '..', 'server', 'hirebyminutes.db');
const backupDir = path.join(__dirname, '..', 'server', 'backups');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const now = new Date();
const dateStr = now.toISOString().slice(0, 10);
const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
const dest = path.join(backupDir, `hirebyminutes-prelaunch-backup-${dateStr}_${timeStr}.db`);

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  const srcStat = fs.statSync(src);
  const destStat = fs.statSync(dest);
  console.log('✓ Successfully created backup at:', dest);
  console.log(`  Source size: ${srcStat.size} bytes | Backup size: ${destStat.size} bytes`);

  // Verify recoverability by opening isolated copy with sqlite
  const testDb = new Database(dest, { readonly: true });
  const userCount = testDb.prepare('SELECT count(*) as total FROM users').get();
  const serviceCount = testDb.prepare('SELECT count(*) as total FROM services').get();
  const bookingCount = testDb.prepare('SELECT count(*) as total FROM bookings').get();
  console.log('✓ Recoverability verified in isolated test database!');
  console.log(`  Records verified: ${userCount.total} users, ${serviceCount.total} services, ${bookingCount.total} bookings.`);
  testDb.close();
} else {
  console.error('Source db not found at', src);
  process.exit(1);
}
