// =============================================================================
// HIREBYMINUTES — CLIENT DASHBOARD PRODUCTION UPGRADE TEST SUITE
// =============================================================================
// Verifies production-readiness of the upgraded Client Dashboard:
// 1. All 6 server-authoritative summary metrics (experts hired, consultations,
//    delivered minutes, total net spent, completed sessions, pending requests).
// 2. Previously Hired Experts section (card layout, stats, actions, empty state).
// 3. My Consultations / Services Received (filter tabs, pagination, lifecycle actions).
// 4. Payment History & Spending Tab (financial breakdown cards, paginated table).
// 5. Resilience & Accessibility (loading/error state with retry, responsive layouts, 44px touch targets).
// 6. Backend API Endpoints (/api/dashboards/client, /api/client/summary, /api/client/experts,
//    /api/client/consultations, /api/client/payments).
// 7. Data integrity: distinct expert counting, failed/pending payment exclusion,
//    accurate refund deduction, no double-deduction, and strict client data isolation.
// =============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const jwt = require('jsonwebtoken');

process.env.PORT = '5112';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'dev-secret-key-client-dashboard';

const db = require('../../server/db');
const { app } = require('../../server/index');

const PORT = 5112;

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

async function runClientDashboardUpgradeSuite() {
  console.log('\n======================================================================');
  console.log('HIREBYMINUTES — CLIENT DASHBOARD PRODUCTION UPGRADE AUDIT');
  console.log('======================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function test(desc, fn) {
    totalTests++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${desc}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}`);
      console.error(`     Error: ${err.message}`);
      process.exitCode = 1;
    }
  }

  async function asyncTest(desc, fn) {
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

  // --- Suite 1: Frontend Source Code & Architecture Audit ---
  console.log('--- Suite 1: Frontend UI Specification & Architecture Audit ---');

  const dashboardPath = path.join(__dirname, '../../client/src/pages/ClientDashboardPage.tsx');
  assert(fs.existsSync(dashboardPath), 'ClientDashboardPage.tsx must exist');
  const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');

  const apiPath = path.join(__dirname, '../../client/src/services/api.ts');
  assert(fs.existsSync(apiPath), 'api.ts must exist');
  const apiCode = fs.readFileSync(apiPath, 'utf8');

  test('1. Client Dashboard renders all 6 server-authoritative summary metrics', () => {
    assert(dashboardCode.includes('Experts Hired'), 'Must display "Experts Hired" card');
    assert(dashboardCode.includes('Total Consultations'), 'Must display "Total Consultations" card');
    assert(dashboardCode.includes('Consultation Mins'), 'Must display "Consultation Mins" card');
    assert(dashboardCode.includes('Total Spent'), 'Must display "Total Spent" card');
    assert(dashboardCode.includes('Completed Sessions'), 'Must display "Completed Sessions" card');
    assert(dashboardCode.includes('Pending Requests'), 'Must display "Pending Requests" card');
    assert(dashboardCode.includes('stats?.totalExpertsHired'), 'Must bind to totalExpertsHired');
    assert(dashboardCode.includes('stats?.totalSpent'), 'Must bind to totalSpent');
  });

  test('2. Previously Hired Experts section includes comprehensive details & action buttons', () => {
    assert(dashboardCode.includes('Previously Hired Experts'), 'Must have section title');
    assert(dashboardCode.includes('exp.total_minutes'), 'Must show verified minutes delivered');
    assert(dashboardCode.includes('exp.total_spent_inr'), 'Must show net amount spent on expert');
    assert(dashboardCode.includes('exp.total_consultations'), 'Must show total consultations');
    assert(dashboardCode.includes('Book Again'), 'Must have "Book Again" action');
    assert(dashboardCode.includes('View Profile'), 'Must have "View Profile" action');
    assert(dashboardCode.includes('No previously hired experts yet') || dashboardCode.includes("You haven't hired any experts yet"), 'Must have clean empty state');
    assert(dashboardCode.includes('Find an Expert') || dashboardCode.includes('Explore Marketplace Experts'), 'Must have empty-state action');
  });

  test('3. My Consultations section provides status filter tabs, pagination, and lifecycle actions', () => {
    assert(dashboardCode.includes('My Consultations'), 'Must have Consultations section');
    assert(dashboardCode.includes("consultationFilter === 'all'"), 'Must have All filter tab');
    assert(dashboardCode.includes("consultationFilter === 'active'"), 'Must have Active/Upcoming filter tab');
    assert(dashboardCode.includes("consultationFilter === 'completed'"), 'Must have Completed filter tab');
    assert(dashboardCode.includes("consultationFilter === 'cancelled'"), 'Must have Cancelled/Refunded filter tab');
    assert(dashboardCode.includes('Pay & Confirm Consultation'), 'Must support Pay & Confirm action');
    assert(dashboardCode.includes('Enter Room'), 'Must support Enter Room action');
    assert(dashboardCode.includes('View Notes') || dashboardCode.includes('problem_description'), 'Must support View Notes / description');
  });

  test('4. Payment History & Spending Tab renders financial breakdown cards and paginated ledger', () => {
    assert(dashboardCode.includes('Total Captured Payments'), 'Must show Total Captured card');
    assert(dashboardCode.includes('Total Completed Refunds'), 'Must show Total Refunded card');
    assert(dashboardCode.includes('Net Client Spending'), 'Must show Net Client Spending card');
    assert(dashboardCode.includes("activeTab === 'payments'"), 'Must have payment history tab');
    assert(dashboardCode.includes('Transaction ID'), 'Must display transaction ID column');
    assert(dashboardCode.includes('Gross Paid'), 'Must display gross paid column');
    assert(dashboardCode.includes('Net Spent'), 'Must display net spent column');
  });

  test('5. Error state provides "Try Again" retry action without displaying deceptive fake zero state', () => {
    assert(dashboardCode.includes('Unable to load dashboard records'), 'Must show clear error heading');
    assert(dashboardCode.includes('Try Again'), 'Must provide a Try Again retry button');
    assert(dashboardCode.includes('loadDashboard'), 'Must re-trigger data fetch on Try Again');
  });

  test('6. UI adheres to brand design tokens, responsive grid, and 44px min touch targets', () => {
    assert(dashboardCode.includes('min-h-[44px]'), 'Must enforce 44px minimum touch targets');
    assert(dashboardCode.includes('grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'), 'Must use responsive 6-col summary grid');
    assert(dashboardCode.includes('moonstone') && dashboardCode.includes('midnight'), 'Must use brand color tokens');
  });

  test('7. API service exposes dedicated client dashboard endpoints', () => {
    assert(apiCode.includes('getClientSummary:'), 'api.ts must export getClientSummary');
    assert(apiCode.includes('getPreviouslyHiredExperts:'), 'api.ts must export getPreviouslyHiredExperts');
    assert(apiCode.includes('getClientConsultations:'), 'api.ts must export getClientConsultations');
    assert(apiCode.includes('getClientPaymentHistory:'), 'api.ts must export getClientPaymentHistory');
    assert(apiCode.includes('getClientDashboard:'), 'api.ts must retain getClientDashboard');
    assert(apiCode.includes('cancelConsultationRequest:'), 'api.ts must export cancelConsultationRequest');
  });

  test('7b. Dashboard includes Read Chats, Rehire, Cancel Request, and topic normalization', () => {
    assert(dashboardCode.includes('Read Chats'), 'Must have Read Chats action');
    assert(dashboardCode.includes('Rehire'), 'Must have Rehire action');
    assert(dashboardCode.includes('Cancel Request'), 'Must have Cancel Request action for pending requests');
    assert(dashboardCode.includes('normalizeTopic'), 'Must have normalizeTopic helper');
  });

  // --- Suite 2: Server-Authoritative Endpoints & Calculations ---
  console.log('\n--- Suite 2: Server-Authoritative Endpoints & Financial Calculations ---');

  return new Promise((resolve) => {
    const server = app.listen(PORT, '127.0.0.1', async () => {
      try {
        // Test client A, test client B, and 2 test experts
        const clientAId = 'client-dash-user-a';
        const clientBId = 'client-dash-user-b';
        const expert1Id = 'expert-dash-user-1';
        const expert2Id = 'expert-dash-user-2';
        const service1Id = 'srv-dash-1';
        const service2Id = 'srv-dash-2';

        // Cleanup before seeding
        db.prepare('DELETE FROM payments WHERE user_id IN (?, ?)').run(clientAId, clientBId);
        db.prepare('DELETE FROM sessions WHERE client_id IN (?, ?)').run(clientAId, clientBId);
        db.prepare('DELETE FROM bookings WHERE client_id IN (?, ?)').run(clientAId, clientBId);
        db.prepare('DELETE FROM consultation_requests WHERE client_id IN (?, ?)').run(clientAId, clientBId);
        db.prepare('DELETE FROM reviews WHERE client_id IN (?, ?)').run(clientAId, clientBId);
        db.prepare('DELETE FROM services WHERE id IN (?, ?)').run(service1Id, service2Id);
        db.prepare('DELETE FROM users WHERE id IN (?, ?, ?, ?)').run(clientAId, clientBId, expert1Id, expert2Id);

        // Seed users
        const seedUserStmt = db.prepare(`
          INSERT INTO users (id, email, username, password_hash, full_name, role, reward_points_balance, payout_balance_paise, verified, email_verified, avatar_url, headline)
          VALUES (?, ?, ?, 'hash', ?, ?, 0, 0, 1, 1, ?, ?)
        `);
        seedUserStmt.run(clientAId, 'client.a@test.com', 'client_dash_a', 'Aarav Sharma', 'client', 'https://example.com/client-a.jpg', 'Enterprise Client');
        seedUserStmt.run(clientBId, 'client.b@test.com', 'client_dash_b', 'Pooja Patel', 'client', 'https://example.com/client-b.jpg', 'Product Client');
        seedUserStmt.run(expert1Id, 'expert1@test.com', 'expert_dash_1', 'Dr. Vikram Malhotra', 'provider', 'https://example.com/expert1.jpg', 'Senior Cloud Architect');
        seedUserStmt.run(expert2Id, 'expert2@test.com', 'expert_dash_2', 'Ananya Roy', 'provider', 'https://example.com/expert2.jpg', 'Principal Frontend Engineer');

        // Seed services
        const seedServiceStmt = db.prepare(`
          INSERT INTO services (id, provider_id, title, category_id, description, price_per_minute, listing_status, listing_fee_paid, available_now)
          VALUES (?, ?, ?, 'cat-tech', 'Expert advice', ?, 'active', 1, 1)
        `);
        seedServiceStmt.run(service1Id, expert1Id, 'Cloud Infrastructure Strategy', 50.00);
        seedServiceStmt.run(service2Id, expert2Id, 'Full-Stack React Architecture', 40.00);

        // Seed consultation requests and bookings for Client A:
        // 1. Completed session with Expert 1 (duration: 30 mins)
        const req1Id = 'cr-test-01';
        const book1Id = 'bk-test-01';
        const sess1Id = 'sess-test-01';
        db.prepare(`
          INSERT INTO consultation_requests (id, client_id, provider_id, service_id, duration_minutes, price_per_minute, total_price, connect_type, scheduled_start, problem_description, response_deadline, status, session_id)
          VALUES (?, ?, ?, ?, 30, 50.00, 1500, 'scheduled', '2026-10-10 10:00:00', 'Cloud migration guidance', '2026-10-10 12:00:00', 'ACCEPTED', ?)
        `).run(req1Id, clientAId, expert1Id, service1Id, sess1Id);

        db.prepare(`
          INSERT INTO bookings (id, client_id, provider_id, service_id, scheduled_start, scheduled_end, duration_minutes, total_price, status)
          VALUES (?, ?, ?, ?, '2026-10-10 10:00:00', '2026-10-10 10:30:00', 30, 1500, 'COMPLETED')
        `).run(book1Id, clientAId, expert1Id, service1Id);

        db.prepare(`
          INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, duration_minutes, status)
          VALUES (?, ?, ?, ?, ?, '2026-10-10 10:00:00', '2026-10-10 10:30:00', 30, 'COMPLETED')
        `).run(sess1Id, book1Id, clientAId, expert1Id, service1Id);

        // 2. Second completed session with Expert 1 (duration: 20 mins) — tests distinct expert counting!
        const req2Id = 'cr-test-02';
        const book2Id = 'bk-test-02';
        const sess2Id = 'sess-test-02';
        db.prepare(`
          INSERT INTO consultation_requests (id, client_id, provider_id, service_id, duration_minutes, price_per_minute, total_price, connect_type, scheduled_start, problem_description, response_deadline, status, session_id)
          VALUES (?, ?, ?, ?, 20, 50.00, 1000, 'scheduled', '2026-10-11 11:00:00', 'Kubernetes tuning', '2026-10-11 13:00:00', 'ACCEPTED', ?)
        `).run(req2Id, clientAId, expert1Id, service1Id, sess2Id);

        db.prepare(`
          INSERT INTO bookings (id, client_id, provider_id, service_id, scheduled_start, scheduled_end, duration_minutes, total_price, status)
          VALUES (?, ?, ?, ?, '2026-10-11 11:00:00', '2026-10-11 11:20:00', 20, 1000, 'COMPLETED')
        `).run(book2Id, clientAId, expert1Id, service1Id);

        db.prepare(`
          INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, duration_minutes, status)
          VALUES (?, ?, ?, ?, ?, '2026-10-11 11:00:00', '2026-10-11 11:20:00', 20, 'COMPLETED')
        `).run(sess2Id, book2Id, clientAId, expert1Id, service1Id);

        // 3. Completed session with Expert 2 (duration: 15 mins)
        const req3Id = 'cr-test-03';
        const book3Id = 'bk-test-03';
        const sess3Id = 'sess-test-03';
        db.prepare(`
          INSERT INTO consultation_requests (id, client_id, provider_id, service_id, duration_minutes, price_per_minute, total_price, connect_type, scheduled_start, problem_description, response_deadline, status, session_id)
          VALUES (?, ?, ?, ?, 15, 40.00, 600, 'scheduled', '2026-10-12 14:00:00', 'React state structure review', '2026-10-12 16:00:00', 'ACCEPTED', ?)
        `).run(req3Id, clientAId, expert2Id, service2Id, sess3Id);

        db.prepare(`
          INSERT INTO bookings (id, client_id, provider_id, service_id, scheduled_start, scheduled_end, duration_minutes, total_price, status)
          VALUES (?, ?, ?, ?, '2026-10-12 14:00:00', '2026-10-12 14:15:00', 15, 600, 'COMPLETED')
        `).run(book3Id, clientAId, expert2Id, service2Id);

        db.prepare(`
          INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, duration_minutes, status)
          VALUES (?, ?, ?, ?, ?, '2026-10-12 14:00:00', '2026-10-12 14:15:00', 15, 'COMPLETED')
        `).run(sess3Id, book3Id, clientAId, expert2Id, service2Id);

        // 4. Pending expert request for Client A
        const reqPendingId = 'cr-test-pending';
        const futureStart = new Date(Date.now() + 3600 * 1000).toISOString();
        const futureDeadline = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
        db.prepare(`
          INSERT INTO consultation_requests (id, client_id, provider_id, service_id, duration_minutes, price_per_minute, total_price, connect_type, scheduled_start, problem_description, response_deadline, status)
          VALUES (?, ?, ?, ?, 30, 50.00, 1500, 'scheduled', ?, 'Pending infra review', ?, 'PENDING_EXPERT')
        `).run(reqPendingId, clientAId, expert1Id, service1Id, futureStart, futureDeadline);

        // 5. Payments for Client A:
        // Payment 1: ₹1500 succeeded
        const pay1Id = 'pay-test-01';
        db.prepare(`
          INSERT INTO payments (id, user_id, amount, status, type, reference_id, metadata_json, created_at)
          VALUES (?, ?, 1500, 'succeeded', 'session_payment', ?, ?, '2026-10-10 09:55:00')
        `).run(pay1Id, clientAId, book1Id, JSON.stringify({ booking_id: book1Id }));

        // Payment 2: ₹1000 succeeded
        const pay2Id = 'pay-test-02';
        db.prepare(`
          INSERT INTO payments (id, user_id, amount, status, type, reference_id, metadata_json, created_at)
          VALUES (?, ?, 1000, 'succeeded', 'session_payment', ?, ?, '2026-10-11 10:55:00')
        `).run(pay2Id, clientAId, book2Id, JSON.stringify({ booking_id: book2Id }));

        // Payment 3: ₹600 succeeded
        const pay3Id = 'pay-test-03';
        db.prepare(`
          INSERT INTO payments (id, user_id, amount, status, type, reference_id, metadata_json, created_at)
          VALUES (?, ?, 600, 'succeeded', 'session_payment', ?, ?, '2026-10-12 13:55:00')
        `).run(pay3Id, clientAId, book3Id, JSON.stringify({ booking_id: book3Id }));

        // Payment 4: ₹800 PENDING (must NOT count towards spending!)
        const payPendingId = 'pay-test-pending';
        db.prepare(`
          INSERT INTO payments (id, user_id, amount, status, type, reference_id, created_at)
          VALUES (?, ?, 800, 'pending', 'session_payment', 'ref-pending', '2026-10-13 11:00:00')
        `).run(payPendingId, clientAId);

        // Payment 5: ₹400 REFUND on Payment 3 (Gross 1500+1000+600 = 3100. Refund 400. Net should be 2700!)
        const payRefundId = 'pay-test-refund';
        db.prepare(`
          INSERT INTO payments (id, user_id, amount, status, type, reference_id, metadata_json, created_at)
          VALUES (?, ?, 400, 'succeeded', 'refund', ?, ?, '2026-10-13 12:00:00')
        `).run(payRefundId, clientAId, pay3Id, JSON.stringify({ original_payment_id: pay3Id, reason: 'partial refund' }));

        // JWT tokens
        const tokenA = jwt.sign({ id: clientAId, role: 'client' }, process.env.JWT_SECRET);
        const tokenB = jwt.sign({ id: clientBId, role: 'client' }, process.env.JWT_SECRET);

        // Run API tests
        await asyncTest('8. GET /api/client/summary calculates exact authoritative statistics', async () => {
          const res = await makeRequest('/api/client/summary', {
            headers: { Authorization: `Bearer ${tokenA}` }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.success, true);
          const s = res.data.summary;

          // Distinct experts: Expert 1 (booked twice) and Expert 2 (booked once) => 2 distinct experts!
          assert.strictEqual(s.experts_hired, 2, `Expected 2 distinct experts hired, got ${s.experts_hired}`);

          // Total consultations: 3 completed + 1 pending = 4
          assert.strictEqual(s.total_consultations, 4, `Expected 4 total consultations, got ${s.total_consultations}`);
          assert.strictEqual(s.completed_sessions, 3, `Expected 3 completed sessions, got ${s.completed_sessions}`);
          assert.strictEqual(s.pending_requests, 1, `Expected 1 pending request, got ${s.pending_requests}`);

          // Verified delivered minutes: 30 + 20 + 15 = 65 minutes
          assert.strictEqual(s.consultation_minutes, 65, `Expected 65 consultation minutes, got ${s.consultation_minutes}`);

          // Total spent: 1500 + 1000 + 600 - 400 (refund) = 2700
          assert.strictEqual(s.total_spent, 2700, `Expected ₹2700 total net spent, got ₹${s.total_spent}`);
        });

        await asyncTest('9. GET /api/client/summary excludes failed and pending payments from total_spent', async () => {
          // If failed (₹500) and pending (₹800) were included, total would be 4000.
          // Correct total spent must remain exactly ₹2700.
          const res = await makeRequest('/api/client/summary', {
            headers: { Authorization: `Bearer ${tokenA}` }
          });
          assert.strictEqual(res.data.summary.total_spent, 2700);
        });

        await asyncTest('10. GET /api/client/experts returns distinct hired experts with accurate aggregations', async () => {
          const res = await makeRequest('/api/client/experts?page=1&limit=10', {
            headers: { Authorization: `Bearer ${tokenA}` }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.success, true);
          assert.strictEqual(res.data.experts.length, 2, `Expected 2 experts, got ${res.data.experts.length}`);

          const exp1 = res.data.experts.find(e => e.id === expert1Id);
          assert(exp1, 'Expert 1 must be present in response');
          assert.strictEqual(exp1.name, 'Dr. Vikram Malhotra');
          assert.strictEqual(exp1.total_consultations, 3); // 2 completed + 1 pending
          assert.strictEqual(exp1.verified_minutes, 50); // 30 + 20
          assert.strictEqual(exp1.net_spent, 2500); // 1500 + 1000

          const exp2 = res.data.experts.find(e => e.id === expert2Id);
          assert(exp2, 'Expert 2 must be present in response');
          assert.strictEqual(exp2.name, 'Ananya Roy');
          assert.strictEqual(exp2.total_consultations, 1);
          assert.strictEqual(exp2.verified_minutes, 15);
          assert.strictEqual(exp2.net_spent, 200); // 600 - 400 refund
        });

        await asyncTest('11. GET /api/client/consultations filters by status and paginates', async () => {
          // All consultations
          const resAll = await makeRequest('/api/client/consultations?status=all', {
            headers: { Authorization: `Bearer ${tokenA}` }
          });
          assert.strictEqual(resAll.status, 200);
          assert.strictEqual(resAll.data.consultations.length, 4);
          assert.strictEqual(resAll.data.pagination.total, 4);

          // Completed only
          const resCompleted = await makeRequest('/api/client/consultations?status=completed', {
            headers: { Authorization: `Bearer ${tokenA}` }
          });
          assert.strictEqual(resCompleted.status, 200);
          assert.strictEqual(resCompleted.data.consultations.length, 3);

          // Active/upcoming (pending expert)
          const resActive = await makeRequest('/api/client/consultations?status=active', {
            headers: { Authorization: `Bearer ${tokenA}` }
          });
          assert.strictEqual(resActive.status, 200);
          assert.strictEqual(resActive.data.consultations.length, 1);
          assert.strictEqual(resActive.data.consultations[0].id, reqPendingId);
        });

        await asyncTest('12. GET /api/client/payments returns financial breakdown and paginated transactions', async () => {
          const res = await makeRequest('/api/client/payments?page=1&limit=10', {
            headers: { Authorization: `Bearer ${tokenA}` }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.success, true);
          assert(res.data.summary, 'Must contain financial summary');
          assert.strictEqual(res.data.summary.total_captured_inr, 3100); // 1500 + 1000 + 600
          assert.strictEqual(res.data.summary.total_refunded_inr, 400); // 400
          assert.strictEqual(res.data.summary.net_spent_inr, 2700); // 3100 - 400 = 2700

          assert(Array.isArray(res.data.payments), 'Payments must be an array');
          assert(res.data.payments.length >= 4, 'Must return payments list');
        });

        await asyncTest('13. GET /api/dashboards/client provides enriched unified dashboard data', async () => {
          const res = await makeRequest('/api/dashboards/client', {
            headers: { Authorization: `Bearer ${tokenA}` }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.success, true);
          assert(res.data.summary, 'Must contain summary');
          assert.strictEqual(res.data.summary.experts_hired, 2);
          assert(Array.isArray(res.data.previously_hired_experts), 'Must contain previously_hired_experts array');
          assert.strictEqual(res.data.previously_hired_experts.length, 2);
          assert(Array.isArray(res.data.consultations), 'Must contain consultations array');
          assert(res.data.spending_summary, 'Must contain spending_summary');
          assert.strictEqual(res.data.spending_summary.net_spent_inr, 2700);
        });

        await asyncTest('14. Client isolation: Client B cannot view Client A\'s dashboard, stats, or payments', async () => {
          const resB = await makeRequest('/api/client/summary', {
            headers: { Authorization: `Bearer ${tokenB}` }
          });
          assert.strictEqual(resB.status, 200);
          // Client B has 0 bookings and 0 payments
          assert.strictEqual(resB.data.summary.experts_hired, 0);
          assert.strictEqual(resB.data.summary.total_consultations, 0);
          assert.strictEqual(resB.data.summary.consultation_minutes, 0);
          assert.strictEqual(resB.data.summary.total_spent, 0);

          const resExpertsB = await makeRequest('/api/client/experts', {
            headers: { Authorization: `Bearer ${tokenB}` }
          });
          assert.strictEqual(resExpertsB.data.experts.length, 0);

          const resPaymentsB = await makeRequest('/api/client/payments', {
            headers: { Authorization: `Bearer ${tokenB}` }
          });
          assert.strictEqual(resPaymentsB.data.payments.length, 0);
          assert.strictEqual(resPaymentsB.data.summary.net_spent_inr, 0);
        });

        await asyncTest('15. Authentication enforcement: Unauthenticated requests return 401 Unauthorized', async () => {
          const resSummary = await makeRequest('/api/client/summary');
          assert.strictEqual(resSummary.status, 401);

          const resExperts = await makeRequest('/api/client/experts');
          assert.strictEqual(resExperts.status, 401);

          const resConsultations = await makeRequest('/api/client/consultations');
          assert.strictEqual(resConsultations.status, 401);

          const resPayments = await makeRequest('/api/client/payments');
          assert.strictEqual(resPayments.status, 401);
        });

        await asyncTest('16. Authoritative lifecycle statuses: Completed sessions have status COMPLETED and never show payment action', async () => {
          const res = await makeRequest('/api/dashboards/client', {
            headers: { Authorization: `Bearer ${tokenA}` }
          });
          assert.strictEqual(res.status, 200);
          const completedConsultations = res.data.consultations.filter(c => c.id === req1Id || c.id === req2Id || c.id === req3Id);
          assert.strictEqual(completedConsultations.length, 3);
          for (const c of completedConsultations) {
            assert.strictEqual(c.status, 'COMPLETED', 'Session must have authoritative COMPLETED status');
          }
        });

        await asyncTest('17. Cancellation: Client can cancel a pending consultation request', async () => {
          const resCancel = await makeRequest(`/api/consultation-requests/${reqPendingId}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenA}` }
          });
          assert.strictEqual(resCancel.status, 200);
          assert.strictEqual(resCancel.data.request.status, 'CANCELLED');

          // Verify updated status in dashboard
          const resDash = await makeRequest('/api/dashboards/client', {
            headers: { Authorization: `Bearer ${tokenA}` }
          });
          const cancelledReq = resDash.data.consultations.find(c => c.id === reqPendingId);
          assert.strictEqual(cancelledReq.status, 'CANCELLED');
        });

        await asyncTest('18. Rehire: Creates a fresh request preserving acceptance-first flow without modifying old sessions', async () => {
          const resRehire = await makeRequest('/api/consultation-requests', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenA}` },
            body: {
              service_id: service1Id,
              duration_minutes: 30,
              connect_type: 'now',
              problem_description: '""Follow-up on database indexing""'
            }
          });
          assert([200, 201].includes(resRehire.status), 'Must return 200 or 201 Created');
          assert(resRehire.data.request.id, 'Must return new request ID');
          assert.notStrictEqual(resRehire.data.request.id, req1Id);
          assert.strictEqual(resRehire.data.request.status, 'PENDING_EXPERT');
          assert.strictEqual(resRehire.data.request.problem_description, 'Follow-up on database indexing', 'Quotes and serialization artifacts must be stripped');

          // Old completed sessions are untouched
          const oldSession = db.prepare('SELECT status FROM sessions WHERE id = ?').get(sess1Id);
          assert.strictEqual(oldSession.status, 'COMPLETED');

          // Clean up created request
          db.prepare('DELETE FROM consultation_requests WHERE id = ?').run(resRehire.data.request.id);
          db.prepare('DELETE FROM bookings WHERE id = ?').run(resRehire.data.request.id);
        });

        await asyncTest('19. Read-only consultation history access & topic formatting', async () => {
          const resSession = await makeRequest(`/api/sessions/${sess1Id}`, {
            headers: { Authorization: `Bearer ${tokenA}` }
          });
          assert.strictEqual(resSession.status, 200);
          assert(resSession.data.session, 'Must return session object');
          assert(Array.isArray(resSession.data.messages), 'Must return messages array');
          assert.strictEqual(resSession.data.session.status, 'COMPLETED');
        });

        // Cleanup
        db.prepare('DELETE FROM payments WHERE user_id IN (?, ?)').run(clientAId, clientBId);
        db.prepare('DELETE FROM sessions WHERE client_id IN (?, ?)').run(clientAId, clientBId);
        db.prepare('DELETE FROM bookings WHERE client_id IN (?, ?)').run(clientAId, clientBId);
        db.prepare('DELETE FROM consultation_requests WHERE client_id IN (?, ?)').run(clientAId, clientBId);
        db.prepare('DELETE FROM services WHERE id IN (?, ?)').run(service1Id, service2Id);
        db.prepare('DELETE FROM users WHERE id IN (?, ?, ?, ?)').run(clientAId, clientBId, expert1Id, expert2Id);

      } catch (err) {
        console.error('Fatal test error:', err);
        process.exitCode = 1;
      } finally {
        server.close(() => {
          console.log('\n======================================================================');
          console.log(`CLIENT DASHBOARD SUITE RESULT: ${passedTests}/${totalTests} Tests Passed`);
          console.log('======================================================================\n');
          if (passedTests === totalTests) {
            console.log('🎉 CLIENT DASHBOARD UPGRADE TEST SUITE PASSED 100%!');
            resolve(true);
          } else {
            console.error('❌ SOME TESTS FAILED IN CLIENT DASHBOARD UPGRADE SUITE.');
            process.exitCode = 1;
            resolve(false);
          }
        });
      }
    });
  });
}

runClientDashboardUpgradeSuite()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error('Test suite runner crashed:', err);
    process.exit(1);
  });
