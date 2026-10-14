// =============================================================================
// HIREBYMINUTES — EXPERT MARKETPLACE PAYOUT NOTICE UI TEST SUITE
// =============================================================================
// Verifies production-readiness of the Expert Dashboard Payout Notice Modal:
// 1. Exact copy conformance for pending-onboarding state
// 2. Neutral informational design (no alarming amber alert styling)
// 3. Clear distinction between recorded ledger earnings and paid funds
// 4. Accessibility compliance (ARIA attributes, 44px touch targets, Escape key, backdrop click)
// 5. Session dismissal persistence (sessionStorage)
// 6. Multi-state coverage (pending_onboarding, processing, failed, unknown)
// 7. Authoritative backend response integration and honest unverified balance handling
// =============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('\n===============================================================');
console.log('HIREBYMINUTES — EXPERT PAYOUT NOTICE MODAL UI AUDIT');
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

const dashboardPath = path.join(__dirname, '../../client/src/pages/ProviderDashboardPage.tsx');
assert(fs.existsSync(dashboardPath), 'ProviderDashboardPage.tsx must exist');
const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');

// --- Suite 1: Modal Copy Conformance (Pending Onboarding State) ---
console.log('--- Suite 1: Modal Copy Conformance (Pending Onboarding State) ---');

it('1. Modal header displays concise title "Payouts & Earnings"', () => {
  assert(dashboardCode.includes("title || 'Payouts & Earnings'"), 'Must fallback to "Payouts & Earnings" title');
  assert(dashboardCode.includes("title: 'Payouts & Earnings'"), 'Default title must be "Payouts & Earnings"');
});

it('2. Body contains exact onboarding explanation without alarming jargon', () => {
  const expectedText = 'Your consultation earnings are being recorded in your account ledger. Automatic bank payouts are not yet available because marketplace transfer activation is pending.';
  assert(dashboardCode.includes(expectedText), `Must include: "${expectedText}"`);
});

it('3. Recorded earnings card displays "Your recorded earnings" label and ledger badge', () => {
  assert(dashboardCode.includes('Your recorded earnings'), 'Must display "Your recorded earnings" label');
  assert(dashboardCode.includes('Ledger Recorded'), 'Must include "Ledger Recorded" status badge');
});

it('4. Follow-up copy clearly outlines gateway activation policy without misleading promises', () => {
  const expectedPolicy = 'Payout availability will be updated once the payment provider approves marketplace transfers. Until then, automatic withdrawals are unavailable.';
  assert(dashboardCode.includes(expectedPolicy), `Must include: "${expectedPolicy}"`);
});

it('5. Primary action button is clearly labeled "Got it"', () => {
  assert(dashboardCode.includes('>Got it</button>') || dashboardCode.includes('>Got it\n              </button>') || dashboardCode.includes('Got it'), 'Must have "Got it" action button');
});

// --- Suite 2: Neutral Informational Styling & Brand Consistency ---
console.log('\n--- Suite 2: Neutral Informational Styling & Brand Consistency ---');

it('6. Modal does NOT use alarming amber alert styling for pending state', () => {
  // Check modal section specifically
  const modalSection = dashboardCode.slice(dashboardCode.indexOf('MODAL 3: PAYOUTS & EARNINGS NOTICE MODAL'));
  const modalEnd = modalSection.indexOf('MODAL 4:');
  const modalSnippet = modalSection.slice(0, modalEnd);

  assert(!modalSnippet.includes('bg-amber-50'), 'Modal must not use alarming bg-amber-50');
  assert(!modalSnippet.includes('border-amber-200'), 'Modal must not use alarming border-amber-200');
  assert(!modalSnippet.includes('text-amber-900'), 'Modal must not use alarming text-amber-900');
});

it('7. Modal uses HireByMinute neutral palette (aliceblue, moonstone, midnight, timberwolf)', () => {
  const modalSection = dashboardCode.slice(dashboardCode.indexOf('MODAL 3: PAYOUTS & EARNINGS NOTICE MODAL'));
  const modalEnd = modalSection.indexOf('MODAL 4:');
  const modalSnippet = modalSection.slice(0, modalEnd);

  assert(modalSnippet.includes('bg-aliceblue'), 'Must use subtle aliceblue theme');
  assert(modalSnippet.includes('text-midnight'), 'Must use midnight text');
  assert(modalSnippet.includes('border-timberwolf'), 'Must use timberwolf border');
});

// --- Suite 3: Earnings Distinction & Ledger Protection ---
console.log('\n--- Suite 3: Earnings Distinction & Ledger Protection ---');

it('8. Clearly clarifies that recorded earnings are safely ledgered but not yet disbursed', () => {
  assert(dashboardCode.includes('Recorded in your account ledger • Funds are protected'), 'Must clarify ledger protection');
  assert(!dashboardCode.includes('Funds are withdrawable immediately'), 'Must not make false immediate withdrawal claims');
  assert(!dashboardCode.includes('Payout arrives on Friday'), 'Must not display fake arrival dates');
});

it('9. Derives recorded earnings accurately from backend wallet availableBalance, payout_balance_inr, or netEarnings', () => {
  assert(dashboardCode.includes('walletData.availableBalance'), 'Must check authoritative availableBalance');
  assert(dashboardCode.includes('walletData.payout_balance_inr'), 'Must check payout_balance_inr fallback');
  assert(dashboardCode.includes('isVerified'), 'Must verify whether earnings are authoritative');
});

it('10. Safely handles unverified balance state without inventing numbers', () => {
  assert(dashboardCode.includes("'Unavailable'"), 'Must display "Unavailable" when earnings are unverified');
  assert(dashboardCode.includes('Earnings balance could not be retrieved from the server'), 'Must explain unverified state honestly');
});

// --- Suite 4: Accessibility & Mobile Responsiveness ---
console.log('\n--- Suite 4: Accessibility & Mobile Responsiveness ---');

it('11. Dialog has proper ARIA attributes (role="dialog", aria-modal="true", aria-labelledby)', () => {
  assert(dashboardCode.includes('role="dialog"'), 'Must have role="dialog"');
  assert(dashboardCode.includes('aria-modal="true"'), 'Must have aria-modal="true"');
  assert(dashboardCode.includes('aria-labelledby="payout-notice-title"'), 'Must reference title ID');
});

it('12. Close button has accessible aria-label and min 44px touch target for mobile', () => {
  assert(dashboardCode.includes('aria-label="Close payout notice"'), 'Close button must have aria-label');
  assert(dashboardCode.includes('min-h-[44px]'), 'Must enforce minimum 44px height for touch target');
  assert(dashboardCode.includes('min-w-[44px]'), 'Must enforce minimum 44px width for touch target');
});

it('13. Supports Escape key keyboard listener to dismiss modal', () => {
  assert(dashboardCode.includes("e.key === 'Escape'"), 'Must handle Escape key to close modal');
  assert(dashboardCode.includes('closePayoutNoticeModal()'), 'Must call closePayoutNoticeModal on Escape');
});

it('14. Supports backdrop click to dismiss modal', () => {
  assert(dashboardCode.includes('e.target === e.currentTarget'), 'Must detect backdrop click');
  assert(dashboardCode.includes('closePayoutNoticeModal();'), 'Must close on backdrop click');
});

it('15. Primary button has mobile-friendly min 44px height and responsive width', () => {
  assert(dashboardCode.includes('w-full sm:w-auto px-6 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs sm:text-sm font-bold hover:bg-midnight-hover shadow-subtle cursor-pointer min-h-[44px]'), 'Must have responsive full-width mobile button');
});

// --- Suite 5: Session Dismissal Persistence ---
console.log('\n--- Suite 5: Session Dismissal Persistence ---');

it('16. Persists modal dismissal to sessionStorage (hbm_payout_notice_dismissed)', () => {
  assert(dashboardCode.includes("sessionStorage.setItem('hbm_payout_notice_dismissed', 'true')"), 'Must store dismissal in sessionStorage');
});

// --- Suite 6: Multi-State Coverage & API Robustness ---
console.log('\n--- Suite 6: Multi-State Coverage & API Robustness ---');

it('17. Supports all 4 payout states: pending_onboarding, processing, failed, unknown', () => {
  assert(dashboardCode.includes("'pending_onboarding'"), 'Must handle pending_onboarding state');
  assert(dashboardCode.includes("'processing'"), 'Must handle processing state');
  assert(dashboardCode.includes("'failed'"), 'Must handle failed state');
  assert(dashboardCode.includes("'unknown'"), 'Must handle unknown state');
});

it('18. "Request Payout" button shows loading state (requestingPayout) to prevent double clicks', () => {
  assert(dashboardCode.includes('disabled={requestingPayout}'), 'Button must disable while requesting');
  assert(dashboardCode.includes('animate-spin'), 'Button must show spinner while requesting');
  assert(dashboardCode.includes('Checking...'), 'Button must indicate checking state');
});

it('19. Financial ledger table supports both transactions and ledger backend payloads', () => {
  assert(dashboardCode.includes('walletData?.ledger || walletData?.transactions || []'), 'Must support both array structures seamlessly');
});

console.log('\n===============================================================');
console.log(`SUMMARY: ${passed} / ${passed + failed} payout notice tests passed.`);
console.log('===============================================================\n');

if (failed === 0) {
  console.log('🎉 ALL EXPERT PAYOUT NOTICE UI TESTS PASSED 100%!\n');
  process.exit(0);
} else {
  console.error(`❌ ${failed} TEST(S) FAILED.\n`);
  process.exit(1);
}
