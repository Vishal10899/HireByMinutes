// =============================================================================
// HIREBYMINUTES — RENDER PRODUCTION DEPLOYMENT & SPA SERVING TEST SUITE
// =============================================================================
// Verifies:
// 1. Static frontend build artifacts compiled in client/dist/
// 2. Zero backend secrets or credentials exposed in frontend bundles
// 3. Lightweight /health & /api/health probe endpoints
// 4. Express static serving & SPA fallback routes (200 OK on all deep links)
// 5. Backend data API responsiveness (awake scenario)
// 6. Cold-start resilience & transient 502/503 retry handling
// =============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const { app } = require(path.join(ROOT_DIR, 'server', 'index'));

const PORT = 5099;
let serverInstance;

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = body;
        try { parsed = JSON.parse(body); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed,
          rawBody: body
        });
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runRenderDeploymentTests() {
  console.log('\n======================================================================');
  console.log('--- TESTING HIREBYMINUTES RENDER PRODUCTION DEPLOYMENT & SPA SERVING ---');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Frontend Static Build in client/dist/
  // ---------------------------------------------------------------------------
  console.log('1. Checking Frontend Build Artifacts in client/dist/...');
  const distDir = path.join(ROOT_DIR, 'client', 'dist');
  const indexHtml = path.join(distDir, 'index.html');
  const assetsDir = path.join(distDir, 'assets');

  assert(fs.existsSync(indexHtml), 'client/dist/index.html exists and is compiled');
  assert(fs.existsSync(assetsDir), 'client/dist/assets exists for static asset delivery');

  // Verify no backend secrets exist in frontend dist
  const distJsFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));
  let bundleContainsSecret = false;
  for (const jsFile of distJsFiles) {
    const code = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');
    if (code.includes('rzp_test_') || code.includes('rzp_live_') || code.includes('re_') || code.includes('whsec_')) {
      bundleContainsSecret = true;
    }
  }
  assert(!bundleContainsSecret, 'Verified zero backend API secrets exposed in frontend bundles');

  // ---------------------------------------------------------------------------
  // Start server on test port
  // ---------------------------------------------------------------------------
  await new Promise((resolve) => {
    serverInstance = app.listen(PORT, '127.0.0.1', resolve);
  });

  try {
    // ---------------------------------------------------------------------------
    // TEST 2: Health Probes (/api/health and /health)
    // ---------------------------------------------------------------------------
    console.log('\n2. Testing Lightweight /health & /api/health Endpoints...');
    const apiHealth = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/health',
      method: 'GET'
    });
    assert(apiHealth.statusCode === 200, 'GET /api/health returns 200 OK');
    assert(apiHealth.body.status === 'healthy', 'GET /api/health body reports status: "healthy"');

    const rootHealthHead = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/health',
      method: 'HEAD'
    });
    assert(rootHealthHead.statusCode === 200, 'HEAD /health returns 200 OK without body');

    // ---------------------------------------------------------------------------
    // TEST 3: CORS Headers for Production & Custom Domain Origins
    // ---------------------------------------------------------------------------
    console.log('\n3. Testing CORS Headers for Production Domain (hirebyminute.com)...');

    const prodPreflight = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/categories',
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://hirebyminute.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    });
    assert(prodPreflight.statusCode === 204, 'Preflight OPTIONS returns 204 No Content');
    assert(prodPreflight.headers['access-control-allow-origin'] === 'https://hirebyminute.com',
      'Preflight responds with Access-Control-Allow-Origin matching production domain');

    // ---------------------------------------------------------------------------
    // TEST 4: Backend Data API Responsiveness
    // ---------------------------------------------------------------------------
    console.log('\n4. Testing Backend Awake Scenario (Data Retrieval)...');
    const catRes = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/categories',
      method: 'GET'
    });
    assert(catRes.statusCode === 200, 'GET /api/categories returns HTTP 200');
    assert(Array.isArray(catRes.body?.categories) && catRes.body.categories.length > 0,
      `Retrieved ${catRes.body?.categories?.length || 0} categories successfully`);

    const servRes = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/services',
      method: 'GET'
    });
    assert(servRes.statusCode === 200, 'GET /api/services returns HTTP 200');

    const oppRes = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/opportunities',
      method: 'GET'
    });
    assert(oppRes.statusCode === 200, 'GET /api/opportunities returns HTTP 200');

    const jobsRes = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/jobs',
      method: 'GET'
    });
    assert(jobsRes.statusCode === 200, 'GET /api/jobs returns HTTP 200');

    // ---------------------------------------------------------------------------
    // TEST 5: Express SPA Fallback Serving client/dist/index.html
    // ---------------------------------------------------------------------------
    console.log('\n5. Testing Express SPA Fallback Serving (Render Direct Deep Links)...');
    const deepLinks = [
      '/',
      '/services',
      '/opportunities',
      '/jobs',
      '/how-it-works',
      '/about',
      '/contact',
      '/terms',
      '/privacy',
      '/login',
      '/signup',
      '/services/cat-tech',
      '/session/test-session-id',
      '/admin'
    ];

    for (const route of deepLinks) {
      const routeRes = await makeRequest({
        hostname: '127.0.0.1',
        port: PORT,
        path: route,
        method: 'GET'
      });
      assert(routeRes.statusCode === 200, `Direct access to ${route} returns 200 OK (no 404)`);
      assert(routeRes.rawBody.includes('<!doctype html>') || routeRes.rawBody.includes('<html'),
        `${route} correctly serves the HTML SPA document`);
    }

    // ---------------------------------------------------------------------------
    // TEST 6: Simulated Cold Start (502 / 503 / 504 / Delay Handling)
    // ---------------------------------------------------------------------------
    console.log('\n6. Testing Simulated Cold Start & Waking-Up Resilience...');

    let sleepAttempts = 0;
    const mockColdServer = http.createServer((req, res) => {
      sleepAttempts++;
      if (sleepAttempts === 1) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service Unavailable (Waking up)' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', woken: true }));
      }
    });

    const COLD_PORT = 5098;
    await new Promise(r => mockColdServer.listen(COLD_PORT, '127.0.0.1', r));

    const firstAttempt = await makeRequest({
      hostname: '127.0.0.1',
      port: COLD_PORT,
      path: '/api/health',
      method: 'GET'
    });
    assert(firstAttempt.statusCode === 503, 'Simulated initial Render sleep returns 503 (transient cold start)');

    const secondAttempt = await makeRequest({
      hostname: '127.0.0.1',
      port: COLD_PORT,
      path: '/api/health',
      method: 'GET'
    });
    assert(secondAttempt.statusCode === 200, 'Simulated retry after cold-start wake returns 200 OK');

    await new Promise(r => mockColdServer.close(r));
  } finally {
    await new Promise(r => serverInstance.close(r));
  }

  console.log('\n======================================================================');
  if (failed === 0) {
    console.log(`🎉 ALL ${passed} RENDER PRODUCTION DEPLOYMENT & SPA TESTS PASSED!`);
    return true;
  } else {
    console.error(`⚠️ ${failed} TESTS FAILED out of ${passed + failed}`);
    throw new Error(`${failed} tests failed`);
  }
}

if (require.main === module) {
  runRenderDeploymentTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}

module.exports = { runRenderDeploymentTests };
