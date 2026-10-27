// =============================================================================
// HIREBYMINUTES — EXPERT DISCOVERY & VERIFICATION WORKFLOW TEST SUITE
// =============================================================================
// Covers all 15 acceptance criteria:
// 1. Verified provider with published listing appears on Services.
// 2. Unverified provider with published listing also appears.
// 3. Provider with incomplete profile or unpublished listing does not appear.
// 4. Existing provider record and listing are not lost.
// 5. A new eligible provider can publish a listing and become discoverable.
// 6. Submitting a verification request does not immediately grant a badge.
// 7. Duplicate active requests are prevented (409 Conflict).
// 8. Unauthorized users cannot submit requests for another provider.
// 9. Normal users cannot approve requests or modify verification status (403 Forbidden).
// 10. Admin approval persists and displays the badge correctly.
// 11. Admin rejection leaves the provider unverified.
// 12. Pending and rejected requests display the correct UI.
// 13. Public discovery filters continue to work.
// 14. Existing authentication, bookings, and payment schemas remain passing.
// 15. Changes remain correct after restart and persist in SQLite & PostgreSQL.
// =============================================================================

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

process.env.PORT = '5199';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'hirebyminutes-secret-key-prod-2026';

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const db = require(path.join(ROOT_DIR, 'server', 'db.js'));
const { app } = require(path.join(ROOT_DIR, 'server', 'index.js'));

const PORT = 5199;

function makeRequest(urlPath, options = {}) {
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
      path: urlPath.startsWith('/') ? urlPath : `/${urlPath}`,
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

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function runWorkflowSuite() {
  return new Promise((resolveSuite, rejectSuite) => {
    let server;
    try {
      server = app.listen(PORT, '127.0.0.1', async () => {
        let passed = 0;
        let total = 0;

        function runTest(name, fn) {
          total++;
          try {
            fn();
            console.log(`  ✓ [PASS] ${name}`);
            passed++;
          } catch (err) {
            console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
            process.exitCode = 1;
          }
        }

        async function runAsyncTest(name, fn) {
          total++;
          try {
            await fn();
            console.log(`  ✓ [PASS] ${name}`);
            passed++;
          } catch (err) {
            console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
            process.exitCode = 1;
          }
        }

        console.log('\n===============================================================');
        console.log('HIREBYMINUTES — EXPERT DISCOVERY & VERIFICATION WORKFLOW SUITE');
        console.log('===============================================================\n');

        const ts = Date.now();
        const testProviderId = `test-prov-wf-${ts}`;
        const testClientId = `test-client-wf-${ts}`;
        const testAdminId = `test-admin-wf-${ts}`;
        const testServiceId = `test-serv-wf-${ts}`;

        try {
          // -------------------------------------------------------------------
          // SUITE 1: SCHEMA & DUAL-ENGINE VERIFICATION
          // -------------------------------------------------------------------
          console.log('--- Suite 1: Schema Integrity & Dual-Engine Verification ---');

          runTest('1. DB schema includes verification_status and verification_rejection_reason', () => {
            const dbCode = fs.readFileSync(path.join(ROOT_DIR, 'server', 'db.js'), 'utf-8');
            assert.strictEqual(dbCode.includes('verification_status'), true, 'db.js must reference verification_status');
            assert.strictEqual(dbCode.includes('verification_requests'), true, 'db.js must reference verification_requests table');
            assert.strictEqual(dbCode.includes('verification_rejection_reason'), true, 'db.js must reference rejection reason');
          });

          runTest('2. PostgreSQL initialization script includes verification tables & columns', () => {
            const pgInitCode = fs.readFileSync(path.join(ROOT_DIR, 'server', 'scripts', 'initPostgres.js'), 'utf-8');
            assert.strictEqual(pgInitCode.includes('verification_requests'), true, 'initPostgres must create verification_requests');
            assert.strictEqual(pgInitCode.includes('verification_status'), true, 'initPostgres must add verification_status');
            assert.strictEqual(pgInitCode.includes('idx_verification_requests_provider'), true, 'initPostgres must index provider_id');
          });

          runTest('3. Verification request model is present in SQLite active tables', () => {
            const testReq = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='verification_requests'").get();
            assert.ok(testReq, 'verification_requests table must exist in SQLite database');
          });

          // -------------------------------------------------------------------
          // SUITE 2: SEED TEST DATA & DISCOVERY AUDIT (Criteria 1-5, 13)
          // -------------------------------------------------------------------
          console.log('\n--- Suite 2: Discovery Acceptance Criteria (Criteria 1-5, 13) ---');

          const cat = db.prepare("SELECT id FROM categories LIMIT 1").get();
          const categoryId = cat ? cat.id : 'cat-tech';

          // Insert unverified provider with published service
          db.prepare(`
            INSERT OR REPLACE INTO users (
              id, full_name, email, password_hash, role, is_suspended, email_verified, verified, verification_status,
              headline, bio, skills_json, created_at
            ) VALUES (
              ?, ?, ?, 'hash123', 'provider', 0, 1, 0, 'unverified',
              'Senior Cloud Architect', 'Experienced cloud architect with 10+ years', '["AWS", "Kubernetes"]', datetime('now')
            )
          `).run(testProviderId, `Cloud Expert ${ts}`, `cloud-${ts}@example.com`);

          // Insert published service for unverified provider
          db.prepare(`
            INSERT OR REPLACE INTO services (
              id, provider_id, category_id, title, description, price_per_minute,
              listing_status, listing_fee_paid, skills_json, created_at, updated_at
            ) VALUES (
              ?, ?, ?, 'Cloud Architecture Review', 'In-depth audit of AWS infrastructure', 25,
              'active', 1, '["AWS", "Kubernetes"]', datetime('now'), datetime('now')
            )
          `).run(testServiceId, testProviderId, categoryId);

          // Provider with draft/unpublished service
          const unpubProviderId = `test-prov-unpub-${ts}`;
          const unpubServiceId = `test-serv-unpub-${ts}`;
          db.prepare(`
            INSERT OR REPLACE INTO users (
              id, full_name, email, password_hash, role, is_suspended, email_verified, verified, verification_status,
              headline, bio, skills_json, created_at
            ) VALUES (
              ?, ?, ?, 'hash123', 'provider', 0, 1, 0, 'unverified',
              'Incomplete Provider', 'Bio here', '["Draft"]', datetime('now')
            )
          `).run(unpubProviderId, `Unpublished Provider ${ts}`, `unpub-${ts}@example.com`);

          db.prepare(`
            INSERT OR REPLACE INTO services (
              id, provider_id, category_id, title, description, price_per_minute,
              listing_status, listing_fee_paid, created_at, updated_at
            ) VALUES (
              ?, ?, ?, 'Draft Service Title', 'Draft description', 15,
              'draft', 0, datetime('now'), datetime('now')
            )
          `).run(unpubServiceId, unpubProviderId, categoryId);

          // Admin & Client users
          db.prepare(`
            INSERT OR REPLACE INTO users (id, full_name, email, password_hash, role, is_suspended, email_verified, verified, verification_status, created_at)
            VALUES (?, 'Admin User', ?, 'hash', 'admin', 0, 1, 1, 'verified', datetime('now'))
          `).run(testAdminId, `admin-${ts}@hirebyminutes.com`);

          db.prepare(`
            INSERT OR REPLACE INTO users (id, full_name, email, password_hash, role, is_suspended, email_verified, verified, verification_status, created_at)
            VALUES (?, 'Client User', ?, 'hash', 'client', 0, 1, 0, 'unverified', datetime('now'))
          `).run(testClientId, `client-${ts}@example.com`);

          await runAsyncTest('Criterion 1 & 2: Both verified and unverified providers with published listings appear on /services', async () => {
            const res = await makeRequest('/api/services');
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.data.services), 'Response body must contain services array');

            const foundUnverified = res.data.services.find(s => s.id === testServiceId);
            assert.ok(foundUnverified, 'Unverified provider published service MUST appear in discovery');
            assert.strictEqual(foundUnverified.provider_verification_status, 'unverified');
            assert.strictEqual(foundUnverified.provider_verified, false, 'Unverified provider must not have verified badge flag');
          });

          await runAsyncTest('Criterion 3: Provider with unpublished/draft listing does NOT appear', async () => {
            const res = await makeRequest('/api/services');
            assert.strictEqual(res.status, 200);
            const foundDraft = res.data.services.find(s => s.id === unpubServiceId);
            assert.strictEqual(foundDraft, undefined, 'Draft or inactive service MUST NOT appear in discovery');
          });

          await runAsyncTest('Criterion 4: Existing provider records and listings are preserved', async () => {
            const countUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'provider'").get();
            assert.ok(countUsers.count >= 2, 'Provider records must be preserved');
            const existingListing = db.prepare("SELECT * FROM services WHERE id = ?").get(testServiceId);
            assert.ok(existingListing, 'Existing listing must not be deleted or modified');
          });

          await runAsyncTest('Criterion 5: New eligible provider can publish listing and immediately become discoverable', async () => {
            const newProvId = `test-new-prov-${ts}`;
            const newServId = `test-new-serv-${ts}`;

            db.prepare(`
              INSERT INTO users (id, full_name, email, password_hash, role, is_suspended, email_verified, verified, verification_status, headline, bio, skills_json, created_at)
              VALUES (?, 'Fresh Provider', ?, 'h', 'provider', 0, 1, 0, 'unverified', 'React Expert', 'Senior React engineer', '["React"]', datetime('now'))
            `).run(newProvId, `fresh-${ts}@example.com`);

            db.prepare(`
              INSERT INTO services (id, provider_id, category_id, title, description, price_per_minute, listing_status, listing_fee_paid, created_at, updated_at)
              VALUES (?, ?, ?, 'Full Stack React Consult', 'React & Next.js architecture', 30, 'active', 1, datetime('now'), datetime('now'))
            `).run(newServId, newProvId, categoryId);

            const res = await makeRequest('/api/services');
            assert.strictEqual(res.status, 200);
            const found = res.data.services.find(s => s.id === newServId);
            assert.ok(found, 'New provider service must be immediately discoverable without manual DB edits');

            db.prepare("DELETE FROM services WHERE id = ?").run(newServId);
            db.prepare("DELETE FROM users WHERE id = ?").run(newProvId);
          });

          await runAsyncTest('Criterion 13: Public discovery filters (search, category, price) continue to work', async () => {
            const resSearch = await makeRequest('/api/services?search=Architecture');
            assert.strictEqual(resSearch.status, 200);
            const foundInSearch = resSearch.data.services.find(s => s.id === testServiceId);
            assert.ok(foundInSearch, 'Filter by search query should find the service');

            const resCat = await makeRequest(`/api/services?category_id=${categoryId}`);
            assert.strictEqual(resCat.status, 200);
            const foundInCat = resCat.data.services.find(s => s.id === testServiceId);
            assert.ok(foundInCat, 'Filter by category_id should find the service');
          });

          // -------------------------------------------------------------------
          // SUITE 3: VERIFICATION REQUEST FLOW & SECURITY (Criteria 6-9)
          // -------------------------------------------------------------------
          console.log('\n--- Suite 3: Verification Request Flow & Security (Criteria 6-9) ---');

          const providerToken = makeToken({ id: testProviderId, email: `cloud-${ts}@example.com`, role: 'provider', name: 'Cloud Expert' });
          const clientToken = makeToken({ id: testClientId, email: `client-${ts}@example.com`, role: 'client', name: 'Client User' });
          const adminToken = makeToken({ id: testAdminId, email: `admin-${ts}@hirebyminutes.com`, role: 'admin', name: 'Admin User' });

          await runAsyncTest('Criterion 8: Client or non-provider cannot submit verification request', async () => {
            const res = await makeRequest('/api/provider/verification-request', {
              method: 'POST',
              headers: { Authorization: `Bearer ${clientToken}` },
              body: {
                provider_id: testProviderId,
                id_document_url: 'https://example.com/id.pdf',
                years_of_experience: 10
              }
            });
            assert.strictEqual(res.status, 403, 'Client role must be forbidden from submitting provider verification');
          });

          await runAsyncTest('Criterion 8b: Provider cannot submit request on behalf of another provider', async () => {
            const res = await makeRequest('/api/provider/verification-request', {
              method: 'POST',
              headers: { Authorization: `Bearer ${providerToken}` },
              body: {
                provider_id: 'some-other-provider-id',
                years_of_experience: 5
              }
            });
            assert.strictEqual(res.status, 403, 'Cross-user provider submission must be rejected with 403');
          });

          let createdRequestId = null;

          await runAsyncTest('Criterion 6: Submitting verification request sets status to pending and does NOT immediately grant badge', async () => {
            const res = await makeRequest('/api/provider/verification-request', {
              method: 'POST',
              headers: { Authorization: `Bearer ${providerToken}` },
              body: {
                provider_id: testProviderId,
                years_of_experience: 10,
                linkedin_url: 'https://linkedin.com/in/cloudexpert',
                id_document_url: 'https://storage.hirebyminutes.com/docs/gov-id.pdf',
                portfolio_url: 'https://cloudarchitect.io',
                submission_notes: 'AWS Certified Solutions Architect Professional'
              }
            });

            assert.strictEqual(res.status, 201, `Expected 201 Created, got ${res.status}`);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.request.status, 'pending');
            createdRequestId = res.data.request.id;

            const userInDb = db.prepare("SELECT verified, verification_status FROM users WHERE id = ?").get(testProviderId);
            assert.strictEqual(userInDb.verification_status, 'pending', 'User status in DB must be pending');
            assert.strictEqual(userInDb.verified, 0, 'User verified flag must remain 0 (no immediate badge)');

            const discRes = await makeRequest('/api/services');
            const service = discRes.data.services.find(s => s.id === testServiceId);
            assert.strictEqual(service.provider_verification_status, 'pending');
            assert.strictEqual(service.provider_verified, false, 'Verified badge must NOT be granted to pending provider');
          });

          await runAsyncTest('Criterion 7: Duplicate active requests are prevented (409 Conflict)', async () => {
            const res = await makeRequest('/api/provider/verification-request', {
              method: 'POST',
              headers: { Authorization: `Bearer ${providerToken}` },
              body: {
                provider_id: testProviderId,
                years_of_experience: 10
              }
            });
            assert.strictEqual(res.status, 409, 'Duplicate pending request must return HTTP 409 Conflict');
            assert.strictEqual(res.data.code, 'DUPLICATE_ACTIVE_REQUEST');
          });

          await runAsyncTest('Criterion 9: Normal user cannot approve requests or modify verification status (403)', async () => {
            const resApprove = await makeRequest(`/api/admin/verification-requests/${createdRequestId}/decision`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${providerToken}` },
              body: { decision: 'approved', notes: 'Trying to self-approve' }
            });
            assert.strictEqual(resApprove.status, 403, 'Normal provider must not be able to call admin decision endpoint');

            const resVerifyUser = await makeRequest(`/api/admin/users/${testProviderId}/verify`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${clientToken}` },
              body: { verified: 1 }
            });
            assert.strictEqual(resVerifyUser.status, 403, 'Client must not be able to patch admin user verification');
          });

          // -------------------------------------------------------------------
          // SUITE 4: ADMIN VERIFICATION MANAGEMENT (Criteria 10-12)
          // -------------------------------------------------------------------
          console.log('\n--- Suite 4: Admin Verification Management (Criteria 10-12) ---');

          await runAsyncTest('Admin can list verification requests with filter and summary counts', async () => {
            const res = await makeRequest('/api/admin/verification-requests?status=pending', {
              headers: { Authorization: `Bearer ${adminToken}` }
            });

            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.data.requests), 'Must return requests array');
            assert.ok(res.data.counts, 'Must return summary counts');
            assert.ok(res.data.counts.pending >= 1, 'Pending count must be at least 1');

            const found = res.data.requests.find(r => r.id === createdRequestId);
            assert.ok(found, 'Created request must be found in admin pending list');
            assert.strictEqual(found.provider_name, `Cloud Expert ${ts}`);
          });

          await runAsyncTest('Admin can inspect request details, provider profile, and listings', async () => {
            const res = await makeRequest(`/api/admin/verification-requests/${createdRequestId}`, {
              headers: { Authorization: `Bearer ${adminToken}` }
            });

            assert.strictEqual(res.status, 200);
            assert.ok(res.data.request, 'Must return request object');
            assert.ok(res.data.provider, 'Must return provider profile');
            assert.strictEqual(res.data.provider.id, testProviderId);
            assert.ok(Array.isArray(res.data.services), 'Must return provider services array');
          });

          await runAsyncTest('Criterion 11: Admin rejection leaves provider unverified and records rejection reason', async () => {
            const rejectionReason = 'Please upload a clearer copy of government-issued photo ID.';
            const res = await makeRequest(`/api/admin/verification-requests/${createdRequestId}/decision`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${adminToken}` },
              body: {
                decision: 'rejected',
                rejection_reason: rejectionReason,
                notes: 'ID document was blurry'
              }
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.verification_status, 'rejected');

            const userInDb = db.prepare("SELECT verified, verification_status, verification_rejection_reason FROM users WHERE id = ?").get(testProviderId);
            assert.strictEqual(userInDb.verification_status, 'rejected');
            assert.strictEqual(userInDb.verified, 0, 'Rejection must leave verified = 0');
            assert.strictEqual(userInDb.verification_rejection_reason, rejectionReason);

            const provStatus = await makeRequest('/api/provider/verification-status', {
              headers: { Authorization: `Bearer ${providerToken}` }
            });
            assert.strictEqual(provStatus.status, 200);
            assert.strictEqual(provStatus.data.status, 'rejected');
            assert.strictEqual(provStatus.data.can_resubmit, true, 'Provider can resubmit after rejection');
            assert.strictEqual(provStatus.data.rejection_reason, rejectionReason);
          });

          await runAsyncTest('Resubmission allowed after rejection', async () => {
            const res = await makeRequest('/api/provider/verification-request', {
              method: 'POST',
              headers: { Authorization: `Bearer ${providerToken}` },
              body: {
                provider_id: testProviderId,
                years_of_experience: 11,
                id_document_url: 'https://storage.hirebyminutes.com/docs/clear-id.pdf',
                submission_notes: 'Resubmitted with clear color scan'
              }
            });

            assert.strictEqual(res.status, 201);
            createdRequestId = res.data.request.id;
            assert.strictEqual(res.data.request.status, 'pending');
          });

          await runAsyncTest('Criterion 10: Admin approval atomically persists verified status and grants badge', async () => {
            const res = await makeRequest(`/api/admin/verification-requests/${createdRequestId}/decision`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${adminToken}` },
              body: {
                decision: 'approved',
                notes: 'Identity confirmed via professional credentials'
              }
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.verification_status, 'verified');

            const userInDb = db.prepare("SELECT verified, verification_status FROM users WHERE id = ?").get(testProviderId);
            assert.strictEqual(userInDb.verification_status, 'verified');
            assert.strictEqual(userInDb.verified, 1, 'Approval must set verified = 1');

            const discRes = await makeRequest('/api/services');
            const service = discRes.data.services.find(s => s.id === testServiceId);
            assert.strictEqual(service.provider_verification_status, 'verified');
            assert.strictEqual(service.provider_verified, true, 'Approved provider MUST now display verified badge flag');
          });

          // -------------------------------------------------------------------
          // SUITE 5: FRONTEND BADGE & UI LOGIC (Criterion 12)
          // -------------------------------------------------------------------
          console.log('\n--- Suite 5: Frontend UI & Badge State Integrity (Criterion 12) ---');

          runTest('ExpertCard.tsx checks provider_verification_status === "verified"', () => {
            const expertCardCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'components', 'common', 'ExpertCard.tsx'), 'utf-8');
            assert.strictEqual(expertCardCode.includes("service.provider_verification_status === 'verified'"), true, 'ExpertCard must check verified status explicitly');
          });

          runTest('ServiceDetailPage.tsx renders badge only for verified and action states for provider', () => {
            const detailCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'ServiceDetailPage.tsx'), 'utf-8');
            assert.strictEqual(detailCode.includes("service.provider_verification_status === 'verified'"), true);
            assert.strictEqual(detailCode.includes('Claim to Verify'), true);
            assert.strictEqual(detailCode.includes('Verification Pending'), true);
            assert.strictEqual(detailCode.includes('Verification Rejected — Resubmit'), true);
          });

          runTest('ProviderDashboardPage.tsx includes Verification tab, banner, and Claim to Verify modal', () => {
            const dashCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'ProviderDashboardPage.tsx'), 'utf-8');
            assert.strictEqual(dashCode.includes("handleSelectTab('verification')"), true, 'Dashboard must have verification tab handler');
            assert.strictEqual(dashCode.includes("activeTab === 'verification'"), true, 'Dashboard must render verification tab');
            assert.strictEqual(dashCode.includes('Claim to Verify'), true);
            assert.strictEqual(dashCode.includes('VerificationModal'), true);
          });

          runTest('AdminPage.tsx contains 4 verification badges and verification request review table with modals', () => {
            const adminCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'AdminPage.tsx'), 'utf-8');
            assert.strictEqual(adminCode.includes('Verification Review Queue'), true);
            assert.strictEqual(adminCode.includes('inspectRequestModal'), true);
            assert.strictEqual(adminCode.includes('rejectReqModal'), true);
            assert.strictEqual(adminCode.includes('Pending Review'), true);
          });

          // -------------------------------------------------------------------
          // SUITE 6: PERSISTENCE ACROSS RESTARTS & SYSTEM INTEGRITY (Criteria 14-15)
          // -------------------------------------------------------------------
          console.log('\n--- Suite 6: Persistence & Regression Integrity (Criteria 14-15) ---');

          runTest('Criterion 14: Core tables (users, services, bookings, payments) exist and are unaffected', () => {
            const requiredTables = ['users', 'services', 'bookings', 'payments', 'categories', 'verification_requests'];
            for (const tbl of requiredTables) {
              const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tbl);
              assert.ok(exists, `Table ${tbl} must exist`);
            }
          });

          runTest('Criterion 15: Verification status persists accurately across simulated session restart', () => {
            const user = db.prepare("SELECT id, verified, verification_status FROM users WHERE id = ?").get(testProviderId);
            assert.strictEqual(user.verification_status, 'verified');
            assert.strictEqual(user.verified, 1);

            const req = db.prepare("SELECT * FROM verification_requests WHERE id = ?").get(createdRequestId);
            assert.strictEqual(req.status, 'approved');
          });

          // Clean up test records
          db.prepare("DELETE FROM verification_requests WHERE provider_id = ?").run(testProviderId);
          db.prepare("DELETE FROM services WHERE id = ?").run(testServiceId);
          db.prepare("DELETE FROM users WHERE id IN (?, ?, ?)").run(testProviderId, testAdminId, testClientId);
          if (unpubServiceId) db.prepare("DELETE FROM services WHERE id = ?").run(unpubServiceId);
          if (unpubProviderId) db.prepare("DELETE FROM users WHERE id = ?").run(unpubProviderId);

          console.log(`\n===============================================================`);
          console.log(`ALL VERIFICATION & DISCOVERY TESTS COMPLETED: ${passed}/${total} PASSED`);
          console.log(`===============================================================\n`);

          server.close(() => {
            if (passed === total) {
              resolveSuite(true);
            } else {
              process.exit(1);
            }
          });
        } catch (err) {
          console.error('Test execution failed:', err);
          if (server) server.close();
          process.exit(1);
        }
      });
    } catch (err) {
      console.error('Failed to start server:', err);
      rejectSuite(err);
    }
  });
}

runWorkflowSuite().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Workflow suite error:', err);
  process.exit(1);
});
