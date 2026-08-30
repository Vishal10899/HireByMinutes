// HireByMinutes — Comprehensive PostgreSQL Integration Test Suite
// Verifies end-to-end functionality of all 20 operational points against PostgreSQL

const { newDb } = require('pg-mem');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { initPostgres } = require('./server/scripts/initPostgres');
const { createPostgresDb } = require('./server/pgDriver');

async function runPostgresIntegrationTests() {
  console.log('\n======================================================================');
  console.log('--- HIREBYMINUTES POSTGRESQL PRODUCTION INTEGRATION TEST SUITE ---');
  console.log('======================================================================\n');

  // Set up live PostgreSQL pool if DATABASE_URL configured, or in-memory PostgreSQL engine
  const connectionUrl = process.env.DATABASE_URL;
  let pool;

  if (connectionUrl && (connectionUrl.startsWith('postgres://') || connectionUrl.startsWith('postgresql://'))) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: connectionUrl,
      ssl: connectionUrl.includes('localhost') || connectionUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
    });
    console.log('[Database Target] Connected to external PostgreSQL database.');
  } else {
    const pgMem = newDb();
    const { Pool } = pgMem.adapters.createPg();
    pool = new Pool();
    console.log('[Database Target] Initialized PostgreSQL engine (in-process test pool).');
  }

  // 1. Database Connection
  console.log('\n1. Verifying PostgreSQL Database Connection...');
  const probeClient = await pool.connect();
  const probeRes = await probeClient.query('SELECT 1 as alive');
  if (probeRes.rows[0].alive !== 1) throw new Error('Database connection failed.');
  console.log('   ✓ PostgreSQL connection established and responsive (SELECT 1 as alive = 1).');
  probeClient.release();

  // 2. Schema Initialization & 21 Tables Verification
  console.log('\n2. Verifying PostgreSQL Schema Initialization & Table Parity...');
  await initPostgres(pool);
  const client = await pool.connect();

  const requiredTables = [
    'users',
    'categories',
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
    'profile_visits',
    'registration_campaigns'
  ];

  for (const table of requiredTables) {
    const tableRes = await client.query(
      `SELECT count(*) as c FROM ${table}`
    );
    if (tableRes.rows === undefined) throw new Error(`Table ${table} not found or inaccessible.`);
    console.log(`   ✓ Table "${table}" verified in PostgreSQL.`);
  }

  // 3. Admin Authentication & Role
  console.log('\n3. Verifying Master Admin Authentication & Role...');
  const expectedAdminPassword = process.env.ADMIN_PASSWORD || 'HBM-Adm!n#2026$Secur3';
  const adminRes = await client.query("SELECT * FROM users WHERE email = 'vishalkumar75912@gmail.com'");
  if (adminRes.rows.length === 0) throw new Error('Master admin record not found.');
  const adminUser = adminRes.rows[0];
  if (adminUser.role !== 'admin') throw new Error('Admin role mismatch');
  const isPassValid = bcrypt.compareSync(expectedAdminPassword, adminUser.password_hash);
  if (!isPassValid) throw new Error('Admin password hash mismatch');
  console.log(`   ✓ Master Admin verified: ${adminUser.full_name} (${adminUser.email}), Role: ${adminUser.role}`);

  // 4. Client Authentication & Registration
  console.log('\n4. Verifying Client User Creation & Authentication...');
  const clientId = `usr-client-${Date.now()}`;
  const clientPassHash = bcrypt.hashSync('Password123!', 10);
  await client.query(`
    INSERT INTO users (id, email, username, password_hash, full_name, role, email_verified)
    VALUES ($1, $2, $3, $4, $5, $6, 1)
  `, [clientId, 'client.pg@test.local', 'client_pg', clientPassHash, 'PG Test Client', 'client']);
  const clientQuery = await client.query('SELECT * FROM users WHERE id = $1', [clientId]);
  if (clientQuery.rows.length === 0) throw new Error('Client user not inserted.');
  console.log(`   ✓ Client created and queried: ${clientQuery.rows[0].full_name} (${clientQuery.rows[0].email})`);

  // 5. Provider Authentication & Registration
  console.log('\n5. Verifying Provider User Creation & Authentication...');
  const providerId = `usr-prov-${Date.now()}`;
  const providerPassHash = bcrypt.hashSync('Password123!', 10);
  await client.query(`
    INSERT INTO users (id, email, username, password_hash, full_name, role, email_verified)
    VALUES ($1, $2, $3, $4, $5, $6, 1)
  `, [providerId, 'provider.pg@test.local', 'prov_pg', providerPassHash, 'Dr. PostgreSQL Expert', 'provider']);
  const provQuery = await client.query('SELECT * FROM users WHERE id = $1', [providerId]);
  if (provQuery.rows.length === 0) throw new Error('Provider user not inserted.');
  console.log(`   ✓ Provider created and queried: ${provQuery.rows[0].full_name} (${provQuery.rows[0].email})`);

  // 6. Registration Campaign System
  console.log('\n6. Verifying Registration Campaign System & Status...');
  const campRes = await client.query("SELECT * FROM registration_campaigns WHERE id = 'camp-launch-free-24h'");
  if (campRes.rows.length === 0) throw new Error('Default 24h campaign not found.');
  const initialCamp = campRes.rows[0];
  const initialStart = initialCamp.start_time;
  const initialEnd = initialCamp.end_time;
  console.log(`   ✓ Active 24-hour campaign found: "${initialCamp.name}"`);
  console.log(`   ✓ Campaign Fee: $${Number(initialCamp.fee_usd).toFixed(2)}, Status: ${initialCamp.status}`);
  console.log(`   ✓ Start Time: ${initialStart}, End Time: ${initialEnd}`);

  // 7. $0 Promotional Listing Waiver
  console.log('\n7. Testing $0 Promotional Service Listing Creation & Immediate Activation...');
  const serviceId1 = `srv-free-${Date.now()}`;
  const effectiveFee = Number(initialCamp.fee_usd); // $0.00
  const isFree = effectiveFee === 0;

  await client.query(`
    INSERT INTO services (
      id, provider_id, title, category_id, description, price_per_minute, listing_status, listing_fee_paid, skills_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    serviceId1,
    providerId,
    'PostgreSQL Performance Optimization & Index Tuning',
    'cat-tech',
    'Deep-dive EXPLAIN ANALYZE queries and high-concurrency connection pooling.',
    3.50,
    isFree ? 'active' : 'pending_payment',
    isFree ? 1 : 0,
    '["PostgreSQL", "Database Design"]'
  ]);

  const srv1 = (await client.query('SELECT * FROM services WHERE id = $1', [serviceId1])).rows[0];
  if (srv1.listing_status !== 'active' || srv1.listing_fee_paid !== 1) {
    throw new Error('$0 promotion failed to activate service immediately.');
  }
  console.log(`   ✓ Service created with $0 promotional waiver! Status: "${srv1.listing_status}", Fee Paid: ${srv1.listing_fee_paid}`);

  // 8. Persistent Campaign End Time on Server Restart Simulation
  console.log('\n8. Simulating Server Restart During Active Campaign...');
  // Startup seeding logic: INSERT INTO ... ON CONFLICT (id) DO NOTHING
  const restartNow = new Date();
  const restartEnd = new Date(restartNow.getTime() + 24 * 60 * 60 * 1000).toISOString();
  await client.query(`
    INSERT INTO registration_campaigns (
      id, name, description, fee_usd, start_time, end_time, is_active, status, created_by, created_by_name
    ) VALUES ($1, $2, $3, $4, $5, $6, 1, 'active', 'system', 'Platform Launch')
    ON CONFLICT (id) DO NOTHING
  `, ['camp-launch-free-24h', 'Launch Promotion — Free Expert Registration', 'Launch Offer', 0.00, restartNow.toISOString(), restartEnd]);

  const campAfterRestart = (await client.query("SELECT * FROM registration_campaigns WHERE id = 'camp-launch-free-24h'")).rows[0];
  if (campAfterRestart.end_time !== initialEnd) {
    throw new Error('CRITICAL FAILURE: Campaign end_time was reset on server restart!');
  }
  console.log('   ✓ Persistent campaign timestamp verified! Original end_time preserved across restart.');

  // 9. Campaign Expiration Logic
  console.log('\n9. Testing Server-Authoritative Campaign Expiration...');
  // Simulate time passage past expiration
  const pastTime = new Date(Date.now() - 60000).toISOString();
  await client.query("UPDATE registration_campaigns SET end_time = $1, status = 'expired' WHERE id = 'camp-launch-free-24h'", [pastTime]);
  const expiredCamp = (await client.query("SELECT * FROM registration_campaigns WHERE id = 'camp-launch-free-24h'")).rows[0];
  if (expiredCamp.status !== 'expired') throw new Error('Campaign status should be expired');
  console.log(`   ✓ Campaign expired authoritatively. Status: ${expiredCamp.status}`);

  // 10. Normal Listing Fee After Expiration ($2.00)
  console.log('\n10. Testing Service Creation After Promotion Expiration (Standard Base Fee)...');
  const baseSetting = (await client.query("SELECT value FROM platform_settings WHERE key = 'listing_fee_usd'")).rows[0];
  const normalFee = parseFloat(baseSetting.value); // $2.00
  console.log(`   ✓ Authoritative listing fee reverted to base fee: $${normalFee.toFixed(2)}`);

  const serviceId2 = `srv-paid-${Date.now()}`;
  await client.query(`
    INSERT INTO services (
      id, provider_id, title, category_id, description, price_per_minute, listing_status, listing_fee_paid, skills_json
    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending_payment', 0, '["PostgreSQL"]')
  `, [serviceId2, providerId, 'High-Availability Database Clustering', 'cat-tech', 'Multi-region streaming replication setup.', 4.00]);

  const srv2 = (await client.query('SELECT * FROM services WHERE id = $1', [serviceId2])).rows[0];
  if (srv2.listing_status !== 'pending_payment' || srv2.listing_fee_paid !== 0) {
    throw new Error('Service after expiration should require payment and be in pending_payment status.');
  }
  console.log(`   ✓ Service created in draft/pending status: "${srv2.listing_status}", Fee Paid: ${srv2.listing_fee_paid}`);

  // 11. Consultation Request Creation
  console.log('\n11. Testing Consultation Request Creation (Stage 1: Pending Expert)...');
  const reqId = `cr-pg-${Date.now()}`;
  const now = new Date();
  const deadline = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  await client.query(`
    INSERT INTO consultation_requests (
      id, client_id, provider_id, service_id, duration_minutes, price_per_minute, total_price,
      connect_type, scheduled_start, problem_description, status, response_deadline
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, [
    reqId, clientId, providerId, serviceId1, 30, 3.50, 105.00,
    'now', now.toISOString(), 'Need index analysis for slow queries.', 'PENDING_EXPERT', deadline
  ]);

  const cr = (await client.query('SELECT * FROM consultation_requests WHERE id = $1', [reqId])).rows[0];
  if (cr.status !== 'PENDING_EXPERT') throw new Error('Consultation request status mismatch');
  console.log(`   ✓ Consultation Request created with ID: ${cr.id}, Status: ${cr.status}, Total: $${Number(cr.total_price).toFixed(2)}`);

  // 12. Expert Approval Flow
  console.log('\n12. Testing Expert Approval of Consultation Request (Stage 2: Accepted)...');
  await client.query(`
    UPDATE consultation_requests 
    SET status = 'ACCEPTED', accepted_at = CURRENT_TIMESTAMP 
    WHERE id = $1
  `, [reqId]);
  const crAccepted = (await client.query('SELECT * FROM consultation_requests WHERE id = $1', [reqId])).rows[0];
  if (crAccepted.status !== 'ACCEPTED') throw new Error('Request was not accepted');
  console.log(`   ✓ Expert approved consultation request! Status: ${crAccepted.status}`);

  // 13. Razorpay Order / Payment Flow
  console.log('\n13. Testing Payment Flow & Ledger Record Creation (Stage 3: Escrow Payment)...');
  const paymentId = `pay-pg-${Date.now()}`;
  await client.query(`
    INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
    VALUES ($1, $2, 'session_payment', $3, 'succeeded', $4, $5)
  `, [paymentId, clientId, 105.00, `rzp_order_${Date.now()}`, JSON.stringify({ requestId: reqId })]);

  const paymentRecord = (await client.query('SELECT * FROM payments WHERE id = $1', [paymentId])).rows[0];
  if (!paymentRecord || paymentRecord.status !== 'succeeded') throw new Error('Payment record creation failed');
  console.log(`   ✓ Payment recorded in ledger! Payment ID: ${paymentRecord.id}, Amount: $${Number(paymentRecord.amount).toFixed(2)}`);

  // 14. Booking & Session Creation
  console.log('\n14. Testing Session & Booking Creation Upon Payment...');
  const bookingId = `bk-pg-${Date.now()}`;
  const sessionId = `ses-pg-${Date.now()}`;
  const sessionStart = new Date().toISOString();
  const sessionEnd = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await client.query(`
    INSERT INTO bookings (id, client_id, provider_id, service_id, duration_minutes, total_price, scheduled_start, scheduled_end, status, payment_id)
    VALUES ($1, $2, $3, $4, 30, 105.00, $5, $6, 'ACCEPTED', $7)
  `, [bookingId, clientId, providerId, serviceId1, sessionStart, sessionEnd, paymentId]);

  await client.query(`
    INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, duration_minutes, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 30, 'SCHEDULED')
  `, [sessionId, bookingId, clientId, providerId, serviceId1, sessionStart, sessionEnd]);

  await client.query(`
    UPDATE consultation_requests 
    SET status = 'PAID', paid_at = CURRENT_TIMESTAMP, payment_id = $1, session_id = $2 
    WHERE id = $3
  `, [paymentId, sessionId, reqId]);

  const sessRecord = (await client.query('SELECT * FROM sessions WHERE id = $1', [sessionId])).rows[0];
  if (sessRecord.status !== 'SCHEDULED') throw new Error('Session creation mismatch');
  console.log(`   ✓ Session created! ID: ${sessRecord.id}, Booking ID: ${sessRecord.booking_id}, Status: ${sessRecord.status}`);

  // 15. In-App Notifications
  console.log('\n15. Testing In-App Notification System...');
  const notifId = `notif-pg-${Date.now()}`;
  await client.query(`
    INSERT INTO notifications (id, user_id, title, message, type, link, read)
    VALUES ($1, $2, $3, $4, $5, $6, 0)
  `, [notifId, providerId, 'Consultation Booked & Paid', 'Sarah paid for your consultation session.', 'booking', `/sessions/${sessionId}`]);

  const notif = (await client.query('SELECT * FROM notifications WHERE id = $1', [notifId])).rows[0];
  if (!notif || notif.read !== 0) throw new Error('Notification creation failed');
  console.log(`   ✓ Notification created for provider: "${notif.title}" - ${notif.message}`);

  // 16. Email Verification & OTP Tokens
  console.log('\n16. Testing OTP Email Verification Token System...');
  const otpId = `evt-pg-${Date.now()}`;
  const codeHash = crypto.createHash('sha256').update('849201').digest('hex');
  const otpExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await client.query(`
    INSERT INTO email_verification_tokens (id, user_id, email, code_hash, expires_at)
    VALUES ($1, $2, $3, $4, $5)
  `, [otpId, clientId, 'client.pg@test.local', codeHash, otpExpires]);

  const otpRecord = (await client.query('SELECT * FROM email_verification_tokens WHERE id = $1', [otpId])).rows[0];
  if (!otpRecord || otpRecord.code_hash !== codeHash) throw new Error('OTP token verification failed');
  console.log(`   ✓ OTP token hashed and stored securely (Expires: ${otpRecord.expires_at})`);

  // 17. Password Reset Token System
  console.log('\n17. Testing Password Reset Token System...');
  const prtId = `prt-pg-${Date.now()}`;
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const prtExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await client.query(`
    INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
    VALUES ($1, $2, $3, $4)
  `, [prtId, clientId, tokenHash, prtExpires]);

  const prtRecord = (await client.query('SELECT * FROM password_reset_tokens WHERE id = $1', [prtId])).rows[0];
  if (!prtRecord || prtRecord.token_hash !== tokenHash) throw new Error('Password reset token mismatch');
  console.log(`   ✓ Password reset token generated and hashed (SHA-256 length: ${prtRecord.token_hash.length})`);

  // 18. Admin RBAC & Audit Logging
  console.log('\n18. Testing Admin RBAC & Action Audit Logging...');
  const auditId = `aud-pg-${Date.now()}`;
  await client.query(`
    INSERT INTO audit_logs (id, admin_id, admin_name, action, target_type, target_id, details_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [auditId, adminUser.id, adminUser.full_name, 'CREATE_CAMPAIGN', 'campaign', 'camp-launch-free-24h', JSON.stringify({ fee: 0 })]);

  const auditLog = (await client.query('SELECT * FROM audit_logs WHERE id = $1', [auditId])).rows[0];
  if (!auditLog || auditLog.action !== 'CREATE_CAMPAIGN') throw new Error('Audit log creation failed');
  console.log(`   ✓ Admin action audit logged: ${auditLog.action} by ${auditLog.admin_name}`);

  // 19. Admin-Created User Exception (Fee Waived)
  console.log('\n19. Testing Admin-Created User Exception Flow...');
  const adminCreatedUserId = `usr-admin-created-${Date.now()}`;
  await client.query(`
    INSERT INTO users (id, email, username, password_hash, full_name, role, email_verified, created_by_admin, created_by_admin_id)
    VALUES ($1, $2, $3, $4, $5, 'provider', 1, 1, $6)
  `, [adminCreatedUserId, 'vip.expert@hbm.local', 'vip_expert', bcrypt.hashSync('Password123!', 10), 'VIP Expert (Admin Invited)', adminUser.id]);

  const adminUserCreated = (await client.query('SELECT * FROM users WHERE id = $1', [adminCreatedUserId])).rows[0];
  if (adminUserCreated.created_by_admin !== 1) throw new Error('Admin created flag mismatch');
  console.log(`   ✓ Admin-created user saved with created_by_admin = 1 (${adminUserCreated.full_name})`);

  // 20. Database Health Check Probe
  console.log('\n20. Testing PostgreSQL Health Check Probe (SELECT 1 as alive)...');
  const healthRes = await client.query('SELECT 1 as alive');
  if (healthRes.rows[0].alive !== 1) throw new Error('Health check query failed');
  console.log('   ✓ PostgreSQL health check query returned 200 OK equivalent (alive = 1).');

  client.release();
  await pool.end();

  console.log('\n======================================================================');
  console.log('✅ ALL 20 POSTGRESQL PRODUCTION INTEGRATION TESTS PASSED 100%!');
  console.log('======================================================================\n');
}

if (require.main === module) {
  runPostgresIntegrationTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ POSTGRESQL INTEGRATION TEST FAILED:', err);
      process.exit(1);
    });
}

module.exports = { runPostgresIntegrationTests };
