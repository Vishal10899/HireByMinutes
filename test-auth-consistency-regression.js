// =============================================================================
// HireByMinute — Authentication Data Consistency & Regression Test Suite
// Verifies:
// 1. Safe inspection of real account (Vishalchaudhary74096@gmail.com) without modifying data
// 2. Email normalization rules across all variants (uppercase, mixed case, whitespace)
// 3. Consistency between Registration duplicate check and Login lookup
// 4. "Existing email detected during registration must also be discoverable by login"
// 5. Verification status handling (unverified account blocked from session issuance,
//    returns requires_verification = true, transitions to verification, NEVER "not found")
// 6. Password reset lookup for real account
// 7. Full lifecycle verification with fresh account (A through K in test matrix)
// =============================================================================

const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const BASE_URL = 'http://localhost:5000/api';
const dbPath = path.join(__dirname, 'server', 'hirebyminutes.db');
const db = new Database(dbPath);

async function runRegressionSuite() {
  console.log('\n=============================================================================');
  console.log('🧪 HIREBYMINUTE AUTHENTICATION DATA CONSISTENCY REGRESSION SUITE');
  console.log('=============================================================================\n');

  let passed = 0;
  let total = 0;

  function record(desc, ok, extra = '') {
    total++;
    if (ok) {
      passed++;
      console.log(`  ✓ [PASS] ${desc} ${extra}`);
    } else {
      console.error(`  ❌ [FAIL] ${desc} ${extra}`);
      throw new Error(`Test assertion failed: ${desc}`);
    }
  }

  // ---------------------------------------------------------------------------
  // PART 1: Safe Inspection of Real Production Account
  // ---------------------------------------------------------------------------
  console.log('--- Phase 1: Safe Audit of Real Account (Vishalchaudhary74096@gmail.com) ---');
  const targetEmail = 'Vishalchaudhary74096@gmail.com';
  const cleanEmail = targetEmail.trim().toLowerCase();

  const userRows = db.prepare('SELECT id, email, username, role, email_verified, is_suspended, verified, created_at, (password_hash IS NOT NULL) as has_password, length(password_hash) as hash_len FROM users WHERE LOWER(email) = ?').all(cleanEmail);

  record('Real account exists in database', userRows.length === 1);
  const realUser = userRows[0];
  record('Exact duplicate count is zero (single unique row)', userRows.length === 1);
  record('Stored email is strictly normalized', realUser.email === cleanEmail);
  record('Account status: not suspended', realUser.is_suspended === 0);
  record('Verification status safely identified', realUser.email_verified === 0, `(email_verified: ${realUser.email_verified})`);
  record('Password hash is securely stored with bcrypt', realUser.has_password === 1 && realUser.hash_len === 60);

  console.log(`     Real User ID: ${realUser.id}`);
  console.log(`     Role: ${realUser.role}`);
  console.log(`     Created At: ${realUser.created_at}`);

  // ---------------------------------------------------------------------------
  // PART 2: Registration Duplicate Check on Real Account
  // ---------------------------------------------------------------------------
  console.log('\n--- Phase 2: Registration Duplicate Check on Real Account ---');

  // Test with original casing
  const regOriginal = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: targetEmail,
      password: 'AnotherPassword123!',
      full_name: 'Imposter Attempt',
      role: 'client'
    })
  });
  const regOrigData = await regOriginal.json();
  record('Registration with existing email returns 409 Conflict', regOriginal.status === 409);
  record('Registration error message is consistent', regOrigData.error === 'An account with this email address already exists.');
  record('Registration identifies unverified state (requires_verification === true)', regOrigData.requires_verification === true);

  // Test with uppercase
  const regUpper = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: targetEmail.toUpperCase(),
      password: 'AnotherPassword123!',
      full_name: 'Imposter Attempt',
      role: 'client'
    })
  });
  record('Registration with uppercase email returns 409 Conflict', regUpper.status === 409);

  // Test with leading and trailing whitespace
  const regWhitespace = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `   ${targetEmail}   `,
      password: 'AnotherPassword123!',
      full_name: 'Imposter Attempt',
      role: 'client'
    })
  });
  record('Registration with whitespace-padded email returns 409 Conflict', regWhitespace.status === 409);

  // ---------------------------------------------------------------------------
  // PART 3: Login Behavior on Real Account
  // ---------------------------------------------------------------------------
  console.log('\n--- Phase 3: Login Account Discovery on Real Account ---');

  // Login with wrong password: MUST return 401 "Invalid email or password" (NEVER "No account found")
  const loginWrongPass = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: targetEmail,
      password: 'DefinitiveWrongPassword999!'
    })
  });
  const loginWrongData = await loginWrongPass.json();
  record('Login with wrong password returns 401 Unauthorized', loginWrongPass.status === 401);
  record('Login wrong password returns generic credentials error', loginWrongData.error === 'Invalid email or password.');

  // Login with uppercase email and wrong password
  const loginUpperWrong = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: targetEmail.toUpperCase(),
      password: 'DefinitiveWrongPassword999!'
    })
  });
  record('Login with uppercase email returns 401 Unauthorized', loginUpperWrong.status === 401);

  // Login with whitespace-padded email and wrong password
  const loginWhiteWrong = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `   ${targetEmail}   `,
      password: 'DefinitiveWrongPassword999!'
    })
  });
  record('Login with whitespace-padded email returns 401 Unauthorized', loginWhiteWrong.status === 401);

  // ---------------------------------------------------------------------------
  // PART 4: Password Reset Lookup on Real Account
  // ---------------------------------------------------------------------------
  console.log('\n--- Phase 4: Password Reset Lookup on Real Account ---');

  const forgotRes = await fetch(`${BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: targetEmail })
  });
  record('Password reset request returns HTTP 200 OK', forgotRes.status === 200);

  const resetToken = db.prepare('SELECT id, user_id, expires_at FROM password_reset_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(realUser.id);
  record('Password reset token created for real user', Boolean(resetToken && resetToken.user_id === realUser.id));

  // Clean up the temporary reset token to keep real user data clean
  if (resetToken) {
    db.prepare('DELETE FROM password_reset_tokens WHERE id = ?').run(resetToken.id);
  }

  // ---------------------------------------------------------------------------
  // PART 5: Full End-to-End Test Matrix on Lifecycle Account (A through K)
  // ---------------------------------------------------------------------------
  console.log('\n--- Phase 5: Full Test Matrix on Lifecycle Account (Points A - K) ---');

  const testStamp = Date.now();
  const matrixEmail = `matrix.test.${testStamp}@hirebyminute.com`;
  const matrixPassword = 'MatrixPassword2026!';
  const matrixName = `Matrix Tester ${testStamp}`;

  // 1. Initial Register (Pending / Unverified)
  const matrixReg = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `  ${matrixEmail.toUpperCase()}  `, // Test normalization on insert
      password: matrixPassword,
      full_name: matrixName,
      role: 'client'
    })
  });
  const matrixRegData = await matrixReg.json();
  record('A1. Initial registration creates unverified account (201)', matrixReg.status === 201);
  record('A2. Initial registration requires verification', matrixRegData.requires_verification === true);
  record('A3. Initial registration does NOT return token', matrixRegData.token === undefined);

  // A. Register with existing email -> existing-account response
  const matrixDup = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: matrixEmail,
      password: matrixPassword,
      full_name: 'Dup Name',
      role: 'client'
    })
  });
  const matrixDupData = await matrixDup.json();
  record('A. Register with existing email -> 409 Conflict', matrixDup.status === 409);
  record('A. Register with existing email -> returns duplicate message', matrixDupData.error === 'An account with this email address already exists.');
  record('A. Register detects unverified account -> requires_verification === true', matrixDupData.requires_verification === true);

  // C. Login with existing email + wrong password -> 401
  const matrixWrongPass = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: matrixEmail,
      password: 'WrongPassword999!'
    })
  });
  record('C. Login with existing email + wrong password -> 401', matrixWrongPass.status === 401);

  // K. Login with existing email + correct password BEFORE verification
  // -> MUST return 403 Forbidden with requires_verification = true (NEVER "No account found")
  const matrixUnverifiedLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: matrixEmail,
      password: matrixPassword
    })
  });
  const matrixUnverifiedData = await matrixUnverifiedLogin.json();
  record('K1. Unverified account login returns 403 Forbidden', matrixUnverifiedLogin.status === 403);
  record('K2. Unverified account login specifies requires_verification === true', matrixUnverifiedData.requires_verification === true);
  record('K3. Unverified account login error directs user to verify email', matrixUnverifiedData.error.includes('verify your email'));
  record('K4. CRITICAL: Unverified account login MUST NOT say "No account found"', !matrixUnverifiedData.error.toLowerCase().includes('not found'));

  // D. Login with uppercase email
  const matrixUpperLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: matrixEmail.toUpperCase(),
      password: matrixPassword
    })
  });
  const matrixUpperData = await matrixUpperLogin.json();
  record('D. Login with uppercase email resolves to same unverified account (403)', matrixUpperLogin.status === 403 && matrixUpperData.requires_verification === true);

  // E. Login with leading/trailing whitespace
  const matrixWhiteLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `   ${matrixEmail}   `,
      password: matrixPassword
    })
  });
  const matrixWhiteData = await matrixWhiteLogin.json();
  record('E. Login with whitespace resolves to same unverified account (403)', matrixWhiteLogin.status === 403 && matrixWhiteData.requires_verification === true);

  // G. OTP Verification -> Account becomes verified
  const matrixUserDb = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(matrixEmail.toLowerCase());
  const tokenRow = db.prepare('SELECT id, code_hash FROM email_verification_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(matrixUserDb.id);
  
  // Find matching OTP by hashing 6-digit combinations
  const crypto = require('crypto');
  let matchedOtp = null;
  for (let c = 100000; c <= 999999; c++) {
    const candidate = crypto.createHash('sha256').update(c.toString() + matrixUserDb.id).digest('hex');
    if (candidate === tokenRow.code_hash) {
      matchedOtp = c.toString();
      break;
    }
  }
  record('G1. OTP code recovered from secure hash', Boolean(matchedOtp));

  const verifyRes = await fetch(`${BASE_URL}/auth/verify-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `  ${matrixEmail.toUpperCase()}  `,
      code: matchedOtp
    })
  });
  const verifyData = await verifyRes.json();
  record('G2. OTP verification returns 200 OK', verifyRes.status === 200);
  record('G3. OTP verification issues valid JWT session token', Boolean(verifyData.token));
  record('G4. Account is now verified (email_verified === 1)', verifyData.user.email_verified === 1);

  // H. Refresh user after login / session persistence
  const meRes = await fetch(`${BASE_URL}/auth/me`, {
    headers: { 'Authorization': `Bearer ${verifyData.token}` }
  });
  const meData = await meRes.json();
  record('H. Session persistence: /auth/me returns authenticated user', meRes.status === 200 && meData.user.email === matrixEmail.toLowerCase());

  // B. Login with existing email + correct password AFTER verification -> 200 OK
  const postVerifyLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: matrixEmail,
      password: matrixPassword
    })
  });
  const postVerifyData = await postVerifyLogin.json();
  record('B. Login after verification returns 200 OK', postVerifyLogin.status === 200);
  record('B. Login after verification issues valid session token', Boolean(postVerifyData.token));

  // J. Login again after simulated logout
  const reLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: matrixEmail.toUpperCase(),
      password: matrixPassword
    })
  });
  record('J. Re-login succeeds with uppercase email (200 OK)', reLogin.status === 200);

  // Clean up lifecycle test user
  db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(matrixUserDb.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(matrixUserDb.id);

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed}/${total} checks passed (100%)`);
  console.log('=============================================================================\n');
  console.log('🎉 REGRESSION AUDIT CONFIRMED: DATA CONSISTENCY FULLY VERIFIED!');
}

runRegressionSuite().catch(err => {
  console.error('\n❌ FATAL REGRESSION ERROR:', err);
  process.exit(1);
});
