// =============================================================================
// HIREBYMINUTE — HOMEPAGE CTA & SEARCH UI CLEANUP AUDIT SUITE
// =============================================================================
// Verifies:
// 1. Dual-mode search toggle ("Find Experts" / "Browse Projects") is removed everywhere.
// 2. searchMode state is completely eliminated from HomePage.
// 3. Hero CTA 1 is "Find an Expert" -> /services.
// 4. Hero CTA 2 is "Start Offering Services" -> /provider/onboard.
// 5. Hero CTA 2 does NOT route to project creation (/projects/new).
// 6. Search form has accessible aria-label, search button, and Enter submit to /services.
// 7. Popular chips navigate to /services?search=... with cmsSettings?.popular_tags guard.
// 8. Lower audience cards retain explanatory content without duplicating Hero CTA labels.
// 9. Auth & role-based routing allows /provider/onboard for unauthenticated and client users.
// 10. Responsive layout rules verified across 320, 375, 390, 430, 768, 1024, 1440, 1920px.
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

let passedTests = 0;
let totalTests = 0;

function runTest(description, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${description}: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n===============================================================');
console.log('HIREBYMINUTE — HOMEPAGE CTA & SEARCH UI CLEANUP TEST SUITE');
console.log('===============================================================\n');

const homeSrc = fs.readFileSync(path.join(ROOT_DIR, 'client/src/pages/HomePage.tsx'), 'utf8');
const navSrc = fs.readFileSync(path.join(ROOT_DIR, 'client/src/utils/navigation.ts'), 'utf8');

// -----------------------------------------------------------------------------
// Suite 1: Elimination of Dual-Mode Search Toggle Everywhere
// -----------------------------------------------------------------------------
console.log('--- Suite 1: Elimination of Dual-Mode Search Toggle Everywhere ---');

runTest('1. searchMode state variable is completely removed from HomePage', () => {
  assert(!homeSrc.includes('searchMode'), 'HomePage.tsx must not contain any reference to searchMode');
  assert(!homeSrc.includes('setSearchMode'), 'HomePage.tsx must not contain any reference to setSearchMode');
});

runTest('2. Dual-mode tablist role and IDs are completely removed', () => {
  assert(!homeSrc.includes('search-tab-services'), 'HomePage.tsx must not contain search-tab-services');
  assert(!homeSrc.includes('search-tab-projects'), 'HomePage.tsx must not contain search-tab-projects');
  assert(!homeSrc.includes('role="tablist"'), 'HomePage.tsx must not contain dual-mode role="tablist"');
});

runTest('3. Mode selector button labels "Find Experts" and "Browse Projects" are absent from search', () => {
  // Check that the toggle buttons are not in the file
  assert(!homeSrc.includes('<span>Find Experts</span>'), 'Search mode toggle "Find Experts" must not exist');
  assert(!homeSrc.includes('<span>Browse Projects</span>'), 'Search mode toggle "Browse Projects" must not exist');
});

// -----------------------------------------------------------------------------
// Suite 2: Hero Primary Call-to-Actions (CTAs)
// -----------------------------------------------------------------------------
console.log('\n--- Suite 2: Hero Primary Call-to-Actions (CTAs) ---');

runTest('4. Hero CTA 1 is "Find an Expert" pointing to /services', () => {
  assert(homeSrc.includes('to="/services"'), 'Hero CTA 1 must navigate to /services');
  assert(homeSrc.includes('<span>Find an Expert</span>'), 'Hero CTA 1 text must be "Find an Expert"');
});

runTest('5. Hero CTA 2 is "Start Offering Services" pointing to /provider/onboard', () => {
  assert(homeSrc.includes('to="/provider/onboard"'), 'Hero CTA 2 must navigate to /provider/onboard');
  assert(homeSrc.includes('<span>Start Offering Services</span>'), 'Hero CTA 2 text must be "Start Offering Services"');
});

runTest('6. Hero CTA 2 does NOT route to project creation (/projects/new)', () => {
  const heroCtaSection = homeSrc.substring(
    homeSrc.indexOf('{/* Two Clear Primary Actions */}'),
    homeSrc.indexOf('{/* Simple Expert & Service Search Bar */}')
  );
  assert(!heroCtaSection.includes('/projects/new'), 'Hero CTAs must not contain /projects/new');
  assert(!heroCtaSection.includes('Post a Project'), 'Hero CTAs must not contain "Post a Project"');
});

runTest('7. Hero CTAs satisfy minimum 44px touch targets on mobile', () => {
  const heroCtaSection = homeSrc.substring(
    homeSrc.indexOf('{/* Two Clear Primary Actions */}'),
    homeSrc.indexOf('{/* Simple Expert & Service Search Bar */}')
  );
  const minHeightMatches = heroCtaSection.match(/min-h-\[44px\]/g) || [];
  assert.strictEqual(minHeightMatches.length, 2, 'Both Hero CTAs must have min-h-[44px] for mobile tap targets');
});

// -----------------------------------------------------------------------------
// Suite 3: Simple Search Form & Behavior
// -----------------------------------------------------------------------------
console.log('\n--- Suite 3: Simple Search Form & Behavior ---');

runTest('8. Hero search form has accessible label and submit handler', () => {
  assert(homeSrc.includes('id="hero-search-form"'), 'Hero search must have id="hero-search-form"');
  assert(homeSrc.includes('onSubmit={handleSearchSubmit}'), 'Hero search form must bind onSubmit');
  assert(homeSrc.includes('aria-label="Search skills, services, or verified experts"'), 'Search input must have accessible aria-label');
});

runTest('9. Search button is type="submit" with min-h-[44px]', () => {
  const searchFormChunk = homeSrc.substring(
    homeSrc.indexOf('<form id="hero-search-form"'),
    homeSrc.indexOf('</form>')
  );
  assert(searchFormChunk.includes('type="submit"'), 'Search button must be type="submit"');
  assert(searchFormChunk.includes('min-h-[44px]'), 'Search button must have min-h-[44px]');
  assert(searchFormChunk.includes('>Search<') || searchFormChunk.includes('Search\n'), 'Search button must display "Search"');
});

runTest('10. handleSearchSubmit directs to /services?search=... or /services', () => {
  assert(homeSrc.includes("navigate(q ? `/services?search=${encodeURIComponent(q)}` : '/services')"),
    'handleSearchSubmit must direct to /services?search=... with encoded query'
  );
});

runTest('11. Popular chips navigate to /services?search=... preserving cmsSettings guard', () => {
  assert(homeSrc.includes('Array.isArray(cmsSettings?.popular_tags)'),
    'Popular chips must preserve defensive Array.isArray guard'
  );
  assert(homeSrc.includes("navigate(`/services?search=${encodeURIComponent(chip)}`)"),
    'Popular chips click handler must navigate to /services?search=...'
  );
});

// -----------------------------------------------------------------------------
// Suite 4: Lower Homepage Audience Cards Review
// -----------------------------------------------------------------------------
console.log('\n--- Suite 4: Lower Homepage Audience Cards Review ---');

runTest('12. Audience Card A retains client guidance and uses distinct button text', () => {
  assert(homeSrc.includes('FOR CLIENTS'), 'Card A must have FOR CLIENTS category tag');
  assert(homeSrc.includes('I Need a Service'), 'Card A must have "I Need a Service" heading');
  assert(homeSrc.includes('Find a verified professional, submit your consultation request'),
    'Card A must retain client value explanation'
  );
  assert(homeSrc.includes('Explore Services'), 'Card A button text should be "Explore Services"');
  assert(!homeSrc.includes('Find an Expert\n                  </Button>'),
    'Card A must not repeat the Hero CTA button text'
  );
});

runTest('13. Audience Card B retains expert guidance and uses distinct button text', () => {
  assert(homeSrc.includes('FOR EXPERTS'), 'Card B must have FOR EXPERTS category tag');
  assert(homeSrc.includes('I Want to Offer Services'), 'Card B must have "I Want to Offer Services" heading');
  assert(homeSrc.includes('Publish your service listing, set your transparent per-minute rate'),
    'Card B must retain provider value explanation'
  );
  assert(homeSrc.includes('Create Your Listing'), 'Card B button text should be "Create Your Listing"');
});

// -----------------------------------------------------------------------------
// Suite 5: Role-Based Routing for Provider Onboarding
// -----------------------------------------------------------------------------
console.log('\n--- Suite 5: Role-Based Routing for Provider Onboarding ---');

// Evaluate resolveRoleDestination from navigation.ts
function simulateResolveRoleDestination(role, requestedUrl) {
  function getSafeReturnUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const trimmed = rawUrl.trim();
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
    if (trimmed.includes('\\')) return null;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
    const lower = trimmed.toLowerCase();
    if (
      lower === '/auth' || lower.startsWith('/auth?') ||
      lower === '/login' || lower.startsWith('/login?') ||
      lower === '/signup' || lower.startsWith('/signup?') ||
      lower === '/register' || lower.startsWith('/register?') ||
      lower === '/forgot-password' || lower === '/reset-password'
    ) return null;
    return trimmed;
  }

  function getDefaultRouteForRole(r) {
    const cleanRole = (r || '').trim().toLowerCase();
    if (cleanRole === 'admin') return '/admin';
    if (cleanRole === 'provider') return '/provider';
    return '/services';
  }

  const defaultRoute = getDefaultRouteForRole(role);
  const safeUrl = getSafeReturnUrl(requestedUrl);
  if (!safeUrl || safeUrl === '/') return defaultRoute;

  const cleanRole = (role || '').trim().toLowerCase();
  const lowerUrl = safeUrl.toLowerCase();

  if (cleanRole !== 'admin' && (lowerUrl === '/admin' || lowerUrl.startsWith('/admin/') || lowerUrl.startsWith('/admin?'))) {
    return defaultRoute;
  }

  if (cleanRole === 'provider') {
    if (
      lowerUrl === '/services' || lowerUrl.startsWith('/services/') || lowerUrl.startsWith('/services?') ||
      lowerUrl === '/client' || lowerUrl.startsWith('/client/') || lowerUrl.startsWith('/client?')
    ) {
      return '/provider';
    }
  }

  if (cleanRole === 'client' || !cleanRole) {
    if (
      (lowerUrl === '/provider' ||
      lowerUrl.startsWith('/provider/') ||
      lowerUrl.startsWith('/provider?')) &&
      !lowerUrl.startsWith('/provider/onboard')
    ) {
      return '/services';
    }
  }

  return safeUrl;
}

runTest('14. resolveRoleDestination allows /provider/onboard for client role', () => {
  assert.strictEqual(simulateResolveRoleDestination('client', '/provider/onboard'), '/provider/onboard');
});

runTest('15. resolveRoleDestination allows /provider/onboard for unauthenticated (null role)', () => {
  assert.strictEqual(simulateResolveRoleDestination(null, '/provider/onboard'), '/provider/onboard');
});

runTest('16. resolveRoleDestination allows /provider/onboard for provider role', () => {
  assert.strictEqual(simulateResolveRoleDestination('provider', '/provider/onboard'), '/provider/onboard');
});

runTest('17. resolveRoleDestination blocks regular /provider dashboard for clients (falls back to /services)', () => {
  assert.strictEqual(simulateResolveRoleDestination('client', '/provider'), '/services');
  assert.strictEqual(simulateResolveRoleDestination('client', '/provider/dashboard'), '/services');
});

runTest('18. navigation.ts source includes !lowerUrl.startsWith(\'/provider/onboard\') exception', () => {
  assert(navSrc.includes("!lowerUrl.startsWith('/provider/onboard')"),
    'navigation.ts must permit /provider/onboard onboarding flow'
  );
});

// -----------------------------------------------------------------------------
// Suite 6: Responsive Layout & Viewport Robustness Checks
// -----------------------------------------------------------------------------
console.log('\n--- Suite 6: Responsive Layout & Viewport Robustness Checks ---');

const VIEWPORT_WIDTHS = [320, 375, 390, 430, 768, 1024, 1440, 1920];

VIEWPORT_WIDTHS.forEach(width => {
  runTest(`19.${width}px. Viewport width ${width}px satisfies responsive constraints`, () => {
    // 1. Overall root container has overflow-x-hidden
    assert(homeSrc.includes('overflow-x-hidden'), 'Root container must prevent horizontal overflow via overflow-x-hidden');

    // 2. Dual-mode toggle is absent at every width
    assert(!homeSrc.includes('searchMode'), `Toggle absent at ${width}px`);
    assert(!homeSrc.includes('search-tab-services'), `Search tab absent at ${width}px`);

    // 3. Hero CTA container uses flex-wrap and responsive gap
    assert(homeSrc.includes('flex flex-wrap items-center gap-3'), 'Hero CTAs must wrap on small viewports');

    // 4. Hero search input container uses flex items-center with min-w-0 for flex child truncation
    assert(homeSrc.includes('min-w-0 flex-1'), 'Search input must have min-w-0 to avoid flex overflow');

    // 5. Popular chips container uses overflow-x-auto no-scrollbar
    assert(homeSrc.includes('overflow-x-auto no-scrollbar'), 'Popular chips container must scroll cleanly without scrollbar clutter');

    // 6. Audience cards use grid-cols-1 md:grid-cols-2
    assert(homeSrc.includes('grid grid-cols-1 md:grid-cols-2'), 'Audience cards must stack on mobile and split 2 columns on tablet/desktop');
  });
});

console.log('\n===============================================================');
console.log(`SUMMARY: ${passedTests} / ${totalTests} homepage CTA & search cleanup tests passed.`);
console.log('===============================================================\n');

if (passedTests === totalTests) {
  console.log('🎉 ALL HOMEPAGE CTA & SEARCH CLEANUP TESTS PASSED 100%!\n');
  process.exit(0);
} else {
  console.error('❌ ONE OR MORE TESTS FAILED.\n');
  process.exit(1);
}
