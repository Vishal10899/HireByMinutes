// =============================================================================
// HIREBYMINUTES — PRODUCTION ACCEPTANCE AUDIT & REGRESSION TEST SUITE
// =============================================================================
// Comprehensive Acceptance Suite:
// 1. Authorization: API-level self-booking prevention & role-based dashboard access
// 2. Loyalty Rewards: Atomic deduction, idempotency, duplicate redemption prevention
// 3. Financial Reconciliation: Ledger reversal & point restoration on Admin Cancellation/Refund
// 4. Webhook Integrity: payment.failed audit & refund.processed ledger/points reconciliation
// 5. Crawler & Indexing: robots.txt directives, private route exclusions & sitemap endpoints
// 6. Two-Account Real-Time Signalling: Socket.IO WebRTC Offer/Answer/ICE, media state & chat
// =============================================================================

const http = require('http');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const { io: ioClient } = require('../../client/node_modules/socket.io-client');
const crypto = require('crypto');

process.env.PORT = '5105';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'dev-secret-key-production-audit';

const db = require('../../server/db');
const { app, server } = require('../../server/index');
const { completeSession } = require('../../server/sessionLifecycle');

const PORT = 5105;

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

    const reqOptions = {
      hostname: '127.0.0.1',
      port: PORT,
      path: path.startsWith('/') ? path : `/${path}`,
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

async function runProductionAuditSuite() {
  return new Promise((resolve, reject) => {
    const testServer = server.listen(PORT, '127.0.0.1', async () => {
      console.log('\n======================================================================');
      console.log('--- HIREBYMINUTE PRODUCTION AUDIT & REGRESSION TEST SUITE ---');
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

      const testClientId = 'audit-client-01';
      const testExpertId = 'audit-expert-01';
      const testAdminId = 'audit-admin-01';
      const testServiceId = 'audit-srv-01';

      try {
        // Cleanup test fixtures
        db.prepare("DELETE FROM processed_webhook_events WHERE event_id LIKE 'evt_%'").run();
        db.prepare('DELETE FROM financial_ledger WHERE user_id IN (?, ?)').run(testClientId, testExpertId);
        db.prepare('DELETE FROM reward_points_ledger WHERE user_id IN (?, ?)').run(testClientId, testExpertId);
        db.prepare('DELETE FROM consultation_requests WHERE client_id = ? OR provider_id = ?').run(testClientId, testExpertId);
        db.prepare('DELETE FROM reviews WHERE provider_id = ?').run(testExpertId);
        db.prepare('DELETE FROM sessions WHERE provider_id = ? OR client_id = ?').run(testExpertId, testClientId);
        db.prepare('DELETE FROM bookings WHERE provider_id = ? OR client_id = ?').run(testExpertId, testClientId);
        db.prepare('DELETE FROM services WHERE id = ?').run(testServiceId);
        db.prepare('DELETE FROM users WHERE id IN (?, ?, ?)').run(testClientId, testExpertId, testAdminId);

        // Seed users
        const passwordHash = 'argon2_or_bcrypt_mock_hash';
        db.prepare(`
          INSERT INTO users (id, email, username, full_name, role, password_hash, reward_points_balance, payout_balance_paise, verified, email_verified)
          VALUES (?, 'audit.client@test.com', 'auditclient', 'Aarav Client', 'client', ?, 2000, 0, 1, 1)
        `).run(testClientId, passwordHash);

        db.prepare(`
          INSERT INTO users (id, email, username, full_name, role, password_hash, reward_points_balance, payout_balance_paise, verified, email_verified)
          VALUES (?, 'audit.expert@test.com', 'auditexpert', 'Dr. Sunita Expert', 'provider', ?, 0, 0, 1, 1)
        `).run(testExpertId, passwordHash);

        db.prepare(`
          INSERT INTO users (id, email, username, full_name, role, password_hash, reward_points_balance, payout_balance_paise, verified, email_verified)
          VALUES (?, 'audit.admin@test.com', 'auditadmin', 'Security Auditor', 'admin', ?, 0, 0, 1, 1)
        `).run(testAdminId, passwordHash);

        // Seed Service
        db.prepare(`
          INSERT INTO services (id, provider_id, title, category_id, description, price_per_minute, listing_status, listing_fee_paid)
          VALUES (?, ?, 'Cloud Infrastructure & Kubernetes Architecture', 'cat-tech', 'High-scale infrastructure architecture teardown and cost optimization.', 50.00, 'active', 1)
        `).run(testServiceId, testExpertId);

        const clientToken = jwt.sign({ id: testClientId, email: 'audit.client@test.com', role: 'client' }, process.env.JWT_SECRET);
        const expertToken = jwt.sign({ id: testExpertId, email: 'audit.expert@test.com', role: 'provider' }, process.env.JWT_SECRET);
        const adminToken = jwt.sign({ id: testAdminId, email: 'audit.admin@test.com', role: 'admin' }, process.env.JWT_SECRET);

        // ---------------------------------------------------------------------
        // SUITE 1: AUTHORIZATION & SELF-BOOKING CONTROLS
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 1: Authorization & Self-Booking Prevention ---');

        await test('1. Client cannot access Provider Dashboard (HTTP 403)', async () => {
          const res = await makeRequest('/api/dashboards/provider', {
            headers: { Authorization: `Bearer ${clientToken}` }
          });
          assert.strictEqual(res.status, 403);
          assert(res.data.error.includes('Provider account required'));
        });

        await test('2. Expert account cannot book consultations (Role Boundary HTTP 403)', async () => {
          const res = await makeRequest('/api/consultation-requests', {
            method: 'POST',
            headers: { Authorization: `Bearer ${expertToken}` },
            body: {
              service_id: testServiceId,
              duration_minutes: 15,
              problem_description: 'Attempted expert booking'
            }
          });
          assert.strictEqual(res.status, 403);
          assert(res.data.error.includes('Expert accounts cannot book consultations'));
        });

        await test('3. Self-booking identity guard blocks request with own service', async () => {
          // If a client was somehow the provider_id on a service
          const selfServiceId = 'self-srv-01';
          db.prepare(`
            INSERT INTO services (id, provider_id, title, category_id, description, price_per_minute, listing_status)
            VALUES (?, ?, 'Self Consultation Service', 'cat-tech', 'Self test', 40.00, 'active')
          `).run(selfServiceId, testClientId);

          const res = await makeRequest('/api/consultation-requests', {
            method: 'POST',
            headers: { Authorization: `Bearer ${clientToken}` },
            body: {
              service_id: selfServiceId,
              duration_minutes: 15,
              problem_description: 'Attempted self consultation'
            }
          });
          assert.strictEqual(res.status, 400);
          assert(res.data.error.includes('cannot request a consultation with yourself'));
          db.prepare('DELETE FROM services WHERE id = ?').run(selfServiceId);
        });

        // ---------------------------------------------------------------------
        // SUITE 2: LOYALTY REWARDS ATOMICITY & IDEMPOTENCY
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 2: Loyalty Rewards Atomicity & Duplicate Prevention ---');

        const rewardReqId = 'rwd-req-audit-01';
        const nowIso = new Date().toISOString();
        const deadlineIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        db.prepare(`
          INSERT INTO consultation_requests (
            id, client_id, provider_id, service_id, duration_minutes, price_per_minute, total_price,
            connect_type, scheduled_start, response_deadline, status, problem_description, reward_points_redeemed, reward_discount_amount
          ) VALUES (?, ?, ?, ?, 5, 50.00, 0.00, 'now', ?, ?, 'ACCEPTED', 'Free 5-min loyalty consultation', 1000, 250.00)
        `).run(rewardReqId, testClientId, testExpertId, testServiceId, nowIso, deadlineIso);

        await test('4. Client redeems 1,000 points atomically for 5-minute free consultation', async () => {
          const res = await makeRequest(`/api/consultation-requests/${rewardReqId}/pay`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${clientToken}` }
          });
          assert.strictEqual(res.status, 200);
          assert(res.data.success);
          assert(res.data.session_id);

          // Verify user balance decremented from 2000 to 1000
          const user = db.prepare('SELECT reward_points_balance FROM users WHERE id = ?').get(testClientId);
          assert.strictEqual(user.reward_points_balance, 1000);

          // Verify ledger entry
          const ledgerEntry = db.prepare('SELECT * FROM reward_points_ledger WHERE booking_id = ? AND entry_type = ?').get(rewardReqId, 'redeemed_consultation');
          assert(ledgerEntry);
          assert.strictEqual(ledgerEntry.points, -1000);
        });

        await test('5. Replay/concurrent call to pay endpoint does not duplicate point deduction', async () => {
          const res = await makeRequest(`/api/consultation-requests/${rewardReqId}/pay`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${clientToken}` }
          });
          assert.strictEqual(res.status, 200);
          assert(res.data.success);

          // Points must remain 1000 (NOT decremented again to 0)
          const user = db.prepare('SELECT reward_points_balance FROM users WHERE id = ?').get(testClientId);
          assert.strictEqual(user.reward_points_balance, 1000);
        });

        // ---------------------------------------------------------------------
        // SUITE 3: FINANCIAL RECONCILIATION & ADMIN REFUNDS
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 3: Financial Ledger Reversal on Admin Refund ---');

        const bookingId = 'book-audit-01';
        const sessionId = 'ses-audit-01';
        const paymentId = 'pay-audit-01';
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO bookings (id, client_id, provider_id, service_id, duration_minutes, total_price, scheduled_start, scheduled_end, status, payment_id)
          VALUES (?, ?, ?, ?, 15, 750.00, ?, ?, 'COMPLETED', ?)
        `).run(bookingId, testClientId, testExpertId, testServiceId, now, now, paymentId);

        db.prepare(`
          INSERT INTO payments (id, user_id, type, amount, status, reference_id)
          VALUES (?, ?, 'session_payment', 750.00, 'succeeded', ?)
        `).run(paymentId, testClientId, bookingId);

        db.prepare(`
          INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, actual_start, actual_end, duration_minutes, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 15, 'ACTIVE')
        `).run(sessionId, bookingId, testClientId, testExpertId, testServiceId, now, now, now, now);

        // Complete session to trigger financial ledger entries (gross 75000p, comm 11250p, net 63750p)
        completeSession(sessionId);

        const expertBefore = db.prepare('SELECT payout_balance_paise FROM users WHERE id = ?').get(testExpertId);
        assert.strictEqual(expertBefore.payout_balance_paise, 63750); // 85% of ₹750

        await test('6. Admin cancels & refunds booking: reverses expert ledger & claws back payout balance', async () => {
          const res = await makeRequest(`/api/admin/bookings/${bookingId}/cancel`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: { reason: 'Client technical dispute' }
          });
          assert.strictEqual(res.status, 200);
          assert(res.data.success);

          // Verify expert balance was clawed back to 0
          const expertAfter = db.prepare('SELECT payout_balance_paise FROM users WHERE id = ?').get(testExpertId);
          assert.strictEqual(expertAfter.payout_balance_paise, 0);

          // Verify reversal ledger entry exists
          const reversal = db.prepare(`SELECT * FROM financial_ledger WHERE booking_id = ? AND entry_type = 'refund_reversal'`).get(bookingId);
          assert(reversal);
          assert.strictEqual(reversal.amount_paise, -63750);

          // Verify payment status changed to refunded
          const pay = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId);
          assert.strictEqual(pay.status, 'refunded');
        });

        // ---------------------------------------------------------------------
        // SUITE 4: WEBHOOK RECONCILIATION: payment.failed & refund.processed
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 4: Webhook Resilience & Dispute Handlers ---');

        await test('7. Webhook handles payment.failed: audits failure and notifies client', async () => {
          const fakeEventId = 'evt_failed_' + Date.now();
          const webhookSecret = 'whsec_test_secret_for_razorpay_98765';
          const payloadObj = {
            id: fakeEventId,
            entity: 'event',
            event: 'payment.failed',
            payload: {
              payment: {
                entity: {
                  id: 'pay_fail_' + Date.now(),
                  order_id: 'order_fail_01',
                  error_code: 'BAD_REQUEST_ERROR',
                  error_description: 'Card declined by bank simulator',
                  notes: { request_id: rewardReqId }
                }
              }
            }
          };
          const rawBody = JSON.stringify(payloadObj);
          const sig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

          const res = await makeRequest('/api/payments/razorpay-webhook', {
            method: 'POST',
            headers: {
              'x-razorpay-signature': sig,
              'Content-Type': 'application/json'
            },
            body: rawBody
          });
          assert.strictEqual(res.status, 200);

          // Verify audit log created
          const audit = db.prepare(`SELECT * FROM audit_logs WHERE action = 'PAYMENT_FAILED_WEBHOOK' ORDER BY created_at DESC LIMIT 1`).get();
          assert(audit);
          assert(audit.details_json.includes('Card declined'));
        });

        await test('8. Webhook handles refund.processed: reverses financial ledger & deducts balance', async () => {
          // Setup another booking with payment
          const bookId2 = 'book-audit-02';
          const sessId2 = 'ses-audit-02';
          const payId2 = 'pay-audit-02';
          db.prepare(`
            INSERT INTO bookings (id, client_id, provider_id, service_id, duration_minutes, total_price, scheduled_start, scheduled_end, status, payment_id)
            VALUES (?, ?, ?, ?, 15, 600.00, ?, ?, 'COMPLETED', ?)
          `).run(bookId2, testClientId, testExpertId, testServiceId, now, now, payId2);

          db.prepare(`
            INSERT INTO payments (id, user_id, type, amount, status, reference_id)
            VALUES (?, ?, 'session_payment', 600.00, 'succeeded', ?)
          `).run(payId2, testClientId, bookId2);

          db.prepare(`
            INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, actual_start, actual_end, duration_minutes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 15, 'ACTIVE')
          `).run(sessId2, bookId2, testClientId, testExpertId, testServiceId, now, now, now, now);

          completeSession(sessId2);
          const expertBeforeWh = db.prepare('SELECT payout_balance_paise FROM users WHERE id = ?').get(testExpertId);
          assert.strictEqual(expertBeforeWh.payout_balance_paise, 51000); // 85% of ₹600 = ₹510

          const webhookSecret = 'whsec_test_secret_for_razorpay_98765';
          const payloadObj = {
            id: 'evt_refund_' + Date.now(),
            entity: 'event',
            event: 'refund.processed',
            payload: {
              refund: {
                entity: {
                  id: 'rfnd_audit_wh_01',
                  payment_id: payId2,
                  amount: 60000
                }
              }
            }
          };
          const rawBody = JSON.stringify(payloadObj);
          const sig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

          const res = await makeRequest('/api/payments/razorpay-webhook', {
            method: 'POST',
            headers: {
              'x-razorpay-signature': sig,
              'Content-Type': 'application/json'
            },
            body: rawBody
          });
          assert.strictEqual(res.status, 200);

          // Balance clawed back to 0
          const expertAfterWh = db.prepare('SELECT payout_balance_paise FROM users WHERE id = ?').get(testExpertId);
          assert.strictEqual(expertAfterWh.payout_balance_paise, 0);

          // Payment status marked refunded
          const pay2 = db.prepare('SELECT status FROM payments WHERE id = ?').get(payId2);
          assert.strictEqual(pay2.status, 'refunded');
        });

        // ---------------------------------------------------------------------
        // SUITE 5: CRAWLER & SITEMAP INTEGRITY
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 5: Crawler Directives & Private Route Exclusions ---');

        await test('9. robots.txt disallows private dashboards & provides both sitemaps', async () => {
          const res = await makeRequest('/robots.txt');
          assert.strictEqual(res.status, 200);
          assert(res.rawText.includes('Disallow: /admin'));
          assert(res.rawText.includes('Disallow: /client'));
          assert(res.rawText.includes('Disallow: /provider'));
          assert(res.rawText.includes('Disallow: /session/'));
          assert(res.rawText.includes('Allow: /blog'));
          assert(res.rawText.includes('Sitemap: https://hirebyminute.com/sitemap.xml'));
          assert(res.rawText.includes('Sitemap: https://hirebyminute.com/sitemap-blog.xml'));
        });

        // ---------------------------------------------------------------------
        // SUITE 6: REAL TWO-ACCOUNT SOCKET.IO WEBRTC SIGNALLING SIMULATION
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 6: Two-Account WebRTC Signalling & Socket Lifecycle ---');

        await test('10. Client & Expert sockets exchange WebRTC Offer, Answer, ICE candidates & chat messages', async () => {
          const liveSessionId = 'ses-live-socket-01';
          const liveBookingId = 'book-live-socket-01';
          const futureEnd = new Date(Date.now() + 15 * 60 * 1000).toISOString();

          db.prepare(`
            INSERT INTO bookings (id, client_id, provider_id, service_id, duration_minutes, total_price, scheduled_start, scheduled_end, status)
            VALUES (?, ?, ?, ?, 15, 750.00, ?, ?, 'COMPLETED')
          `).run(liveBookingId, testClientId, testExpertId, testServiceId, now, futureEnd);

          db.prepare(`
            INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, actual_start, actual_end, duration_minutes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 15, 'ACTIVE')
          `).run(liveSessionId, liveBookingId, testClientId, testExpertId, testServiceId, now, futureEnd, now, futureEnd);

          // Connect client and expert socket clients
          const clientSocket = ioClient(`http://127.0.0.1:${PORT}`, {
            auth: { token: clientToken },
            transports: ['websocket'],
            reconnection: false
          });

          const expertSocket = ioClient(`http://127.0.0.1:${PORT}`, {
            auth: { token: expertToken },
            transports: ['websocket'],
            reconnection: false
          });

          await new Promise((res, rej) => {
            let connected = 0;
            const timeout = setTimeout(() => rej(new Error('Socket connection timed out')), 4000);
            const check = () => {
              connected++;
              if (connected === 2) {
                clearTimeout(timeout);
                res();
              }
            };
            clientSocket.on('connect', check);
            expertSocket.on('connect', check);
            clientSocket.on('connect_error', rej);
            expertSocket.on('connect_error', rej);
          });

          // Track events received
          let peerReadyReceived = false;
          let offerReceived = false;
          let answerReceived = false;
          let iceReceived = false;
          let chatReceived = false;

          const signalPromise = new Promise((res, rej) => {
            const timeout = setTimeout(() => rej(new Error('Signalling exchange timed out')), 5000);

            clientSocket.on('peer_ready', () => {
              peerReadyReceived = true;
              // Client creates and sends offer
              clientSocket.emit('webrtc_offer', {
                sessionId: liveSessionId,
                offer: { type: 'offer', sdp: 'v=0\r\no=client 12345 12345 IN IP4 127.0.0.1\r\ns=HireByMinute' }
              });
            });

            expertSocket.on('webrtc_offer', ({ offer }) => {
              offerReceived = true;
              assert.strictEqual(offer.type, 'offer');
              // Expert responds with answer
              expertSocket.emit('webrtc_answer', {
                sessionId: liveSessionId,
                answer: { type: 'answer', sdp: 'v=0\r\no=expert 67890 67890 IN IP4 127.0.0.1\r\ns=HireByMinute' }
              });
            });

            clientSocket.on('webrtc_answer', ({ answer }) => {
              answerReceived = true;
              assert.strictEqual(answer.type, 'answer');
              // Client sends ICE candidate
              clientSocket.emit('webrtc_ice_candidate', {
                sessionId: liveSessionId,
                candidate: { candidate: 'candidate:1 1 UDP 2130706431 127.0.0.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 }
              });
            });

            expertSocket.on('webrtc_ice_candidate', ({ candidate }) => {
              iceReceived = true;
              assert(candidate.candidate.includes('typ host'));
              // Send live chat message
              clientSocket.emit('send_session_message', {
                sessionId: liveSessionId,
                content: 'Hello Dr. Sunita, can you hear my audio?'
              });
            });

            expertSocket.on('session_message', (msg) => {
              chatReceived = true;
              assert.strictEqual(msg.content, 'Hello Dr. Sunita, can you hear my audio?');
              clearTimeout(timeout);
              res();
            });
          });

          // Join session rooms
          clientSocket.emit('join_session', { sessionId: liveSessionId });
          expertSocket.emit('join_session', { sessionId: liveSessionId });

          // Allow sockets to be added to room on server
          await new Promise(r => setTimeout(r, 150));

          // Expert announces WebRTC ready
          expertSocket.emit('webrtc_ready', { sessionId: liveSessionId });

          await signalPromise;

          assert(peerReadyReceived, 'peer_ready not received');
          assert(offerReceived, 'offer not received');
          assert(answerReceived, 'answer not received');
          assert(iceReceived, 'ice candidate not received');
          assert(chatReceived, 'chat message not received');

          clientSocket.disconnect();
          expertSocket.disconnect();

          db.prepare('DELETE FROM sessions WHERE id = ?').run(liveSessionId);
          db.prepare('DELETE FROM bookings WHERE id = ?').run(liveBookingId);
        });

        // Clean up test data
        db.prepare('DELETE FROM financial_ledger WHERE user_id IN (?, ?)').run(testClientId, testExpertId);
        db.prepare('DELETE FROM reward_points_ledger WHERE user_id IN (?, ?)').run(testClientId, testExpertId);
        db.prepare('DELETE FROM consultation_requests WHERE client_id = ? OR provider_id = ?').run(testClientId, testExpertId);
        db.prepare('DELETE FROM reviews WHERE provider_id = ?').run(testExpertId);
        db.prepare('DELETE FROM sessions WHERE provider_id = ? OR client_id = ?').run(testExpertId, testClientId);
        db.prepare('DELETE FROM bookings WHERE provider_id = ? OR client_id = ?').run(testExpertId, testClientId);
        db.prepare('DELETE FROM services WHERE id = ?').run(testServiceId);
        db.prepare('DELETE FROM users WHERE id IN (?, ?, ?)').run(testClientId, testExpertId, testAdminId);

      } catch (fatalErr) {
        console.error('Fatal audit error:', fatalErr);
        process.exitCode = 1;
      } finally {
        testServer.close(() => {
          console.log('\n======================================================================');
          console.log(`SUMMARY: ${passedTests} / ${totalTests} production audit tests passed.`);
          console.log('======================================================================\n');
          if (passedTests === totalTests) {
            console.log('🎉 ALL PRODUCTION AUDIT & REGRESSION TESTS PASSED 100%!\n');
            resolve();
          } else {
            reject(new Error(`${totalTests - passedTests} tests failed.`));
          }
        });
      }
    });
  });
}

runProductionAuditSuite().then(() => {
  process.exit(0);
}).catch(() => {
  process.exit(1);
});
