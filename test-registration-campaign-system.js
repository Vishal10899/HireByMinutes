const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('./server/db');

// Setup express app with real routes and middleware
const app = express();
app.use(express.json());

// Load routes
const routes = require('./server/routes')(null, null);
app.use('/api', routes);

// Add health routes as in server/index.js
app.get(['/api/health', '/health'], (req, res) => {
  try {
    const result = db.prepare('SELECT 1 as alive').get();
    if (result && result.alive === 1) {
      return res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
        platform: 'HireByMinutes'
      });
    }
    return res.status(503).json({ status: 'unhealthy', error: 'Database query failed' });
  } catch (err) {
    return res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

const server = http.createServer(app);
const PORT = 54321;
const BASE_URL = `http://localhost:${PORT}/api`;

let adminToken = '';
let clientToken = '';
let providerToken = '';

async function request(method, path, body = null, token = null) {
  const url = path.startsWith('http') 
    ? path 
    : path.startsWith('/api')
    ? `http://localhost:${PORT}${path}`
    : `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  };

  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('===============================================================');
  console.log('HIREBYMINUTES — REGISTRATION CAMPAIGN & DATA INTEGRITY TESTS');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, name, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name} ${details ? `— ${details}` : ''}`);
      failed++;
    }
  }

  await new Promise((resolve) => server.listen(PORT, resolve));

  try {
    // 1. Health Endpoints
    console.log('\n--- 1. Health Endpoints ---');
    const health1 = await request('GET', '/health');
    assert(health1.status === 200 && health1.data.status === 'healthy' && health1.data.database === 'connected', 'GET /health returns 200 and healthy DB status');
    assert(!health1.data.secret && !health1.data.password && !health1.data.jwt, 'GET /health leaks zero secret variables');

    const health2 = await request('GET', '/api/health');
    assert(health2.status === 200 && health2.data.status === 'healthy', 'GET /api/health returns 200 OK');

    // 2. Authentication Setup for Tests
    console.log('\n--- 2. Auth & RBAC Setup ---');
    // Admin login
    const adminEmail = (process.env.ADMIN_EMAIL || 'vishalkumar75912@gmail.com').trim().toLowerCase();
    const adminPass = process.env.ADMIN_PASSWORD || 'HBM-Adm!n#2026$Secur3';
    const adminLogin = await request('POST', '/auth/login', { email: adminEmail, password: adminPass });
    assert(adminLogin.status === 200 && adminLogin.data.user.role === 'admin', 'Admin login succeeded with role admin');
    adminToken = adminLogin.data.token || adminLogin.data.user.id;

    // Register a test expert provider
    const testExpertEmail = `expert.test.${Date.now()}@testcampaign.local`;
    const regProvider = await request('POST', '/auth/register', {
      email: testExpertEmail,
      password: 'Password123!',
      full_name: 'Dr. Test Expert',
      role: 'provider',
      headline: 'Senior Distributed Systems Architect'
    });
    assert(regProvider.status === 201, 'Test expert registered successfully');
    providerToken = regProvider.data.token || regProvider.data.user.id;

    // Register a test client
    const testClientEmail = `client.test.${Date.now()}@testcampaign.local`;
    const regClient = await request('POST', '/auth/register', {
      email: testClientEmail,
      password: 'Password123!',
      full_name: 'Test Client',
      role: 'client'
    });
    assert(regClient.status === 201, 'Test client registered successfully');
    clientToken = regClient.data.token || regClient.data.user.id;

    // 3. Public Registration Fee Endpoint
    console.log('\n--- 3. Public Registration Fee API ---');
    const feeRes = await request('GET', '/platform/registration-fee');
    assert(feeRes.status === 200, 'GET /api/platform/registration-fee returns 200');
    assert(typeof feeRes.data.fee === 'number', 'Fee is a numeric value');
    assert(typeof feeRes.data.baseFee === 'number', 'Base fee is a numeric value');
    assert(typeof feeRes.data.isPromotionActive === 'boolean', 'isPromotionActive is a boolean');
    assert(feeRes.data.serverTime !== undefined, 'serverTime timestamp is returned');

    // 4. Launch Free 24h Campaign Activation via Admin
    console.log('\n--- 4. Launch 24h Free Campaign Action ---');
    const launch24h = await request('POST', '/admin/campaigns/launch-free-24h', {}, adminToken);
    assert(launch24h.status === 201, 'POST /admin/campaigns/launch-free-24h returns 201');
    assert(launch24h.data.campaign.fee_usd === 0, '24h Campaign fee is $0.00');
    assert(launch24h.data.campaign.status === 'active', '24h Campaign status is active');
    assert(launch24h.data.effective.fee === 0, 'Effective fee is $0.00');
    assert(launch24h.data.effective.isPromotionActive === true, 'isPromotionActive is true');

    // 5. Non-Admin RBAC Protection
    console.log('\n--- 5. Admin RBAC Security ---');
    const nonAdminLaunch = await request('POST', '/admin/campaigns/launch-free-24h', {}, providerToken);
    assert(nonAdminLaunch.status === 403, 'Provider cannot trigger admin campaigns (HTTP 403)');
    const clientAdminGet = await request('GET', '/admin/campaigns', null, clientToken);
    assert(clientAdminGet.status === 403, 'Client cannot view admin campaigns (HTTP 403)');

    // 6. Service Creation During Free 24h Promotion ($0 Waiver)
    console.log('\n--- 6. Service Creation Under Active Promotion ---');
    const srvCreate1 = await request('POST', '/services', {
      title: 'Real-Time Python & Distributed Systems Consult',
      category_id: 'cat-tech',
      description: 'Hop on a live debugging session. We will trace latency bottlenecks and architect scale.',
      price_per_minute: 2.00,
      skills: ['Python', 'Docker', 'PostgreSQL'],
      languages: ['English'],
      experience_years: 8,
      available_now: 1
    }, providerToken);

    assert(srvCreate1.status === 201, 'Service created successfully');
    assert(srvCreate1.data.service.listing_status === 'active', 'Service is immediately active ($0 fee waiver)');
    assert(srvCreate1.data.service.listing_fee_paid === 1, 'Service listing_fee_paid = 1');
    assert(srvCreate1.data.is_free === true, 'Response confirms is_free = true');

    // Check payment record
    const srvPayment = db.prepare("SELECT * FROM payments WHERE reference_id = ? AND type = 'listing_fee'").get(srvCreate1.data.service.id);
    assert(srvPayment !== undefined && srvPayment.amount === 0 && srvPayment.status === 'succeeded', 'Promotional $0 payment record logged in payments ledger');

    // 7. Test Campaign Expiration Behavior
    console.log('\n--- 7. Campaign Automatic Expiration ---');
    // Force set campaign end_time to past in DB to test automatic expiration
    db.prepare("UPDATE registration_campaigns SET end_time = ? WHERE status = 'active'").run(
      new Date(Date.now() - 60000).toISOString()
    );

    const expiredFeeRes = await request('GET', '/platform/registration-fee');
    assert(expiredFeeRes.data.isPromotionActive === false, 'After end_time, isPromotionActive automatically transitions to false');
    assert(expiredFeeRes.data.fee === expiredFeeRes.data.baseFee, 'After end_time, effective fee automatically reverts to baseFee ($2.00)');

    // 8. Service Creation Under Normal Fee ($2.00 Draft)
    console.log('\n--- 8. Service Creation Under Normal Fee ($2.00 Draft) ---');
    const srvCreate2 = await request('POST', '/services', {
      title: 'Post-Expiration Figma Design Teardown',
      category_id: 'cat-design',
      description: 'Comprehensive UI/UX design tokens and micro-interactions audit.',
      price_per_minute: 1.50,
      skills: ['Figma', 'UI Design'],
      languages: ['English'],
      experience_years: 6,
      available_now: 1
    }, providerToken);

    assert(srvCreate2.status === 201, 'Draft service created successfully');
    assert(srvCreate2.data.service.listing_status === 'pending_payment', 'Service is in pending_payment status when fee applies');
    assert(srvCreate2.data.service.listing_fee_paid === 0, 'listing_fee_paid = 0');
    assert(srvCreate2.data.is_free === false, 'is_free = false');
    assert(srvCreate2.data.fee === 2.00, 'Fee required is $2.00');

    // 9. Create Razorpay Order Under Normal Fee
    console.log('\n--- 9. Razorpay Order Creation Under Normal Fee ---');
    const orderRes = await request('POST', `/services/${srvCreate2.data.service.id}/create-listing-order`, {}, providerToken);
    assert(orderRes.status === 200, 'Listing order endpoint returns 200');
    assert(orderRes.data.amount === 2.00, 'Order amount is exact server calculated $2.00');
    assert(orderRes.data.amount_paise === 200, 'Order amount_paise is 200');

    // 10. Pay Normal Listing Fee via Verified Payment
    console.log('\n--- 10. Pay Listing Fee ($2.00 Paid via Razorpay Verification) ---');
    const payBypass = await request('POST', `/services/${srvCreate2.data.service.id}/pay-listing-fee`, {}, providerToken);
    assert(payBypass.status === 400, 'Payment bypass endpoint correctly rejected with 400 when fee > 0');

    const paymentId = `pay_test_${Date.now()}`;
    const hmacSecret = process.env.RAZORPAY_KEY_SECRET || 'dev_razorpay_secret_key_12345';
    const signature = crypto.createHmac('sha256', hmacSecret).update(`${orderRes.data.order_id}|${paymentId}`).digest('hex');
    const payRes = await request('POST', `/services/${srvCreate2.data.service.id}/verify-listing-payment`, {
      razorpay_order_id: orderRes.data.order_id,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature
    }, providerToken);
    assert(payRes.status === 200, 'Payment verification endpoint returns 200');
    assert(payRes.data.fee === 2.00, 'Charged exact $2.00');

    const updatedSrv2 = db.prepare('SELECT * FROM services WHERE id = ?').get(srvCreate2.data.service.id);
    assert(updatedSrv2.listing_status === 'active' && updatedSrv2.listing_fee_paid === 1, 'Service is now active with fee paid');

    // 11. Admin Custom Campaign Creation
    console.log('\n--- 11. Admin Create Custom Campaign ---');
    const now = new Date();
    const customCampRes = await request('POST', '/admin/campaigns', {
      name: 'Spring Flash Sale — 50% Off Listing',
      description: 'Special $1.00 listing fee for Spring season',
      fee_usd: 1.00,
      start_time: now.toISOString(),
      end_time: new Date(now.getTime() + 48 * 3600 * 1000).toISOString(),
      is_active: 1
    }, adminToken);

    assert(customCampRes.status === 201, 'Admin custom campaign created successfully');
    assert(customCampRes.data.campaign.fee_usd === 1.00, 'Custom campaign fee is $1.00');
    assert(customCampRes.data.effective.fee === 1.00, 'Effective fee updated to $1.00');

    // 12. Admin Cancel Campaign Early
    console.log('\n--- 12. Admin End/Cancel Campaign Early ---');
    const cancelRes = await request('PATCH', `/admin/campaigns/${customCampRes.data.campaign.id}`, {
      status: 'cancelled'
    }, adminToken);
    assert(cancelRes.status === 200, 'Campaign cancelled successfully');
    assert(cancelRes.data.campaign.status === 'cancelled', 'Status changed to cancelled');
    assert(cancelRes.data.effective.fee === 2.00, 'Effective fee immediately reverted to standard base fee $2.00');

    // 13. Admin Base Fee Configuration Update
    console.log('\n--- 13. Admin Update Base Listing Fee ---');
    const updateBaseFee = await request('PATCH', '/admin/settings/listing-fee', { listing_fee_usd: 3.50 }, adminToken);
    assert(updateBaseFee.status === 200, 'Base listing fee updated');
    assert(updateBaseFee.data.base_fee === 3.50, 'Base fee set to $3.50');

    // Restore to standard $2.00
    await request('PATCH', '/admin/settings/listing-fee', { listing_fee_usd: 2.00 }, adminToken);

    // 14. Reactivate 24-Hour Free Launch Campaign for Production Launch
    console.log('\n--- 14. Reactivate 24h Launch Campaign ---');
    const finalLaunch = await request('POST', '/admin/campaigns/launch-free-24h', {}, adminToken);
    assert(finalLaunch.status === 201 && finalLaunch.data.effective.fee === 0, 'Production 24h launch campaign reactivated ($0.00 fee)');

    // 15. Admin Add User Exception Flow
    console.log('\n--- 15. Admin Add User Exception ---');
    const adminCreatedEmail = `expert.admincreated.${Date.now()}@testcampaign.local`;
    const adminAddUser = await request('POST', '/admin/users', {
      full_name: 'Dr. Admin Created Expert',
      email: adminCreatedEmail,
      password: 'AdminPassword2026!',
      role: 'provider',
      headline: 'Principal AI Engineer',
      bio: 'Onboarded directly via platform administration.',
      country: 'United States',
      city: 'Austin',
      languages: ['English'],
      skills: ['AI', 'PyTorch'],
      experience_years: 10,
      verified: true,
      service_title: 'AI Pipeline Architecture Review',
      service_description: 'Architecture review for high-throughput LLM pipelines.',
      category_id: 'cat-ai',
      price_per_minute: 3.00
    }, adminToken);

    assert(adminAddUser.status === 201, 'Admin created user successfully');
    assert(adminAddUser.data.user.created_by_admin === 1, 'Marked internally with created_by_admin = 1');
    assert(adminAddUser.data.service.listing_status === 'active', 'Admin created expert service is active immediately without payment requirement');
    assert(adminAddUser.data.service.listing_fee_paid === 1, 'listing_fee_paid = 1');

    // 16. Verify Public Marketplace Appearance
    console.log('\n--- 16. Public Marketplace Verification ---');
    const publicServices = await request('GET', '/services');
    assert(publicServices.status === 200, 'GET /services returns 200');
    const foundAdminCreated = publicServices.data.services.find(s => s.id === adminAddUser.data.service.id);
    assert(foundAdminCreated !== undefined, 'Admin created expert service appears publicly in marketplace');
    assert(!foundAdminCreated.created_by_admin, 'Public API sanitizes and strips internal admin flags');

    // 17. Admin Dashboard KPI Integrity
    console.log('\n--- 17. Admin Dashboard KPI Integrity ---');
    const statsRes = await request('GET', '/admin/stats', null, adminToken);
    assert(statsRes.status === 200, 'GET /admin/stats returns 200');
    assert(typeof statsRes.data.stats.totalUsers === 'number', 'totalUsers is numeric');
    assert(typeof statsRes.data.stats.totalProviders === 'number', 'totalProviders is numeric');
    assert(typeof statsRes.data.stats.conversions.requestToAcceptedRate === 'number', 'requestToAcceptedRate is numeric');
    assert(typeof statsRes.data.stats.conversions.acceptedToPaidRate === 'number', 'acceptedToPaidRate is numeric');
    assert(typeof statsRes.data.stats.conversions.paidToCompletedRate === 'number', 'paidToCompletedRate is numeric');
    assert(statsRes.data.stats.totalProfileVisits >= 0, 'totalProfileVisits is >= 0 without fabricated fallback');

    // 18. Audit Logs Verification
    console.log('\n--- 18. Audit Trail Verification ---');
    const auditLogsRes = await request('GET', '/admin/audit-logs', null, adminToken);
    assert(auditLogsRes.status === 200, 'GET /admin/audit-logs returns 200');
    const actions = auditLogsRes.data.logs.map(l => l.action);
    assert(actions.includes('ACTIVATE_24H_FREE_PROMOTION'), 'ACTIVATE_24H_FREE_PROMOTION recorded in audit trail');
    assert(actions.includes('CREATE_REGISTRATION_CAMPAIGN'), 'CREATE_REGISTRATION_CAMPAIGN recorded in audit trail');

    // 19. No Fake Demo Accounts in Database
    console.log('\n--- 19. Fake Demo Accounts Check ---');
    const fakeUsers = db.prepare("SELECT id, email FROM users WHERE id IN ('usr-arjun', 'usr-elena', 'usr-marcus', 'usr-priya', 'usr-david', 'usr-sarah', 'usr-admin')").all();
    assert(fakeUsers.length === 0, 'Zero fake demo user accounts in database');

    // Clean up test users created by this test run
    db.prepare("DELETE FROM services WHERE provider_id IN (SELECT id FROM users WHERE email LIKE '%@testcampaign.local')").run();
    db.prepare("DELETE FROM payments WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@testcampaign.local')").run();
    db.prepare("DELETE FROM users WHERE email LIKE '%@testcampaign.local'").run();

    // Re-verify category counts
    db.prepare(`
      UPDATE categories 
      SET service_count = (
        SELECT COUNT(*) FROM services 
        WHERE services.category_id = categories.id AND services.listing_status = 'active'
      )
    `).run();

    console.log('\n===============================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
    console.log('===============================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTests();
