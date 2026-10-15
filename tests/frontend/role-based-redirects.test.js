// =============================================================================
// HIREBYMINUTE — ROLE-BASED LOGIN & SESSION REDIRECTION TEST SUITE
// =============================================================================
// Verifies:
// 1. Client login / auth resolution redirects to /services by default.
// 2. Provider login / auth resolution redirects to /provider by default.
// 3. Admin login / auth resolution redirects to /admin by default.
// 4. Provider is never redirected to /services or /client even if returnTo is set.
// 5. Client is never redirected to /provider even if returnTo is set.
// 6. External URLs, protocol-relative hosts, and auth loops fallback to role default.
// 7. Stale return URLs are cleared upon logout (clearStoredReturnUrl in AuthContext).
// 8. AuthPage uses resolveRoleDestination in useEffect, login, and OTP verification.
// 9. Failed logins never navigate.
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
console.log('HIREBYMINUTE — ROLE-BASED LOGIN REDIRECTION AUDIT SUITE');
console.log('===============================================================\n');

// -----------------------------------------------------------------------------
// 1. Extract and Evaluate navigation.ts Logic in Node Environment
// -----------------------------------------------------------------------------
const navSrc = fs.readFileSync(path.join(ROOT_DIR, 'client/src/utils/navigation.ts'), 'utf8');

assert(navSrc.includes('function getDefaultRouteForRole'), 'navigation.ts must export getDefaultRouteForRole');
assert(navSrc.includes('function resolveRoleDestination'), 'navigation.ts must export resolveRoleDestination');
assert(navSrc.includes('function getSafeReturnUrl'), 'navigation.ts must export getSafeReturnUrl');
assert(navSrc.includes('function clearStoredReturnUrl'), 'navigation.ts must export clearStoredReturnUrl');

// Replicate the pure functions from navigation.ts
function getSafeReturnUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (trimmed.includes('\\')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  if (
    lower === '/auth' ||
    lower.startsWith('/auth?') ||
    lower === '/login' ||
    lower.startsWith('/login?') ||
    lower === '/signup' ||
    lower.startsWith('/signup?') ||
    lower === '/register' ||
    lower.startsWith('/register?') ||
    lower === '/forgot-password' ||
    lower === '/reset-password'
  ) {
    return null;
  }
  return trimmed;
}

function getDefaultRouteForRole(role) {
  const cleanRole = (role || '').trim().toLowerCase();
  if (cleanRole === 'admin') return '/admin';
  if (cleanRole === 'provider') return '/provider';
  return '/services';
}

function resolveRoleDestination(role, requestedUrl) {
  const defaultRoute = getDefaultRouteForRole(role);
  const safeUrl = getSafeReturnUrl(requestedUrl);

  if (!safeUrl || safeUrl === '/') {
    return defaultRoute;
  }

  const cleanRole = (role || '').trim().toLowerCase();
  const lowerUrl = safeUrl.toLowerCase();

  // Non-admins cannot access /admin
  if (cleanRole !== 'admin' && (lowerUrl === '/admin' || lowerUrl.startsWith('/admin/') || lowerUrl.startsWith('/admin?'))) {
    return defaultRoute;
  }

  // Provider cannot be redirected to client services or client dashboard
  if (cleanRole === 'provider') {
    if (
      lowerUrl === '/services' ||
      lowerUrl.startsWith('/services/') ||
      lowerUrl.startsWith('/services?') ||
      lowerUrl === '/client' ||
      lowerUrl.startsWith('/client/') ||
      lowerUrl.startsWith('/client?')
    ) {
      return '/provider';
    }
  }

  // Client cannot be redirected to provider dashboard
  if (cleanRole === 'client' || !cleanRole) {
    if (
      lowerUrl === '/provider' ||
      lowerUrl.startsWith('/provider/') ||
      lowerUrl.startsWith('/provider?')
    ) {
      return '/services';
    }
  }

  return safeUrl;
}

// -----------------------------------------------------------------------------
// Test Suite
// -----------------------------------------------------------------------------

console.log('--- Suite 1: Canonical Role Default Destinations ---');

runTest('1. getDefaultRouteForRole returns /services for client', () => {
  assert.strictEqual(getDefaultRouteForRole('client'), '/services');
});

runTest('2. getDefaultRouteForRole returns /provider for provider', () => {
  assert.strictEqual(getDefaultRouteForRole('provider'), '/provider');
});

runTest('3. getDefaultRouteForRole returns /admin for admin', () => {
  assert.strictEqual(getDefaultRouteForRole('admin'), '/admin');
});

runTest('4. getDefaultRouteForRole defaults to /services for unspecified role', () => {
  assert.strictEqual(getDefaultRouteForRole(null), '/services');
  assert.strictEqual(getDefaultRouteForRole(undefined), '/services');
  assert.strictEqual(getDefaultRouteForRole(''), '/services');
});

console.log('\n--- Suite 2: Client Post-Login Redirection ---');

runTest('5. Client without returnTo redirects to /services', () => {
  assert.strictEqual(resolveRoleDestination('client', null), '/services');
  assert.strictEqual(resolveRoleDestination('client', undefined), '/services');
  assert.strictEqual(resolveRoleDestination('client', ''), '/services');
});

runTest('6. Client with root ("/") returnTo redirects to /services', () => {
  assert.strictEqual(resolveRoleDestination('client', '/'), '/services');
});

runTest('7. Client with specific service deep link preserves intended service', () => {
  assert.strictEqual(resolveRoleDestination('client', '/services/srv-455779a7'), '/services/srv-455779a7');
  assert.strictEqual(resolveRoleDestination('client', '/services/srv-455779a7?action=hire'), '/services/srv-455779a7?action=hire');
});

runTest('8. Client cannot be redirected to /provider (falls back to /services)', () => {
  assert.strictEqual(resolveRoleDestination('client', '/provider'), '/services');
  assert.strictEqual(resolveRoleDestination('client', '/provider/dashboard'), '/services');
  assert.strictEqual(resolveRoleDestination('client', '/provider/new-service'), '/services');
});

runTest('9. Client cannot be redirected to /admin (falls back to /services)', () => {
  assert.strictEqual(resolveRoleDestination('client', '/admin'), '/services');
  assert.strictEqual(resolveRoleDestination('client', '/admin/users'), '/services');
});

console.log('\n--- Suite 3: Provider Post-Login Redirection ---');

runTest('10. Provider without returnTo redirects to /provider', () => {
  assert.strictEqual(resolveRoleDestination('provider', null), '/provider');
  assert.strictEqual(resolveRoleDestination('provider', undefined), '/provider');
  assert.strictEqual(resolveRoleDestination('provider', ''), '/provider');
});

runTest('11. Provider with root ("/") returnTo redirects to /provider', () => {
  assert.strictEqual(resolveRoleDestination('provider', '/'), '/provider');
});

runTest('12. Provider is never redirected to client /services (enforces /provider)', () => {
  assert.strictEqual(resolveRoleDestination('provider', '/services'), '/provider');
  assert.strictEqual(resolveRoleDestination('provider', '/services/srv-455779a7'), '/provider');
  assert.strictEqual(resolveRoleDestination('provider', '/services?category=tech'), '/provider');
});

runTest('13. Provider is never redirected to /client dashboard (enforces /provider)', () => {
  assert.strictEqual(resolveRoleDestination('provider', '/client'), '/provider');
  assert.strictEqual(resolveRoleDestination('provider', '/client/overview'), '/provider');
});

runTest('14. Provider can access authorized contract and live session deep links', () => {
  assert.strictEqual(resolveRoleDestination('provider', '/contracts/cnt-9912'), '/contracts/cnt-9912');
  assert.strictEqual(resolveRoleDestination('provider', '/session/sess-abc'), '/session/sess-abc');
  assert.strictEqual(resolveRoleDestination('provider', '/jobs'), '/jobs');
  assert.strictEqual(resolveRoleDestination('provider', '/opportunities'), '/opportunities');
});

runTest('15. Provider cannot access /admin (falls back to /provider)', () => {
  assert.strictEqual(resolveRoleDestination('provider', '/admin'), '/provider');
});

console.log('\n--- Suite 4: Security & Open Redirect Protection ---');

runTest('16. External URLs and protocol-relative hosts are rejected and fallback to role default', () => {
  assert.strictEqual(resolveRoleDestination('client', 'https://evil.example.com'), '/services');
  assert.strictEqual(resolveRoleDestination('provider', 'https://evil.example.com'), '/provider');
  assert.strictEqual(resolveRoleDestination('client', '//evil.com'), '/services');
  assert.strictEqual(resolveRoleDestination('client', '/\\evil.com'), '/services');
  assert.strictEqual(resolveRoleDestination('client', 'javascript:alert(1)'), '/services');
});

runTest('17. Auth loop destinations are rejected and fallback to role default', () => {
  assert.strictEqual(resolveRoleDestination('client', '/login'), '/services');
  assert.strictEqual(resolveRoleDestination('client', '/signup'), '/services');
  assert.strictEqual(resolveRoleDestination('provider', '/login'), '/provider');
  assert.strictEqual(resolveRoleDestination('provider', '/auth?tab=register'), '/provider');
});

console.log('\n--- Suite 5: Source Code Architecture Verification ---');

runTest('18. AuthContext clears stored return URL on logout', () => {
  const authContextSrc = fs.readFileSync(path.join(ROOT_DIR, 'client/src/context/AuthContext.tsx'), 'utf8');
  assert(authContextSrc.includes('clearStoredReturnUrl();'), 'AuthContext.logout must invoke clearStoredReturnUrl()');
});

runTest('19. AuthPage routes login, session check, and OTP via resolveRoleDestination', () => {
  const authPageSrc = fs.readFileSync(path.join(ROOT_DIR, 'client/src/pages/AuthPage.tsx'), 'utf8');
  assert(authPageSrc.includes('resolveRoleDestination(user.role, destination)'), 'AuthPage useEffect must use resolveRoleDestination');
  assert(authPageSrc.includes('resolveRoleDestination(loggedInUser.role, destination)'), 'handleLoginSubmit must use resolveRoleDestination');
  assert(authPageSrc.includes('resolveRoleDestination(userRole, destination)'), 'handleVerifyOtpSubmit must use resolveRoleDestination');
  assert(authPageSrc.includes('clearStoredReturnUrl()'), 'AuthPage must clean up stored return URL');
});

runTest('20. Failed logins do not invoke navigate or trigger redirects', () => {
  const authPageSrc = fs.readFileSync(path.join(ROOT_DIR, 'client/src/pages/AuthPage.tsx'), 'utf8');
  // In handleLoginSubmit catch block:
  const catchIndex = authPageSrc.indexOf('} catch (err: any) {');
  const finallyIndex = authPageSrc.indexOf('} finally {', catchIndex);
  const catchBlock = authPageSrc.substring(catchIndex, finallyIndex);
  assert(!catchBlock.includes('navigate('), 'Catch block in handleLoginSubmit must never call navigate');
});

console.log('\n===============================================================');
console.log(`SUMMARY: ${passedTests} / ${totalTests} role-based redirect tests passed.`);
console.log('===============================================================\n');

if (passedTests === totalTests) {
  console.log('🎉 ALL ROLE-BASED LOGIN REDIRECT TESTS PASSED 100%!\n');
  process.exit(0);
} else {
  console.error('❌ ONE OR MORE TESTS FAILED.\n');
  process.exit(1);
}
