// test-final-product-upgrade.js
const http = require('http');
const crypto = require('crypto');

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
  console.log('=== STARTING HIREBYMINUTES FINAL PRODUCT UPGRADE SUITE ===\n');
  const BASE_URL = 'http://localhost:5000/api';
  const rzpKeySecret = process.env.RAZORPAY_KEY_SECRET || 'dev_razorpay_secret_key_12345';
  let passed = 0;
  let total = 0;

  function assert(condition, name) {
    total++;
    if (condition) {
      console.log(`✓ [PASS ${total}] ${name}`);
      passed++;
    } else {
      console.error(`✗ [FAIL ${total}] ${name}`);
    }
  }

  // 1. Authenticate or create test client and expert
  const ts = Date.now();
  const clientRes = await post(`${BASE_URL}/auth/register`, {
    email: `final_client_${ts}@test.local`,
    password: 'Password123!',
    full_name: 'Final Upgrade Client',
    role: 'client'
  });
  const clientToken = clientRes.data.token;
  const clientId = clientRes.data.user.id;
  assert(clientToken && clientId, 'Client registered successfully with JWT');

  const expertRes = await post(`${BASE_URL}/auth/register`, {
    email: `final_expert_${ts}@test.local`,
    password: 'Password123!',
    full_name: 'Final Upgrade Expert',
    role: 'provider'
  });
  const expertToken = expertRes.data.token;
  const expertId = expertRes.data.user.id;
  assert(expertToken && expertId, 'Expert registered successfully with JWT');

  // 2. Expert creates a service
  const serviceRes = await post(`${BASE_URL}/services`, {
    title: 'Senior Distributed Systems Consultation',
    category_id: 'cat-tech',
    description: 'Expert advice on Kafka, Kubernetes, and Golang microservices by the minute.',
    price_per_minute: 2.50,
    skills: ['Kubernetes', 'Go', 'Distributed Systems'],
    languages: ['English', 'German'],
    experience_years: 8,
    available_now: 1
  }, expertToken);
  const serviceId = serviceRes.data.service.id;
  assert(serviceRes.status === 201 && serviceId, 'Expert created consultation service');

  // Activate service via listing fee order or payment if not already active
  if (serviceRes.data.service.listing_status !== 'active') {
    const listOrderRes = await post(`${BASE_URL}/services/${serviceId}/create-listing-order`, {}, expertToken);
    if (listOrderRes.data.order_id) {
      const listPayId = `pay_list_${ts}`;
      const listSig = crypto.createHmac('sha256', rzpKeySecret)
        .update(`${listOrderRes.data.order_id}|${listPayId}`)
        .digest('hex');
      await post(`${BASE_URL}/services/${serviceId}/verify-listing-payment`, {
        razorpay_order_id: listOrderRes.data.order_id,
        razorpay_payment_id: listPayId,
        razorpay_signature: listSig
      }, expertToken);
    }
  }

  // 3. Test Marketplace Discovery filtering and sorting
  console.log('\n--- Testing Marketplace Discovery & Sorting ---');
  const sortResAsc = await get(`${BASE_URL}/services?sort=price_asc`);
  assert(sortResAsc.status === 200 && Array.isArray(sortResAsc.data.services), 'GET /services with sort=price_asc returned 200');

  const sortResDesc = await get(`${BASE_URL}/services?sort=price_desc`);
  assert(sortResDesc.status === 200 && Array.isArray(sortResDesc.data.services), 'GET /services with sort=price_desc returned 200');

  const sortResExp = await get(`${BASE_URL}/services?sort=experience`);
  assert(sortResExp.status === 200, 'GET /services with sort=experience returned 200');

  const sortResRating = await get(`${BASE_URL}/services?sort=rating`);
  assert(sortResRating.status === 200, 'GET /services with sort=rating returned 200');

  const sortResAvail = await get(`${BASE_URL}/services?sort=available_now`);
  assert(sortResAvail.status === 200, 'GET /services with sort=available_now returned 200');

  // Filter by skill
  const skillRes = await get(`${BASE_URL}/services?skill=Kubernetes`);
  const foundSkill = skillRes.data.services.some(s => s.id === serviceId);
  assert(foundSkill, 'GET /services filtered correctly by skill="Kubernetes"');

  // Verify availability status format in service list
  const sampleService = sortResAsc.data.services.find(s => s.id === serviceId);
  assert(sampleService && ['AVAILABLE NOW', 'BUSY', 'OFFLINE'].includes(sampleService.availability_status),
    `Service has availability_status badge ("${sampleService?.availability_status}")`);

  // 4. Test Expert Profile endpoint (total_session_minutes & availability_status)
  console.log('\n--- Testing Expert Profile Endpoint ---');
  const profileRes = await get(`${BASE_URL}/services/${serviceId}`);
  assert(profileRes.status === 200, 'GET /services/:id returned 200');
  assert(profileRes.data.service.total_session_minutes !== undefined, 'Service profile includes total_session_minutes');
  assert(profileRes.data.service.availability_status === 'AVAILABLE NOW', 'Service profile reports availability_status: "AVAILABLE NOW"');

  // 5. Test Provider Availability Toggle
  console.log('\n--- Testing Provider Availability Toggle ---');
  const toggleOffRes = await post(`${BASE_URL}/provider/toggle-availability`, { available_now: false }, expertToken);
  assert(toggleOffRes.status === 200 && toggleOffRes.data.available_now === false, 'POST /provider/toggle-availability toggled to OFFLINE');

  const profileAfterOff = await get(`${BASE_URL}/services/${serviceId}`);
  assert(profileAfterOff.data.service.availability_status === 'OFFLINE', 'Profile now reflects OFFLINE availability');

  const toggleOnRes = await post(`${BASE_URL}/provider/toggle-availability`, { available_now: true }, expertToken);
  assert(toggleOnRes.status === 200 && toggleOnRes.data.available_now === true, 'POST /provider/toggle-availability toggled to AVAILABLE NOW');

  // 6. Test Consultation Request & 10-minute response lifecycle
  console.log('\n--- Testing Consultation Request Lifecycle ---');
  const reqRes = await post(`${BASE_URL}/consultation-requests`, {
    service_id: serviceId,
    duration_minutes: 30,
    connect_type: 'now',
    scheduled_start: new Date().toISOString(),
    problem_description: 'Need assistance diagnosing Kubernetes pod crash loops in production'
  }, clientToken);
  assert(reqRes.status === 201 && reqRes.data.request.status === 'PENDING_EXPERT', 'Client created consultation request (PENDING_EXPERT)');
  const requestId = reqRes.data.request.id;

  // Verify Provider Dashboard enriched pending request preview with Client Reputation
  const providerDash = await get(`${BASE_URL}/dashboards/provider`, expertToken);
  assert(providerDash.status === 200, 'GET /dashboards/provider returned 200');
  const pendingInDash = providerDash.data.pendingRequests.find(r => r.id === requestId);
  assert(pendingInDash && pendingInDash.client_sessions_completed !== undefined && pendingInDash.client_rating !== undefined,
    'Provider dashboard pending request preview includes client reputation metadata');

  // Expert accepts request
  const acceptRes = await post(`${BASE_URL}/consultation-requests/${requestId}/accept`, {}, expertToken);
  assert(acceptRes.status === 200 && acceptRes.data.request.status === 'ACCEPTED', 'Expert accepted request (ACCEPTED)');

  // Client creates Razorpay order & pays
  const orderRes = await post(`${BASE_URL}/consultation-requests/${requestId}/create-razorpay-order`, {}, clientToken);
  assert(orderRes.status === 200 && orderRes.data.order_id, 'Server created authoritative Razorpay order for consultation');

  const payId = `pay_mock_${ts}`;
  const validSig = crypto.createHmac('sha256', rzpKeySecret)
    .update(`${orderRes.data.order_id}|${payId}`)
    .digest('hex');

  const payVerifyRes = await post(`${BASE_URL}/consultation-requests/${requestId}/verify-razorpay-payment`, {
    razorpay_order_id: orderRes.data.order_id,
    razorpay_payment_id: payId,
    razorpay_signature: validSig
  }, clientToken);
  assert(payVerifyRes.status === 200 && payVerifyRes.data.session_id, 'Payment signature verified and live consultation session activated');
  const sessionId = payVerifyRes.data.session_id;

  // 7. Test Session Extension Endpoint (Server-authoritative price & payment verification)
  console.log('\n--- Testing Session Extension Flow ---');
  // Client creates extension order for +15 minutes
  const extOrderRes = await post(`${BASE_URL}/sessions/${sessionId}/create-extension-order`, {
    additional_minutes: 15
  }, clientToken);
  assert(extOrderRes.status === 200 && extOrderRes.data.additional_minutes === 15, 'POST /sessions/:id/create-extension-order created order');
  assert(extOrderRes.data.amount_paise === 3750, `Extension price server-authoritatively computed: 15 mins * $2.50 = $37.50 (${extOrderRes.data.amount_paise} paise)`);

  const extPayId = `pay_ext_${ts}`;
  const extValidSig = crypto.createHmac('sha256', rzpKeySecret)
    .update(`${extOrderRes.data.order_id}|${extPayId}`)
    .digest('hex');

  const extVerifyRes = await post(`${BASE_URL}/sessions/${sessionId}/verify-extension-payment`, {
    razorpay_order_id: extOrderRes.data.order_id,
    razorpay_payment_id: extPayId,
    razorpay_signature: extValidSig,
    additional_minutes: 15
  }, clientToken);
  assert(extVerifyRes.status === 200 && extVerifyRes.data.session.duration_minutes === 45,
    `Session seamlessly extended: duration increased from 30 to 45 mins (actual: ${extVerifyRes.data.session.duration_minutes}m)`);

  // Replay prevention on same payment
  const replayExt = await post(`${BASE_URL}/sessions/${sessionId}/verify-extension-payment`, {
    razorpay_order_id: extOrderRes.data.order_id,
    razorpay_payment_id: extPayId,
    razorpay_signature: extValidSig,
    additional_minutes: 15
  }, clientToken);
  assert(replayExt.status === 409 || replayExt.status === 400, 'Replay protection blocked duplicate session extension payment');

  // 8. Test Session Manual End Endpoint
  console.log('\n--- Testing Session End & Review Flow ---');
  const endRes = await post(`${BASE_URL}/sessions/${sessionId}/end`, {}, clientToken);
  assert(endRes.status === 200 && endRes.data.session.status === 'COMPLETED', 'POST /sessions/:id/end terminated consultation cleanly');

  // Client leaves review
  const reviewRes = await post(`${BASE_URL}/sessions/${sessionId}/review`, {
    rating: 5,
    comment: 'Superb consultation on distributed systems. Highly recommended expert!'
  }, clientToken);
  assert(reviewRes.status === 201, 'Client successfully submitted verified consultation review');

  // 9. Test Client Dashboard (Stats & 1-click Hire Again)
  console.log('\n--- Testing Client Dashboard & 1-Click Rehire ---');
  const clientDash = await get(`${BASE_URL}/dashboards/client`, clientToken);
  assert(clientDash.status === 200, 'GET /dashboards/client returned 200');
  assert(clientDash.data.stats && clientDash.data.stats.completedSessions >= 1, 'Client dashboard stats tracks completedSessions');
  assert(clientDash.data.stats.totalSessionMinutes >= 45, `Client dashboard stats tracks totalSessionMinutes (${clientDash.data.stats.totalSessionMinutes}m)`);
  assert(Array.isArray(clientDash.data.previouslyHiredExperts) && clientDash.data.previouslyHiredExperts.length >= 1,
    'Client dashboard includes previouslyHiredExperts with metadata for 1-click rehire');

  // 10. Test Provider Dashboard (Gross, 15% platform fee, Net, and Completed Sessions Breakdown)
  console.log('\n--- Testing Provider Dashboard 15% Platform Commission Transparency ---');
  const updatedProvDash = await get(`${BASE_URL}/dashboards/provider`, expertToken);
  assert(updatedProvDash.status === 200, 'GET /dashboards/provider returned 200');
  const earnings = updatedProvDash.data.earnings;
  assert(earnings.gross > 0 && earnings.platformFee > 0 && earnings.total > 0,
    `Provider earnings transparent: Gross: $${earnings.gross}, 15% Platform Fee: $${earnings.platformFee}, Net Payout: $${earnings.total}`);
  assert(Math.abs(earnings.gross - (earnings.platformFee + earnings.total)) < 0.05,
    'Platform fee commission math strictly verified (Gross = Fee + Net)');

  assert(Array.isArray(updatedProvDash.data.completedSessionsBreakdown) && updatedProvDash.data.completedSessionsBreakdown.length >= 1,
    'Provider dashboard contains itemized completedSessionsBreakdown');
  const firstBreakdown = updatedProvDash.data.completedSessionsBreakdown[0];
  assert(firstBreakdown.gross_amount && firstBreakdown.platform_fee && firstBreakdown.net_earned,
    `Itemized session breakdown shows gross ($${firstBreakdown.gross_amount}), platform_fee ($${firstBreakdown.platform_fee}), and net ($${firstBreakdown.net_earned})`);

  // 11. Test Paid Opportunity Application ($2 Fee) Flow
  console.log('\n--- Testing Paid Opportunities $2 Entry Fee Flow ---');
  // Client posts opportunity
  const oppPostRes = await post(`${BASE_URL}/opportunities`, {
    title: 'PostgreSQL Performance Optimization & Index Tuning',
    category_id: 'cat-tech',
    description: 'Looking for a database engineer to inspect query execution plans and index strategy.',
    duration_minutes: 60,
    budget: 150
  }, clientToken);
  assert(oppPostRes.status === 201 && oppPostRes.data.opportunity.id, 'Client posted work opportunity');
  const oppId = oppPostRes.data.opportunity.id;

  // Provider creates application Razorpay order ($2.00)
  const oppOrderRes = await post(`${BASE_URL}/opportunities/${oppId}/create-application-order`, {}, expertToken);
  assert(oppOrderRes.status === 200 && oppOrderRes.data.amount_paise === 200, 'Created Razorpay order for $2.00 entry fee (200 paise)');

  const oppPayId = `pay_opp_${ts}`;
  const oppValidSig = crypto.createHmac('sha256', rzpKeySecret)
    .update(`${oppOrderRes.data.order_id}|${oppPayId}`)
    .digest('hex');

  const oppVerifyRes = await post(`${BASE_URL}/opportunities/${oppId}/verify-application-payment`, {
    razorpay_order_id: oppOrderRes.data.order_id,
    razorpay_payment_id: oppPayId,
    razorpay_signature: oppValidSig,
    message: 'I have 10 years tuning PostgreSQL execution plans and indexing.',
    relevant_experience: 'Senior DBA',
    availability: 'Immediate'
  }, expertToken);
  assert(oppVerifyRes.status === 201 && oppVerifyRes.data.application.id, 'Verified $2 application fee payment and recorded application');

  // Verify $2 fee recorded in payments table
  assert(oppVerifyRes.data.payment_id, `Application references confirmed payment ID (${oppVerifyRes.data.payment_id})`);

  console.log(`\n==================================================`);
  console.log(`FINAL PRODUCT UPGRADE VALIDATION: ${passed}/${total} CHECKS PASSED (${((passed/total)*100).toFixed(0)}%)`);
  console.log(`==================================================\n`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
