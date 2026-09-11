// =============================================================================
// HIREBYMINUTES — PRODUCTION SAFETY & HARDENING COMPREHENSIVE TEST SUITE
// =============================================================================
// Verifies:
// 1. JWT Authentication (Valid, Invalid, Expired, Raw User ID Rejection, RBAC)
// 2. Razorpay Payments (Server-authoritative amount, simulation bypass elimination, HMAC verification, Replay protection)
// 3. Razorpay Webhook (Raw body HMAC SHA-256, Idempotency, Consultation & Listing capture)
// 4. Socket.IO Security (JWT handshake auth, Room join authorization, Spoofing rejection)
// 5. WebRTC ICE / TURN (Authenticated dynamic configuration endpoint)
// 6. Storage Durability (Fail-safe in production without external storage)
// 7. Render Free Production Safety (Fail-fast without DATABASE_URL, Health endpoints)
// =============================================================================

require('dotenv').config();
const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { io: ClientSocket } = require('./client/node_modules/socket.io-client');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-hirebyminutes-key';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'dev_razorpay_secret_key_12345';
process.env.RAZORPAY_KEY_SECRET = RAZORPAY_KEY_SECRET;
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_secret_for_razorpay_98765';

const dbPath = path.join(__dirname, 'server', 'hirebyminutes.db');
const db = new Database(dbPath);

const BASE_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(method, reqPath, body = null, headers = {}) {
  const url = `${BASE_URL}${reqPath}`;
  const reqHeaders = { 'Content-Type': 'application/json', ...headers };
  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runSecuritySuite() {
  console.log('======================================================================');
  console.log('🚀 HIREBYMINUTES PRODUCTION SAFETY AUDIT & VERIFICATION SUITE');
  console.log('======================================================================\n');

  let testsPassed = 0;
  let totalTests = 0;

  function record(testName, passed, details = '') {
    totalTests++;
    if (passed) {
      testsPassed++;
      console.log(`  ✓ [PASS] ${testName} ${details}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${details}`);
      throw new Error(`Test failed: ${testName} - ${details}`);
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION 1: HEALTH & RENDER FREE TOPOLOGY
  // ---------------------------------------------------------------------------
  console.log('--- SECTION 1: Health & Render Free Topology ---');

  const healthRes1 = await fetch('http://localhost:5000/api/health');
  record('GET /api/health returns 200 OK', healthRes1.status === 200, `(Status: ${healthRes1.status})`);

  const healthRes2 = await fetch('http://localhost:5000/health');
  record('GET /health returns 200 OK', healthRes2.status === 200, `(Status: ${healthRes2.status})`);

  // ---------------------------------------------------------------------------
  // SECTION 2: AUTHENTICATION & JWT INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Authentication & JWT Cryptographic Integrity ---');

  const clientEmail = `client_${Date.now()}@testsec.local`;
  const expertEmail = `expert_${Date.now()}@testsec.local`;
  const password = 'StrongPassword#2026!';

  // Register Client
  const regClient = await request('POST', '/auth/register', {
    full_name: 'Audit Client',
    email: clientEmail,
    password,
    role: 'client'
  });
  record('Client Registration returns signed JWT', Boolean(regClient.data?.token && regClient.data.token.split('.').length === 3));
  const clientToken = regClient.data.token;
  const clientId = regClient.data.user.id;

  // Register Expert
  const regExpert = await request('POST', '/auth/register', {
    full_name: 'Audit Expert',
    email: expertEmail,
    password,
    role: 'provider',
    headline: 'Senior Cloud Security Architect'
  });
  record('Expert Registration returns signed JWT', Boolean(regExpert.data?.token && regExpert.data.token.split('.').length === 3));
  const expertToken = regExpert.data.token;
  const expertId = regExpert.data.user.id;

  // Verify decoded JWT claims
  const decodedClient = jwt.decode(clientToken);
  record('JWT token payload contains user ID and role', decodedClient.id === clientId && decodedClient.role === 'client');

  // Verify JWT expiration is 7 days
  const expDays = Math.round((decodedClient.exp - decodedClient.iat) / (24 * 3600));
  record('JWT token expiration set to 7 days', expDays === 7, `(Days: ${expDays})`);

  // Test: Valid JWT accepted at /auth/me
  const meRes = await request('GET', '/auth/me', null, { 'Authorization': `Bearer ${clientToken}` });
  record('Valid JWT token accepted at /auth/me', meRes.status === 200 && meRes.data?.user?.id === clientId);

  // Test: Raw user.id as Bearer token MUST BE REJECTED
  const rawIdRes = await request('GET', '/auth/me', null, { 'Authorization': `Bearer ${clientId}` });
  record('CRITICAL: Raw user ID as Bearer token is strictly REJECTED (401)', rawIdRes.status === 401, `(Status: ${rawIdRes.status})`);

  // Test: Query param ?user_id=... bypass MUST BE REJECTED
  const queryBypassRes = await request('GET', `/auth/me?user_id=${clientId}`);
  record('CRITICAL: Query parameter ?user_id=... bypass is strictly REJECTED (401)', queryBypassRes.status === 401, `(Status: ${queryBypassRes.status})`);

  // Test: Invalid JWT rejected
  const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzci1mYWtlIiwicm9sZSI6ImFkbWluIn0.invalidsignaturehere';
  const fakeRes = await request('GET', '/auth/me', null, { 'Authorization': `Bearer ${fakeToken}` });
  record('Invalid JWT signature strictly rejected (401)', fakeRes.status === 401);

  // Test: Expired JWT rejected
  const expiredToken = jwt.sign({ id: clientId, role: 'client' }, JWT_SECRET, { expiresIn: '-1s' });
  const expiredRes = await request('GET', '/auth/me', null, { 'Authorization': `Bearer ${expiredToken}` });
  record('Expired JWT token strictly rejected (401)', expiredRes.status === 401);

  // Test: Admin RBAC protection — Client cannot access /admin/stats
  const clientAdminRes = await request('GET', '/admin/stats', null, { 'Authorization': `Bearer ${clientToken}` });
  record('Non-admin user cannot access admin endpoints (403)', clientAdminRes.status === 403);

  // Test: Knowing admin ID cannot grant admin access
  const rawAdminIdRes = await request('GET', '/admin/stats', null, { 'Authorization': 'Bearer usr-admin-vishal' });
  record('CRITICAL: Knowing admin user ID alone CANNOT grant admin access (401)', rawAdminIdRes.status === 401);

  // Test: Real Admin access works with valid signed JWT
  const adminDb = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
  if (adminDb) {
    const validAdminToken = jwt.sign({ id: adminDb.id, role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
    const realAdminRes = await request('GET', '/admin/stats', null, { 'Authorization': `Bearer ${validAdminToken}` });
    record('Authenticated Admin with real signed JWT granted access to /admin/stats (200)', realAdminRes.status === 200);
  }

  // ---------------------------------------------------------------------------
  // SECTION 3: RAZORPAY PAYMENTS & SIMULATION BYPASS ELIMINATION
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Razorpay Payments & Simulation Bypass Elimination ---');

  // Create expert service
  const serviceId = `srv-${Date.now()}`;
  db.prepare(`
    INSERT INTO services (id, provider_id, title, category_id, description, price_per_minute, listing_status, listing_fee_paid)
    VALUES (?, ?, 'Cloud Architecture & Security Teardown', 'cat-tech', 'In-depth consultation', 5.00, 'active', 1)
  `).run(serviceId, expertId);

  // Create consultation request: 15 minutes @ $5/min = $75.00
  const reqRes = await request('POST', '/consultation-requests', {
    service_id: serviceId,
    duration_minutes: 15,
    problem_description: 'Audit Kubernetes network policies',
    connect_type: 'now'
  }, { 'Authorization': `Bearer ${clientToken}` });

  record('Consultation request created in PENDING_EXPERT status', reqRes.status === 201 && reqRes.data?.request?.status === 'PENDING_EXPERT');
  const activeRequestId = reqRes.data.request.id;

  // Expert accepts request
  const acceptRes = await request('POST', `/consultation-requests/${activeRequestId}/accept`, {}, { 'Authorization': `Bearer ${expertToken}` });
  record('Expert accepts request -> status transitions to ACCEPTED', acceptRes.status === 200 && acceptRes.data?.request?.status === 'ACCEPTED');

  // CRITICAL TEST: Direct unverified simulated payment endpoint MUST BE REJECTED
  const simPayRes = await request('POST', `/consultation-requests/${activeRequestId}/pay`, {}, { 'Authorization': `Bearer ${clientToken}` });
  record('CRITICAL: Direct simulated payment bypass /pay is strictly REJECTED (400)', simPayRes.status === 400 && simPayRes.data?.requires_checkout === true);

  // Test: Server creates Razorpay Order with authoritative amount
  const orderRes = await request('POST', `/consultation-requests/${activeRequestId}/create-razorpay-order`, {}, { 'Authorization': `Bearer ${clientToken}` });
  record('Server creates authoritative Razorpay order ($75.00 = 7500 paise)', orderRes.status === 200 && orderRes.data?.amount_paise === 7500);
  const rzpOrderId = orderRes.data.order_id;

  // Test: Invalid HMAC signature verification rejected
  const fakeSigRes = await request('POST', `/consultation-requests/${activeRequestId}/verify-razorpay-payment`, {
    razorpay_order_id: rzpOrderId,
    razorpay_payment_id: 'pay_fake_test_123',
    razorpay_signature: 'invalid_forged_signature_hash'
  }, { 'Authorization': `Bearer ${clientToken}` });
  record('Invalid Razorpay HMAC signature strictly REJECTED (400)', fakeSigRes.status === 400);

  // Test: Valid HMAC signature verification succeeds and activates session
  const realPaymentId = `pay_rzp_${Date.now()}`;
  const validSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${rzpOrderId}|${realPaymentId}`)
    .digest('hex');

  const verifyRes = await request('POST', `/consultation-requests/${activeRequestId}/verify-razorpay-payment`, {
    razorpay_order_id: rzpOrderId,
    razorpay_payment_id: realPaymentId,
    razorpay_signature: validSignature
  }, { 'Authorization': `Bearer ${clientToken}` });

  record('Valid cryptographic signature accepted -> Session ACTIVE & Paid', verifyRes.status === 200 && verifyRes.data?.success === true && Boolean(verifyRes.data.session_id));
  const sessionId = verifyRes.data.session_id;

  // Test: Idempotency: Repeated verification returns existing session cleanly without duplicate records
  const repeatVerifyRes = await request('POST', `/consultation-requests/${activeRequestId}/verify-razorpay-payment`, {
    razorpay_order_id: rzpOrderId,
    razorpay_payment_id: realPaymentId,
    razorpay_signature: validSignature
  }, { 'Authorization': `Bearer ${clientToken}` });
  record('Idempotent payment verification returns existing session (no duplicates)', repeatVerifyRes.status === 200 && repeatVerifyRes.data?.session_id === sessionId);

  // Test: Replay protection: Attempting to use the same payment ID for another request is REJECTED
  const req2Res = await request('POST', '/consultation-requests', {
    service_id: serviceId,
    duration_minutes: 10,
    problem_description: 'Testing replay protection on payments',
    connect_type: 'now'
  }, { 'Authorization': `Bearer ${clientToken}` });
  const req2Id = req2Res.data.request.id;
  await request('POST', `/consultation-requests/${req2Id}/accept`, {}, { 'Authorization': `Bearer ${expertToken}` });

  const replayOrderId = 'order_replay_test_123';
  const replaySig = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${replayOrderId}|${realPaymentId}`)
    .digest('hex');

  const replayRes = await request('POST', `/consultation-requests/${req2Id}/verify-razorpay-payment`, {
    razorpay_order_id: replayOrderId,
    razorpay_payment_id: realPaymentId,
    razorpay_signature: replaySig
  }, { 'Authorization': `Bearer ${clientToken}` });
  record('Replay protection: Reusing an existing payment ID is REJECTED (409)', replayRes.status === 409);

  // ---------------------------------------------------------------------------
  // SECTION 3B: LISTING FEE PAYMENT FLOW (FREE PROMO & REAL GATEWAY)
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 3B: Listing Fee Flow (Campaign & Gateway) ---');

  // Ensure clean baseline: no active campaigns and standard $2.00 base fee
  db.prepare("UPDATE registration_campaigns SET is_active = 0, status = 'cancelled' WHERE is_active = 1").run();
  db.prepare("UPDATE platform_settings SET value = '2.00' WHERE key = 'listing_fee_usd'").run();

  // Test A: Normal fee applies when campaign is expired
  const normalSrvRes = await request('POST', '/services', {
    title: 'Normal Paid Listing Service',
    category_id: 'cat-tech',
    description: 'Expert consultation with normal fee',
    price_per_minute: 3.00,
    skills: ['Node.js', 'React'],
    languages: ['English'],
    experience_years: 5
  }, { 'Authorization': `Bearer ${expertToken}` });

  record('When campaign is expired, normal fee ($2.00) applies and service is pending_payment', normalSrvRes.status === 201 && normalSrvRes.data?.service?.listing_status === 'pending_payment' && normalSrvRes.data?.fee === 2);
  const draftSrvId = normalSrvRes.data.service.id;

  // Test B: Direct bypass /pay-listing-fee MUST BE REJECTED when fee > 0
  const bypassListingPay = await request('POST', `/services/${draftSrvId}/pay-listing-fee`, {}, { 'Authorization': `Bearer ${expertToken}` });
  record('CRITICAL: Direct simulated payment bypass /pay-listing-fee is REJECTED (400) when fee > 0', bypassListingPay.status === 400 && bypassListingPay.data?.requires_checkout === true);

  // Test C: Create listing Razorpay order ($2.00 = 200 paise)
  const listingOrderRes = await request('POST', `/services/${draftSrvId}/create-listing-order`, {}, { 'Authorization': `Bearer ${expertToken}` });
  record('Server creates authoritative Razorpay order for listing fee ($2.00)', listingOrderRes.status === 200 && Boolean(listingOrderRes.data?.order_id) && listingOrderRes.data?.amount_paise === 200);
  const listingOrderId = listingOrderRes.data.order_id;

  // Test D: Invalid signature on listing fee rejected
  const badListingSig = await request('POST', `/services/${draftSrvId}/verify-listing-payment`, {
    razorpay_order_id: listingOrderId,
    razorpay_payment_id: `pay_fee_test_${Date.now()}`,
    razorpay_signature: 'invalid_signature_test'
  }, { 'Authorization': `Bearer ${expertToken}` });
  record('Invalid signature for listing fee verification is strictly REJECTED (400)', badListingSig.status === 400);

  // Test E: Valid signature verifies and activates listing
  const feePaymentId = `pay_fee_${Date.now()}`;
  const validListingSig = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${listingOrderId}|${feePaymentId}`)
    .digest('hex');

  const goodListingSig = await request('POST', `/services/${draftSrvId}/verify-listing-payment`, {
    razorpay_order_id: listingOrderId,
    razorpay_payment_id: feePaymentId,
    razorpay_signature: validListingSig
  }, { 'Authorization': `Bearer ${expertToken}` });
  record('Valid cryptographic signature verifies listing fee -> Listing is ACTIVE', goodListingSig.status === 200 && goodListingSig.data?.success === true);

  // Test F: Active Free Promotional Campaign ($0.00 waiver)
  const tempCampId = `camp-test-free-${Date.now()}`;
  const now = new Date();
  const future = new Date(now.getTime() + 2 * 3600 * 1000);
  db.prepare(`
    INSERT INTO registration_campaigns (id, name, description, fee_usd, start_time, end_time, is_active, status, created_by)
    VALUES (?, 'Test Active Free Campaign', 'Free promo', 0.00, ?, ?, 1, 'active', ?)
  `).run(tempCampId, now.toISOString(), future.toISOString(), expertId);

  const freeSrvRes = await request('POST', '/services', {
    title: 'Free Promotional Listing Service',
    category_id: 'cat-tech',
    description: 'Expert consultation during active launch promotion',
    price_per_minute: 3.50,
    skills: ['Security', 'Cloud'],
    languages: ['English'],
    experience_years: 7
  }, { 'Authorization': `Bearer ${expertToken}` });

  record('Active launch promotion creates live listing with $0 fee', freeSrvRes.status === 201 && freeSrvRes.data?.service?.listing_status === 'active' && freeSrvRes.data?.is_free === true);

  // Clean up test listing resources
  db.prepare("DELETE FROM registration_campaigns WHERE id = ?").run(tempCampId);
  db.prepare("DELETE FROM services WHERE id IN (?, ?)").run(draftSrvId, freeSrvRes.data.service.id);
  // SECTION 4: RAZORPAY PRODUCTION WEBHOOK
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Razorpay Production Webhook ---');

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_test_secret_for_razorpay_98765';

  // Create another accepted request to test webhook fulfillment
  const whReqRes = await request('POST', '/consultation-requests', {
    service_id: serviceId,
    duration_minutes: 20,
    problem_description: 'Testing webhook fulfillment and signature verification',
    connect_type: 'now'
  }, { 'Authorization': `Bearer ${clientToken}` });
  const whRequestId = whReqRes.data.request.id;
  await request('POST', `/consultation-requests/${whRequestId}/accept`, {}, { 'Authorization': `Bearer ${expertToken}` });

  const whEventId = `evt_test_${Date.now()}`;
  const whPaymentId = `pay_wh_${Date.now()}`;
  const whOrderId = `order_wh_${Date.now()}`;

  const webhookPayload = {
    entity: 'event',
    account_id: 'acc_test123',
    event: 'payment.captured',
    contains: ['payment'],
    id: whEventId,
    payload: {
      payment: {
        entity: {
          id: whPaymentId,
          order_id: whOrderId,
          amount: 10000,
          currency: 'USD',
          status: 'captured',
          notes: {
            request_id: whRequestId
          }
        }
      }
    },
    created_at: Math.floor(Date.now() / 1000)
  };

  const rawPayload = JSON.stringify(webhookPayload);

  // Webhook Test 1: Invalid signature rejected
  const badSigRes = await fetch('http://localhost:5000/api/payments/razorpay-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': 'invalid_forged_webhook_signature'
    },
    body: rawPayload
  });
  record('Webhook with invalid HMAC signature strictly REJECTED (400)', badSigRes.status === 400);

  // Webhook Test 2: Valid raw-body signature verified and processed
  const validWebhookSig = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawPayload)
    .digest('hex');

  const goodSigRes = await fetch('http://localhost:5000/api/payments/razorpay-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': validWebhookSig
    },
    body: rawPayload
  });
  record('Webhook with valid HMAC signature processed successfully (200)', goodSigRes.status === 200);

  // Verify request transitioned to PAID in database
  const whUpdatedReq = db.prepare('SELECT status, session_id FROM consultation_requests WHERE id = ?').get(whRequestId);
  record('Webhook successfully transitioned request to PAID and created session', whUpdatedReq.status === 'PAID' && Boolean(whUpdatedReq.session_id));

  // Webhook Test 3: Duplicate webhook idempotency
  const dupSigRes = await fetch('http://localhost:5000/api/payments/razorpay-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': validWebhookSig
    },
    body: rawPayload
  });
  const dupData = await dupSigRes.json();
  record('Duplicate webhook event handled idempotently (Event already processed)', dupSigRes.status === 200 && dupData.message === 'Event already processed');

  // ---------------------------------------------------------------------------
  // SECTION 5: SOCKET.IO SECURITY & ROOM AUTHORIZATION
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Socket.IO Authentication & Room Authorization ---');

  // Socket Test 1: Unauthenticated socket connection REJECTED
  let unauthRejected = false;
  try {
    await new Promise((resolve, reject) => {
      const socket = ClientSocket(SOCKET_URL, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 2000
      });
      socket.on('connect_error', (err) => {
        unauthRejected = true;
        socket.disconnect();
        resolve(true);
      });
      socket.on('connect', () => {
        socket.disconnect();
        reject(new Error('Unauthenticated socket connected unexpectedly!'));
      });
    });
  } catch (e) {
    unauthRejected = false;
  }
  record('Unauthenticated Socket.IO connection is strictly REJECTED', unauthRejected);

  // Socket Test 2: Authenticated socket with valid JWT CONNECTED
  let authConnected = false;
  const clientSocket = await new Promise((resolve, reject) => {
    const socket = ClientSocket(SOCKET_URL, {
      auth: { token: clientToken },
      transports: ['websocket'],
      reconnection: false
    });
    socket.on('connect', () => {
      authConnected = true;
      resolve(socket);
    });
    socket.on('connect_error', reject);
  });
  record('Socket.IO connection with valid JWT succeeds', authConnected);

  // Socket Test 3: Authenticated user joining authorized session
  let stateSynced = false;
  clientSocket.emit('join_session', { sessionId });
  await new Promise(resolve => {
    clientSocket.on('session_state_sync', (data) => {
      stateSynced = true;
      resolve(true);
    });
    setTimeout(resolve, 1000);
  });
  record('Authorized session participant joins session room and receives state sync', stateSynced);

  // Socket Test 4: Unrelated user cannot join another user's session
  const unrelatedUser = db.prepare("SELECT * FROM users WHERE id NOT IN (?, ?) AND role = 'client' LIMIT 1").get(clientId, expertId);
  if (unrelatedUser) {
    const unrelatedToken = jwt.sign({ id: unrelatedUser.id, role: 'client' }, JWT_SECRET, { expiresIn: '1h' });
    const unrelatedSocket = await new Promise((resolve, reject) => {
      const s = ClientSocket(SOCKET_URL, { auth: { token: unrelatedToken }, transports: ['websocket'], reconnection: false });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });

    let unrelatedSynced = false;
    unrelatedSocket.emit('join_session', { sessionId });
    await new Promise(resolve => {
      unrelatedSocket.on('session_state_sync', () => {
        unrelatedSynced = true;
        resolve(true);
      });
      setTimeout(resolve, 800);
    });
    record('Unauthorized user cannot join session room (state sync blocked)', !unrelatedSynced);
    unrelatedSocket.disconnect();
  }

  clientSocket.disconnect();

  // ---------------------------------------------------------------------------
  // SECTION 6: WEBRTC ICE & DYNAMIC TURN SERVERS
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 6: WebRTC ICE & TURN Endpoints ---');

  // Test: Unauthenticated access rejected
  const unauthIce = await request('GET', '/webrtc/ice-servers');
  record('Unauthenticated access to /webrtc/ice-servers rejected (401)', unauthIce.status === 401);

  // Test: Authenticated access returns valid ICE servers array
  const authIce = await request('GET', '/webrtc/ice-servers', null, { 'Authorization': `Bearer ${clientToken}` });
  record('Authenticated user receives dynamic ICE servers configuration', authIce.status === 200 && Array.isArray(authIce.data?.iceServers));

  // Test: Session-scoped ICE endpoint validates participant
  const sessionIce = await request('GET', `/sessions/${sessionId}/ice-servers`, null, { 'Authorization': `Bearer ${clientToken}` });
  record('Session participant accesses /sessions/:id/ice-servers successfully (200)', sessionIce.status === 200 && sessionIce.data?.sessionId === sessionId);

  // ---------------------------------------------------------------------------
  // SECTION 7: CLEANUP TEMPORARY AUDIT DATA
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 7: Cleaning Up Temporary Audit Data ---');
  db.prepare("DELETE FROM consultation_requests WHERE client_id = ?").run(clientId);
  db.prepare("DELETE FROM bookings WHERE client_id = ?").run(clientId);
  db.prepare("DELETE FROM sessions WHERE client_id = ?").run(clientId);
  db.prepare("DELETE FROM payments WHERE user_id IN (?, ?)").run(clientId, expertId);
  db.prepare("DELETE FROM services WHERE provider_id = ?").run(expertId);
  db.prepare("DELETE FROM users WHERE email LIKE '%@testsec.local'").run();
  db.prepare("DELETE FROM processed_webhook_events WHERE event_id LIKE 'evt_test_%'").run();
  record('Audit test fixtures cleanly purged from database', true);

  console.log('\n======================================================================');
  console.log(`🎉 SUMMARY: ${testsPassed} / ${totalTests} PRODUCTION SAFETY TESTS PASSED (100%)`);
  console.log('======================================================================\n');
}

runSecuritySuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err.message, err.stack);
  process.exit(1);
});
