// =============================================================================
// HIREBYMINUTES — REGISTRATION, VALIDATION & PERSISTENCE TEST SUITE
// =============================================================================
const assert = require('assert');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'hirebyminutes.db');
const db = new Database(dbPath);

const BASE_URL = 'http://localhost:5000/api';

async function post(endpoint, body, headers = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function get(endpoint, token = null) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${endpoint}`, { headers });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('======================================================================');
  console.log('🧪 HIREBYMINUTES ACCOUNT CREATION & PERSISTENCE VERIFICATION');
  console.log('======================================================================\n');

  const timestamp = Date.now();
  const testEmail = `newuser.${timestamp}@testdomain.local`;
  const testPassword = `SecurePass${timestamp}!1`;
  const testFullName = `Dr. Sarah Verification`;

  // --- 1. Test Registration Validation & Required Fields ---
  console.log('--- 1. Testing Registration Validation Rules ---');
  
  // Missing full_name
  const noName = await post('/auth/register', { email: testEmail, password: testPassword, full_name: '' });
  assert.strictEqual(noName.status, 400);
  assert.strictEqual(noName.data.error, 'Full name is required.');
  console.log('✓ [PASS] Missing full_name rejected with 400 Bad Request');

  // Missing email
  const noEmail = await post('/auth/register', { email: '', password: testPassword, full_name: testFullName });
  assert.strictEqual(noEmail.status, 400);
  assert.strictEqual(noEmail.data.error, 'Email address is required.');
  console.log('✓ [PASS] Missing email rejected with 400 Bad Request');

  // Invalid email format
  const badEmail = await post('/auth/register', { email: 'notanemail', password: testPassword, full_name: testFullName });
  assert.strictEqual(badEmail.status, 400);
  assert.strictEqual(badEmail.data.error, 'Please enter a valid email address.');
  console.log('✓ [PASS] Malformed email rejected with 400 Bad Request');

  // Missing password
  const noPass = await post('/auth/register', { email: testEmail, password: '', full_name: testFullName });
  assert.strictEqual(noPass.status, 400);
  assert.strictEqual(noPass.data.error, 'Password is required.');
  console.log('✓ [PASS] Missing password rejected with 400 Bad Request');

  // 7-character password (e.g. "Vishal1")
  const shortPass = await post('/auth/register', { email: testEmail, password: 'Vishal1', full_name: testFullName });
  assert.strictEqual(shortPass.status, 400);
  assert.strictEqual(shortPass.data.error, 'Password must be at least 8 characters long.');
  console.log('✓ [PASS] 7-character password ("Vishal1") rejected with 400 Bad Request');

  // 8+ characters without letter (e.g. "12345678")
  const noLetterPass = await post('/auth/register', { email: testEmail, password: '12345678', full_name: testFullName });
  assert.strictEqual(noLetterPass.status, 400);
  assert.strictEqual(noLetterPass.data.error, 'Password must contain at least one letter and one number.');
  console.log('✓ [PASS] 8+ characters without letters ("12345678") rejected with 400 Bad Request');

  // 8+ characters without number (e.g. "VishalKumar")
  const noNumPass = await post('/auth/register', { email: testEmail, password: 'VishalKumar', full_name: testFullName });
  assert.strictEqual(noNumPass.status, 400);
  assert.strictEqual(noNumPass.data.error, 'Password must contain at least one letter and one number.');
  console.log('✓ [PASS] 8+ characters without numbers ("VishalKumar") rejected with 400 Bad Request');

  // --- 2. Test Registration API Endpoint & Database Persistence with Valid Password ("Vishal123") ---
  console.log('\n--- 2. Testing Registration API & Database Persistence (Password: "Vishal123") ---');
  const validPassword = 'Vishal123';
  const regRes = await post('/auth/register', {
    email: testEmail,
    password: validPassword,
    full_name: testFullName,
    role: 'client'
  });
  assert.strictEqual(regRes.status, 201);
  assert.ok(regRes.data.user);
  assert.ok(regRes.data.token);
  assert.strictEqual(regRes.data.requires_verification, true);
  console.log(`✓ [PASS] Valid password "Vishal123" accepted! POST /api/auth/register succeeded (status: 201, id: ${regRes.data.user.id})`);

  // Direct database verification
  const dbUser = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(testEmail.toLowerCase());
  assert.ok(dbUser, 'User must exist in database');
  assert.strictEqual(dbUser.email, testEmail.toLowerCase());
  assert.strictEqual(dbUser.full_name, testFullName);
  assert.strictEqual(dbUser.role, 'client');
  assert.strictEqual(dbUser.email_verified, 0, 'New account must start with email_verified = 0');
  console.log('✓ [PASS] Database persistence verified: user row correctly stored in development database');

  // --- 3. Test Password Hashing Verification ---
  console.log('\n--- 3. Testing Password Hashing ---');
  assert.ok(dbUser.password_hash.startsWith('$2'), 'Password hash must be a valid bcrypt hash');
  const isPasswordValid = bcrypt.compareSync(validPassword, dbUser.password_hash);
  assert.strictEqual(isPasswordValid, true, 'bcrypt.compareSync must succeed for plaintext password "Vishal123"');
  console.log(`✓ [PASS] Password "Vishal123" properly hashed with bcrypt (hash prefix: ${dbUser.password_hash.slice(0, 7)})`);

  // --- 4. Test Duplicate Email Rejection ---
  console.log('\n--- 4. Testing Duplicate Email Collision ---');
  const dupEmailRes = await post('/auth/register', {
    email: testEmail.toUpperCase(), // case-insensitive check
    password: 'AnotherPassword123',
    full_name: 'Imposter User',
    role: 'client'
  });
  assert.strictEqual(dupEmailRes.status, 409);
  assert.strictEqual(dupEmailRes.data.error, 'An account with this email address already exists.');
  console.log('✓ [PASS] Case-insensitive duplicate email strictly rejected with 409 Conflict');

  // --- 5. Test Duplicate Username Rejection ---
  console.log('\n--- 5. Testing Duplicate Username Collision ---');
  const explicitUsername = `expert_${timestamp}`;
  const firstUser = await post('/auth/register', {
    email: `expert.${timestamp}.1@testdomain.local`,
    password: testPassword,
    full_name: 'Expert One',
    username: explicitUsername,
    role: 'provider'
  });
  assert.strictEqual(firstUser.status, 201);

  const dupUserRes = await post('/auth/register', {
    email: `expert.${timestamp}.2@testdomain.local`,
    password: testPassword,
    full_name: 'Expert Two',
    username: explicitUsername.toUpperCase(),
    role: 'provider'
  });
  assert.strictEqual(dupUserRes.status, 409);
  assert.strictEqual(dupUserRes.data.error, 'This username is already taken. Please choose another username.');
  console.log('✓ [PASS] Case-insensitive explicit duplicate username strictly rejected with 409 Conflict');

  // --- 6. Test Double-Submit Protection ---
  console.log('\n--- 6. Testing Double-Submit Concurrency ---');
  const doubleSubmitEmail = `doublesubmit.${timestamp}@testdomain.local`;
  const payload = {
    email: doubleSubmitEmail,
    password: testPassword,
    full_name: 'Double Submit Test',
    role: 'client'
  };

  // Dispatch two simultaneous POST requests
  const [res1, res2] = await Promise.all([
    post('/auth/register', payload),
    post('/auth/register', payload)
  ]);

  const statuses = [res1.status, res2.status].sort();
  assert.strictEqual(statuses[0], 201, 'Exactly one request must succeed with 201');
  assert.strictEqual(statuses[1], 409, 'Duplicate request must be rejected with 409 Conflict');
  console.log(`✓ [PASS] Double-submit concurrency handled safely: Request 1 = ${res1.status}, Request 2 = ${res2.status}`);

  // Verify only 1 row exists in database
  const count = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE LOWER(email) = ?').get(doubleSubmitEmail.toLowerCase()).cnt;
  assert.strictEqual(count, 1, 'Exactly 1 database row should exist for double submit');
  console.log('✓ [PASS] Single database row confirmed (no duplicate user created)');

  // --- 7. Test Verification & Login Persistence ---
  console.log('\n--- 7. Testing OTP Verification & Login Persistence ---');
  // Retrieve the generated OTP token record
  const tokenRecord = db.prepare('SELECT * FROM email_verification_tokens WHERE LOWER(email) = ? ORDER BY created_at DESC').get(testEmail.toLowerCase());
  assert.ok(tokenRecord, 'OTP verification token must exist in email_verification_tokens table');

  // Verify that an email dispatch was queued / executed
  console.log(`✓ [PASS] OTP token record created in database (token id: ${tokenRecord.id})`);

  // To test the cryptographic verification path deterministically:
  // Inject a known test OTP hash and verify through the API endpoint
  const crypto = require('crypto');
  const testOtp = '849201';
  const testOtpHash = crypto.createHash('sha256').update(testOtp + regRes.data.user.id).digest('hex');
  db.prepare('UPDATE email_verification_tokens SET code_hash = ? WHERE id = ?').run(testOtpHash, tokenRecord.id);

  // Verify invalid OTP rejection
  const invalidOtpRes = await post('/auth/verify-email-otp', {
    email: testEmail,
    code: '000000'
  }, { 'Authorization': `Bearer ${regRes.data.token}` });
  assert.strictEqual(invalidOtpRes.status, 400);
  console.log('✓ [PASS] Invalid OTP strictly rejected with 400 Bad Request');

  // Verify valid OTP
  const verifyRes = await post('/auth/verify-email-otp', {
    email: testEmail,
    code: testOtp
  }, { 'Authorization': `Bearer ${regRes.data.token}` });
  assert.strictEqual(verifyRes.status, 200);
  assert.strictEqual(verifyRes.data.user.email_verified, 1);
  console.log('✓ [PASS] POST /api/auth/verify-email-otp verified successfully (email_verified: 1)');

  // Verify DB state
  const verifiedDbUser = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(regRes.data.user.id);
  assert.strictEqual(verifiedDbUser.email_verified, 1);
  console.log('✓ [PASS] Database updated: email_verified is now 1');

  // Test /auth/me persistence with Bearer token
  const meRes = await get('/auth/me', regRes.data.token);
  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.data.user.id, regRes.data.user.id);
  assert.strictEqual(meRes.data.user.email, testEmail.toLowerCase());
  assert.strictEqual(meRes.data.user.email_verified, 1);
  console.log('✓ [PASS] GET /api/auth/me returned authentic persistent profile with token');

  // Test /auth/login with the new credentials ("Vishal123")
  const loginRes = await post('/auth/login', { email: testEmail, password: validPassword });
  assert.strictEqual(loginRes.status, 200);
  assert.ok(loginRes.data.token);
  assert.strictEqual(loginRes.data.user.id, regRes.data.user.id);
  assert.strictEqual(loginRes.data.user.email_verified, 1);
  console.log('✓ [PASS] POST /api/auth/login authenticated successfully with verified state');

  // Purge test fixtures
  db.prepare('DELETE FROM users WHERE LOWER(email) LIKE ?').run(`%@testdomain.local`);
  db.prepare('DELETE FROM email_verification_tokens WHERE LOWER(email) LIKE ?').run(`%@testdomain.local`);
  db.prepare('DELETE FROM email_logs WHERE LOWER(recipient) LIKE ?').run(`%@testdomain.local`);
  console.log('\n✓ Test records cleanly purged from database.');

  console.log('\n======================================================================');
  console.log('🎉 ALL ACCOUNT CREATION & PERSISTENCE TESTS PASSED (100%)!');
  console.log('======================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
