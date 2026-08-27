// HireByMinutes — Admin Authentication & Security Test Suite
// Verifies RBAC, bcrypt password hashing, token validation, and authorization protections

const http = require('http');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const dbPath = path.join(__dirname, 'server', 'hirebyminutes.db');
const db = new Database(dbPath);

const API_BASE = 'http://localhost:5000/api';

function request(method, reqPath, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}${reqPath}`);
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, data: parsed });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runAdminAuthTests() {
  console.log('======================================================================');
  console.log('--- TESTING HIREBYMINUTES ADMIN AUTHENTICATION & SECURITY (RBAC) ---');
  console.log('======================================================================\n');

  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'vishalkumar75912@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'HBM-Adm!n#2026$Secur3';

    // 1. Admin account exists
    console.log('1. Checking Admin Account Existence in Database...');
    const adminDbUser = db.prepare('SELECT id, email, role, password_hash, verified, email_verified FROM users WHERE LOWER(email) = ?').get(adminEmail.toLowerCase());
    if (!adminDbUser) {
      throw new Error(`Admin user not found in database for email: ${adminEmail}`);
    }
    console.log(`   ✓ Admin user exists: ${adminDbUser.id} (${adminDbUser.email})`);
    console.log(`   ✓ Admin role in database: ${adminDbUser.role}`);

    // 2. Password is not stored as plaintext
    console.log('\n2. Verifying Password Storage Security...');
    if (!adminDbUser.password_hash.startsWith('$2')) {
      throw new Error('Password hash is not a valid bcrypt hash! Security violation.');
    }
    if (adminDbUser.password_hash.length !== 60) {
      throw new Error('Expected 60-character bcrypt hash.');
    }
    if (adminDbUser.password_hash === adminPassword) {
      throw new Error('CRITICAL: Plaintext password found stored directly in database!');
    }
    console.log(`   ✓ Admin password is securely hashed with bcrypt (length: ${adminDbUser.password_hash.length}, prefix: ${adminDbUser.password_hash.slice(0, 7)}...)`);
    console.log(`   ✓ Plaintext password is NEVER stored in database.`);

    // 3. Valid admin credentials -> 200
    console.log('\n3. Testing Admin Login with Valid Credentials...');
    const validLogin = await request('POST', '/auth/login', {
      email: adminEmail,
      password: adminPassword
    });

    if (validLogin.status !== 200) {
      throw new Error(`Admin login failed with status ${validLogin.status}: ${JSON.stringify(validLogin.data)}`);
    }
    if (!validLogin.data.token || !validLogin.data.user) {
      throw new Error('Login response missing token or user payload');
    }
    const adminToken = validLogin.data.token;
    const adminUser = validLogin.data.user;
    console.log(`   ✓ Status 200 OK — Admin authenticated successfully!`);
    console.log(`   ✓ Welcome message: "${validLogin.data.message}"`);

    // 4. Admin receives role = 'admin'
    console.log('\n4. Verifying Admin Role & Sanitization...');
    if (adminUser.role !== 'admin') {
      throw new Error(`Expected role 'admin', received '${adminUser.role}'`);
    }
    console.log(`   ✓ User role verified as 'admin'`);

    // 5. Password is never returned by any API
    console.log('\n5. Verifying Password Hash is Never Returned in API Payloads...');
    if (adminUser.password_hash || adminUser.password) {
      throw new Error('CRITICAL: Password hash leaked in login API response!');
    }

    const meRes = await request('GET', '/auth/me', null, adminToken);
    if (meRes.data.user.password_hash || meRes.data.user.password) {
      throw new Error('CRITICAL: Password hash leaked in /auth/me API response!');
    }
    console.log(`   ✓ Verified: password_hash is stripped from /auth/login and /auth/me payloads.`);

    // 6. Invalid password -> 401
    console.log('\n6. Testing Admin Login with Invalid Password...');
    const wrongPassRes = await request('POST', '/auth/login', {
      email: adminEmail,
      password: 'WrongPassword!999'
    });
    if (wrongPassRes.status !== 401) {
      throw new Error(`Expected status 401 for wrong password, received ${wrongPassRes.status}`);
    }
    console.log(`   ✓ Status 401 Unauthorized — Correctly rejected: "${wrongPassRes.data.error}"`);

    // 7. Invalid email -> 401
    console.log('\n7. Testing Admin Login with Invalid Email...');
    const wrongEmailRes = await request('POST', '/auth/login', {
      email: 'nonexistent_admin_123@example.com',
      password: adminPassword
    });
    if (wrongEmailRes.status !== 401) {
      throw new Error(`Expected status 401 for nonexistent email, received ${wrongEmailRes.status}`);
    }
    console.log(`   ✓ Status 401 Unauthorized — Correctly rejected: "${wrongEmailRes.data.error}"`);

    // 8. Admin access to Admin Endpoints
    console.log('\n8. Testing Admin Authorized Access to Protected Endpoints...');
    const adminStatsRes = await request('GET', '/admin/stats', null, adminToken);
    if (adminStatsRes.status !== 200) {
      throw new Error(`Admin access to /admin/stats failed with status ${adminStatsRes.status}`);
    }
    console.log(`   ✓ Admin access granted to /admin/stats (Total users: ${adminStatsRes.data.stats.totalUsers})`);

    // 9. Client cannot access admin endpoints -> 403
    console.log('\n9. Testing RBAC: Client User Access Rejection to Admin Endpoints...');
    const clientAuth = await request('POST', '/auth/login', { email: 'sarah@hirebyminutes.com', password: 'demo123' });
    const clientToken = clientAuth.data.token;

    const clientAdminStats = await request('GET', '/admin/stats', null, clientToken);
    if (clientAdminStats.status !== 403) {
      throw new Error(`Expected status 403 for client accessing admin endpoint, received ${clientAdminStats.status}`);
    }
    console.log(`   ✓ Status 403 Forbidden — Client user correctly blocked from admin endpoints: "${clientAdminStats.data.error}"`);

    // 10. Provider cannot access admin endpoints -> 403
    console.log('\n10. Testing RBAC: Provider User Access Rejection to Admin Endpoints...');
    const providerAuth = await request('POST', '/auth/login', { email: 'arjun@hirebyminutes.com', password: 'demo123' });
    const providerToken = providerAuth.data.token;

    const providerAdminStats = await request('GET', '/admin/stats', null, providerToken);
    if (providerAdminStats.status !== 403) {
      throw new Error(`Expected status 403 for provider accessing admin endpoint, received ${providerAdminStats.status}`);
    }
    console.log(`   ✓ Status 403 Forbidden — Provider user correctly blocked from admin endpoints: "${providerAdminStats.data.error}"`);

    // 11. Existing client/provider authentication remains unaffected
    console.log('\n11. Verifying Client and Provider Authentication Continuity...');
    if (clientAuth.status !== 200 || clientAuth.data.user.email !== 'sarah@hirebyminutes.com') {
      throw new Error('Client authentication failed');
    }
    if (providerAuth.status !== 200 || providerAuth.data.user.email !== 'arjun@hirebyminutes.com') {
      throw new Error('Provider authentication failed');
    }
    console.log(`   ✓ Client Sarah Chen authenticated successfully`);
    console.log(`   ✓ Provider Arjun Sharma authenticated successfully`);

    console.log('\n======================================================================');
    console.log('✅ ALL ADMIN AUTHENTICATION & RBAC SECURITY TESTS PASSED 100%!');
    console.log('======================================================================');

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  }
}

runAdminAuthTests();
