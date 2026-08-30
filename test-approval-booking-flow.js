// Integration test suite for HireByMinutes Approval-First Consultation Flow
const http = require('http');

function post(url, data, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseBody) });
        } catch {
          resolve({ status: res.statusCode, data: responseBody });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseBody) });
        } catch {
          resolve({ status: res.statusCode, data: responseBody });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('--- TESTING HIREBYMINUTES APPROVAL-FIRST BOOKING FLOW ---');
  console.log('======================================================\n');

  // 1. Authenticate Client and Provider
  console.log('1. Authenticating test users...');
  const testClientEmail = `client.booking.${Date.now()}@testbooking.local`;
  const clientLogin = await post('http://localhost:5000/api/auth/register', {
    email: testClientEmail,
    password: 'Password123!',
    full_name: 'Sarah Chen (Test)',
    role: 'client'
  });
  if (clientLogin.status !== 201) throw new Error(`Client register failed: ${JSON.stringify(clientLogin.data)}`);
  const clientToken = clientLogin.data.token;
  const clientId = clientLogin.data.user.id;
  console.log(`   ✓ Authenticated Client: ${clientLogin.data.user.full_name} (${clientId})`);

  const testProviderEmail = `provider.booking.${Date.now()}@testbooking.local`;
  const providerLogin = await post('http://localhost:5000/api/auth/register', {
    email: testProviderEmail,
    password: 'Password123!',
    full_name: 'Dr. Elena Rostova (Test)',
    role: 'provider'
  });
  if (providerLogin.status !== 201) throw new Error(`Provider register failed: ${JSON.stringify(providerLogin.data)}`);
  const providerToken = providerLogin.data.token;
  const providerId = providerLogin.data.user.id;
  console.log(`   ✓ Authenticated Provider: ${providerLogin.data.user.full_name} (${providerId})`);

  // Another client for unauthorized payment tests
  const testOtherClientEmail = `other.booking.${Date.now()}@testbooking.local`;
  const otherClientLogin = await post('http://localhost:5000/api/auth/register', {
    email: testOtherClientEmail,
    password: 'Password123!',
    full_name: 'Marcus Brody (Test)',
    role: 'client'
  });
  if (otherClientLogin.status !== 201) throw new Error(`Other client register failed: ${JSON.stringify(otherClientLogin.data)}`);
  const otherClientToken = otherClientLogin.data.token;

  // Create active service for provider
  const createServiceRes = await post('http://localhost:5000/api/services', {
    title: 'High-Load Architecture Review & Next.js Debugging',
    category_id: 'cat-tech',
    description: 'Direct deep-dive architecture inspection and live tracing.',
    price_per_minute: 2.00,
    skills: ['Next.js', 'System Architecture'],
    languages: ['English'],
    experience_years: 10,
    available_now: 1
  }, providerToken);
  const elenaService = createServiceRes.data.service;
  console.log(`   ✓ Found service: "${elenaService.title}" ($${elenaService.price_per_minute}/min)`);

  // 2. Client sends consultation request (Stage 1)
  console.log('\n2. Testing Consultation Request creation (Stage 1: Request sent, NO payment, NO session)...');
  const reqRes = await post('http://localhost:5000/api/consultation-requests', {
    service_id: elenaService.id,
    duration_minutes: 30,
    connect_type: 'now',
    problem_description: 'Need assistance reviewing high-load architecture for our Next.js frontend.'
  }, clientToken);

  if (reqRes.status !== 201) {
    throw new Error(`Failed to create request: ${JSON.stringify(reqRes.data)}`);
  }

  const request = reqRes.data.request;
  console.log(`   ✓ Request created with ID: ${request.id}`);
  console.log(`   ✓ Status is: ${request.status} (Expected: PENDING_EXPERT)`);
  console.log(`   ✓ Remaining response seconds: ${request.remaining_seconds}s (~10 mins)`);
  console.log(`   ✓ Total price calculated server-side: $${request.total_price}`);

  if (request.status !== 'PENDING_EXPERT') throw new Error('Status should be PENDING_EXPERT');
  if (request.payment_id || request.session_id) throw new Error('Payment or Session should NOT exist yet');

  // 3. Security: Test that client CANNOT pay before expert accepts
  console.log('\n3. Testing Security: Client attempts direct payment BEFORE expert acceptance...');
  const earlyPayRes = await post(`http://localhost:5000/api/consultation-requests/${request.id}/pay`, {}, clientToken);
  console.log(`   ✓ Direct early payment rejected with HTTP ${earlyPayRes.status}: "${earlyPayRes.data.error}"`);
  if (earlyPayRes.status !== 400) throw new Error('Backend should reject payment before ACCEPTED status');

  // 4. Security: Unauthorized provider attempts to accept
  console.log('\n4. Testing Security: Wrong provider attempts to accept request...');
  const wrongAcceptRes = await post(`http://localhost:5000/api/consultation-requests/${request.id}/accept`, {}, otherClientToken);
  console.log(`   ✓ Unauthorized accept rejected with HTTP ${wrongAcceptRes.status}: "${wrongAcceptRes.data.error}"`);
  if (wrongAcceptRes.status !== 403) throw new Error('Backend should reject unauthorized accept');

  // 5. Expert accepts request (Stage 2)
  console.log('\n5. Testing Expert acceptance (Stage 2: Status -> ACCEPTED, Client notified)...');
  const acceptRes = await post(`http://localhost:5000/api/consultation-requests/${request.id}/accept`, {}, providerToken);
  console.log(`   ✓ Expert accepted request. Status: ${acceptRes.data.request.status}`);
  if (acceptRes.data.request.status !== 'ACCEPTED') throw new Error('Status should be ACCEPTED');

  // 6. Security: Another client attempts to pay this accepted request
  console.log('\n6. Testing Security: Different user attempts to pay another client\'s request...');
  const thiefPayRes = await post(`http://localhost:5000/api/consultation-requests/${request.id}/pay`, {}, otherClientToken);
  console.log(`   ✓ Payment by non-owner rejected with HTTP ${thiefPayRes.status}: "${thiefPayRes.data.error}"`);
  if (thiefPayRes.status !== 403) throw new Error('Backend should reject payment from non-owner');

  // 7. Client completes payment after acceptance (Stage 3)
  console.log('\n7. Testing Client payment for ACCEPTED request (Stage 3: Escrow payment & session created)...');
  const payRes = await post(`http://localhost:5000/api/consultation-requests/${request.id}/pay`, {}, clientToken);
  if (payRes.status !== 200) {
    console.error('Payment Error Payload:', payRes.data);
    throw new Error(`Payment failed with HTTP ${payRes.status}: ${JSON.stringify(payRes.data)}`);
  }
  console.log(`   ✓ Payment succeeded! Payment ID: ${payRes.data.payment_id}`);
  console.log(`   ✓ Session created! Session ID: ${payRes.data.session_id}`);
  console.log(`   ✓ Session status is: ${payRes.data.session.status}`);
  if (!payRes.data.session_id || !payRes.data.payment_id) throw new Error('Payment ID and Session ID required');

  // 8. Idempotency test (Double payment prevention)
  console.log('\n8. Testing Idempotency: Duplicate payment submission...');
  const doublePayRes = await post(`http://localhost:5000/api/consultation-requests/${request.id}/pay`, {}, clientToken);
  console.log(`   ✓ Duplicate payment safely handled with idempotency. Session ID returned: ${doublePayRes.data.session_id}`);
  if (doublePayRes.data.session_id !== payRes.data.session_id) throw new Error('Idempotent pay should return existing session');

  // 9. Expert Decline flow
  console.log('\n9. Testing Expert Decline flow...');
  const declineReqRes = await post('http://localhost:5000/api/consultation-requests', {
    service_id: elenaService.id,
    duration_minutes: 15,
    connect_type: 'now',
    problem_description: 'Checking availability for a quick 15-minute consultation.'
  }, clientToken);

  const declineReqId = declineReqRes.data.request.id;
  const declineRes = await post(`http://localhost:5000/api/consultation-requests/${declineReqId}/decline`, {}, providerToken);
  console.log(`   ✓ Expert declined request. Status: ${declineRes.data.request.status}`);
  if (declineRes.data.request.status !== 'DECLINED') throw new Error('Status should be DECLINED');

  const payDeclinedRes = await post(`http://localhost:5000/api/consultation-requests/${declineReqId}/pay`, {}, clientToken);
  console.log(`   ✓ Payment on DECLINED request rejected with HTTP ${payDeclinedRes.status}: "${payDeclinedRes.data.error}"`);
  if (payDeclinedRes.status !== 400) throw new Error('Payment on DECLINED request must be rejected');

  // 10. 10-Minute Server-Authoritative Expiration Test
  console.log('\n10. Testing 10-Minute Server-Authoritative Expiration...');
  const timeoutReqRes = await post('http://localhost:5000/api/consultation-requests', {
    service_id: elenaService.id,
    duration_minutes: 20,
    connect_type: 'now',
    problem_description: 'Testing automatic expiration window.'
  }, clientToken);

  const timeoutReqId = timeoutReqRes.data.request.id;
  
  // Directly simulate deadline expiry in DB
  const db = require('./server/db');
  db.prepare(`UPDATE consultation_requests SET response_deadline = datetime('now', '-1 minute') WHERE id = ?`).run(timeoutReqId);

  // Fetch updated request
  const expiredGetRes = await get(`http://localhost:5000/api/consultation-requests/${timeoutReqId}`, clientToken);
  console.log(`   ✓ Expired request queried. Server-authoritative status: ${expiredGetRes.data.request.status}`);

  const lateAcceptRes = await post(`http://localhost:5000/api/consultation-requests/${timeoutReqId}/accept`, {}, providerToken);
  console.log(`   ✓ Late acceptance on expired request rejected with HTTP ${lateAcceptRes.status}: "${lateAcceptRes.data.error}"`);
  if (lateAcceptRes.status !== 400) throw new Error('Accepting expired request must be rejected');

  const latePayRes = await post(`http://localhost:5000/api/consultation-requests/${timeoutReqId}/pay`, {}, clientToken);
  console.log(`   ✓ Payment on expired request rejected with HTTP ${latePayRes.status}: "${latePayRes.data.error}"`);
  if (latePayRes.status !== 400) throw new Error('Payment on expired request must be rejected');

  console.log('\n======================================================');
  console.log('✅ ALL 10 APPROVAL-FIRST BOOKING FLOW TESTS PASSED 100%!');
  console.log('======================================================\n');

  // Clean up test booking records
  db.prepare("DELETE FROM consultation_requests WHERE client_id IN (SELECT id FROM users WHERE email LIKE '%@testbooking.local') OR provider_id IN (SELECT id FROM users WHERE email LIKE '%@testbooking.local')").run();
  db.prepare("DELETE FROM sessions WHERE client_id IN (SELECT id FROM users WHERE email LIKE '%@testbooking.local') OR provider_id IN (SELECT id FROM users WHERE email LIKE '%@testbooking.local')").run();
  db.prepare("DELETE FROM payments WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@testbooking.local')").run();
  db.prepare("DELETE FROM services WHERE provider_id IN (SELECT id FROM users WHERE email LIKE '%@testbooking.local')").run();
  db.prepare("DELETE FROM users WHERE email LIKE '%@testbooking.local'").run();
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
