const http = require('http');
const crypto = require('crypto');

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

async function runRazorpayWebRTCApprovalTests() {
  console.log('======================================================================');
  console.log('--- TESTING HIREBYMINUTES RAZORPAY INTEGRATION & APPROVAL FLOW ---');
  console.log('======================================================================\n');

  try {
    // 1. Authenticate Client & Expert
    console.log('1. Authenticating test users...');
    const clientRes = await request('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'sarah@hirebyminutes.com', password: 'demo123' }
    });
    const clientToken = clientRes.data.token;
    console.log(`   ✓ Authenticated Client: Sarah Chen (${clientRes.data.user.id})`);

    const expertRes = await request('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'arjun@hirebyminutes.com', password: 'demo123' }
    });
    const expertToken = expertRes.data.token;
    console.log(`   ✓ Authenticated Expert: Arjun Sharma (${expertRes.data.user.id})`);

    // Get an active service
    const servicesRes = await request('http://localhost:5000/api/services');
    const targetService = servicesRes.data.services.find(s => s.provider_id === expertRes.data.user.id) || servicesRes.data.services[0];
    console.log(`   ✓ Target Service: "${targetService.title}" ($${targetService.price_per_minute}/min)`);

    // 2. Stage 1: Create Consultation Request
    console.log('\n2. Testing Stage 1 Consultation Request Creation...');
    const createReq = await request('http://localhost:5000/api/consultation-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientToken}`
      },
      body: {
        service_id: targetService.id,
        duration_minutes: 20,
        problem_description: 'Architecture review for distributed backend scalability.'
      }
    });
    if (createReq.status !== 201) throw new Error(`Create request returned status ${createReq.status}`);
    const reqItem = createReq.data.request;
    console.log(`   ✓ Request created: ${reqItem.id}, Status: ${reqItem.status}`);
    console.log(`   ✓ Total price calculated server-side: $${reqItem.total_price}`);
    console.log(`   ✓ Remaining response window: ${reqItem.remaining_seconds}s (~10 minutes)`);

    // 3. Security: Attempt Razorpay order creation BEFORE expert acceptance
    console.log('\n3. Security: Client attempts Razorpay order creation on PENDING_EXPERT request...');
    const earlyOrder = await request(`http://localhost:5000/api/consultation-requests/${reqItem.id}/create-razorpay-order`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    if (earlyOrder.status !== 400) throw new Error(`Expected 400 for early order creation, got ${earlyOrder.status}`);
    console.log(`   ✓ Early Razorpay order creation rejected with HTTP 400: "${earlyOrder.data.error}"`);

    // 4. Security: Unauthorized expert attempts to accept
    console.log('\n4. Security: Unauthorized expert attempts to accept request...');
    const wrongExpertAccept = await request(`http://localhost:5000/api/consultation-requests/${reqItem.id}/accept`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${clientToken}` } // Client token instead of provider
    });
    if (wrongExpertAccept.status !== 403) throw new Error(`Expected 403 for wrong expert accept, got ${wrongExpertAccept.status}`);
    console.log(`   ✓ Unauthorized accept blocked with HTTP 403: "${wrongExpertAccept.data.error}"`);

    // 5. Stage 2: Target Expert Accepts Request
    console.log('\n5. Stage 2: Expert accepts consultation request...');
    const expertAccept = await request(`http://localhost:5000/api/consultation-requests/${reqItem.id}/accept`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${expertToken}` }
    });
    if (expertAccept.status !== 200) throw new Error(`Expert accept returned ${expertAccept.status}`);
    console.log(`   ✓ Expert accepted request. Status: ${expertAccept.data.request.status}`);

    // 6. Stage 3: Client creates Razorpay Order for ACCEPTED request
    console.log('\n6. Stage 3: Client creates Razorpay Order for ACCEPTED request...');
    const rzpOrderRes = await request(`http://localhost:5000/api/consultation-requests/${reqItem.id}/create-razorpay-order`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    if (rzpOrderRes.status !== 200) throw new Error(`Razorpay order creation returned ${rzpOrderRes.status}`);
    const rzpOrder = rzpOrderRes.data;
    console.log(`   ✓ Razorpay Order created: ${rzpOrder.order_id}`);
    console.log(`   ✓ Amount in paise: ${rzpOrder.amount_paise} ($${rzpOrder.amount} USD)`);
    console.log(`   ✓ Key ID: ${rzpOrder.key_id}`);

    // 7. Stage 4: Verify Razorpay Payment Signature & Transition to Session
    console.log('\n7. Stage 4: Verifying Razorpay payment signature & creating live session...');
    const simulatedPaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
    const simulatedSignature = crypto.randomBytes(32).toString('hex');

    const verifyRes = await request(`http://localhost:5000/api/consultation-requests/${reqItem.id}/verify-razorpay-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientToken}`
      },
      body: {
        razorpay_order_id: rzpOrder.order_id,
        razorpay_payment_id: simulatedPaymentId,
        razorpay_signature: simulatedSignature
      }
    });
    if (verifyRes.status !== 200) throw new Error(`Payment verification returned ${verifyRes.status}: ${JSON.stringify(verifyRes.data)}`);
    console.log(`   ✓ Payment verified! Session created: ${verifyRes.data.session_id}`);
    console.log(`   ✓ Session Status: ${verifyRes.data.session.status}`);

    // 8. Idempotency: Duplicate payment verification returns existing session
    console.log('\n8. Idempotency: Re-submitting payment verification on already paid request...');
    const dupVerify = await request(`http://localhost:5000/api/consultation-requests/${reqItem.id}/verify-razorpay-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientToken}`
      },
      body: {
        razorpay_order_id: rzpOrder.order_id,
        razorpay_payment_id: simulatedPaymentId,
        razorpay_signature: simulatedSignature
      }
    });
    if (dupVerify.status !== 200 || dupVerify.data.session_id !== verifyRes.data.session_id) {
      throw new Error('Duplicate payment verification did not return existing session idempotently');
    }
    console.log(`   ✓ Duplicate payment safely handled with idempotency. Session ID: ${dupVerify.data.session_id}`);

    // 9. Testing $2 Service Listing Fee Razorpay Flow
    console.log('\n9. Testing $2 Service Listing Fee Razorpay Flow...');
    const draftServiceRes = await request('http://localhost:5000/api/services', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${expertToken}`
      },
      body: {
        title: 'Distributed Microservices & Event-Driven Architecture Review',
        category_id: 'cat-tech',
        description: 'Deep dive into event sourcing, Kafka streams, and gRPC microservices.',
        price_per_minute: 3.50
      }
    });
    const draftService = draftServiceRes.data.service;
    console.log(`   ✓ Service draft created: ${draftService.id}, Status: ${draftService.listing_status}`);

    const feeOrderRes = await request(`http://localhost:5000/api/services/${draftService.id}/create-listing-order`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${expertToken}` }
    });
    console.log(`   ✓ Listing Fee Razorpay order created: ${feeOrderRes.data.order_id} ($${feeOrderRes.data.amount})`);

    const feeVerifyRes = await request(`http://localhost:5000/api/services/${draftService.id}/verify-listing-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${expertToken}`
      },
      body: {
        razorpay_order_id: feeOrderRes.data.order_id,
        razorpay_payment_id: `pay_fee_${crypto.randomBytes(6).toString('hex')}`,
        razorpay_signature: crypto.randomBytes(32).toString('hex')
      }
    });
    if (feeVerifyRes.status !== 200 || feeVerifyRes.data.service.listing_status !== 'active') {
      throw new Error('Listing fee payment verification failed to activate service');
    }
    console.log(`   ✓ Listing fee verified! Service status is now: ${feeVerifyRes.data.service.listing_status}`);

    console.log('\n======================================================================');
    console.log('✅ ALL RAZORPAY INTEGRATION & APPROVAL TESTS PASSED 100%!');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  }
}

runRazorpayWebRTCApprovalTests();
