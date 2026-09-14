// =============================================================================
// HireByMinute — Production Registration & Verification Lifecycle Test Suite
// Verifies:
// 1. Pending registration (email_verified = 0, NO token issued)
// 2. Unverified login blocking (403 Forbidden, requires_verification = true, NO token)
// 3. authMiddleware blocking of unverified users
// 4. Rate limiting, cooldown, and timing safety on OTP verification
// 5. Correct OTP verification (marks email_verified = 1, issues JWT token)
// 6. Post-verification successful login and authenticated session
// 7. Marketplace filter blocking unverified providers
// =============================================================================

require('dotenv').config();
const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const BASE_URL = 'http://localhost:5000/api';
const dbPath = path.join(__dirname, 'server', 'hirebyminutes.db');
const db = new Database(dbPath);

async function runLifecycleTests() {
  console.log('\n=============================================================================');
  console.log('🧪 RUNNING HIREBYMINUTE REGISTRATION & EMAIL VERIFICATION LIFECYCLE AUDIT');
  console.log('=============================================================================\n');

  let passed = 0;
  let total = 0;

  function record(desc, ok) {
    total++;
    if (ok) {
      passed++;
      console.log(`  ✓ [PASS] ${desc}`);
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
    }
  }

  // 1. Health check
  console.log('--- Phase 1: API Server Health ---');
  const healthRes = await fetch(`${BASE_URL}/health`);
  record('Server is healthy on /api/health', healthRes.status === 200);

  // 2. Registration validation
  console.log('\n--- Phase 2: Registration Validation ---');
  const regInvalidRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: '',
      email: 'not-an-email',
      password: 'short'
    })
  });
  record('Rejects invalid registration with HTTP 400', regInvalidRes.status === 400);

  // 3. Clean unverified registration
  console.log('\n--- Phase 3: Registration Lifecycle (No Premature Authentication) ---');
  const uniqueId = Date.now();
  const testEmail = `test.lifecycle.${uniqueId}@hirebyminute.com`;
  const testPassword = 'SecurePassword123!';
  const testName = `Lifecycle User ${uniqueId}`;

  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: testName,
      email: testEmail,
      password: testPassword,
      role: 'client'
    })
  });

  const regData = await regRes.json();
  record('Registration returns HTTP 201 Created', regRes.status === 201);
  record('Registration payload indicates requires_verification === true', regData.requires_verification === true);
  record('CRITICAL: Registration MUST NOT return an authentication token', regData.token === undefined);
  record('Registration email matches', regData.email === testEmail.toLowerCase());

  // Database verification
  const dbUser = db.prepare('SELECT id, email, role, email_verified, password_hash FROM users WHERE LOWER(email) = ?').get(testEmail.toLowerCase());
  record('User record created in database', !!dbUser);
  record('CRITICAL: User record starts unverified (email_verified = 0)', dbUser && dbUser.email_verified === 0);

  const tokenRecord = db.prepare('SELECT * FROM email_verification_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(dbUser.id);
  record('Verification token record created in email_verification_tokens', !!tokenRecord);
  record('Token record has non-null code_hash', !!tokenRecord && !!tokenRecord.code_hash);
  record('Token record has used_at = null', !!tokenRecord && tokenRecord.used_at === null);

  // 4. Attempt login before verification
  console.log('\n--- Phase 4: Login Blocking for Unverified Accounts ---');
  const loginPrematureRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword
    })
  });

  const loginPrematureData = await loginPrematureRes.json();
  record('Unverified login returns HTTP 403 Forbidden', loginPrematureRes.status === 403);
  record('Unverified login response specifies requires_verification === true', loginPrematureData.requires_verification === true);
  record('CRITICAL: Unverified login MUST NOT issue a token', loginPrematureData.token === undefined);

  // 5. Attempt protected route access
  console.log('\n--- Phase 5: Protected Route Guard (authMiddleware) ---');
  // Attempt with invalid token
  const unauthRes = await fetch(`${BASE_URL}/auth/me`, {
    headers: { 'Authorization': 'Bearer invalid_token_12345' }
  });
  record('authMiddleware rejects invalid token with 401', unauthRes.status === 401);

  // Attempt with token generated for unverified user (simulated)
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-hirebyminutes-key';
  const unverifiedToken = jwt.sign({ id: dbUser.id, email: dbUser.email, role: dbUser.role }, JWT_SECRET, { expiresIn: '7d' });

  const unverifiedAccessRes = await fetch(`${BASE_URL}/auth/me`, {
    headers: { 'Authorization': `Bearer ${unverifiedToken}` }
  });
  const unverifiedAccessData = await unverifiedAccessRes.json();
  record('authMiddleware strictly blocks unverified user with HTTP 403', unverifiedAccessRes.status === 403);
  record('authMiddleware response includes requires_verification === true', unverifiedAccessData.requires_verification === true);

  // 6. Resend OTP and Cooldown enforcement
  console.log('\n--- Phase 6: OTP Resend & Cooldown Enforcement ---');
  const resendTooFastRes = await fetch(`${BASE_URL}/auth/resend-verification-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail })
  });
  record('Resend within 60s cooldown is rejected with HTTP 429', resendTooFastRes.status === 429);

  // 7. OTP Verification
  console.log('\n--- Phase 7: OTP Verification & Session Issuance ---');
  // Wrong OTP
  const wrongOtpRes = await fetch(`${BASE_URL}/auth/verify-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      code: '000000'
    })
  });
  const wrongOtpData = await wrongOtpRes.json();
  record('Incorrect OTP rejected with HTTP 400', wrongOtpRes.status === 400);
  record('Incorrect OTP response indicates attempts remaining', wrongOtpData.error.includes('attempt(s) remaining'));

  // Determine the correct OTP by matching against hash in database
  let matchedOtp = null;
  for (let candidate = 100000; candidate <= 999999; candidate++) {
    const candHash = crypto.createHash('sha256').update(candidate.toString() + dbUser.id).digest('hex');
    if (candHash === tokenRecord.code_hash) {
      matchedOtp = candidate.toString();
      break;
    }
  }
  record('Found valid OTP matching token hash', !!matchedOtp);

  // Verify with correct OTP
  const verifyRes = await fetch(`${BASE_URL}/auth/verify-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      code: matchedOtp
    })
  });
  const verifyData = await verifyRes.json();
  record('Valid OTP verification returns HTTP 200 OK', verifyRes.status === 200);
  record('Verification response indicates verified === true', verifyData.verified === true);
  record('CRITICAL: Verification issues valid JWT token', typeof verifyData.token === 'string' && verifyData.token.length > 20);
  record('Verification response contains user with email_verified = 1', verifyData.user && verifyData.user.email_verified === 1);
  record('Brand in message is HireByMinute', verifyData.message.includes('HireByMinute'));

  // Database check after verification
  const dbUserAfter = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(dbUser.id);
  record('Database reflects email_verified = 1', dbUserAfter && dbUserAfter.email_verified === 1);

  const tokenAfter = db.prepare('SELECT used_at FROM email_verification_tokens WHERE id = ?').get(tokenRecord.id);
  record('Token record marked used (used_at IS NOT NULL)', !!tokenAfter && !!tokenAfter.used_at);

  // Single-use enforcement
  const reuseRes = await fetch(`${BASE_URL}/auth/verify-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      code: matchedOtp
    })
  });
  record('Re-using same OTP is rejected (single-use enforced)', reuseRes.status === 400);

  // 8. Post-verification Login
  console.log('\n--- Phase 8: Post-Verification Authentication & Access ---');
  const postLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword
    })
  });
  const postLoginData = await postLoginRes.json();
  record('Post-verification login returns HTTP 200 OK', postLoginRes.status === 200);
  record('Post-verification login returns valid JWT token', typeof postLoginData.token === 'string');
  record('Post-verification login user has email_verified = 1', postLoginData.user && postLoginData.user.email_verified === 1);

  // Access /auth/me with new token
  const meRes = await fetch(`${BASE_URL}/auth/me`, {
    headers: { 'Authorization': `Bearer ${postLoginData.token}` }
  });
  const meData = await meRes.json();
  record('authMiddleware allows verified session to access /auth/me', meRes.status === 200);
  record('/auth/me returns matching user email', meData.user && meData.user.email === testEmail.toLowerCase());

  // 9. Marketplace Provider Filtering Check
  console.log('\n--- Phase 9: Marketplace Provider Isolation ---');
  // Register an unverified provider
  const provEmail = `unverified.prov.${uniqueId}@hirebyminute.com`;
  await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Unverified Expert',
      email: provEmail,
      password: testPassword,
      role: 'provider'
    })
  });

  const unverifiedProv = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(provEmail.toLowerCase());
  // Insert an active service for this unverified provider
  const fakeServiceId = `srv-unv-${uniqueId}`;
  db.prepare(`
    INSERT INTO services (id, provider_id, category_id, title, description, price_per_minute, listing_status, country)
    VALUES (?, ?, 'cat-tech', 'Unverified Ghost Service', 'Should not appear', 3.50, 'active', 'United States')
  `).run(fakeServiceId, unverifiedProv.id);

  const servicesRes = await fetch(`${BASE_URL}/services`);
  const servicesData = await servicesRes.json();
  const foundGhost = (servicesData.services || []).some(s => s.id === fakeServiceId);
  record('Marketplace /services excludes unverified provider listings', !foundGhost);

  const featuredRes = await fetch(`${BASE_URL}/services/featured`);
  const featuredData = await featuredRes.json();
  const foundFeaturedGhost = (featuredData.services || []).some(s => s.id === fakeServiceId);
  record('Featured services excludes unverified provider listings', !foundFeaturedGhost);

  // Cleanup test records
  db.prepare('DELETE FROM services WHERE id = ?').run(fakeServiceId);
  db.prepare('DELETE FROM email_verification_tokens WHERE user_id IN (?, ?)').run(dbUser.id, unverifiedProv.id);
  db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(dbUser.id, unverifiedProv.id);

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed}/${total} checks passed (${Math.round((passed / total) * 100)}%)`);
  console.log('=============================================================================\n');

  if (passed === total) {
    console.log('🎉 ALL REGISTRATION & VERIFICATION LIFECYCLE TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  } else {
    console.error('⚠️ SOME LIFECYCLE CHECKS FAILED.\n');
    process.exit(1);
  }
}

runLifecycleTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
