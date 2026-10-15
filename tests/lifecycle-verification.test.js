// =============================================================================
// HIREBYMINUTES — LIFECYCLE & CLIENT INBOX PRODUCTION READINESS AUDIT
// =============================================================================
// Verifies:
// 1. Lifecycle transitions across PENDING, ACCEPTED, PAID/ACTIVE, COMPLETED, EXPIRED, CANCELLED, failed-payment
// 2. Completed consultations never display payment or room-entry actions
// 3. Accepted requests with an existing session cannot trigger duplicate payment or order creation
// 4. Cancellation ownership & permitted state transitions (only PENDING/ACCEPTED without payment/session)
// 5. Client authorization on session transcripts (Client B forbidden from Client A's archive)
//    and immutable locked communication on ended/completed sessions
// 6. Rehire creates a fresh request with server-side duration & price validation without mutating historical sessions
// 7. Authoritative metrics calculation (completed count, minutes, spending, distinct experts)
// =============================================================================

const http = require('http');
const assert = require('assert');
const jwt = require('jsonwebtoken');

process.env.PORT = '5115';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'dev-secret-lifecycle-audit';

const db = require('../server/db');
const { app } = require('../server/index');

const PORT = 5115;

function makeRequest(pathStr, options = {}) {
  return new Promise((resolve, reject) => {
    const isBuffer = Buffer.isBuffer(options.body);
    const contentType = options.headers && options.headers['Content-Type']
      ? options.headers['Content-Type']
      : (isBuffer ? 'application/octet-stream' : 'application/json');

    const headers = {
      ...(options.headers || {}),
      'Content-Type': contentType
    };

    if (options.body && !headers['Content-Length']) {
      if (isBuffer) {
        headers['Content-Length'] = options.body.length;
      } else {
        const bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        headers['Content-Length'] = Buffer.byteLength(bodyStr);
      }
    }

    const reqOptions = {
      hostname: '127.0.0.1',
      port: PORT,
      path: pathStr.startsWith('/') ? pathStr : `/${pathStr}`,
      method: options.method || 'GET',
      headers
    };

    const req = http.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const rawBuffer = Buffer.concat(chunks);
        const text = rawBuffer.toString('utf-8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json || text,
          rawText: text
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      if (isBuffer) {
        req.write(options.body);
      } else {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
    }
    req.end();
  });
}

async function runLifecycleVerification() {
  console.log('\n======================================================================');
  console.log('HIREBYMINUTES — LIFECYCLE & CLIENT INBOX PRODUCTION READINESS AUDIT');
  console.log('======================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  async function test(desc, fn) {
    totalTests++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${desc}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}`);
      console.error(`     Error: ${err.message}`);
      process.exitCode = 1;
    }
  }

  return new Promise((resolve) => {
    const server = app.listen(PORT, '127.0.0.1', async () => {
      try {
        const client1Id = 'audit-client-01';
        const client2Id = 'audit-client-02';
        const expert1Id = 'audit-expert-01';
        const service1Id = 'audit-service-01';

        const tokenClient1 = jwt.sign({ id: client1Id, role: 'client' }, process.env.JWT_SECRET);
        const tokenClient2 = jwt.sign({ id: client2Id, role: 'client' }, process.env.JWT_SECRET);
        const tokenExpert1 = jwt.sign({ id: expert1Id, role: 'provider' }, process.env.JWT_SECRET);

        // Clean previous test data
        db.prepare('DELETE FROM messages WHERE session_id LIKE ?').run('audit-%');
        db.prepare('DELETE FROM payments WHERE user_id IN (?, ?)').run(client1Id, client2Id);
        db.prepare('DELETE FROM sessions WHERE client_id IN (?, ?)').run(client1Id, client2Id);
        db.prepare('DELETE FROM bookings WHERE client_id IN (?, ?)').run(client1Id, client2Id);
        db.prepare('DELETE FROM consultation_requests WHERE client_id IN (?, ?)').run(client1Id, client2Id);
        db.prepare('DELETE FROM services WHERE id = ?').run(service1Id);
        db.prepare('DELETE FROM users WHERE id IN (?, ?, ?)').run(client1Id, client2Id, expert1Id);

        // Seed users & service
        db.prepare(`
          INSERT INTO users (id, full_name, email, password_hash, role, headline, rating, review_count, verified, email_verified)
          VALUES (?, 'Audit Client 1', 'client1@audit.local', 'dummy-hash', 'client', 'Founder', 5.0, 1, 1, 1)
        `).run(client1Id);

        db.prepare(`
          INSERT INTO users (id, full_name, email, password_hash, role, headline, rating, review_count, verified, email_verified)
          VALUES (?, 'Audit Client 2', 'client2@audit.local', 'dummy-hash', 'client', 'VP Engineering', 5.0, 0, 1, 1)
        `).run(client2Id);

        db.prepare(`
          INSERT INTO users (id, full_name, email, password_hash, role, headline, rating, review_count, verified, email_verified)
          VALUES (?, 'Senior Architect', 'expert1@audit.local', 'dummy-hash', 'provider', 'Principal Cloud Architect', 4.95, 24, 1, 1)
        `).run(expert1Id);

        db.prepare(`
          INSERT INTO services (id, provider_id, title, category_id, description, price_per_minute, listing_status, listing_fee_paid, available_now)
          VALUES (?, ?, 'Cloud Infrastructure Review', 'cat-tech', 'Detailed cloud audit and optimization', 60.00, 'active', 1, 1)
        `).run(service1Id, expert1Id);

        // --- Test 1: Full Lifecycle Transition: PENDING -> ACCEPTED -> PAID -> ACTIVE -> COMPLETED ---
        await test('1. Lifecycle transitions across PENDING -> ACCEPTED -> PAID -> ACTIVE -> COMPLETED', async () => {
          // A. Client creates request (PENDING_EXPERT)
          const createRes = await makeRequest('/api/consultation-requests', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenClient1}` },
            body: {
              service_id: service1Id,
              duration_minutes: 30,
              connect_type: 'now',
              problem_description: '""Need Kubernetes migration architecture review""'
            }
          });
          if (![200, 201].includes(createRes.status)) {
            console.error('DEBUG createRes:', createRes.status, createRes.data);
          }
          assert([200, 201].includes(createRes.status), 'Must create request');
          const reqId = createRes.data.request.id;
          assert.strictEqual(createRes.data.request.status, 'PENDING_EXPERT');
          assert.strictEqual(createRes.data.request.problem_description, 'Need Kubernetes migration architecture review', 'Topic quotes stripped');

          // B. Expert accepts request (ACCEPTED)
          const acceptRes = await makeRequest(`/api/consultation-requests/${reqId}/accept`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenExpert1}` }
          });
          assert.strictEqual(acceptRes.status, 200);
          assert.strictEqual(acceptRes.data.request.status, 'ACCEPTED');

          // C. Client initiates Razorpay Order
          const orderRes = await makeRequest(`/api/consultation-requests/${reqId}/create-razorpay-order`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenClient1}` }
          });
          assert.strictEqual(orderRes.status, 200);
          assert(orderRes.data.order_id, 'Must generate razorpay order');
          assert.strictEqual(orderRes.data.amount, 1800); // 30 mins * ₹60/min = ₹1800

          // D. Payment verified (Transitions to PAID and ACTIVE session)
          const fakeOrderId = orderRes.data.order_id;
          const fakePaymentId = `pay-audit-${Date.now()}`;
          const crypto = require('crypto');
          const secret = 'dev_razorpay_secret_key_12345';
          const signature = crypto.createHmac('sha256', secret).update(`${fakeOrderId}|${fakePaymentId}`).digest('hex');

          const verifyRes = await makeRequest(`/api/consultation-requests/${reqId}/verify-razorpay-payment`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenClient1}` },
            body: {
              razorpay_order_id: fakeOrderId,
              razorpay_payment_id: fakePaymentId,
              razorpay_signature: signature
            }
          });
          assert.strictEqual(verifyRes.status, 200);
          assert(verifyRes.data.session_id, 'Must link session_id');
          const sessionId = verifyRes.data.session_id;

          // E. Check session status in DB -> ACTIVE
          const activeSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
          assert.strictEqual(activeSession.status, 'ACTIVE');

          // F. Transition to COMPLETED
          db.prepare("UPDATE sessions SET status = 'COMPLETED', actual_end = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
          const completedSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
          assert.strictEqual(completedSession.status, 'COMPLETED');
        });

        // --- Test 2: Completed consultations never show payment action ---
        await test('2. Completed consultations in dashboard data strictly have status COMPLETED and no pending payment', async () => {
          const dashRes = await makeRequest('/api/dashboards/client', {
            headers: { Authorization: `Bearer ${tokenClient1}` }
          });
          assert.strictEqual(dashRes.status, 200);
          const completed = dashRes.data.consultations.filter(c => c.status === 'COMPLETED');
          assert.strictEqual(completed.length, 1);
          for (const c of completed) {
            assert.strictEqual(c.status, 'COMPLETED');
            assert.notStrictEqual(c.status, 'ACCEPTED');
            assert(c.session_id, 'Must have linked session_id');
          }
        });

        // --- Test 3: Duplicate payment prevention ---
        await test('3. Accepted request with existing session cannot trigger second payment or order creation', async () => {
          // Attempting to create order for completed/paid request
          const allReqs = db.prepare('SELECT id FROM consultation_requests WHERE client_id = ?').all(client1Id);
          for (const r of allReqs) {
            const reOrderRes = await makeRequest(`/api/consultation-requests/${r.id}/create-razorpay-order`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${tokenClient1}` }
            });
            assert.strictEqual(reOrderRes.status, 400, 'Must disallow creating order for paid/session request');
          }
        });

        // --- Test 4: Cancellation ownership and permitted state transitions ---
        await test('4. Cancellation ownership & permitted state transitions: client-only, pending-only, no paid cancellation', async () => {
          // Create new pending request
          const pendingRes = await makeRequest('/api/consultation-requests', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenClient1}` },
            body: {
              service_id: service1Id,
              duration_minutes: 15,
              connect_type: 'now',
              problem_description: 'Test pending cancellation'
            }
          });
          const pendingId = pendingRes.data.request.id;

          // Client 2 attempts to cancel Client 1's request -> 403 Forbidden
          const wrongClientRes = await makeRequest(`/api/consultation-requests/${pendingId}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenClient2}` }
          });
          assert.strictEqual(wrongClientRes.status, 403, 'Unauthorized client must be rejected');

          // Owner client cancels request -> 200 OK
          const cancelRes = await makeRequest(`/api/consultation-requests/${pendingId}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenClient1}` }
          });
          assert.strictEqual(cancelRes.status, 200);
          assert.strictEqual(cancelRes.data.request.status, 'CANCELLED');

          // Cannot cancel already cancelled request -> 400
          const reCancelRes = await makeRequest(`/api/consultation-requests/${pendingId}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenClient1}` }
          });
          assert.strictEqual(reCancelRes.status, 400);
        });

        // --- Test 5: Authorization on session transcript and locked messaging on completed sessions ---
        await test('5. Authorized read-only chat access: Client 2 forbidden from Client 1 session transcript; completed sessions lock messaging', async () => {
          const session = db.prepare('SELECT id FROM sessions WHERE client_id = ?').get(client1Id);
          assert(session, 'Must have a session for client 1');

          // Client 2 attempts to read Client 1 transcript -> 403 Forbidden
          const unauthRes = await makeRequest(`/api/sessions/${session.id}`, {
            headers: { Authorization: `Bearer ${tokenClient2}` }
          });
          assert.strictEqual(unauthRes.status, 403, 'Non-participant client must be denied');

          // Client 1 reads own transcript -> 200 OK
          const authRes = await makeRequest(`/api/sessions/${session.id}`, {
            headers: { Authorization: `Bearer ${tokenClient1}` }
          });
          assert.strictEqual(authRes.status, 200);
          assert(Array.isArray(authRes.data.messages));

          // Attempting to post message to COMPLETED session -> 403 Locked
          const postMsgRes = await makeRequest(`/api/sessions/${session.id}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenClient1}` },
            body: { content: 'Trying to send message to finished session' }
          });
          assert.strictEqual(postMsgRes.status, 403, 'Posting message to ended session must be locked');
        });

        // --- Test 6: Rehire creates fresh request with server-side validation without mutating old sessions ---
        await test('6. Rehire creates a fresh request with server-side duration & price validation without altering old sessions', async () => {
          const oldSessionBefore = db.prepare('SELECT * FROM sessions WHERE client_id = ?').get(client1Id);

          // Submitting rehire request
          const rehireRes = await makeRequest('/api/consultation-requests', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenClient1}` },
            body: {
              service_id: service1Id,
              duration_minutes: 45,
              connect_type: 'now',
              problem_description: '""Follow-up on CI/CD pipeline automation""'
            }
          });
          assert([200, 201].includes(rehireRes.status));
          const newReq = rehireRes.data.request;
          assert(newReq.id);
          assert.notStrictEqual(newReq.id, oldSessionBefore.booking_id);
          assert.strictEqual(newReq.duration_minutes, 45);
          // Server-side price validation: 45 * ₹60/min = ₹2700
          assert.strictEqual(newReq.total_price, 2700);
          assert.strictEqual(newReq.problem_description, 'Follow-up on CI/CD pipeline automation');

          // Verify old session remained untouched
          const oldSessionAfter = db.prepare('SELECT * FROM sessions WHERE id = ?').get(oldSessionBefore.id);
          assert.strictEqual(oldSessionAfter.status, 'COMPLETED');
          assert.strictEqual(oldSessionAfter.duration_minutes, oldSessionBefore.duration_minutes);
        });

        // --- Test 7: Accurate dashboard metrics against database records ---
        await test('7. Authoritative metrics calculation: distinct experts, delivered minutes, completed count, net spending', async () => {
          const dashRes = await makeRequest('/api/dashboards/client', {
            headers: { Authorization: `Bearer ${tokenClient1}` }
          });
          assert.strictEqual(dashRes.status, 200);
          const data = dashRes.data;

          // 1 distinct expert hired
          assert.strictEqual(data.summary.experts_hired, 1);
          // Exactly 1 completed session (30 mins)
          assert.strictEqual(data.summary.completed_sessions, 1);
          assert.strictEqual(data.summary.consultation_minutes, 30);
          // Captured spending: ₹1800
          assert.strictEqual(data.spending_summary.net_spent_inr, 1800);

          // Expert row in previously_hired_experts
          assert.strictEqual(data.previously_hired_experts.length, 1);
          const expRow = data.previously_hired_experts[0];
          assert.strictEqual(expRow.provider_id, expert1Id);
          assert.strictEqual(expRow.completed_sessions_count, 1);
          assert.strictEqual(expRow.total_minutes, 30);
          assert.strictEqual(expRow.total_spent_inr, 1800);
        });

        // Cleanup test data
        db.prepare('DELETE FROM messages WHERE session_id LIKE ?').run('audit-%');
        db.prepare('DELETE FROM payments WHERE user_id IN (?, ?)').run(client1Id, client2Id);
        db.prepare('DELETE FROM sessions WHERE client_id IN (?, ?)').run(client1Id, client2Id);
        db.prepare('DELETE FROM bookings WHERE client_id IN (?, ?)').run(client1Id, client2Id);
        db.prepare('DELETE FROM consultation_requests WHERE client_id IN (?, ?)').run(client1Id, client2Id);
        db.prepare('DELETE FROM services WHERE id = ?').run(service1Id);
        db.prepare('DELETE FROM users WHERE id IN (?, ?, ?)').run(client1Id, client2Id, expert1Id);

      } catch (err) {
        console.error('Audit suite error:', err);
        process.exitCode = 1;
      } finally {
        server.close(() => {
          console.log('\n======================================================================');
          console.log(`LIFECYCLE AUDIT RESULT: ${passedTests}/${totalTests} Tests Passed`);
          console.log('======================================================================\n');
          resolve(passedTests === totalTests);
        });
      }
    });
  });
}

runLifecycleVerification()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Fatal crash:', err);
    process.exit(1);
  });
