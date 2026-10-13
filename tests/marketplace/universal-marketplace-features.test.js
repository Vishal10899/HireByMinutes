// =============================================================================
// HIREBYMINUTES — UNIVERSAL MARKETPLACE SPECIFICATION & FEATURES TEST SUITE
// =============================================================================
// Comprehensive test suite for Universal Marketplace sections:
// 1. 10 Universal Categories & Subcategories Taxonomy, Regulated Flags & SEO
// 2. Minimum Initial 15-Minute Consultation Duration Enforcement
// 3. Blog & Content Publishing Engine (Listing, Slugs, Categories, View counts)
// 4. Dynamic XML Sitemaps (/sitemap.xml and /sitemap-blog.xml)
// 5. Expert Review Replies (POST /provider/reviews/:id/reply)
// 6. Real Performance Metrics (Response Rate, Time, Platform Ranking Score & Tier)
// =============================================================================

const http = require('http');
const assert = require('assert');
const jwt = require('jsonwebtoken');

process.env.PORT = '5102';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'dev-secret-key-universal-features';

const db = require('../../server/db');
const { app } = require('../../server/index');

const PORT = 5102;

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

async function runUniversalFeaturesSuite() {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, '127.0.0.1', async () => {
      console.log('\n======================================================================');
      console.log('--- HIREBYMINUTE UNIVERSAL MARKETPLACE SPECIFICATION TEST SUITE ---');
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
        // Setup test users and data
        const testClientId = 'test-client-univ-01';
        const testExpertId = 'test-expert-univ-01';
        const testAdminId = 'test-admin-univ-01';
        const testServiceId = 'test-srv-univ-01';

        // Clean any leftover records
        db.prepare('DELETE FROM consultation_requests WHERE client_id = ? OR provider_id = ?').run(testClientId, testExpertId);
        db.prepare('DELETE FROM reviews WHERE provider_id = ?').run(testExpertId);
        db.prepare('DELETE FROM services WHERE id = ?').run(testServiceId);
        db.prepare('DELETE FROM users WHERE id IN (?, ?, ?)').run(testClientId, testExpertId, testAdminId);

        // Seed users
        db.prepare(`
          INSERT INTO users (id, email, password_hash, full_name, role, reward_points_balance, payout_balance_paise, verified, email_verified)
          VALUES (?, ?, 'hash', 'Kavita Client', 'client', 0, 0, 1, 1)
        `).run(testClientId, 'univ.client@test.com');

        db.prepare(`
          INSERT INTO users (id, email, password_hash, full_name, role, reward_points_balance, payout_balance_paise, verified, email_verified)
          VALUES (?, ?, 'hash', 'Dr. Ramesh Expert', 'provider', 0, 0, 1, 1)
        `).run(testExpertId, 'univ.expert@test.com');

        db.prepare(`
          INSERT INTO users (id, email, password_hash, full_name, role, reward_points_balance, payout_balance_paise, verified, email_verified)
          VALUES (?, ?, 'hash', 'Admin User', 'admin', 0, 0, 1, 1)
        `).run(testAdminId, 'univ.admin@test.com');

        // Seed service
        db.prepare(`
          INSERT INTO services (id, provider_id, title, category_id, description, price_per_minute, listing_status, listing_fee_paid, available_now)
          VALUES (?, ?, 'Enterprise Architecture Teardown', 'cat-tech', 'Full architectural deep dive', 60.00, 'active', 1, 1)
        `).run(testServiceId, testExpertId);

        // Tokens
        const clientToken = jwt.sign({ id: testClientId, role: 'client' }, process.env.JWT_SECRET);
        const expertToken = jwt.sign({ id: testExpertId, role: 'provider' }, process.env.JWT_SECRET);
        const adminToken = jwt.sign({ id: testAdminId, role: 'admin' }, process.env.JWT_SECRET);

        // ---------------------------------------------------------------------
        // SUITE 1: 10 UNIVERSAL CATEGORIES & REGULATED FLAGS
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 1: 10 Universal Categories & Regulated Flags ---');

        await test('1. GET /api/categories returns all 10 universal categories with taxonomies', async () => {
          const res = await makeRequest('/api/categories');
          assert.strictEqual(res.status, 200);
          assert(Array.isArray(res.data.categories), 'Expected categories array');
          assert(res.data.categories.length >= 10, `Expected at least 10 categories, got ${res.data.categories.length}`);

          const catSlugs = res.data.categories.map(c => c.slug);
          assert(catSlugs.includes('technology') || catSlugs.includes('technology-software'), 'Missing Technology and Software category');
          assert(catSlugs.includes('medical-health-guidance'), 'Missing Medical and Health Guidance category');
          assert(catSlugs.includes('legal') || catSlugs.includes('legal-consultation'), 'Missing Legal Consultation category');
          assert(catSlugs.includes('mental-wellness-psychology'), 'Missing Mental Wellness category');
          assert(catSlugs.includes('fitness-personal-training'), 'Missing Fitness category');
          assert(catSlugs.includes('business') || catSlugs.includes('business-professional-consulting'), 'Missing Business category');
        });

        await test('2. Regulated categories have is_regulated flag enabled', async () => {
          const res = await makeRequest('/api/categories');
          const med = res.data.categories.find(c => c.slug === 'medical-health-guidance');
          const legal = res.data.categories.find(c => c.slug === 'legal' || c.slug === 'legal-consultation');
          const wellness = res.data.categories.find(c => c.slug === 'mental-wellness-psychology');
          const tech = res.data.categories.find(c => c.slug === 'technology' || c.slug === 'technology-software');

          assert(med && Boolean(med.is_regulated) === true, 'Medical category must have is_regulated === true');
          assert(legal && Boolean(legal.is_regulated) === true, 'Legal category must have is_regulated === true');
          assert(wellness && Boolean(wellness.is_regulated) === true, 'Mental wellness category must have is_regulated === true');
          assert(tech && Boolean(tech.is_regulated) === false, 'Tech category should not be regulated');
        });

        // ---------------------------------------------------------------------
        // SUITE 2: 15-MINUTE MINIMUM INITIAL CONSULTATION DURATION
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 2: 15-Minute Minimum Consultation Duration Rule ---');

        await test('3. Rejects paid consultation requests under 15 minutes (HTTP 400)', async () => {
          const res = await makeRequest('/api/consultation-requests', {
            method: 'POST',
            headers: { Authorization: `Bearer ${clientToken}` },
            body: {
              service_id: testServiceId,
              duration_minutes: 10, // Under 15m
              connect_type: 'now',
              problem_description: 'Short 10-minute question'
            }
          });
          assert.strictEqual(res.status, 400);
          assert(res.data.error.includes('15'), `Expected error mentioning 15 mins, got: ${res.data.error}`);
        });

        await test('4. Accepts consultation request with 15 minutes duration', async () => {
          const res = await makeRequest('/api/consultation-requests', {
            method: 'POST',
            headers: { Authorization: `Bearer ${clientToken}` },
            body: {
              service_id: testServiceId,
              duration_minutes: 15,
              connect_type: 'now',
              problem_description: 'Standard 15-minute consultation review'
            }
          });
          assert.strictEqual(res.status, 201);
          assert.strictEqual(res.data.request.duration_minutes, 15);
          assert.strictEqual(Number(res.data.request.total_price), 900.00); // 15m * ₹60/m = ₹900
        });

        // ---------------------------------------------------------------------
        // SUITE 3: BLOG & EDITORIAL CMS APIS
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 3: Blog & Content Publishing Engine ---');

        let createdPostId = null;

        await test('5. GET /api/blog returns seeded articles and categories', async () => {
          const res = await makeRequest('/api/blog');
          assert.strictEqual(res.status, 200);
          assert(Array.isArray(res.data.posts), 'Expected posts array');
          assert(res.data.posts.length >= 3, `Expected at least 3 seeded posts, got ${res.data.posts.length}`);

          const catRes = await makeRequest('/api/blog/categories');
          assert.strictEqual(catRes.status, 200);
          assert(Array.isArray(catRes.data.categories), 'Expected blog categories array');
        });

        await test('6. GET /api/blog/:slug returns single article and increments views_count', async () => {
          const listRes = await makeRequest('/api/blog');
          const firstPost = listRes.data.posts[0];
          assert(firstPost, 'No post found');

          const initialViews = firstPost.views_count || 0;
          const articleRes = await makeRequest(`/api/blog/${firstPost.slug}`);
          assert.strictEqual(articleRes.status, 200);
          assert.strictEqual(articleRes.data.post.slug, firstPost.slug);
          assert.strictEqual(articleRes.data.post.views_count, initialViews + 1);
        });

        await test('7. Admin creates, updates, and manages blog post (POST & PUT /api/admin/blog)', async () => {
          const createRes = await makeRequest('/api/admin/blog', {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: {
              title: 'Automated Test Article for Marketplace Publishing',
              slug: 'automated-test-article-marketplace',
              excerpt: 'This is a test article excerpt.',
              content: '# Test Article Content\n\nTesting dynamic markdown and SEO metadata.',
              category: 'Technology and Software',
              author_name: 'Test Author',
              read_time_minutes: 4,
              status: 'published',
              meta_title: 'Automated Test Article | HireByMinute',
              meta_description: 'SEO preview description for test article.'
            }
          });
          assert.strictEqual(createRes.status, 201);
          assert(createRes.data.post && createRes.data.post.id, 'Expected post id');
          createdPostId = createRes.data.post.id;

          // Update status to draft
          const statusRes = await makeRequest(`/api/admin/blog/${createdPostId}/status`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: { status: 'draft' }
          });
          assert.strictEqual(statusRes.status, 200);
          assert.strictEqual(statusRes.data.post.status, 'draft');

          // Delete post
          const delRes = await makeRequest(`/api/admin/blog/${createdPostId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${adminToken}` }
          });
          assert.strictEqual(delRes.status, 200);
        });

        // ---------------------------------------------------------------------
        // SUITE 4: DYNAMIC XML SITEMAPS
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 4: Dynamic XML Sitemaps ---');

        await test('8. GET /sitemap.xml returns valid XML urlset with categories and blog URLs', async () => {
          const res = await makeRequest('/sitemap.xml');
          assert.strictEqual(res.status, 200);
          assert(res.headers['content-type'].includes('xml'), 'Expected xml content-type');
          assert(res.rawText.includes('<urlset'), 'Expected valid urlset XML');
          assert(res.rawText.includes('/categories/'), 'Expected category URL in sitemap');
          assert(res.rawText.includes('/blog'), 'Expected blog URL in sitemap');
        });

        await test('9. GET /sitemap-blog.xml returns valid XML urlset for published articles', async () => {
          const res = await makeRequest('/sitemap-blog.xml');
          assert.strictEqual(res.status, 200);
          assert(res.headers['content-type'].includes('xml'), 'Expected xml content-type');
          assert(res.rawText.includes('<urlset'), 'Expected valid urlset XML');
          assert(res.rawText.includes('/blog/'), 'Expected seeded article in blog sitemap');
        });

        // ---------------------------------------------------------------------
        // SUITE 5: EXPERT REVIEW REPLY ENDPOINT
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 5: Expert Review Replies ---');

        const now = new Date().toISOString();
        const testBookingId = 'test-book-univ-01';
        const testSessionId = 'test-sess-univ-01';
        let reviewId = 'test-rev-univ-01';

        db.prepare('DELETE FROM reviews WHERE id = ?').run(reviewId);
        db.prepare('DELETE FROM sessions WHERE id = ?').run(testSessionId);
        db.prepare('DELETE FROM bookings WHERE id = ?').run(testBookingId);

        db.prepare(`
          INSERT INTO bookings (id, client_id, provider_id, service_id, duration_minutes, total_price, scheduled_start, scheduled_end, status, created_at)
          VALUES (?, ?, ?, ?, 15, 900.0, ?, ?, 'COMPLETED', ?)
        `).run(testBookingId, testClientId, testExpertId, testServiceId, now, now, now);

        db.prepare(`
          INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, actual_start, actual_end, duration_minutes, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 15, 'COMPLETED', ?)
        `).run(testSessionId, testBookingId, testClientId, testExpertId, testServiceId, now, now, now, now, now);

        db.prepare(`
          INSERT INTO reviews (id, booking_id, session_id, client_id, provider_id, service_id, rating, comment, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 5, 'Incredible architectural advice in just 15 minutes!', ?)
        `).run(reviewId, testBookingId, testSessionId, testClientId, testExpertId, testServiceId, now);

        await test('10. Provider replies to client review (POST /api/provider/reviews/:id/reply)', async () => {
          const res = await makeRequest(`/api/provider/reviews/${reviewId}/reply`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${expertToken}` },
            body: { reply: 'Thank you Kavita! Glad we solved the scaling bottleneck quickly.' }
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.review.provider_reply, 'Thank you Kavita! Glad we solved the scaling bottleneck quickly.');
          assert(res.data.review.provider_replied_at, 'Expected provider_replied_at timestamp');
        });

        await test('11. Prevents unauthorized users from replying to other providers\' reviews', async () => {
          const res = await makeRequest(`/api/provider/reviews/${reviewId}/reply`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${clientToken}` }, // Client token
            body: { reply: 'Unauthorized reply' }
          });
          assert(res.status === 403 || res.status === 404, `Expected 403/404, got ${res.status}`);
        });

        // ---------------------------------------------------------------------
        // SUITE 6: REAL PERFORMANCE METRICS & PLATFORM RANKING
        // ---------------------------------------------------------------------
        console.log('\n--- Suite 6: Performance Metrics & Merit Platform Ranking ---');

        await test('12. Provider dashboard returns real response metrics and platform ranking', async () => {
          const res = await makeRequest('/api/dashboards/provider', {
            headers: { Authorization: `Bearer ${expertToken}` }
          });
          assert.strictEqual(res.status, 200);
          assert(res.data.provider, 'Expected provider in response');
          assert(typeof res.data.provider.response_rate === 'string', 'Expected response_rate string');
          assert(typeof res.data.provider.response_time === 'string', 'Expected response_time string');
          assert(res.data.provider.platform_ranking, 'Expected platform_ranking object');
          assert(typeof res.data.provider.platform_ranking.rank_score === 'number', 'Expected numeric rank_score');
          assert(typeof res.data.provider.platform_ranking.tier === 'string', 'Expected ranking tier string');
          assert(res.data.provider.platform_ranking.methodology, 'Expected documented ranking methodology');
        });

        await test('13. Client dashboard returns totalAmountPaid and recommendedExperts personalization', async () => {
          const res = await makeRequest('/api/dashboards/client', {
            headers: { Authorization: `Bearer ${clientToken}` }
          });
          assert.strictEqual(res.status, 200);
          assert(res.data.stats, 'Expected stats object');
          assert(typeof res.data.stats.totalAmountPaid === 'number', 'Expected totalAmountPaid number');
          assert(Array.isArray(res.data.recommendedExperts), 'Expected recommendedExperts array');
        });

        // Clean up test data
        db.prepare('DELETE FROM reviews WHERE provider_id = ?').run(testExpertId);
        db.prepare('DELETE FROM sessions WHERE provider_id = ?').run(testExpertId);
        db.prepare('DELETE FROM bookings WHERE provider_id = ?').run(testExpertId);
        db.prepare('DELETE FROM consultation_requests WHERE client_id = ? OR provider_id = ?').run(testClientId, testExpertId);
        db.prepare('DELETE FROM services WHERE id = ?').run(testServiceId);
        db.prepare('DELETE FROM users WHERE id IN (?, ?, ?)').run(testClientId, testExpertId, testAdminId);

      } catch (fatalErr) {
        console.error('Fatal test error:', fatalErr);
        process.exitCode = 1;
      } finally {
        server.close(() => {
          console.log('\n======================================================================');
          console.log(`SUMMARY: ${passedTests} / ${totalTests} universal marketplace specification tests passed.`);
          console.log('======================================================================\n');
          if (passedTests === totalTests) {
            console.log('🎉 ALL UNIVERSAL MARKETPLACE SPECIFICATION TESTS PASSED 100%!\n');
            resolve();
          } else {
            reject(new Error(`${totalTests - passedTests} tests failed.`));
          }
        });
      }
    });
  });
}

runUniversalFeaturesSuite().then(() => {
  process.exit(0);
}).catch(() => {
  process.exit(1);
});
