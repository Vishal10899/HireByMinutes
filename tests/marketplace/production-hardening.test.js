// =============================================================================
// HIREBYMINUTES — PRODUCTION HARDENING, MARKETPLACE UX & RELIABILITY TEST SUITE
// =============================================================================
// Authoritative Acceptance Test Suite:
// 1. Strict Client/Expert role separation & self-booking prevention
// 2. Explicit role switching via signed JWT
// 3. Client loyalty rewards (1000 pts = 5m credit up to ₹500 cap) & zero-rupee payment bypass
// 4. Expert portfolio projects CRUD & public profile endpoints
// 5. Masked bank account details (•••• •••• •••• 1234) & integer-paise financial ledger
// 6. Honest marketplace payout request response
// =============================================================================

const http = require('http');
const assert = require('assert');
const jwt = require('jsonwebtoken');

process.env.PORT = '5098';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'dev-secret-key-production-hardening';

const db = require('../../server/db');
const { app, io } = require('../../server/index');
const { completeSession } = require('../../server/sessionLifecycle');

const PORT = 5098;

function makeRequest(path, options = {}) {
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

    const normalizedPath = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`;

    const reqOptions = {
      hostname: '127.0.0.1',
      port: PORT,
      path: normalizedPath,
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
          rawBuffer
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

async function runProductionHardeningSuite() {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, '127.0.0.1', async () => {
      console.log('\n======================================================================');
      console.log('--- HIREBYMINUTE PRODUCTION HARDENING & RELIABILITY TEST SUITE ---');
      console.log('======================================================================\n');

      let passedTests = 0;
      let totalTests = 0;

      async function test(name, fn) {
        totalTests++;
        try {
          await fn();
          console.log(`  ✓ [PASS] ${name}`);
          passedTests++;
        } catch (err) {
          console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
          process.exitCode = 1;
        }
      }

      try {
        // Setup mock test accounts
        const testClientId = 'test-client-harden-01';
        const testExpertId = 'test-expert-harden-01';
        const testServiceId = 'test-srv-harden-01';

        // Clean any leftover records
        db.prepare('DELETE FROM consultation_requests WHERE client_id = ? OR provider_id = ?').run(testClientId, testExpertId);
        db.prepare('DELETE FROM bookings WHERE client_id = ? OR provider_id = ?').run(testClientId, testExpertId);
        db.prepare('DELETE FROM services WHERE id = ?').run(testServiceId);
        db.prepare('DELETE FROM portfolio_projects WHERE user_id = ?').run(testExpertId);
        db.prepare('DELETE FROM expert_bank_accounts WHERE user_id = ?').run(testExpertId);
        db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testClientId, testExpertId);

        // Seed Client User
        db.prepare(`
          INSERT INTO users (id, email, password_hash, full_name, role, reward_points_balance, payout_balance_paise, verified, email_verified)
          VALUES (?, ?, 'hash', 'Aarav Client', 'client', 1200, 0, 1, 1)
        `).run(testClientId, 'aarav.client@test.com');

        // Seed Expert User
        db.prepare(`
          INSERT INTO users (id, email, password_hash, full_name, role, reward_points_balance, payout_balance_paise, verified, email_verified)
          VALUES (?, ?, 'hash', 'Dr. Priya Expert', 'provider', 0, 0, 1, 1)
        `).run(testExpertId, 'priya.expert@test.com');

        // Seed Service for Expert
        db.prepare(`
          INSERT INTO services (id, provider_id, title, category_id, description, price_per_minute, listing_status, listing_fee_paid, available_now)
          VALUES (?, ?, 'Cloud System Architecture Teardown', 'cat-tech', 'Deep architectural review', 50.00, 'active', 1, 1)
        `).run(testServiceId, testExpertId);

        const clientToken = jwt.sign({ id: testClientId, role: 'client' }, process.env.JWT_SECRET, { expiresIn: '1h' });
        const expertToken = jwt.sign({ id: testExpertId, role: 'provider' }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // -------------------------------------------------------------------
        // SECTION 1: STRICT ROLE SEPARATION & SELF-BOOKING REJECTION
        // -------------------------------------------------------------------
        console.log('--- Suite 1: Strict Role Separation & Self-Booking Rejection ---');

        await test('1. Provider account cannot create consultation bookings (HTTP 403)', async () => {
          const res = await makeRequest('/consultation-requests', {
            method: 'POST',
            headers: { Authorization: `Bearer ${expertToken}` },
            body: {
              service_id: testServiceId,
              duration_minutes: 15,
              connect_type: 'now',
              problem_description: 'Expert trying to book'
            }
          });
          assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
          assert.ok(res.data.error.includes('Expert accounts cannot book consultations'));
        });

        await test('2. Client cannot self-book if they own the service (HTTP 400)', async () => {
          try {
            // Temporarily set service provider_id to testClientId
            db.prepare('UPDATE services SET provider_id = ? WHERE id = ?').run(testClientId, testServiceId);

            const res = await makeRequest('/consultation-requests', {
              method: 'POST',
              headers: { Authorization: `Bearer ${clientToken}` },
              body: {
                service_id: testServiceId,
                duration_minutes: 15,
                connect_type: 'now',
                problem_description: 'Client self-booking'
              }
            });
            assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
            assert.ok(res.data.error.includes('consultation with yourself'));
          } finally {
            // Restore provider_id to expert
            db.prepare('UPDATE services SET provider_id = ? WHERE id = ?').run(testExpertId, testServiceId);
          }
        });

        await test('3. Client cannot publish or create expert services (HTTP 403)', async () => {
          const res = await makeRequest('/services', {
            method: 'POST',
            headers: { Authorization: `Bearer ${clientToken}` },
            body: {
              title: 'Hacked Service Listing',
              category_id: 'cat-tech',
              description: 'Unauthorized creation',
              price_per_minute: 100
            }
          });
          assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
          assert.ok(res.data.error.includes('registered experts can create'));
        });

        // -------------------------------------------------------------------
        // SECTION 2: EXPLICIT ROLE SWITCHING
        // -------------------------------------------------------------------
        console.log('\n--- Suite 2: Explicit Role Switching with Fresh JWT ---');

        await test('4. Client switches role to provider (POST /auth/switch-role)', async () => {
          const res = await makeRequest('/auth/switch-role', {
            method: 'POST',
            headers: { Authorization: `Bearer ${clientToken}` },
            body: { role: 'provider' }
          });
          assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
          assert.strictEqual(res.data.user.role, 'provider');
          assert.ok(res.data.token, 'Expected new JWT token');

          const decoded = jwt.verify(res.data.token, process.env.JWT_SECRET);
          assert.strictEqual(decoded.role, 'provider');
        });

        await test('5. Role switch rejects invalid roles (HTTP 400)', async () => {
          const res = await makeRequest('/auth/switch-role', {
            method: 'POST',
            headers: { Authorization: `Bearer ${clientToken}` },
            body: { role: 'admin' }
          });
          assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
          assert.ok(res.data.error.includes('Valid target_role'));
        });

        await test('6. User switches back to client role', async () => {
          const res = await makeRequest('/auth/switch-role', {
            method: 'POST',
            headers: { Authorization: `Bearer ${clientToken}` },
            body: { role: 'client' }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.user.role, 'client');
        });

        // -------------------------------------------------------------------
        // SECTION 3: CLIENT LOYALTY REWARDS & ZERO-RUPEE PAYMENT BYPASS
        // -------------------------------------------------------------------
        console.log('\n--- Suite 3: Client Loyalty Rewards & Zero-Rupee Payment ---');

        await test('7. GET /rewards/me returns client points balance and redemption rules', async () => {
          const res = await makeRequest('/rewards/me', {
            headers: { Authorization: `Bearer ${clientToken}` }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.reward_points_balance, 1200);
          assert.strictEqual(res.data.redemption_threshold, 1000);
          assert.strictEqual(res.data.free_minutes, 5);
          assert.strictEqual(res.data.can_redeem, true);
        });

        let createdRequestId = null;

        await test('8. Client redeems 1000 reward points on 5-minute consultation (₹250 discount)', async () => {
          const res = await makeRequest('/consultation-requests', {
            method: 'POST',
            headers: { Authorization: `Bearer ${clientToken}` },
            body: {
              service_id: testServiceId,
              duration_minutes: 5,
              connect_type: 'now',
              problem_description: 'Architecture review using reward points',
              redeem_reward_points: true
            }
          });
          assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
          assert.strictEqual(res.data.request.reward_points_redeemed, 1000);
          assert.strictEqual(res.data.request.reward_discount_amount, 250);
          assert.strictEqual(res.data.request.total_price, 0); // 5 * 50 = 250 - 250 = 0
          createdRequestId = res.data.request.id;
        });

        await test('9. Expert accepts consultation request (POST /consultation-requests/:id/accept)', async () => {
          const res = await makeRequest(`/consultation-requests/${createdRequestId}/accept`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${expertToken}` }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.request.status, 'ACCEPTED');
        });

        await test('10. Zero-rupee payment activates directly without Razorpay (POST /consultation-requests/:id/pay)', async () => {
          const res = await makeRequest(`/consultation-requests/${createdRequestId}/pay`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${clientToken}` }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.success, true);
          assert.strictEqual(res.data.request.status, 'PAID');
          assert.ok(res.data.session_id, 'Session ID must be created');

          // Verify client reward points balance decreased by 1000 (from 1200 to 200)
          const updatedClient = db.prepare('SELECT reward_points_balance FROM users WHERE id = ?').get(testClientId);
          assert.strictEqual(updatedClient.reward_points_balance, 200, 'Expected balance 200 after 1000 point deduction');
        });

        // -------------------------------------------------------------------
        // SECTION 4: EXPERT PROFILE & PORTFOLIO PROJECTS CRUD
        // -------------------------------------------------------------------
        console.log('\n--- Suite 4: Expert Profile & Portfolio Projects CRUD ---');

        let createdProjectId = null;

        await test('11. Expert creates portfolio project (POST /provider/portfolio)', async () => {
          const res = await makeRequest('/provider/portfolio', {
            method: 'POST',
            headers: { Authorization: `Bearer ${expertToken}` },
            body: {
              title: 'Distributed Event Bus in Go & Kafka',
              description: 'Processed 500k events/sec with sub-5ms p99 latency',
              technologies: ['Go', 'Kafka', 'Docker', 'Kubernetes'],
              project_url: 'https://github.com/hirebyminute/eventbus',
              image_url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31'
            }
          });
          assert.strictEqual(res.status, 201);
          assert.strictEqual(res.data.project.title, 'Distributed Event Bus in Go & Kafka');
          assert.strictEqual(res.data.project.user_id, testExpertId);
          createdProjectId = res.data.project.id;
        });

        await test('12. Expert lists portfolio projects (GET /provider/portfolio)', async () => {
          const res = await makeRequest('/provider/portfolio', {
            headers: { Authorization: `Bearer ${expertToken}` }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.projects.length, 1);
          assert.strictEqual(res.data.projects[0].id, createdProjectId);
        });

        await test('13. Public user retrieves expert portfolio without authentication (GET /users/:id/portfolio)', async () => {
          const res = await makeRequest(`/users/${testExpertId}/portfolio`);
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.projects.length, 1);
          assert.strictEqual(res.data.projects[0].title, 'Distributed Event Bus in Go & Kafka');
        });

        await test('14. Expert updates profile with education & certifications (PUT /provider/profile)', async () => {
          const res = await makeRequest('/provider/profile', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${expertToken}` },
            body: {
              headline: 'Principal Cloud Systems Engineer',
              bio: 'Over 12 years building high-scale distributed systems.',
              education: ['M.S. Computer Science, Stanford University (2014)'],
              certifications: ['AWS Certified Solutions Architect Professional', 'CKA Kubernetes Administrator'],
              skills: ['Distributed Systems', 'WebRTC', 'Go', 'Kafka'],
              experience_years: 12
            }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.user.headline, 'Principal Cloud Systems Engineer');
          assert.strictEqual(res.data.user.education.length, 1);
          assert.strictEqual(res.data.user.certifications.length, 2);
        });

        await test('15. Expert updates and deletes portfolio project', async () => {
          // Update
          const updateRes = await makeRequest(`/provider/portfolio/${createdProjectId}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${expertToken}` },
            body: {
              title: 'Distributed Event Bus v2',
              technologies: ['Go', 'Kafka', 'Rust']
            }
          });
          assert.strictEqual(updateRes.status, 200);
          assert.strictEqual(updateRes.data.project.title, 'Distributed Event Bus v2');

          // Delete
          const delRes = await makeRequest(`/provider/portfolio/${createdProjectId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${expertToken}` }
          });
          assert.strictEqual(delRes.status, 200);

          // Verify deleted
          const listRes = await makeRequest('/provider/portfolio', {
            headers: { Authorization: `Bearer ${expertToken}` }
          });
          assert.strictEqual(listRes.data.projects.length, 0);
        });

        // -------------------------------------------------------------------
        // SECTION 5: VERIFIED BANK ACCOUNT, MASKING & FINANCIAL LEDGER
        // -------------------------------------------------------------------
        console.log('\n--- Suite 5: Bank Account Masking & Integer-Paise Financial Ledger ---');

        await test('16. Expert saves verified bank account details (POST /provider/payout-account)', async () => {
          const res = await makeRequest('/provider/payout-account', {
            method: 'POST',
            headers: { Authorization: `Bearer ${expertToken}` },
            body: {
              account_holder_name: 'Dr. Priya Expert',
              account_number: '12345678901234',
              confirm_account_number: '12345678901234',
              ifsc_code: 'HDFC0001234',
              bank_name: 'HDFC Bank',
              account_type: 'savings'
            }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.account.account_holder_name, 'Dr. Priya Expert');
          assert.strictEqual(res.data.account.account_number_masked, '•••• •••• •••• 1234');
        });

        await test('17. Bank account retrieval returns masked number and never exposes raw account number', async () => {
          const res = await makeRequest('/provider/payout-account', {
            headers: { Authorization: `Bearer ${expertToken}` }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.account.account_number_masked, '•••• •••• •••• 1234');
          assert.strictEqual(res.data.account.account_number, undefined, 'Raw account number must never be exposed');
        });

        await test('18. Session lifecycle records 15% platform commission and 85% net earnings in integer paise', async () => {
          // Create a mock active session
          const mockSessionId = 'mock-sess-harden-01';
          const mockBookingId = 'mock-bk-harden-01';

          db.prepare('DELETE FROM sessions WHERE id = ?').run(mockSessionId);
          db.prepare('DELETE FROM bookings WHERE id = ?').run(mockBookingId);

          db.prepare(`
            INSERT INTO bookings (id, client_id, provider_id, service_id, scheduled_start, scheduled_end, duration_minutes, total_price, status, payment_id)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 10, 1000.00, 'ACCEPTED', 'pay_mock')
          `).run(mockBookingId, testClientId, testExpertId, testServiceId);

          db.prepare(`
            INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, duration_minutes, status, actual_start)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 10, 'ACTIVE', CURRENT_TIMESTAMP)
          `).run(mockSessionId, mockBookingId, testClientId, testExpertId, testServiceId);

          // Complete the session
          const outcome = await completeSession(mockSessionId, 'normal_completion');
          assert.strictEqual(outcome.success, true);
          assert.strictEqual(outcome.grossAmountInr, 1000);
          assert.strictEqual(outcome.platformFeeInr, 150); // 15%
          assert.strictEqual(outcome.netEarnedInr, 850);   // 85%

          // Verify financial ledger record in database
          const commRow = db.prepare("SELECT * FROM financial_ledger WHERE session_id = ? AND entry_type = 'platform_commission'").get(mockSessionId);
          assert.ok(commRow, 'Commission ledger row must exist');
          assert.strictEqual(commRow.amount_paise, 15000); // 150 INR = 15000 paise

          const netRow = db.prepare("SELECT * FROM financial_ledger WHERE session_id = ? AND entry_type = 'net_earning'").get(mockSessionId);
          assert.ok(netRow, 'Net earning ledger row must exist');
          assert.strictEqual(netRow.amount_paise, 85000);   // 850 INR = 85000 paise

          // Verify expert payout balance in users table
          const expertDb = db.prepare('SELECT payout_balance_paise FROM users WHERE id = ?').get(testExpertId);
          assert.strictEqual(expertDb.payout_balance_paise, 85000);

          // Verify client reward points credited: 10 mins * 20 pts = 200 points
          const clientDb = db.prepare('SELECT reward_points_balance FROM users WHERE id = ?').get(testClientId);
          assert.strictEqual(clientDb.reward_points_balance, 400); // 200 remaining + 200 earned
        });

        await test('19. Payout request responds honestly with pending onboarding status and preserves balance', async () => {
          const res = await makeRequest('/provider/payouts/request', {
            method: 'POST',
            headers: { Authorization: `Bearer ${expertToken}` },
            body: { amount_inr: 850 }
          });
          assert.strictEqual(res.status, 400);
          assert.strictEqual(res.data.payouts_enabled, false);
          assert.ok(res.data.error.includes('Direct API withdrawals are currently disabled'), 'Must explain gateway status honestly');

          // Ensure balance was NOT deducted or lost
          const expertDb = db.prepare('SELECT payout_balance_paise FROM users WHERE id = ?').get(testExpertId);
          assert.strictEqual(expertDb.payout_balance_paise, 85000);
        });

        // Clean up test data
        db.prepare('DELETE FROM consultation_requests WHERE client_id = ? OR provider_id = ?').run(testClientId, testExpertId);
        db.prepare('DELETE FROM bookings WHERE client_id = ? OR provider_id = ?').run(testClientId, testExpertId);
        db.prepare('DELETE FROM services WHERE id = ?').run(testServiceId);
        db.prepare('DELETE FROM portfolio_projects WHERE user_id = ?').run(testExpertId);
        db.prepare('DELETE FROM expert_bank_accounts WHERE user_id = ?').run(testExpertId);
        db.prepare('DELETE FROM financial_ledger WHERE user_id = ?').run(testExpertId);
        db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testClientId, testExpertId);

        console.log('\n======================================================================');
        console.log(`SUMMARY: ${passedTests} / ${totalTests} production hardening tests passed.`);
        console.log('======================================================================\n');

        if (passedTests === totalTests) {
          console.log('🎉 ALL 19 PRODUCTION HARDENING & RELIABILITY TESTS PASSED 100%!\n');
          resolve();
        } else {
          reject(new Error(`${totalTests - passedTests} tests failed.`));
        }

      } catch (fatalErr) {
        console.error('Fatal test error:', fatalErr);
        reject(fatalErr);
      } finally {
        server.close();
      }
    });
  });
}

if (require.main === module) {
  runProductionHardeningSuite()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runProductionHardeningSuite };
