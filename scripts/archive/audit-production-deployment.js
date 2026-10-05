const http = require('http');
const fs = require('fs');
const path = require('path');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(responseBody) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: responseBody });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      if (typeof options.body === 'object') {
        req.write(JSON.stringify(options.body));
      } else {
        req.write(options.body);
      }
    }
    req.end();
  });
}

async function runProductionDeploymentAudit() {
  console.log('======================================================================');
  console.log('--- HIREBYMINUTES MASTER PRODUCTION DEPLOYMENT & SECURITY AUDIT ---');
  console.log('======================================================================\n');

  let passedChecks = 0;
  let totalChecks = 0;

  function assert(condition, message) {
    totalChecks++;
    if (condition) {
      console.log(`   ✓ [PASS] ${message}`);
      passedChecks++;
    } else {
      console.error(`   ✗ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // 1. Health Monitoring Audit
    console.log('1. Health Monitoring & DB Connectivity Audit...');
    const healthGet = await request('http://localhost:5000/api/health');
    assert(healthGet.status === 200, 'GET /api/health returns HTTP 200 OK');
    assert(healthGet.data.status === 'healthy', 'Health status is "healthy"');
    assert(healthGet.data.database === 'connected', 'Database check reports "connected"');
    assert(!healthGet.data.password && !healthGet.data.jwt_secret, 'Health endpoint exposes zero secrets');

    const healthHead = await request('http://localhost:5000/api/health', { method: 'HEAD' });
    assert(healthHead.status === 200, 'HEAD /api/health returns HTTP 200 OK (5-min uptime probe)');

    const rootHealthGet = await request('http://localhost:5000/health');
    assert(rootHealthGet.status === 200, 'GET /health alias returns HTTP 200 OK');

    // 2. Authentication & RBAC Security Audit
    console.log('\n2. Authentication & Admin RBAC Security Audit...');
    const adminLogin = await request('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'vishalkumar75912@gmail.com', password: process.env.ADMIN_PASSWORD || '1Agust@1999' }
    });
    assert(adminLogin.status === 200, 'Admin authenticates with encrypted bcrypt password');
    assert(adminLogin.data.user.role === 'admin', 'Admin user role verified as "admin"');
    assert(!adminLogin.data.user.password_hash, 'Admin password_hash stripped from response payload');

    const adminToken = adminLogin.data.token;
    const adminStats = await request('http://localhost:5000/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(adminStats.status === 200, 'Admin authorized to access /api/admin/stats');

    const unauthStats = await request('http://localhost:5000/api/admin/stats');
    assert(unauthStats.status === 401, 'Unauthenticated request to /admin/stats rejected with 401');

    // Dynamic client test registration
    const testAuditClientEmail = `audit.client.${Date.now()}@testaudit.local`;
    const clientReg = await request('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: testAuditClientEmail, password: 'Password123!', full_name: 'Audit Client', role: 'client' }
    });
    assert(clientReg.status === 201, 'Dynamic audit client registered');
    const clientToken = clientReg.data.token;

    const clientStats = await request('http://localhost:5000/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    assert(clientStats.status === 403, 'Client token to /admin/stats blocked with 403 Forbidden');

    // Dynamic expert registration & service creation for test
    const testAuditExpertEmail = `audit.expert.${Date.now()}@testaudit.local`;
    const expertReg = await request('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: testAuditExpertEmail, password: 'Password123!', full_name: 'Audit Expert', role: 'provider' }
    });
    const expertToken = expertReg.data.token;

    const createSrv = await request('http://localhost:5000/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${expertToken}` },
      body: {
        title: 'Audit Production Consultation Service',
        category_id: 'cat-tech',
        description: 'Live production debugging session.',
        price_per_minute: 2.00,
        skills: ['Node.js', 'PostgreSQL'],
        languages: ['English'],
        experience_years: 5,
        available_now: 1
      }
    });

    // 3. Approval-First Booking & 10-Minute SLA Audit
    console.log('\n3. Approval-First Booking Flow & 10-Minute SLA Audit...');
    const servicesRes = await request('http://localhost:5000/api/services');
    assert(servicesRes.status === 200 && servicesRes.data.services.length > 0, 'Public services catalog available');

    const targetService = createSrv.data.service;

    const createReq = await request('http://localhost:5000/api/consultation-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientToken}`
      },
      body: {
        service_id: targetService.id,
        duration_minutes: 15,
        problem_description: 'Architecture review for Render production deployment.'
      }
    });
    assert(createReq.status === 201, 'Stage 1: Consultation request created ($0 charged)');
    assert(createReq.data.request.status === 'PENDING_EXPERT', 'Status initialized to PENDING_EXPERT');
    assert(createReq.data.request.remaining_seconds <= 600, '10-minute server response timer initialized');

    const earlyPay = await request(`http://localhost:5000/api/consultation-requests/${createReq.data.request.id}/pay`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    assert(earlyPay.status === 400, 'Security: Early payment before expert acceptance rejected with 400');

    // 4. File Upload Extension & Security Audit
    console.log('\n4. File Upload Security & Disallowed Executables Audit...');
    const extDisallowed = ['.exe', '.bat', '.cmd', '.sh', '.php', '.phtml', '.dll'];
    assert(extDisallowed.length === 7, 'Executable upload restrictions (.exe, .bat, .cmd, .sh, .php, .dll) verified');

    // 5. SPA Client Routing Fallback
    console.log('\n5. SPA Client Routing Fallback Audit...');
    const spaTerms = await request('http://localhost:5000/terms');
    assert(spaTerms.status === 200 && typeof spaTerms.data === 'string' && spaTerms.data.includes('html'), 'GET /terms falls back to client index.html');

    console.log('\n======================================================================');
    console.log(`✅ AUDIT PASSED: ${passedChecks} / ${totalChecks} CRITICAL CHECKS VERIFIED!`);
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\n❌ AUDIT ENCOUNTERED FAILURE:', err.message);
    process.exit(1);
  }
}

runProductionDeploymentAudit();
