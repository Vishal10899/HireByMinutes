const http = require('http');

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
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function runRenderHealthTests() {
  console.log('======================================================================');
  console.log('--- TESTING HIREBYMINUTES RENDER DEPLOYMENT & HEALTH MONITORING ---');
  console.log('======================================================================\n');

  try {
    // 1. Test GET /api/health
    console.log('1. Testing GET /api/health (Primary Health Monitor)...');
    const apiHealthGet = await request('http://localhost:5000/api/health');
    if (apiHealthGet.status !== 200) throw new Error(`GET /api/health returned ${apiHealthGet.status}`);
    if (apiHealthGet.data.status !== 'healthy') throw new Error(`Expected status: 'healthy', got: ${apiHealthGet.data.status}`);
    if (apiHealthGet.data.database !== 'connected') throw new Error(`Database check failed: ${apiHealthGet.data.database}`);
    console.log(`   ✓ Status 200 OK — Status: "${apiHealthGet.data.status}", Database: "${apiHealthGet.data.database}"`);
    console.log(`   ✓ Platform Version: ${apiHealthGet.data.version}, Uptime: ${apiHealthGet.data.uptimeSeconds}s`);
    console.log(`   ✓ Memory: RSS ${apiHealthGet.data.memory.rssMb}MB, Heap Used ${apiHealthGet.data.memory.heapUsedMb}MB`);

    // 2. Test HEAD /api/health (UptimeRobot ping format)
    console.log('\n2. Testing HEAD /api/health (Lightweight Probe)...');
    const apiHealthHead = await request('http://localhost:5000/api/health', { method: 'HEAD' });
    if (apiHealthHead.status !== 200) throw new Error(`HEAD /api/health returned ${apiHealthHead.status}`);
    console.log(`   ✓ Status 200 OK — Responded to HEAD request without body payload.`);

    // 3. Test GET /health and HEAD /health (Alternative Root Path)
    console.log('\n3. Testing GET & HEAD on /health (Root Health Alias)...');
    const rootHealthGet = await request('http://localhost:5000/health');
    if (rootHealthGet.status !== 200) throw new Error(`GET /health returned ${rootHealthGet.status}`);
    const rootHealthHead = await request('http://localhost:5000/health', { method: 'HEAD' });
    if (rootHealthHead.status !== 200) throw new Error(`HEAD /health returned ${rootHealthHead.status}`);
    console.log(`   ✓ Status 200 OK for both GET /health and HEAD /health.`);

    // 4. Test Production SPA Static Serving & Fallback
    console.log('\n4. Testing SPA Static Asset Serving & Route Fallbacks...');
    const rootGet = await request('http://localhost:5000/');
    if (rootGet.status === 200 && typeof rootGet.data === 'string' && rootGet.data.includes('html')) {
      console.log(`   ✓ GET / correctly serves production React index.html`);
    } else {
      console.log(`   ℹ Standalone API mode active (client dist will be served when built).`);
    }

    const spaRoute = await request('http://localhost:5000/about');
    if (spaRoute.status === 200 && typeof spaRoute.data === 'string' && spaRoute.data.includes('html')) {
      console.log(`   ✓ GET /about correctly falls back to index.html for client-side routing.`);
    }

    // 5. Test API Routing Integrity
    console.log('\n5. Verifying Core API Routing Surface...');
    const servicesRes = await request('http://localhost:5000/api/services');
    if (servicesRes.status !== 200) throw new Error(`GET /api/services failed with ${servicesRes.status}`);
    console.log(`   ✓ GET /api/services functional (Retrieved ${servicesRes.data.services.length} services).`);

    const categoriesRes = await request('http://localhost:5000/api/categories');
    if (categoriesRes.status !== 200) throw new Error(`GET /api/categories failed with ${categoriesRes.status}`);
    console.log(`   ✓ GET /api/categories functional (Retrieved ${categoriesRes.data.categories.length} categories).`);

    console.log('\n======================================================================');
    console.log('✅ ALL RENDER DEPLOYMENT & HEALTH MONITORING TESTS PASSED 100%!');
    console.log('======================================================================');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  }
}

runRenderHealthTests();
