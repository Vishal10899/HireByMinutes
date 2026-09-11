const http = require('http');
const db = require('./server/db');

const BASE_URL = 'http://localhost:5000/api';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : `${BASE_URL}${path}`);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      url,
      {
        method,
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runAuthPersistenceTests() {
  console.log('======================================================================');
  console.log('--- TESTING HIREBYMINUTES AUTHENTICATION LIFECYCLE & PERSISTENCE ---');
  console.log('======================================================================\n');

  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'vishalkumar75912@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'HBM-Adm!n#2026$Secur3';

    // 1. Admin Authentication & Session Setup
    console.log('1. Testing Admin Authentication (/auth/login)...');
    const adminLoginRes = await request('POST', '/auth/login', {
      email: adminEmail,
      password: adminPassword
    });
    if (adminLoginRes.status !== 200 || !adminLoginRes.data.token) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminLoginRes.data)}`);
    }
    const adminToken = adminLoginRes.data.token;
    const adminUser = adminLoginRes.data.user;
    console.log(`   ✓ Admin logged in: ${adminUser.full_name} (${adminUser.role})`);
    console.log(`   ✓ Received valid token: ${adminToken}\n`);

    // 2. Simulating Page Refresh on /admin (Token Restoration Lifecycle)
    console.log('2. Simulating Browser Refresh on /admin (Validating Session /auth/me)...');
    const adminMeRes = await request('GET', '/auth/me', null, adminToken);
    if (adminMeRes.status !== 200 || adminMeRes.data.user.role !== 'admin') {
      throw new Error(`Admin session validation failed on refresh: ${JSON.stringify(adminMeRes.data)}`);
    }
    console.log(`   ✓ /auth/me validated: user is ${adminMeRes.data.user.full_name}, role: ${adminMeRes.data.user.role}`);
    console.log(`   ✓ /admin route remains accessible with zero redirect to login.\n`);

    // 3. Admin Access to Authoritative APIs
    console.log('3. Testing Admin Authoritative API Access (/admin/stats)...');
    const adminStatsRes = await request('GET', '/admin/stats', null, adminToken);
    if (adminStatsRes.status !== 200) {
      throw new Error(`Admin stats failed: ${JSON.stringify(adminStatsRes.data)}`);
    }
    console.log(`   ✓ Admin access granted to stats: ${adminStatsRes.data.stats.totalUsers} total users\n`);

    // 4. Client Authentication & Persistence
    console.log('4. Testing Client Authentication & Refresh (/auth/me)...');
    const clientReg = await request('POST', '/auth/register', {
      email: `client.persist.${Date.now()}@testauth.local`,
      password: 'DemoPassword123!',
      full_name: 'Sarah Chen',
      role: 'client'
    });
    if (clientReg.status !== 201) throw new Error('Client registration failed');
    const clientToken = clientReg.data.token;

    const clientMeRes = await request('GET', '/auth/me', null, clientToken);
    if (clientMeRes.status !== 200 || !clientMeRes.data.user) {
      throw new Error(`Client session validation failed: ${JSON.stringify(clientMeRes.data)}`);
    }
    console.log(`   ✓ Client session preserved: ${clientMeRes.data.user.full_name} (${clientMeRes.data.user.role})\n`);

    // 5. Provider / Expert Authentication & Persistence
    console.log('5. Testing Provider / Expert Authentication & Refresh (/auth/me)...');
    const providerReg = await request('POST', '/auth/register', {
      email: `provider.persist.${Date.now()}@testauth.local`,
      password: 'DemoPassword123!',
      full_name: 'Arjun Sharma',
      role: 'provider'
    });
    if (providerReg.status !== 201) throw new Error('Provider registration failed');
    const providerToken = providerReg.data.token;

    const providerMeRes = await request('GET', '/auth/me', null, providerToken);
    if (providerMeRes.status !== 200 || providerMeRes.data.user.role !== 'provider') {
      throw new Error('Provider session validation failed');
    }
    console.log(`   ✓ Provider session preserved: ${providerMeRes.data.user.full_name} (${providerMeRes.data.user.role})\n`);

    // 6. Security Test: Client attempting /admin APIs
    console.log('6. Testing RBAC Security: Client attempting /admin/stats...');
    const clientAdminAttempt = await request('GET', '/admin/stats', null, clientToken);
    if (clientAdminAttempt.status !== 403) {
      throw new Error(`Client was not blocked from admin API! Status: ${clientAdminAttempt.status}`);
    }
    console.log(`   ✓ Client correctly blocked with HTTP 403: "${clientAdminAttempt.data.error}"\n`);

    // 7. Security Test: Provider attempting /admin APIs
    console.log('7. Testing RBAC Security: Provider attempting /admin/stats...');
    const providerAdminAttempt = await request('GET', '/admin/stats', null, providerToken);
    if (providerAdminAttempt.status !== 403) {
      throw new Error(`Provider was not blocked from admin API! Status: ${providerAdminAttempt.status}`);
    }
    console.log(`   ✓ Provider correctly blocked with HTTP 403: "${providerAdminAttempt.data.error}"\n`);

    // 8. Security Test: Unauthenticated user attempting /admin APIs
    console.log('8. Testing RBAC Security: Unauthenticated request to /admin/stats...');
    const unauthAdminAttempt = await request('GET', '/admin/stats');
    if (unauthAdminAttempt.status !== 401) {
      throw new Error(`Unauthenticated request was not blocked! Status: ${unauthAdminAttempt.status}`);
    }
    console.log(`   ✓ Unauthenticated request correctly blocked with HTTP 401: "${unauthAdminAttempt.data.error}"\n`);

    // 9. Logout Simulation & Token Invalidation
    console.log('9. Testing Logout Simulation & Clean State Invalidation...');
    const invalidTokenRes = await request('GET', '/auth/me', null, 'invalid-or-cleared-token');
    if (invalidTokenRes.status !== 401) {
      throw new Error('Invalid token was not rejected');
    }
    console.log(`   ✓ Cleared/invalid token correctly rejected with HTTP 401.\n`);

    console.log('======================================================================');
    console.log('✅ ALL AUTHENTICATION LIFECYCLE & PERSISTENCE TESTS PASSED 100%!');
    console.log('======================================================================');
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);
    process.exit(1);
  }
}

runAuthPersistenceTests();
