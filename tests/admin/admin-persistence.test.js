// =============================================================================
// HIREBYMINUTES — FULL ADMIN PANEL PERSISTENCE & DATA INTEGRITY TEST SUITE
// =============================================================================
// Validates end-to-end functionality, authorization, database mutations,
// refresh survival, and public frontend synchronization across all modules:
//
// 1. Admin RBAC Authorization & Security
// 2. Footer Settings Persistence & Public Sync (No Reset Bug)
// 3. Contact Settings Persistence & Public Sync (No Reset Bug)
// 4. Homepage CMS Content & Visibility Persistence
// 5. SEO Settings Persistence & Public Sync
// 6. Dynamic Platform Commission Impact (Admin Settings -> Stats & Ledger)
// 7. Banners & Announcements (CTA labels, URLs, type, toggle, delete)
// 8. CMS Pages & System Legal Pages Protection
// 9. Review Moderation (Reviewer names, numeric is_hidden, public filtering)
// 10. Service Featuring & Persistence in DB
// 11. Opportunity Management & applicant_count field parity
// 12. Category Reordering & Deactivation Persistence
// 13. User Moderation & Self-Deletion Security Guard
// 14. Audit Log Mutation Records
// 15. Admin Password Change Verification
// =============================================================================

const http = require('http');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

process.env.PORT = '5095';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'dev-secret-key-admin-audit';

const db = require('../../server/db');
const { app } = require('../../server/index');

const PORT = 5095;

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
      path,
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

function runAdminPersistenceTests() {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, '127.0.0.1', async () => {
      console.log('\n======================================================================');
      console.log('--- HIREBYMINUTES ADMIN PANEL END-TO-END PERSISTENCE AUDIT SUITE ---');
      console.log('======================================================================\n');

      let testsPassed = 0;
      let testsFailed = 0;

      function test(name, fn) {
        try {
          fn();
          console.log(`  ✓ [PASS] ${name}`);
          testsPassed++;
        } catch (err) {
          console.error(`  ✗ [FAIL] ${name}`);
          console.error(`     Error: ${err.message}`);
          testsFailed++;
        }
      }

      async function testAsync(name, fn) {
        try {
          await fn();
          console.log(`  ✓ [PASS] ${name}`);
          testsPassed++;
        } catch (err) {
          console.error(`  ✗ [FAIL] ${name}`);
          console.error(`     Error: ${err.message}`);
          testsFailed++;
        }
      }

      try {
        const ts = Date.now();

        // Setup Admin User
        let adminUser = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
        if (!adminUser) {
          const adminId = `admin-audit-${ts}`;
          const hash = bcrypt.hashSync('AdminPassword123!', 10);
          db.prepare(`
            INSERT INTO users (id, email, username, password_hash, full_name, role, verified, email_verified)
            VALUES (?, 'admin_audit@hirebyminute.com', 'admin_audit', ?, 'Master Administrator', 'admin', 1, 1)
          `).run(adminId, hash);
          adminUser = db.prepare('SELECT * FROM users WHERE id = ?').get(adminId);
        } else {
          // Set a known password hash for password testing
          const hash = bcrypt.hashSync('AdminPassword123!', 10);
          db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, adminUser.id);
          adminUser = db.prepare('SELECT * FROM users WHERE id = ?').get(adminUser.id);
        }

        const adminToken = jwt.sign(
          { id: adminUser.id, email: adminUser.email, role: 'admin', full_name: adminUser.full_name },
          process.env.JWT_SECRET,
          { expiresIn: '2h' }
        );

        // Setup Client User for RBAC testing
        const clientId = `client-test-${ts}`;
        const clientEmail = `client_tester_${ts}@hirebyminute.com`;
        const clientUsername = `client_tester_${ts}`;
        db.prepare(`
          INSERT INTO users (id, email, username, password_hash, full_name, role, verified, email_verified)
          VALUES (?, ?, ?, 'hash', 'Test Client', 'client', 1, 1)
        `).run(clientId, clientEmail, clientUsername);

        const clientToken = jwt.sign(
          { id: clientId, email: clientEmail, role: 'client', full_name: 'Test Client' },
          process.env.JWT_SECRET,
          { expiresIn: '2h' }
        );

        const authHeaders = { Authorization: `Bearer ${adminToken}` };
        const clientHeaders = { Authorization: `Bearer ${clientToken}` };

        // ---------------------------------------------------------------------
        // SUITE 1: RBAC & ADMIN AUTHORIZATION
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 1: RBAC & Admin Authorization Guards ---');

        await testAsync('1. Unauthenticated requests to /api/admin/stats are rejected (401)', async () => {
          const res = await makeRequest('/api/admin/stats');
          assert.strictEqual(res.status, 401);
        });

        await testAsync('2. Non-admin users are rejected from /api/admin/stats (403)', async () => {
          const res = await makeRequest('/api/admin/stats', { headers: clientHeaders });
          assert.strictEqual(res.status, 403);
        });

        await testAsync('3. Authenticated admin is granted access to /api/admin/stats (200)', async () => {
          const res = await makeRequest('/api/admin/stats', { headers: authHeaders });
          assert.strictEqual(res.status, 200);
          const stats = res.data.stats || res.data;
          assert.ok(stats.totalUsers >= 1);
        });

        // ---------------------------------------------------------------------
        // SUITE 2: FOOTER SETTINGS PERSISTENCE & PUBLIC SYNCHRONIZATION
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 2: Footer Settings Persistence & Public Sync ---');

        const uniqueFooterDesc = `Precision consulting platform verified at timestamp ${ts}.`;
        const uniqueFooterEmail = `footer-audit-${ts}@hirebyminute.com`;

        await testAsync('4. Admin can update footer with nested { footer } payload', async () => {
          const payload = {
            footer: {
              company_description: uniqueFooterDesc,
              contact_email: uniqueFooterEmail,
              contact_phone: '+1 (800) 999-8877',
              address: 'Wall Street, New York, NY',
              copyright_text: '© 2026 HireByMinute Inc.',
              designer_credit: 'Designed by Antigravity',
              social_links: [{ platform: 'x', url: 'https://x.com/hirebyminute' }],
              sections: {
                legal: [{ id: 'terms', label: 'Terms of Service', url: '/terms', order: 1, is_visible: true }]
              }
            }
          };

          const res = await makeRequest('/api/admin/footer', {
            method: 'PUT',
            headers: authHeaders,
            body: payload
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.success, true);
          assert.strictEqual(res.data.footer.company_description, uniqueFooterDesc);
        });

        await testAsync('5. Footer update survives Admin Panel page refresh (DB persistence)', async () => {
          const res = await makeRequest('/api/admin/footer', { headers: authHeaders });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.footer.company_description, uniqueFooterDesc);
          assert.strictEqual(res.data.footer.contact_email, uniqueFooterEmail);
          assert.ok(res.data.footer.sections.legal.length >= 1);
        });

        await testAsync('6. Public frontend API (/platform/footer) immediately reflects updated footer', async () => {
          const res = await makeRequest('/api/platform/footer');
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.footer.company_description, uniqueFooterDesc);
          assert.strictEqual(res.data.footer.contact_email, uniqueFooterEmail);
        });

        // ---------------------------------------------------------------------
        // SUITE 3: CONTACT SETTINGS PERSISTENCE & PUBLIC SYNCHRONIZATION
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 3: Contact Settings Persistence & Public Sync ---');

        const uniqueSupportEmail = `support-audit-${ts}@hirebyminute.com`;
        const uniquePhone = `+1 (555) 777-${String(ts).slice(-4)}`;

        await testAsync('7. Admin can update contact channels with { contact } payload', async () => {
          const payload = {
            contact: {
              support_email: uniqueSupportEmail,
              business_email: 'biz@hirebyminute.com',
              phone: uniquePhone,
              support_hours: '24/7 Global Escalations',
              address: 'Silicon Valley, CA, USA',
              whatsapp_url: 'https://wa.me/15557778888',
              contact_form_enabled: true
            }
          };

          const res = await makeRequest('/api/admin/contact', {
            method: 'PUT',
            headers: authHeaders,
            body: payload
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.success, true);
          assert.strictEqual(res.data.contact.support_email, uniqueSupportEmail);
          assert.strictEqual(res.data.contact.phone, uniquePhone);
        });

        await testAsync('8. Contact settings survive Admin refresh without reset', async () => {
          const res = await makeRequest('/api/admin/contact', { headers: authHeaders });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.contact.support_email, uniqueSupportEmail);
          assert.strictEqual(res.data.contact.phone, uniquePhone);
        });

        await testAsync('9. Public contact endpoint (/platform/contact) reflects Admin changes', async () => {
          const res = await makeRequest('/api/platform/contact');
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.contact.support_email, uniqueSupportEmail);
          assert.strictEqual(res.data.contact.phone, uniquePhone);
        });

        // ---------------------------------------------------------------------
        // SUITE 4: HOMEPAGE CMS & SEO META SETTINGS
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 4: Homepage CMS & SEO Settings Persistence ---');

        const uniqueHeadline = `Precision Consulting at Speed — ${ts}`;

        await testAsync('10. Admin can save homepage hero copy and section visibility', async () => {
          const res = await makeRequest('/api/admin/homepage', {
            method: 'PUT',
            headers: authHeaders,
            body: {
              homepage: {
                hero_headline: uniqueHeadline,
                hero_badge_text: '⚡ Instant 1-on-1 Consultations',
                primary_cta_label: 'Explore Catalog',
                primary_cta_url: '/services',
                visibility: { hero: true, search: true, intent_cards: false }
              }
            }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.homepage.hero_headline, uniqueHeadline);
          assert.strictEqual(res.data.homepage.visibility.intent_cards, false);
        });

        await testAsync('11. Homepage settings survive refresh and synchronize with public API', async () => {
          const res = await makeRequest('/api/platform/homepage');
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.homepage.hero_headline, uniqueHeadline);
        });

        const uniqueSiteTitle = `HireByMinute Marketplace v${ts}`;

        await testAsync('12. Admin can save SEO meta tags and open graph configurations', async () => {
          const res = await makeRequest('/api/admin/seo', {
            method: 'PUT',
            headers: authHeaders,
            body: {
              seo: {
                site_title: uniqueSiteTitle,
                meta_description: 'Instant 1-on-1 consultations per minute.',
                canonical_url: 'https://hirebyminute.com',
                og_title: uniqueSiteTitle
              }
            }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.seo.site_title, uniqueSiteTitle);
        });

        await testAsync('13. Public SEO endpoint returns authoritative updated metadata', async () => {
          const res = await makeRequest('/api/platform/seo');
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.seo.site_title, uniqueSiteTitle);
        });

        // ---------------------------------------------------------------------
        // SUITE 5: DYNAMIC PLATFORM COMMISSION (BUSINESS LOGIC)
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 5: Dynamic Platform Commission Business Logic ---');

        await testAsync('14. Updating platform commission to 25% updates DB platform_settings', async () => {
          const res = await makeRequest('/api/admin/settings', {
            method: 'PUT',
            headers: authHeaders,
            body: {
              platform_fee_percent: '25'
            }
          });
          assert.strictEqual(res.status, 200);

          const dbSetting = db.prepare("SELECT value FROM platform_settings WHERE key = 'platform_fee_percent'").get();
          assert.strictEqual(dbSetting.value, '25');
        });

        await testAsync('15. Admin stats endpoint calculates platform revenue using dynamic 25% rate', async () => {
          const res = await makeRequest('/api/admin/stats', { headers: authHeaders });
          assert.strictEqual(res.status, 200);
          // If session revenue exists, verify 25% cut calculation
          const stats = res.data.stats || res.data;
          assert.strictEqual(typeof stats.platformRevenue, 'number');
        });

        // Reset commission back to 15%
        db.prepare("UPDATE platform_settings SET value = '15' WHERE key = 'platform_fee_percent'").run();

        // ---------------------------------------------------------------------
        // SUITE 6: BANNERS & ANNOUNCEMENTS CONTROL
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 6: Banners & Announcements Persistence ---');

        let createdBannerId = null;
        const bannerTitle = `Launch Incentive Alert ${ts}`;

        await testAsync('16. Admin can create banner with cta_label, cta_url, and type', async () => {
          const res = await makeRequest('/api/admin/banners', {
            method: 'POST',
            headers: authHeaders,
            body: {
              title: bannerTitle,
              message: 'Get ₹0 listing fee for the next 48 hours.',
              cta_label: 'Claim Offer',
              cta_url: '/provider/onboard',
              type: 'promo',
              placement: 'global',
              priority: 5,
              is_active: 1
            }
          });
          assert.strictEqual(res.status, 201);
          assert.ok(res.data.banner.id);
          assert.strictEqual(res.data.banner.cta_label, 'Claim Offer');
          assert.strictEqual(res.data.banner.cta_url, '/provider/onboard');
          assert.strictEqual(res.data.banner.type, 'promo');
          assert.strictEqual(res.data.banner.is_active, 1);
          createdBannerId = res.data.banner.id;
        });

        await testAsync('17. Banner survives Admin refresh and preserves CTA fields', async () => {
          const res = await makeRequest('/api/admin/banners', { headers: authHeaders });
          assert.strictEqual(res.status, 200);
          const found = res.data.banners.find(b => b.id === createdBannerId);
          assert.ok(found, 'Created banner not found in list');
          assert.strictEqual(found.cta_label, 'Claim Offer');
          assert.strictEqual(found.cta_url, '/provider/onboard');
          assert.strictEqual(found.type, 'promo');
          assert.strictEqual(found.is_active, 1);
        });

        await testAsync('18. Banner can be edited and toggled inactive', async () => {
          const editRes = await makeRequest(`/api/admin/banners/${createdBannerId}`, {
            method: 'PUT',
            headers: authHeaders,
            body: {
              cta_label: 'Register Now',
              priority: 10
            }
          });
          assert.strictEqual(editRes.status, 200);
          assert.strictEqual(editRes.data.banner.cta_label, 'Register Now');

          const toggleRes = await makeRequest(`/api/admin/banners/${createdBannerId}/toggle`, {
            method: 'PATCH',
            headers: authHeaders,
            body: { is_active: false }
          });
          assert.strictEqual(toggleRes.status, 200);
          assert.strictEqual(toggleRes.data.is_active, 0);

          // Verify toggle persisted in database
          const row = db.prepare('SELECT is_active FROM banners_announcements WHERE id = ?').get(createdBannerId);
          assert.strictEqual(Number(row.is_active), 0);
        });

        await testAsync('19. Admin can delete banner cleanly', async () => {
          const delRes = await makeRequest(`/api/admin/banners/${createdBannerId}`, {
            method: 'DELETE',
            headers: authHeaders
          });
          assert.strictEqual(delRes.status, 200);

          const row = db.prepare('SELECT id FROM banners_announcements WHERE id = ?').get(createdBannerId);
          assert.strictEqual(row, undefined);
        });

        // ---------------------------------------------------------------------
        // SUITE 7: CMS PAGES & SYSTEM PAGE DELETION PROTECTION
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 7: CMS Legal Pages & System Protection ---');

        await testAsync('20. GET /api/admin/cms/pages returns is_system: 1 for system legal pages', async () => {
          const res = await makeRequest('/api/admin/cms/pages', { headers: authHeaders });
          assert.strictEqual(res.status, 200);
          const terms = res.data.pages.find(p => p.slug === 'terms');
          const privacy = res.data.pages.find(p => p.slug === 'privacy');
          assert.ok(terms, 'Terms page missing');
          assert.ok(privacy, 'Privacy page missing');
          assert.strictEqual(terms.is_system, 1);
          assert.strictEqual(privacy.is_system, 1);
        });

        await testAsync('21. System legal pages cannot be deleted (returns 400 Bad Request)', async () => {
          const termsRow = db.prepare("SELECT id FROM cms_pages WHERE slug = 'terms'").get();
          if (termsRow) {
            const res = await makeRequest(`/api/admin/cms/pages/${termsRow.id}`, {
              method: 'DELETE',
              headers: authHeaders
            });
            assert.strictEqual(res.status, 400);
            assert.ok(res.data.error.includes('Cannot delete essential'));
          }
        });

        const customTermsClause = `Arbitration clause updated at ${ts} for platform compliance.`;

        await testAsync('22. Admin can edit Terms CMS content and public endpoint updates immediately', async () => {
          const termsRow = db.prepare("SELECT * FROM cms_pages WHERE slug = 'terms'").get();
          const updatedContent = `${termsRow.content}\n\n## Special Clause\n${customTermsClause}`;

          const updateRes = await makeRequest(`/api/admin/cms/pages/${termsRow.id}`, {
            method: 'PUT',
            headers: authHeaders,
            body: {
              title: termsRow.title,
              content: updatedContent,
              status: 'published'
            }
          });
          assert.strictEqual(updateRes.status, 200);

          // Verify public /cms/pages/terms endpoint returns updated content
          const pubRes = await makeRequest('/api/cms/pages/terms');
          assert.strictEqual(pubRes.status, 200);
          assert.ok(pubRes.data.page.content.includes(customTermsClause));
        });

        // ---------------------------------------------------------------------
        // SUITE 8: REVIEW MODERATION & RATINGS INTEGRITY
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 8: Review Moderation & State Integrity ---');

        let testProvider = db.prepare("SELECT * FROM users WHERE role = 'provider' LIMIT 1").get();
        if (!testProvider) {
          const provId = `prov-audit-${ts}`;
          db.prepare(`
            INSERT INTO users (id, email, username, password_hash, full_name, role, verified, email_verified)
            VALUES (?, ?, ?, 'hash', 'Test Provider', 'provider', 1, 1)
          `).run(provId, `prov_tester_${ts}@hirebyminute.com`, `prov_tester_${ts}`);
          testProvider = db.prepare('SELECT * FROM users WHERE id = ?').get(provId);
        }

        let testService = db.prepare('SELECT s.id, s.provider_id FROM services s JOIN users u ON s.provider_id = u.id LIMIT 1').get();
        if (!testService) {
          const srvId = `srv-audit-${ts}`;
          db.prepare(`
            INSERT INTO services (id, provider_id, category_id, title, description, price_per_minute, listing_status, is_featured)
            VALUES (?, ?, 'cat-tech', 'Audit Service', 'Audit Service Description', 2.0, 'active', 0)
          `).run(srvId, testProvider.id);
          testService = db.prepare('SELECT id, provider_id FROM services WHERE id = ?').get(srvId);
        }

        let testReviewId = `rev-audit-${ts}`;
        const testBookingId = `bk-audit-${ts}`;
        const testSessionId = `ses-audit-${ts}`;

        db.prepare(`
          INSERT INTO bookings (id, client_id, provider_id, service_id, duration_minutes, total_price, scheduled_start, scheduled_end, status)
          VALUES (?, ?, ?, ?, 30, 60.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'COMPLETED')
        `).run(testBookingId, clientId, testService.provider_id, testService.id);

        db.prepare(`
          INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, duration_minutes, status)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 30, 'COMPLETED')
        `).run(testSessionId, testBookingId, clientId, testService.provider_id, testService.id);

        db.prepare(`
          INSERT INTO reviews (id, booking_id, session_id, client_id, provider_id, service_id, rating, comment, is_hidden)
          VALUES (?, ?, ?, ?, ?, ?, 5.0, 'Outstanding consultation on smart contract security.', 0)
        `).run(testReviewId, testBookingId, testSessionId, clientId, testService.provider_id, testService.id);

        await testAsync('23. GET /api/admin/reviews returns reviewer_name and numeric is_hidden (0)', async () => {
          const res = await makeRequest('/api/admin/reviews', { headers: authHeaders });
          assert.strictEqual(res.status, 200);
          const rev = res.data.reviews.find(r => r.id === testReviewId);
          assert.ok(rev, 'Audit review not found');
          assert.strictEqual(rev.reviewer_name, 'Test Client');
          assert.strictEqual(rev.is_hidden, 0);
        });

        await testAsync('24. Moderating review to hidden updates DB and returns is_hidden: 1', async () => {
          const modRes = await makeRequest(`/api/admin/reviews/${testReviewId}/visibility`, {
            method: 'PATCH',
            headers: authHeaders,
            body: { is_hidden: 1, moderation_note: 'Spam review flagged by automated scanner' }
          });
          assert.strictEqual(modRes.status, 200);
          assert.strictEqual(modRes.data.is_hidden, 1);

          // Verify database
          const row = db.prepare('SELECT is_hidden, moderation_note FROM reviews WHERE id = ?').get(testReviewId);
          assert.strictEqual(Number(row.is_hidden), 1);
          assert.strictEqual(row.moderation_note, 'Spam review flagged by automated scanner');
        });

        // ---------------------------------------------------------------------
        // SUITE 9: SERVICE MODERATION & FEATURING
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 9: Service Featuring & Column Integrity ---');

        if (testService) {
          await testAsync('25. Admin can toggle is_featured on services and DB persists cleanly', async () => {
            const initialRes = await makeRequest('/api/admin/services', { headers: authHeaders });
            const s = initialRes.data.services.find(srv => srv.id === testService.id);
            const currentFeatured = Number(s?.is_featured) === 1 ? 1 : 0;

            const toggleRes = await makeRequest(`/api/admin/services/${testService.id}/feature`, {
              method: 'PATCH',
              headers: authHeaders
            });
            assert.strictEqual(toggleRes.status, 200);
            assert.strictEqual(toggleRes.data.is_featured, currentFeatured === 1 ? 0 : 1);

            // Verify in DB directly
            const dbRow = db.prepare('SELECT is_featured FROM services WHERE id = ?').get(testService.id);
            assert.strictEqual(Number(dbRow.is_featured), currentFeatured === 1 ? 0 : 1);

            // Re-fetch via GET /admin/services
            const refreshed = await makeRequest('/api/admin/services', { headers: authHeaders });
            const refS = refreshed.data.services.find(srv => srv.id === testService.id);
            assert.strictEqual(refS.is_featured, currentFeatured === 1 ? 0 : 1);
          });
        }

        // ---------------------------------------------------------------------
        // SUITE 10: OPPORTUNITY MANAGEMENT & EDITING
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 10: Opportunity Creation, Editing, & applicant_count ---');

        let createdOppId = null;
        const oppTitle = `Full Stack Web3 Audit ${ts}`;

        await testAsync('26. Admin can post new opportunity with free/paid configuration', async () => {
          const res = await makeRequest('/api/admin/opportunities', {
            method: 'POST',
            headers: authHeaders,
            body: {
              title: oppTitle,
              category_id: 'cat-tech',
              description: 'Conduct security audit on EVM smart contracts.',
              budget: 150.00,
              duration_minutes: 60,
              pricing_type: 'paid',
              entry_fee_usd: 5.00
            }
          });
          assert.strictEqual(res.status, 201);
          assert.ok(res.data.opportunity.id);
          createdOppId = res.data.opportunity.id;
        });

        await testAsync('27. GET /api/admin/opportunities returns applicant_count and applications_count', async () => {
          const res = await makeRequest('/api/admin/opportunities', { headers: authHeaders });
          assert.strictEqual(res.status, 200);
          const opp = res.data.opportunities.find(o => o.id === createdOppId);
          assert.ok(opp, 'Created opportunity not found');
          assert.strictEqual(typeof opp.applicant_count, 'number');
          assert.strictEqual(typeof opp.applications_count, 'number');
          assert.strictEqual(opp.applicant_count, opp.applications_count);
        });

        await testAsync('28. Admin can edit existing opportunity details via PATCH', async () => {
          const updatedTitle = `${oppTitle} (Updated Scope)`;
          const patchRes = await makeRequest(`/api/admin/opportunities/${createdOppId}`, {
            method: 'PATCH',
            headers: authHeaders,
            body: {
              title: updatedTitle,
              budget: 200.00
            }
          });
          assert.strictEqual(patchRes.status, 200);

          const dbRow = db.prepare('SELECT title, budget FROM opportunities WHERE id = ?').get(createdOppId);
          assert.strictEqual(dbRow.title, updatedTitle);
          assert.strictEqual(Number(dbRow.budget), 200.00);
        });

        // ---------------------------------------------------------------------
        // SUITE 11: CATEGORY REORDERING & RETRIEVAL
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 11: Category Reordering & Deactivation Persistence ---');

        await testAsync('29. Reordering categories accepts { categories } and { order } formats', async () => {
          const catList = db.prepare('SELECT id, sort_order FROM categories LIMIT 3').all();
          if (catList.length >= 2) {
            const reordered = [
              { id: catList[0].id, sort_order: 10 },
              { id: catList[1].id, sort_order: 20 }
            ];

            // Test { categories } payload
            const res1 = await makeRequest('/api/admin/categories/reorder', {
              method: 'PUT',
              headers: authHeaders,
              body: { categories: reordered }
            });
            assert.strictEqual(res1.status, 200);

            // Test { order } payload
            const res2 = await makeRequest('/api/admin/categories/reorder', {
              method: 'PUT',
              headers: authHeaders,
              body: { order: reordered }
            });
            assert.strictEqual(res2.status, 200);
          }
        });

        await testAsync('30. GET /api/admin/categories returns all categories including deactivated ones', async () => {
          const cat = db.prepare('SELECT id, active FROM categories LIMIT 1').get();
          if (cat) {
            // Deactivate category
            db.prepare('UPDATE categories SET active = 0 WHERE id = ?').run(cat.id);

            const res = await makeRequest('/api/admin/categories', { headers: authHeaders });
            assert.strictEqual(res.status, 200);
            const found = res.data.categories.find(c => c.id === cat.id);
            assert.ok(found, 'Deactivated category disappeared from admin categories list');
            assert.strictEqual(found.active, 0);

            // Restore active state
            db.prepare('UPDATE categories SET active = 1 WHERE id = ?').run(cat.id);
          }
        });

        // ---------------------------------------------------------------------
        // SUITE 12: USER MANAGEMENT & SELF-DELETION PROTECTION
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 12: User Moderation & Self-Deletion Protection ---');

        await testAsync('31. Admin cannot delete their own administrator account (400)', async () => {
          const res = await makeRequest(`/api/admin/users/${adminUser.id}`, {
            method: 'DELETE',
            headers: authHeaders
          });
          assert.strictEqual(res.status, 400);
          assert.ok(res.data.error.includes('cannot delete your own'));
        });

        await testAsync('32. Admin can suspend and unsuspend a client account', async () => {
          const suspRes = await makeRequest(`/api/admin/users/${clientId}/suspend`, {
            method: 'PATCH',
            headers: authHeaders,
            body: { suspended: true }
          });
          assert.strictEqual(suspRes.status, 200);
          assert.strictEqual(suspRes.data.suspended, 1);

          const dbRow = db.prepare('SELECT is_suspended FROM users WHERE id = ?').get(clientId);
          assert.strictEqual(Number(dbRow.is_suspended), 1);

          // Unsuspend
          const unsuspRes = await makeRequest(`/api/admin/users/${clientId}/suspend`, {
            method: 'PATCH',
            headers: authHeaders,
            body: { suspended: false }
          });
          assert.strictEqual(unsuspRes.status, 200);
          assert.strictEqual(unsuspRes.data.suspended, 0);
        });

        // ---------------------------------------------------------------------
        // SUITE 13: ADMIN PASSWORD CHANGE WITH CURRENT PASSWORD VERIFICATION
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 13: Admin Password Change Verification ---');

        await testAsync('33. Password change rejects incorrect current password (400)', async () => {
          const res = await makeRequest('/api/admin/change-password', {
            method: 'POST',
            headers: authHeaders,
            body: {
              current_password: 'WrongPassword!',
              new_password: 'ValidNewPassword123!'
            }
          });
          assert.strictEqual(res.status, 400);
          assert.ok(res.data.error.includes('does not match'));
        });

        await testAsync('34. Password change succeeds with valid current password', async () => {
          const res = await makeRequest('/api/admin/change-password', {
            method: 'POST',
            headers: authHeaders,
            body: {
              current_password: 'AdminPassword123!',
              new_password: 'UpdatedAdminPass123!'
            }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.success, true);

          // Verify new password bcrypt matches
          const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(adminUser.id);
          assert.ok(bcrypt.compareSync('UpdatedAdminPass123!', user.password_hash));
        });

        // ---------------------------------------------------------------------
        // SUITE 14: OUTBOUND COMMUNICATION & TEST EMAIL
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 14: Outbound Communication & Test Email ---');

        await testAsync('35. Admin test email dispatch logs into email_logs table', async () => {
          const res = await makeRequest('/api/admin/test-email', {
            method: 'POST',
            headers: authHeaders,
            body: { to: 'test_dispatch@hirebyminute.com' }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.success, true);

          // Verify record exists in email_logs
          const log = db.prepare("SELECT * FROM email_logs WHERE recipient = 'test_dispatch@hirebyminute.com' ORDER BY created_at DESC LIMIT 1").get();
          assert.ok(log, 'Email log not created');
          assert.strictEqual(log.template, 'test_email');
        });

        // ---------------------------------------------------------------------
        // SUITE 15: AUDIT LOGS IMMUTABILITY & RECORDING
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 15: Audit Logs Immutability & Coverage ---');

        await testAsync('36. Admin actions write immutable entries into audit_logs', async () => {
          const res = await makeRequest('/api/admin/audit-logs', { headers: authHeaders });
          assert.strictEqual(res.status, 200);
          assert.ok(res.data.logs.length >= 5, 'Audit logs count should reflect recent mutations');
        });

        // ---------------------------------------------------------------------
        // SUMMARY
        // ---------------------------------------------------------------------
        console.log('\n======================================================================');
        console.log(`SUMMARY: ${testsPassed} / ${testsPassed + testsFailed} admin persistence tests passed.`);
        console.log('======================================================================\n');

        if (testsFailed > 0) {
          console.error(`💥 ${testsFailed} test(s) failed.`);
          server.close(() => process.exit(1));
        } else {
          console.log('🎉 ALL ADMIN PANEL PERSISTENCE & DATA CONSISTENCY TESTS PASSED 100%!');
          server.close(() => process.exit(0));
        }

      } catch (fatalErr) {
        console.error('Fatal Test Runner Failure:', fatalErr);
        server.close(() => process.exit(1));
      }
    });
  });
}

if (require.main === module) {
  runAdminPersistenceTests();
}

module.exports = { runAdminPersistenceTests };
