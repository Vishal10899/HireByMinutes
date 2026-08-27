const assert = require('assert');

async function runAuthTests() {
  const BASE_URL = 'http://localhost:5000/api';
  console.log('--- Testing HireByMinutes Password Authentication ---');

  const testEmail = `test-user-${Date.now()}@example.com`;
  const validPassword = 'SecurePassword2026!';

  // Test 1: Short password rejection
  console.log('1. Testing short password rejection (< 8 chars)...');
  const resShort = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Test Short',
      email: testEmail,
      password: 'short'
    })
  });
  assert.strictEqual(resShort.status, 400, 'Should reject short password with 400');
  const jsonShort = await resShort.json();
  console.log('   ✓ Short password rejected:', jsonShort.error);

  // Test 2: Password missing numbers
  console.log('2. Testing password without numbers...');
  const resNoNum = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Test NoNum',
      email: testEmail,
      password: 'onlyletterslongpassword'
    })
  });
  assert.strictEqual(resNoNum.status, 400, 'Should reject password without numbers with 400');
  const jsonNoNum = await resNoNum.json();
  console.log('   ✓ Password without numbers rejected:', jsonNoNum.error);

  // Test 3: Valid registration
  console.log('3. Testing valid registration with strong password...');
  const resValid = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Alex Developer',
      email: testEmail,
      password: validPassword,
      role: 'provider',
      headline: 'Senior Cloud & Backend Architect'
    })
  });
  assert.strictEqual(resValid.status, 201, 'Should create account with 201');
  const jsonValid = await resValid.json();
  assert.ok(jsonValid.user, 'Should return user object');
  assert.ok(jsonValid.token, 'Should return token');
  assert.strictEqual(jsonValid.user.password_hash, undefined, 'CRITICAL: password_hash MUST NOT be returned in register response');
  assert.strictEqual(jsonValid.user.email, testEmail);
  console.log('   ✓ Account created cleanly. User ID:', jsonValid.user.id);
  console.log('   ✓ password_hash properly stripped from response.');

  // Test 4: Duplicate email rejection
  console.log('4. Testing duplicate email rejection...');
  const resDup = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Duplicate Alex',
      email: testEmail,
      password: validPassword
    })
  });
  assert.strictEqual(resDup.status, 409, 'Should reject duplicate email with 409');
  console.log('   ✓ Duplicate email rejected.');

  // Test 5: Login with wrong password
  console.log('5. Testing login with wrong password...');
  const resWrongPass = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'WrongPassword123!'
    })
  });
  assert.strictEqual(resWrongPass.status, 401, 'Should reject wrong password with 401');
  console.log('   ✓ Wrong password rejected.');

  // Test 6: Login with correct password
  console.log('6. Testing login with correct password...');
  const resLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: validPassword
    })
  });
  assert.strictEqual(resLogin.status, 200, 'Should login with 200');
  const jsonLogin = await resLogin.json();
  assert.ok(jsonLogin.token, 'Should return token');
  assert.strictEqual(jsonLogin.user.password_hash, undefined, 'CRITICAL: password_hash MUST NOT be returned in login response');
  console.log('   ✓ Login successful. Welcome message:', jsonLogin.message);
  console.log('   ✓ password_hash properly stripped from response.');

  // Test 7: Verify /auth/me sanitization
  console.log('7. Testing /auth/me sanitization...');
  const resMe = await fetch(`${BASE_URL}/auth/me`, {
    headers: { 'Authorization': `Bearer ${jsonLogin.token}` }
  });
  assert.strictEqual(resMe.status, 200);
  const jsonMe = await resMe.json();
  assert.strictEqual(jsonMe.user.password_hash, undefined, 'CRITICAL: password_hash MUST NOT be returned in /auth/me response');
  console.log('   ✓ /auth/me verified. password_hash stripped.');

  console.log('\n✅ ALL 7 AUTHENTICATION SECURITY & PASSWORD TESTS PASSED 100%!');
}

runAuthTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
