// =============================================================================
// HireByMinute — SQLite Local Database Fresh Start Cleanup Script
// Target: Local Development SQLite Database (server/hirebyminutes.db)
// Preserves ONLY the verified master Administrator account
// Deletes ALL non-admin users and user-owned marketplace/test data
// =============================================================================

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const dbPath = path.join(__dirname, '..', 'hirebyminutes.db');

function runSqliteFreshStartCleanup() {
  console.log('=============================================================================');
  console.log('🚀 HIREBYMINUTE — SQLITE FRESH START CLEANUP');
  console.log('=============================================================================\n');

  if (!fs.existsSync(dbPath)) {
    console.error(`❌ SQLite database file not found at: ${dbPath}`);
    process.exit(1);
  }

  // Backup SQLite file
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupPath = path.join(backupDir, `sqlite_backup_${Date.now()}.db`);
  fs.copyFileSync(dbPath, backupPath);
  console.log(`SQLite Backup written to: ${backupPath}\n`);

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  const adminUser = db.prepare("SELECT * FROM users WHERE role = 'admin'").all();
  if (adminUser.length !== 1) {
    console.error(`❌ Expected exactly 1 admin user, found ${adminUser.length}`);
    process.exit(1);
  }

  const admin = adminUser[0];
  console.log(`Master Admin to preserve: ID=${admin.id}, Email=${admin.email}, Role=${admin.role}`);

  const nonAdmins = db.prepare("SELECT id, email, role FROM users WHERE role != 'admin'").all();
  console.log(`Non-admin users scheduled for deletion: ${nonAdmins.length}\n`);

  const nonAdminIds = nonAdmins.map(u => u.id);
  const nonAdminEmails = nonAdmins.map(u => u.email.trim().toLowerCase());

  if (nonAdminIds.length > 0) {
    const runTransaction = db.transaction(() => {
      // 1. Messages
      db.prepare(`
        DELETE FROM messages 
        WHERE sender_id NOT IN (SELECT id FROM users WHERE role = 'admin')
           OR session_id IN (
             SELECT id FROM sessions 
             WHERE client_id NOT IN (SELECT id FROM users WHERE role = 'admin')
                OR provider_id NOT IN (SELECT id FROM users WHERE role = 'admin')
           )
      `).run();

      // 2. Reviews
      db.prepare(`
        DELETE FROM reviews 
        WHERE client_id NOT IN (SELECT id FROM users WHERE role = 'admin')
           OR provider_id NOT IN (SELECT id FROM users WHERE role = 'admin')
      `).run();

      // 3. Sessions
      db.prepare(`
        DELETE FROM sessions 
        WHERE client_id NOT IN (SELECT id FROM users WHERE role = 'admin')
           OR provider_id NOT IN (SELECT id FROM users WHERE role = 'admin')
      `).run();

      // 4. Bookings
      db.prepare(`
        DELETE FROM bookings 
        WHERE client_id NOT IN (SELECT id FROM users WHERE role = 'admin')
           OR provider_id NOT IN (SELECT id FROM users WHERE role = 'admin')
      `).run();

      // 5. Consultation requests
      db.prepare(`
        DELETE FROM consultation_requests 
        WHERE client_id NOT IN (SELECT id FROM users WHERE role = 'admin')
           OR provider_id NOT IN (SELECT id FROM users WHERE role = 'admin')
      `).run();

      // 6. Payments
      db.prepare(`
        DELETE FROM payments 
        WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'admin')
      `).run();

      // 7. Applications
      db.prepare(`
        DELETE FROM applications 
        WHERE provider_id NOT IN (SELECT id FROM users WHERE role = 'admin')
      `).run();

      // 8. Opportunities
      db.prepare(`
        DELETE FROM opportunities 
        WHERE creator_id NOT IN (SELECT id FROM users WHERE role = 'admin')
      `).run();

      // 9. Provider availability
      db.prepare(`
        DELETE FROM provider_availability 
        WHERE provider_id NOT IN (SELECT id FROM users WHERE role = 'admin')
      `).run();

      // 10. Services
      db.prepare(`
        DELETE FROM services 
        WHERE provider_id NOT IN (SELECT id FROM users WHERE role = 'admin')
      `).run();

      // 11. Notifications
      db.prepare(`
        DELETE FROM notifications 
        WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'admin')
      `).run();

      // 12. Reports
      db.prepare(`
        DELETE FROM reports 
        WHERE reporter_id NOT IN (SELECT id FROM users WHERE role = 'admin')
           OR (reported_type = 'user' AND reported_id NOT IN (SELECT id FROM users WHERE role = 'admin'))
      `).run();

      // 13. Profile visits
      db.prepare(`
        DELETE FROM profile_visits 
        WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'admin')
      `).run();

      // 14. Email verification tokens
      db.prepare(`
        DELETE FROM email_verification_tokens 
        WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'admin')
      `).run();

      // 15. Password reset tokens
      db.prepare(`
        DELETE FROM password_reset_tokens 
        WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'admin')
      `).run();

      // 16. Email logs
      const placeholders = nonAdminEmails.map(() => '?').join(',');
      db.prepare(`
        DELETE FROM email_logs 
        WHERE user_id NOT IN (SELECT id FROM users WHERE role = 'admin')
           OR LOWER(recipient) IN (${placeholders})
      `).run(...nonAdminEmails);

      // 17. Users
      const delUserRes = db.prepare("DELETE FROM users WHERE role != 'admin'").run();
      console.log(`Deleted ${delUserRes.changes} non-admin users from SQLite.`);

      // Recalculate categories service count
      db.prepare(`
        UPDATE categories 
        SET service_count = (
          SELECT COUNT(*) FROM services 
          WHERE services.category_id = categories.id AND services.listing_status = 'active'
        )
      `).run();
    });

    runTransaction();
  }

  const remainingUsers = db.prepare("SELECT * FROM users").all();
  console.log(`Remaining users in SQLite: ${remainingUsers.length}`);
  if (remainingUsers.length !== 1 || remainingUsers[0].role !== 'admin') {
    throw new Error('SQLite integrity check failed!');
  }

  console.log('✅ SQLite cleanup complete and verified. Preserved admin:', remainingUsers[0].email);
  console.log('NO FAKE/DEMO DATA WAS CREATED.\n');
  db.close();
}

if (require.main === module) {
  runSqliteFreshStartCleanup();
}

module.exports = { runSqliteFreshStartCleanup };
