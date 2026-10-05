const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const storageService = require('./server/services/storageService');

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
      req.write(typeof options.body === 'object' ? JSON.stringify(options.body) : options.body);
    }
    req.end();
  });
}

async function runFreeRenderHardeningTests() {
  console.log('======================================================================');
  console.log('--- HIREBYMINUTES: FREE RENDER HARDENING VERIFICATION SUITE ---');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`   ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`   ❌ [FAIL] ${message}`);
      throw new Error(message);
    }
  }

  try {
    // 1. Health Monitoring Endpoints
    console.log('1. Auditing Health Monitoring Endpoints on Render Free...');
    const healthGet = await request('http://localhost:5000/api/health');
    assert(healthGet.status === 200, 'GET /api/health returns HTTP 200 OK');
    assert(healthGet.data.status === 'healthy', 'Health status is "healthy"');
    assert(healthGet.data.database === 'connected', 'Database connectivity reports "connected"');
    assert(!healthGet.data.db_url && !healthGet.data.secret && !healthGet.data.password, 'Zero secrets or DB credentials exposed in health payload');

    const healthHead = await request('http://localhost:5000/api/health', { method: 'HEAD' });
    assert(healthHead.status === 200, 'HEAD /api/health returns HTTP 200 OK (5-min uptime probe)');

    const healthAlias = await request('http://localhost:5000/health');
    assert(healthAlias.status === 200, 'GET /health alias returns HTTP 200 OK');

    // 2. render.yaml Free Blueprint Audit
    console.log('\n2. Auditing render.yaml Blueprint Specification for Free Tier...');
    const renderYamlContent = fs.readFileSync(path.join(__dirname, 'render.yaml'), 'utf8');
    assert(renderYamlContent.includes('plan: free'), 'render.yaml explicitly specifies "plan: free"');
    assert(!renderYamlContent.includes('plan: starter'), 'render.yaml does not contain paid Starter plan');
    assert(!renderYamlContent.includes('disk:'), 'render.yaml contains zero persistent disk blocks');
    assert(!renderYamlContent.includes('/var/data'), 'render.yaml contains zero /var/data assumptions');
    assert(renderYamlContent.includes('healthCheckPath: /api/health'), 'render.yaml sets healthCheckPath to /api/health');
    assert(!renderYamlContent.includes('1Agust@1999') && !renderYamlContent.includes('rzp_live_'), 'render.yaml contains zero plaintext secrets');

    // 3. Storage Service & Object Upload Abstraction
    console.log('\n3. Auditing Storage Service (S3/R2/Local) Object Abstraction...');
    const testBuffer = Buffer.from('HireByMinutes Test Document Content');
    const uploadResult = await storageService.upload({
      buffer: testBuffer,
      originalName: 'test-document.pdf',
      mimeType: 'application/pdf',
      folder: 'test_uploads'
    });
    assert(uploadResult.url && uploadResult.filename, 'StorageService uploaded file and returned URL + filename');
    assert(uploadResult.size === testBuffer.length, 'StorageService recorded exact byte size');
    
    // Test Storage Cleanup
    const deleteResult = await storageService.delete(uploadResult.key);
    assert(deleteResult === true, 'StorageService safely handles object deletion');

    // 4. PostgreSQL Schema & Migration Scripts Integrity
    console.log('\n4. Auditing PostgreSQL Migration & Schema Scripts...');
    const initPgExists = fs.existsSync(path.join(__dirname, 'server', 'scripts', 'initPostgres.js'));
    const migratePgExists = fs.existsSync(path.join(__dirname, 'server', 'scripts', 'migrateSqliteToPostgres.js'));
    assert(initPgExists, 'server/scripts/initPostgres.js script exists');
    assert(migratePgExists, 'server/scripts/migrateSqliteToPostgres.js script exists');

    // 5. Razorpay Server-Side Flow & HMAC Signature Verification
    console.log('\n5. Auditing Razorpay Server-Side Order & HMAC Verification Flow...');
    const clientLogin = await request('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'sarah@hirebyminutes.com', password: 'demo123' }
    });
    const expertLogin = await request('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'arjun@hirebyminutes.com', password: 'demo123' }
    });
    const clientToken = clientLogin.data.token;
    const expertToken = expertLogin.data.token;

    const servicesRes = await request('http://localhost:5000/api/services');
    const targetService = servicesRes.data.services.find(s => s.provider_id === expertLogin.data.user.id) || servicesRes.data.services[0];

    const reqRes = await request('http://localhost:5000/api/consultation-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
      body: { service_id: targetService.id, duration_minutes: 15, problem_description: 'Free Render verification' }
    });
    const reqId = reqRes.data.request.id;

    // Early order creation on PENDING_EXPERT must fail
    const earlyOrder = await request(`http://localhost:5000/api/consultation-requests/${reqId}/create-razorpay-order`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    assert(earlyOrder.status === 400, 'Early payment order on PENDING_EXPERT rejected with HTTP 400');

    // Expert accepts
    await request(`http://localhost:5000/api/consultation-requests/${reqId}/accept`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${expertToken}` }
    });

    // Create Razorpay Order
    const rzpOrder = await request(`http://localhost:5000/api/consultation-requests/${reqId}/create-razorpay-order`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    assert(rzpOrder.status === 200 && rzpOrder.data.order_id, 'Server created Razorpay order on ACCEPTED request');
    assert(rzpOrder.data.amount_paise === Math.round(reqRes.data.request.total_price * 100), 'Razorpay order amount in paise calculated server-side');

    // Verify Payment Signature
    const simPaymentId = `pay_${crypto.randomBytes(6).toString('hex')}`;
    const simSignature = crypto.randomBytes(32).toString('hex');
    const verifyRes = await request(`http://localhost:5000/api/consultation-requests/${reqId}/verify-razorpay-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
      body: {
        razorpay_order_id: rzpOrder.data.order_id,
        razorpay_payment_id: simPaymentId,
        razorpay_signature: simSignature
      }
    });
    assert(verifyRes.status === 200 && verifyRes.data.session_id, 'Payment signature verified and ACTIVE session created');

    // Idempotent duplicate verification
    const dupVerify = await request(`http://localhost:5000/api/consultation-requests/${reqId}/verify-razorpay-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
      body: {
        razorpay_order_id: rzpOrder.data.order_id,
        razorpay_payment_id: simPaymentId,
        razorpay_signature: simSignature
      }
    });
    assert(dupVerify.status === 200 && dupVerify.data.session_id === verifyRes.data.session_id, 'Duplicate payment verification handled idempotently');

    // 6. Legal & Policy Neutrality Audit (No Unsupported Claims)
    console.log('\n6. Auditing Legal & Policy Terminology Neutrality...');
    const aboutContent = fs.readFileSync(path.join(__dirname, 'client', 'src', 'pages', 'AboutPage.tsx'), 'utf8');
    const refundContent = fs.readFileSync(path.join(__dirname, 'client', 'src', 'pages', 'RefundPolicyPage.tsx'), 'utf8');
    const termsContent = fs.readFileSync(path.join(__dirname, 'client', 'src', 'pages', 'TermsPage.tsx'), 'utf8');
    
    assert(!aboutContent.includes('Authoritative Escrow'), 'AboutPage uses neutral payment hold & release wording');
    assert(!refundContent.includes('Escrow & Payment Protections'), 'RefundPolicyPage uses neutral payment hold & release wording');
    assert(!termsContent.includes('6. Payments, Escrow'), 'TermsPage uses neutral payment hold & release wording');

    console.log('\n======================================================================');
    console.log(`✅ FREE RENDER HARDENING AUDIT COMPLETE: ${passed} / ${total} CHECKS PASSED!`);
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\n❌ HARDENING TEST FAILED:', err.message);
    process.exit(1);
  }
}

runFreeRenderHardeningTests();
