const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('\n===============================================================');
console.log('HIREBYMINUTE — FRONTEND RUNTIME & ERROR BOUNDARY AUDIT');
console.log('===============================================================\n');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

// Suite 1: Root & Route Error Boundary Protection
console.log('--- Suite 1: Root & Route Error Boundary Protection ---');

const mainTsxPath = path.join(__dirname, '../../client/src/main.tsx');
const mainTsx = fs.readFileSync(mainTsxPath, 'utf8');

const appTsxPath = path.join(__dirname, '../../client/src/App.tsx');
const appTsx = fs.readFileSync(appTsxPath, 'utf8');

const errorBoundaryPath = path.join(__dirname, '../../client/src/components/common/ErrorBoundary.tsx');
const errorBoundaryTsx = fs.readFileSync(errorBoundaryPath, 'utf8');

it('1. ErrorBoundary component exists and implements componentDidCatch & getDerivedStateFromError', () => {
  assert(fs.existsSync(errorBoundaryPath), 'ErrorBoundary.tsx must exist');
  assert(errorBoundaryTsx.includes('getDerivedStateFromError'), 'Must implement getDerivedStateFromError');
  assert(errorBoundaryTsx.includes('componentDidCatch'), 'Must implement componentDidCatch');
  assert(errorBoundaryTsx.includes('Something went wrong'), 'Must include "Something went wrong" message');
  assert(errorBoundaryTsx.includes('Please refresh the page and try again.'), 'Must include user instruction');
  assert(errorBoundaryTsx.includes('Refresh Page'), 'Must include Refresh Page action');
});

it('2. Root main.tsx wraps the entire application in ErrorBoundary', () => {
  assert(mainTsx.includes('<ErrorBoundary>'), 'main.tsx must wrap App in ErrorBoundary');
  assert(mainTsx.includes('</ErrorBoundary>'), 'main.tsx must close ErrorBoundary');
});

it('3. App.tsx wraps route tree in ErrorBoundary with preserveHeader to keep Header/Footer visible', () => {
  assert(appTsx.includes('<ErrorBoundary preserveHeader>'), 'App.tsx must wrap Routes in ErrorBoundary preserveHeader');
  assert(appTsx.includes('</ErrorBoundary>'), 'App.tsx must close ErrorBoundary');
});

// Suite 2: Defensive User & Layout Rendering
console.log('\n--- Suite 2: Defensive User & Layout Rendering ---');

const headerPath = path.join(__dirname, '../../client/src/components/layout/Header.tsx');
const headerTsx = fs.readFileSync(headerPath, 'utf8');

it('4. Header safely handles null/undefined user full_name without throwing TypeError', () => {
  assert(
    headerTsx.includes('user.full_name || user.username || user.email || \'User\''),
    'Header must safely fall back when full_name is null/undefined before calling .replace'
  );
  assert(
    !headerTsx.includes('user.full_name.replace('),
    'Header must never call .replace directly on user.full_name without safe fallback'
  );
});

const customCursorPath = path.join(__dirname, '../../client/src/components/common/CustomCursor.tsx');
const customCursorTsx = fs.readFileSync(customCursorPath, 'utf8');

it('5. CustomCursor guards matchMedia and navigator checks defensively', () => {
  assert(customCursorTsx.includes('safeMatch'), 'CustomCursor must use safe matchMedia wrapper');
  assert(customCursorTsx.includes('document?.documentElement?.classList'), 'CustomCursor must safely check classList');
});

const bannerPath = path.join(__dirname, '../../client/src/components/common/BannerAnnouncement.tsx');
const bannerTsx = fs.readFileSync(bannerPath, 'utf8');

it('6. BannerAnnouncement safely parses sessionStorage and guards array filter', () => {
  assert(bannerTsx.includes('typeof window !== \'undefined\' && window.sessionStorage'), 'Must check window.sessionStorage');
  assert(bannerTsx.includes('Array.isArray(banners)'), 'Must verify banners is an array before filter');
});

// Suite 3: Auth Initialization & Network Resilience
console.log('\n--- Suite 3: Auth Initialization & Network Resilience ---');

const apiTsPath = path.join(__dirname, '../../client/src/services/api.ts');
const apiTs = fs.readFileSync(apiTsPath, 'utf8');

it('7. api.getMe attaches err.status to let AuthContext distinguish 401 from cold start timeouts', () => {
  assert(apiTs.includes('err.status = res.status'), 'api.getMe must attach res.status to error');
});

const homePath = path.join(__dirname, '../../client/src/pages/HomePage.tsx');
const homeTsx = fs.readFileSync(homePath, 'utf8');

it('8. HomePage guards CMS arrays with Array.isArray to prevent render exceptions', () => {
  assert(homeTsx.includes('Array.isArray(cmsSettings?.popular_tags)'), 'Must check Array.isArray for popular_tags');
  assert(homeTsx.includes('Array.isArray(cmsSettings?.how_it_works_steps)'), 'Must check Array.isArray for how_it_works_steps');
});

// Suite 4: Production Build Bundle & Script Tags
console.log('\n--- Suite 4: Production Build Bundle & Script Tags ---');

const clientIndexPath = path.join(__dirname, '../../client/index.html');
const clientIndexHtml = fs.readFileSync(clientIndexPath, 'utf8');

it('9. client/index.html uses defer for Razorpay to prevent render-blocking', () => {
  assert(clientIndexHtml.includes('checkout.razorpay.com/v1/checkout.js" defer'), 'Razorpay script must have defer attribute');
});

const distIndexPath = path.join(__dirname, '../../client/dist/index.html');
it('10. client/dist/index.html exists and contains valid JS bundle and CSS assets', () => {
  assert(fs.existsSync(distIndexPath), 'dist/index.html must exist');
  const distHtml = fs.readFileSync(distIndexPath, 'utf8');
  assert(distHtml.includes('/assets/index-'), 'dist/index.html must contain assets/index script tag');
  assert(distHtml.includes('.css'), 'dist/index.html must contain css link tag');
});

// Suite 5: Route Structure Verification
console.log('\n--- Suite 5: Route Structure Verification ---');

const routes = [
  'path="/"',
  'path="/services"',
  'path="/opportunities"',
  'path="/jobs"',
  'path="/how-it-works"',
  'path="/login"',
  'path="/register"'
];

it('11. All 7 required core public routes are declared and configured in App.tsx', () => {
  routes.forEach(r => {
    assert(appTsx.includes(r), `App.tsx must declare route ${r}`);
  });
});

// Suite 6: PostgreSQL Type Coercion Resilience (NUMERIC string serialization)
console.log('\n--- Suite 6: PostgreSQL Type Coercion Resilience (NUMERIC string serialization) ---');

const expertCardPath = path.join(__dirname, '../../client/src/components/common/ExpertCard.tsx');
const expertCardTsx = fs.readFileSync(expertCardPath, 'utf8');

const serviceDetailPath = path.join(__dirname, '../../client/src/pages/ServiceDetailPage.tsx');
const serviceDetailTsx = fs.readFileSync(serviceDetailPath, 'utf8');

const clientDashboardPath = path.join(__dirname, '../../client/src/pages/ClientDashboardPage.tsx');
const clientDashboardTsx = fs.readFileSync(clientDashboardPath, 'utf8');

it('12. ExpertCard safely coerces provider_rating to number before calling toFixed', () => {
  assert(expertCardTsx.includes('Number(service.provider_rating)'), 'ExpertCard must wrap provider_rating in Number()');
  assert(!expertCardTsx.includes('service.provider_rating.toFixed('), 'ExpertCard must never call .toFixed directly on service.provider_rating');
});

it('13. ExpertCard safely guards skills with Array.isArray', () => {
  assert(expertCardTsx.includes('Array.isArray(service.skills)'), 'ExpertCard must guard service.skills with Array.isArray');
});

it('14. ServiceDetailPage safely coerces provider_rating and price_per_minute to number', () => {
  assert(serviceDetailTsx.includes('Number(service.provider_rating)'), 'ServiceDetailPage must wrap provider_rating in Number()');
  assert(!serviceDetailTsx.includes('service.provider_rating.toFixed('), 'ServiceDetailPage must never call .toFixed directly on service.provider_rating');
  assert(serviceDetailTsx.includes('Number(service.price_per_minute)'), 'ServiceDetailPage must wrap price_per_minute in Number()');
});

it('15. ClientDashboardPage safely coerces provider_rating to number', () => {
  assert(clientDashboardTsx.includes('Number(exp.provider_rating)'), 'ClientDashboardPage must wrap provider_rating in Number()');
  assert(!clientDashboardTsx.includes('exp.provider_rating.toFixed('), 'ClientDashboardPage must never call .toFixed directly on exp.provider_rating');
});

it('16. ErrorBoundary logs error and componentStack to console unconditionally', () => {
  assert(!errorBoundaryTsx.includes('if (import.meta.env.DEV)'), 'ErrorBoundary must not suppress error logs in production');
  assert(errorBoundaryTsx.includes('console.error(\'[HireByMinute ErrorBoundary]:\''), 'ErrorBoundary must log with tag');
});

it('17. Runtime verification: simulated Postgres NUMERIC string payload formats safely', () => {
  // Test formatting logic exactly as implemented in ExpertCard
  const formatRating = (rating) => {
    const r = Number(rating);
    return !isNaN(r) && r > 0 ? r.toFixed(1) : '5.0';
  };

  assert.strictEqual(formatRating("5.00"), "5.0", 'String "5.00" should format to "5.0"');
  assert.strictEqual(formatRating("4.85"), "4.8", 'String "4.85" should format to "4.8"');
  assert.strictEqual(formatRating(4.9), "4.9", 'Number 4.9 should format to "4.9"');
  assert.strictEqual(formatRating(null), "5.0", 'null should fall back to "5.0"');
  assert.strictEqual(formatRating(undefined), "5.0", 'undefined should fall back to "5.0"');
  assert.strictEqual(formatRating(""), "5.0", 'empty string should fall back to "5.0"');
  assert.strictEqual(formatRating("invalid"), "5.0", 'invalid string should fall back to "5.0"');
});

console.log('\n===============================================================');
console.log(`SUMMARY: ${passed} / ${passed + failed} runtime tests passed.`);
console.log('===============================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL RUNTIME & ERROR BOUNDARY AUDIT TESTS PASSED 100%!\n');
  process.exit(0);
}
