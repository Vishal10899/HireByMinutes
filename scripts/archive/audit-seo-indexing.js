const http = require('http');
const assert = require('assert');
const path = require('path');

// Spin up the real server on a dedicated test port
process.env.PORT = '5099';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'test-seo-jwt-secret-hirebyminutes-key';
process.env.GOOGLE_SITE_VERIFICATION = 'google-verification-test-code-12345';

const { app } = require('./server/index');

const server = app.listen(5099, '127.0.0.1', async () => {
  console.log('\n======================================================================');
  console.log('--- HIREBYMINUTE SEO & SEARCH INDEXING VERIFICATION TEST SUITE ---');
  console.log('======================================================================\n');

  try {
    const makeRequest = (options) => {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 5099,
          ...options
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          }));
        });
        req.on('error', reject);
        req.end();
      });
    };

    // TEST 1: robots.txt HTTP status and Content-Type
    console.log('1. Testing GET /robots.txt HTTP status & headers...');
    const robotsRes = await makeRequest({ path: '/robots.txt', method: 'GET' });
    assert.strictEqual(robotsRes.statusCode, 200, `Expected status 200, got ${robotsRes.statusCode}`);
    assert.match(robotsRes.headers['content-type'], /^text\/plain/, 'robots.txt must return text/plain');
    assert.match(robotsRes.body, /User-agent:\s*\*/, 'robots.txt must include User-agent: *');
    assert.match(robotsRes.body, /Allow:\s*\/services/, 'robots.txt must allow public services');
    assert.match(robotsRes.body, /Disallow:\s*\/admin/, 'robots.txt must disallow /admin');
    assert.match(robotsRes.body, /Disallow:\s*\/client/, 'robots.txt must disallow /client');
    assert.match(robotsRes.body, /Disallow:\s*\/provider/, 'robots.txt must disallow /provider');
    assert.match(robotsRes.body, /Disallow:\s*\/session\//, 'robots.txt must disallow /session/');
    assert.match(robotsRes.body, /Disallow:\s*\/api\//, 'robots.txt must disallow /api/');
    assert.match(robotsRes.body, /Sitemap:\s*https:\/\/hirebyminute\.com\/sitemap\.xml/, 'robots.txt must reference sitemap.xml');
    console.log('   ✓ robots.txt returns HTTP 200 text/plain with correct directives.');

    // TEST 2: HEAD /robots.txt
    console.log('2. Testing HEAD /robots.txt...');
    const robotsHead = await makeRequest({ path: '/robots.txt', method: 'HEAD' });
    assert.strictEqual(robotsHead.statusCode, 200, 'HEAD /robots.txt must return 200');
    assert.match(robotsHead.headers['content-type'], /^text\/plain/, 'HEAD /robots.txt must have text/plain');
    console.log('   ✓ HEAD /robots.txt returns HTTP 200 text/plain.');

    // TEST 3: sitemap.xml HTTP status, Content-Type and XML Structure
    console.log('3. Testing GET /sitemap.xml HTTP status & headers...');
    const sitemapRes = await makeRequest({ path: '/sitemap.xml', method: 'GET' });
    assert.strictEqual(sitemapRes.statusCode, 200, `Expected status 200, got ${sitemapRes.statusCode}`);
    assert.match(sitemapRes.headers['content-type'], /^application\/xml/, 'sitemap.xml must return application/xml');
    assert.match(sitemapRes.body, /<\?xml version="1.0" encoding="UTF-8"\?>/, 'sitemap.xml must have XML declaration');
    assert.match(sitemapRes.body, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/, 'sitemap.xml must have sitemap namespace');
    assert.match(sitemapRes.body, /<loc>https:\/\/hirebyminute\.com\/<\/loc>/, 'sitemap must include homepage');
    assert.match(sitemapRes.body, /<loc>https:\/\/hirebyminute\.com\/services<\/loc>/, 'sitemap must include /services');
    assert.match(sitemapRes.body, /<loc>https:\/\/hirebyminute\.com\/opportunities<\/loc>/, 'sitemap must include /opportunities');
    assert.match(sitemapRes.body, /<loc>https:\/\/hirebyminute\.com\/how-it-works<\/loc>/, 'sitemap must include /how-it-works');
    assert.match(sitemapRes.body, /<loc>https:\/\/hirebyminute\.com\/about<\/loc>/, 'sitemap must include /about');
    assert.match(sitemapRes.body, /<loc>https:\/\/hirebyminute\.com\/contact<\/loc>/, 'sitemap must include /contact');
    assert.match(sitemapRes.body, /<loc>https:\/\/hirebyminute\.com\/terms<\/loc>/, 'sitemap must include /terms');
    assert.match(sitemapRes.body, /<loc>https:\/\/hirebyminute\.com\/privacy<\/loc>/, 'sitemap must include /privacy');
    assert.match(sitemapRes.body, /<loc>https:\/\/hirebyminute\.com\/refund-policy<\/loc>/, 'sitemap must include /refund-policy');
    assert.match(sitemapRes.body, /<loc>https:\/\/hirebyminute\.com\/expert-policy<\/loc>/, 'sitemap must include /expert-policy');
    assert.match(sitemapRes.body, /<loc>https:\/\/hirebyminute\.com\/acceptable-use<\/loc>/, 'sitemap must include /acceptable-use');

    // Strict exclusion check: No admin, login, signup, session, or api in sitemap
    assert.strictEqual(sitemapRes.body.includes('/admin'), false, 'sitemap.xml MUST NOT contain /admin');
    assert.strictEqual(sitemapRes.body.includes('/login'), false, 'sitemap.xml MUST NOT contain /login');
    assert.strictEqual(sitemapRes.body.includes('/signup'), false, 'sitemap.xml MUST NOT contain /signup');
    assert.strictEqual(sitemapRes.body.includes('/session'), false, 'sitemap.xml MUST NOT contain /session');
    assert.strictEqual(sitemapRes.body.includes('/api/'), false, 'sitemap.xml MUST NOT contain /api/');
    console.log('   ✓ sitemap.xml returns HTTP 200 application/xml with strictly public URLs.');

    // TEST 4: HEAD /sitemap.xml
    console.log('4. Testing HEAD /sitemap.xml...');
    const sitemapHead = await makeRequest({ path: '/sitemap.xml', method: 'HEAD' });
    assert.strictEqual(sitemapHead.statusCode, 200, 'HEAD /sitemap.xml must return 200');
    assert.match(sitemapHead.headers['content-type'], /^application\/xml/, 'HEAD /sitemap.xml must have application/xml');
    console.log('   ✓ HEAD /sitemap.xml returns HTTP 200 application/xml.');

    // TEST 5: Homepage HTTP 200 & Exact Required Metadata
    console.log('5. Testing GET / Homepage metadata & OpenGraph/Twitter tags...');
    const homeRes = await makeRequest({ path: '/', method: 'GET' });
    assert.strictEqual(homeRes.statusCode, 200, 'Homepage must return HTTP 200');
    assert.match(homeRes.headers['content-type'], /^text\/html/, 'Homepage must return text/html');
    
    // Check noindex is NOT present in headers or homepage HTML
    assert.strictEqual(homeRes.headers['x-robots-tag'], undefined, 'Public homepage must NOT have X-Robots-Tag header');
    assert.match(homeRes.body, /<meta\s+name="robots"\s+content="index,\s*follow/, 'Homepage must have index, follow in robots meta');

    // Exact Title requirement
    assert.match(homeRes.body, /<title>HireByMinute — Hire Experts by the Minute<\/title>/, 'Homepage title must match requirement exactly');

    // Exact Meta Description requirement
    assert.match(homeRes.body, /<meta\s+name="description"\s+content="Find the right expert and hire them by the minute\. Get real-time help from skilled professionals and pay only for the time you need\."/, 'Homepage description must match requirement exactly');

    // Exact Canonical requirement
    assert.match(homeRes.body, /<link\s+rel="canonical"\s+href="https:\/\/hirebyminute\.com\/"/, 'Homepage canonical must be https://hirebyminute.com/');

    // Open Graph Tags
    assert.match(homeRes.body, /<meta\s+property="og:title"\s+content="HireByMinute — Hire Experts by the Minute"/, 'og:title must match');
    assert.match(homeRes.body, /<meta\s+property="og:description"\s+content="Find the right expert and hire them by the minute\./, 'og:description must match');
    assert.match(homeRes.body, /<meta\s+property="og:url"\s+content="https:\/\/hirebyminute\.com\/"/, 'og:url must match');
    assert.match(homeRes.body, /<meta\s+property="og:type"\s+content="website"/, 'og:type must match');
    assert.match(homeRes.body, /<meta\s+property="og:image"\s+content="https:\/\/hirebyminute\.com\/og-image\.png"/, 'og:image must match');

    // Twitter Tags
    assert.match(homeRes.body, /<meta\s+name="twitter:card"\s+content="summary_large_image"/, 'twitter:card must match');
    assert.match(homeRes.body, /<meta\s+name="twitter:title"\s+content="HireByMinute — Hire Experts by the Minute"/, 'twitter:title must match');
    assert.match(homeRes.body, /<meta\s+name="twitter:image"\s+content="https:\/\/hirebyminute\.com\/og-image\.png"/, 'twitter:image must match');

    // Structured Data JSON-LD
    assert.match(homeRes.body, /"@type":\s*"WebSite"/, 'JSON-LD must include WebSite');
    assert.match(homeRes.body, /"@type":\s*"Organization"/, 'JSON-LD must include Organization');
    assert.match(homeRes.body, /"@type":\s*"BreadcrumbList"/, 'JSON-LD must include BreadcrumbList');

    // Google Search Console meta verification injection
    assert.match(homeRes.body, /<meta\s+name="google-site-verification"\s+content="google-verification-test-code-12345"/, 'Google verification meta tag must be populated');

    // Pre-rendered accessible HTML shell check
    assert.match(homeRes.body, /<h1[^>]*>HireByMinute — Hire Experts by the Minute<\/h1>/, 'HTML shell must contain pre-rendered H1');
    assert.match(homeRes.body, /How HireByMinute Works/, 'HTML shell must contain How It Works content');

    console.log('   ✓ Homepage returns HTTP 200 with all exact metadata, OG/Twitter tags, Schema.org JSON-LD, and pre-rendered shell.');

    // TEST 6: Route-specific SEO Server-Side Injection (/services)
    console.log('6. Testing Route-specific SEO injection for /services...');
    const servicesRes = await makeRequest({ path: '/services', method: 'GET' });
    assert.strictEqual(servicesRes.statusCode, 200, 'GET /services must return 200');
    assert.match(servicesRes.body, /<title>Browse Expert Services — HireByMinute<\/title>/, '/services title must be injected');
    assert.match(servicesRes.body, /<link\s+rel="canonical"\s+href="https:\/\/hirebyminute\.com\/services"/, '/services canonical must be https://hirebyminute.com/services');
    assert.match(servicesRes.body, /<meta\s+property="og:url"\s+content="https:\/\/hirebyminute\.com\/services"/, '/services og:url must be https://hirebyminute.com/services');
    console.log('   ✓ /services returns HTTP 200 with exact canonical and metadata.');

    // TEST 7: Route-specific SEO Server-Side Injection (/opportunities, /about, /how-it-works, /contact)
    console.log('7. Testing Route-specific SEO injection for other public pages...');
    const aboutRes = await makeRequest({ path: '/about', method: 'GET' });
    assert.match(aboutRes.body, /<link\s+rel="canonical"\s+href="https:\/\/hirebyminute\.com\/about"/, '/about canonical must match');

    const howRes = await makeRequest({ path: '/how-it-works', method: 'GET' });
    assert.match(howRes.body, /<link\s+rel="canonical"\s+href="https:\/\/hirebyminute\.com\/how-it-works"/, '/how-it-works canonical must match');

    const contactRes = await makeRequest({ path: '/contact', method: 'GET' });
    assert.match(contactRes.body, /<link\s+rel="canonical"\s+href="https:\/\/hirebyminute\.com\/contact"/, '/contact canonical must match');
    console.log('   ✓ Public routes (/about, /how-it-works, /contact) have exact server-injected canonical tags.');

    // TEST 8: Private Endpoint X-Robots-Tag protection
    console.log('8. Testing Private Endpoint protection (X-Robots-Tag: noindex, nofollow)...');
    const adminRes = await makeRequest({ path: '/admin', method: 'GET' });
    assert.match(adminRes.headers['x-robots-tag'], /noindex,\s*nofollow/, '/admin must return X-Robots-Tag: noindex');

    const clientRes = await makeRequest({ path: '/client', method: 'GET' });
    assert.match(clientRes.headers['x-robots-tag'], /noindex,\s*nofollow/, '/client must return X-Robots-Tag: noindex');

    const providerRes = await makeRequest({ path: '/provider', method: 'GET' });
    assert.match(providerRes.headers['x-robots-tag'], /noindex,\s*nofollow/, '/provider must return X-Robots-Tag: noindex');

    const sessionRes = await makeRequest({ path: '/session/test-session-123', method: 'GET' });
    assert.match(sessionRes.headers['x-robots-tag'], /noindex,\s*nofollow/, '/session/:id must return X-Robots-Tag: noindex');

    const apiRes = await makeRequest({ path: '/api/services', method: 'GET' });
    assert.match(apiRes.headers['x-robots-tag'], /noindex,\s*nofollow/, '/api/* must return X-Robots-Tag: noindex');
    console.log('   ✓ Private routes (/admin, /client, /provider, /session, /api) strictly protected with X-Robots-Tag.');

    // TEST 9: WWW Canonical 301 Permanent Redirect
    console.log('9. Testing WWW canonicalization (301 Permanent Redirect)...');
    const wwwRes = await makeRequest({
      path: '/services?sort=top_rated',
      method: 'GET',
      headers: {
        host: 'www.hirebyminute.com'
      }
    });
    assert.strictEqual(wwwRes.statusCode, 301, `Expected status 301, got ${wwwRes.statusCode}`);
    assert.strictEqual(wwwRes.headers['location'], 'https://hirebyminute.com/services?sort=top_rated', 'Must redirect to https://hirebyminute.com with preserved query');
    console.log('   ✓ www.hirebyminute.com permanently redirects (HTTP 301) to https://hirebyminute.com preserving paths.');

    // TEST 10: Google Search Console Verification File endpoint
    console.log('10. Testing Google Search Console file verification endpoint...');
    const gscFileRes = await makeRequest({ path: '/googleabcdef0123456789.html', method: 'GET' });
    assert.strictEqual(gscFileRes.statusCode, 200, 'GSC file verification must return 200');
    assert.match(gscFileRes.body, /google-site-verification:\s*googleabcdef0123456789\.html/, 'GSC file verification body must match');
    console.log('   ✓ Google Search Console verification file route operates properly.');

    console.log('\n======================================================================');
    console.log('✅ ALL 10 SEO & SEARCH INDEXING INTEGRATION TESTS PASSED 100%!');
    console.log('======================================================================\n');

  } catch (err) {
    console.error('\n❌ SEO Test Failed:', err.message);
    if (err.actual && err.expected) {
      console.error('   Expected:', err.expected);
      console.error('   Actual:', err.actual);
    }
    process.exitCode = 1;
  } finally {
    server.close();
    process.exit(process.exitCode || 0);
  }
});
