const http = require('http');
const jwt = require('jsonwebtoken');

process.env.PORT = '5097';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'dev-secret-key-12345';

const db = require('./server/db');
const { app } = require('./server/index');

const PORT = 5097;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json || data
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

const server = app.listen(PORT, '127.0.0.1', async () => {
  console.log('\n======================================================================');
  console.log('--- HIREBYMINUTE WEBSITE & PLATFORM CONTROL CENTER TEST SUITE ---');
  console.log('======================================================================\n');

  try {
    // 1. Get or create Admin user for auth token
    const adminUser = db.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').get('admin');
    if (!adminUser) throw new Error('No admin user found in database.');

    const adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: 'admin', full_name: adminUser.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Get or create Provider user for testing opportunity applications
    let providerUser = db.prepare('SELECT * FROM users WHERE role = ? AND email_verified = 1 LIMIT 1').get('provider');
    if (!providerUser) {
      const pId = `test-prov-${Date.now()}`;
      db.prepare(
        `INSERT INTO users (id, email, password_hash, full_name, role, verified, email_verified, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`
      ).run(pId, `prov-${Date.now()}@test.local`, 'hash', 'Test Provider', 'provider', 1);
      providerUser = db.prepare('SELECT * FROM users WHERE id = ?').get(pId);
    }

    const providerToken = jwt.sign(
      { id: providerUser.id, email: providerUser.email, role: 'provider', full_name: providerUser.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    let passed = 0;
    let total = 0;

    function assert(condition, message) {
      total++;
      if (condition) {
        passed++;
        console.log(`   ✓ ${message}`);
      } else {
        console.error(`   ✗ FAILED: ${message}`);
        throw new Error(`Assertion failed: ${message}`);
      }
    }

    // -------------------------------------------------------------
    // TEST 1: Public Homepage Settings API
    // -------------------------------------------------------------
    console.log('1. Testing Public GET /api/platform/homepage...');
    const homeRes = await makeRequest('/api/platform/homepage');
    assert(homeRes.status === 200, 'Returns HTTP 200');
    assert(homeRes.data.homepage !== undefined, 'Returns homepage object');
    assert(homeRes.data.homepage.hero_headline !== undefined, 'Contains hero headline');
    assert(homeRes.data.homepage.visibility !== undefined, 'Contains visibility');

    // -------------------------------------------------------------
    // TEST 2: Admin Homepage Settings Update & Audit Log
    // -------------------------------------------------------------
    console.log('\n2. Testing Admin PUT /api/admin/homepage (Auth & Audit)...');
    const updateHomePayload = {
      ...homeRes.data.homepage,
      hero_headline: 'Hire Top Experts by the Minute — Live & On Demand'
    };
    const adminHomeRes = await makeRequest('/api/admin/homepage', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: updateHomePayload
    });
    assert(adminHomeRes.status === 200, 'Returns HTTP 200 for authenticated admin');
    assert(adminHomeRes.data.homepage.hero_headline === 'Hire Top Experts by the Minute — Live & On Demand', 'Headline updated successfully');

    // Verify change is immediately public
    const publicHomeVerify = await makeRequest('/api/platform/homepage');
    assert(publicHomeVerify.data.homepage.hero_headline === 'Hire Top Experts by the Minute — Live & On Demand', 'Public API serves updated headline');

    // Check Audit Log
    const auditLogHome = db.prepare(
      'SELECT * FROM audit_logs WHERE action = ? ORDER BY created_at DESC LIMIT 1'
    ).get('ADMIN_UPDATED_HOMEPAGE');
    assert(auditLogHome !== undefined, 'Audit log ADMIN_UPDATED_HOMEPAGE recorded');

    // -------------------------------------------------------------
    // TEST 3: Public SEO Settings API
    // -------------------------------------------------------------
    console.log('\n3. Testing Public GET /api/platform/seo...');
    const seoRes = await makeRequest('/api/platform/seo');
    assert(seoRes.status === 200, 'Returns HTTP 200');
    assert(seoRes.data.seo !== undefined, 'Returns seo settings object');
    assert(seoRes.data.seo.site_title !== undefined, 'Contains site_title');
    assert(seoRes.data.seo.meta_description !== undefined, 'Contains meta_description');

    // -------------------------------------------------------------
    // TEST 4: Admin SEO Settings Update & Audit Log
    // -------------------------------------------------------------
    console.log('\n4. Testing Admin PUT /api/admin/seo (Auth & Audit)...');
    const updateSeoPayload = {
      ...seoRes.data.seo,
      site_title: 'HireByMinute — Instant Verified Expert Consultations by the Minute'
    };
    const adminSeoRes = await makeRequest('/api/admin/seo', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: updateSeoPayload
    });
    assert(adminSeoRes.status === 200, 'Returns HTTP 200 for authenticated admin');
    assert(adminSeoRes.data.seo.site_title === 'HireByMinute — Instant Verified Expert Consultations by the Minute', 'Site title updated successfully');

    const publicSeoVerify = await makeRequest('/api/platform/seo');
    assert(publicSeoVerify.data.seo.site_title === 'HireByMinute — Instant Verified Expert Consultations by the Minute', 'Public API serves updated SEO title');

    const auditLogSeo = db.prepare(
      'SELECT * FROM audit_logs WHERE action = ? ORDER BY created_at DESC LIMIT 1'
    ).get('ADMIN_UPDATED_SEO');
    assert(auditLogSeo !== undefined, 'Audit log ADMIN_UPDATED_SEO recorded');

    // -------------------------------------------------------------
    // TEST 5: Public FAQs (Published only)
    // -------------------------------------------------------------
    console.log('\n5. Testing Public GET /api/faqs...');
    const faqsRes = await makeRequest('/api/faqs');
    assert(faqsRes.status === 200, 'Returns HTTP 200');
    assert(Array.isArray(faqsRes.data.faqs), 'Returns faqs array');
    assert(faqsRes.data.faqs.length >= 1, 'Contains default seeded FAQs');
    const allPublished = faqsRes.data.faqs.every(f => f.is_published === 1 || f.is_published === true);
    assert(allPublished, 'All returned FAQs have is_published = 1');

    // -------------------------------------------------------------
    // TEST 6: Admin FAQ Full CRUD
    // -------------------------------------------------------------
    console.log('\n6. Testing Admin FAQ CRUD Flow (Create, Update, Publish Toggle, Delete)...');
    // CREATE
    const createFaqRes = await makeRequest('/api/admin/faqs', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        question: 'Can I test HireByMinute before making a live consultation?',
        answer: 'Yes! Clients can browse verified expert profiles, read verified reviews, and view transparent per-minute rates before scheduling.',
        category: 'Clients & Billing',
        sort_order: 99,
        is_published: 1
      }
    });
    assert(createFaqRes.status === 201, 'POST /api/admin/faqs returns HTTP 201 Created');
    assert(createFaqRes.data.faq && createFaqRes.data.faq.id, 'New FAQ created with unique ID');
    const createdFaqId = createFaqRes.data.faq.id;

    // UPDATE
    const updateFaqRes = await makeRequest(`/api/admin/faqs/${createdFaqId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        question: 'Can I test HireByMinute before booking a consultation?',
        is_published: 0 // change to draft
      }
    });
    assert(updateFaqRes.status === 200, 'PUT /api/admin/faqs/:id returns HTTP 200');
    assert(updateFaqRes.data.faq.is_published === 0, 'FAQ updated to hidden/draft');

    // Verify draft is excluded from public endpoint
    const publicFaqsVerify = await makeRequest('/api/faqs');
    const foundInPublic = publicFaqsVerify.data.faqs.some(f => f.id === createdFaqId);
    assert(!foundInPublic, 'Draft FAQ is strictly excluded from public /api/faqs');

    // DELETE
    const deleteFaqRes = await makeRequest(`/api/admin/faqs/${createdFaqId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(deleteFaqRes.status === 200, 'DELETE /api/admin/faqs/:id returns HTTP 200');

    // -------------------------------------------------------------
    // TEST 7: Opportunity Creation - Free vs Paid
    // -------------------------------------------------------------
    console.log('\n7. Testing Opportunity Pricing (FREE vs PAID)...');
    // Create FREE Opportunity
    const freeOppRes = await makeRequest('/api/admin/opportunities', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        title: 'Open Source React Code Review',
        category_id: 'cat-tech',
        subcategory: 'Frontend Engineering',
        description: 'Review component hierarchy, clean code standards, and state management.',
        duration_minutes: 30,
        budget: 60,
        pricing_type: 'free',
        entry_fee_usd: 0
      }
    });
    assert(freeOppRes.status === 201, 'Admin created FREE opportunity (HTTP 201)');
    assert(freeOppRes.data.opportunity.pricing_type === 'free', 'Opportunity has pricing_type: free');
    assert(Number(freeOppRes.data.opportunity.entry_fee_usd || 0) === 0, 'Opportunity has entry_fee_usd: 0');
    const freeOppId = freeOppRes.data.opportunity.id;

    // Create PAID Opportunity
    const paidOppRes = await makeRequest('/api/admin/opportunities', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        title: 'Enterprise Architecture High-Stakes Consultation',
        category_id: 'cat-tech',
        subcategory: 'Cloud Architecture',
        description: 'Multi-region AWS failover and high-throughput PostgreSQL replication design.',
        duration_minutes: 60,
        budget: 350,
        pricing_type: 'paid',
        entry_fee_usd: 15.00
      }
    });
    assert(paidOppRes.status === 201, 'Admin created PAID opportunity (HTTP 201)');
    assert(paidOppRes.data.opportunity.pricing_type === 'paid', 'Opportunity has pricing_type: paid');
    assert(Number(paidOppRes.data.opportunity.entry_fee_usd) === 15.00, 'Opportunity has entry_fee_usd: 15.00');
    const paidOppId = paidOppRes.data.opportunity.id;

    // -------------------------------------------------------------
    // TEST 8: Provider Application Flow - Free vs Paid
    // -------------------------------------------------------------
    console.log('\n8. Testing Application Flows (Direct Free vs Server Razorpay Order)...');
    // Provider submits directly to FREE opportunity
    const applyFreeRes = await makeRequest(`/api/opportunities/${freeOppId}/apply`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${providerToken}` },
      body: {
        message: 'I have 8+ years building enterprise React architectures.',
        relevant_experience: 'Lead Frontend Architect at tech company.',
        availability: 'Immediate'
      }
    });
    assert(applyFreeRes.status === 201, 'Provider applied directly to FREE opportunity without payment');

    // Provider initiates paid application fee order
    const orderPaidRes = await makeRequest(`/api/opportunities/${paidOppId}/create-application-order`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${providerToken}` }
    });
    assert(orderPaidRes.status === 200, 'Paid opportunity create-application-order returns HTTP 200');
    assert(orderPaidRes.data.is_free === false, 'Returns is_free: false');
    assert(orderPaidRes.data.amount === 15, 'Returns exact authoritative fee: $15 USD');
    assert(orderPaidRes.data.order_id !== undefined, 'Returns server-generated order_id');

    // -------------------------------------------------------------
    // TEST 9: Security & RBAC Enforcement
    // -------------------------------------------------------------
    console.log('\n9. Testing Security & RBAC Restrictions on Admin Modules...');
    // Unauthenticated access
    const unauthRes = await makeRequest('/api/admin/homepage', { method: 'PUT', body: {} });
    assert(unauthRes.status === 401, 'Unauthenticated access to /api/admin/homepage returns HTTP 401');

    // Provider (non-admin) access to admin endpoints
    const providerAdminRes = await makeRequest('/api/admin/seo', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${providerToken}` },
      body: {}
    });
    assert(providerAdminRes.status === 403, 'Provider access to /api/admin/seo returns HTTP 403 Forbidden');

    console.log('\n======================================================================');
    console.log(`✅ ALL ${passed}/${total} CONTROL CENTER & WEBSITE INTEGRATION TESTS PASSED 100%!`);
    console.log('======================================================================\n');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exitCode = 1;
  } finally {
    server.close(() => {
      process.exit(process.exitCode || 0);
    });
  }
});
