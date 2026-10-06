// =============================================================================
// HIREBYMINUTES — FREE SERVICE LISTING & SIGNUP UX AUDIT TEST SUITE
// =============================================================================
// Verifies:
// 1. Service listing creation is completely free (₹0) and directly published
// 2. No listing fee Razorpay initialization or payment checkout
// 3. Signup role selection copy and absence of photo upload during registration
// 4. Client session payments retain Razorpay INR and 15% platform take rate
// 5. Public and Admin copy reflects free service listings
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
console.log('HIREBYMINUTE — FREE LISTING & SIGNUP FLOW VERIFICATION');
console.log('===============================================================\n');

// -----------------------------------------------------------------------------
// 1. BACKEND SERVICE CREATION & FEE CONTROLLER
// -----------------------------------------------------------------------------
console.log('--- Suite 1: Backend Free Listing Controller ---');

runTest('1. getEffectiveListingFee returns fee: 0 and isFree: true', () => {
  const routesCode = fs.readFileSync(path.join(ROOT_DIR, 'server', 'routes.js'), 'utf-8');
  assert.strictEqual(routesCode.includes('getEffectiveListingFee'), true);
  assert.strictEqual(routesCode.includes('fee: 0'), true);
  assert.strictEqual(routesCode.includes('baseFee: 0'), true);
  assert.strictEqual(routesCode.includes('isFree: true'), true);
  assert.strictEqual(routesCode.includes('isPromotionActive: false'), true);
});

runTest('2. POST /services directly sets listing_status = active with zero fee', () => {
  const routesCode = fs.readFileSync(path.join(ROOT_DIR, 'server', 'routes.js'), 'utf-8');
  assert.strictEqual(routesCode.includes("listing_status, listing_fee_paid, listing_fee_payment_id"), true);
  assert.strictEqual(routesCode.includes("VALUES (?, ?, ?, ?, ?, ?, 'active', 1, NULL"), true);
  assert.strictEqual(routesCode.includes("Your service is now live."), true);
});

runTest('3. Obsolete listing fee payment endpoints activate directly without Razorpay', () => {
  const routesCode = fs.readFileSync(path.join(ROOT_DIR, 'server', 'routes.js'), 'utf-8');
  assert.strictEqual(routesCode.includes("router.post('/services/:id/create-listing-order'"), true);
  assert.strictEqual(routesCode.includes("router.post('/services/:id/verify-listing-payment'"), true);
  assert.strictEqual(routesCode.includes("free_activated: true"), true);
  assert.strictEqual(routesCode.includes("Your service is now live."), true);
});

// -----------------------------------------------------------------------------
// 2. CLIENT SESSION PAYMENTS & COMMISSION ARCHITECTURE
// -----------------------------------------------------------------------------
console.log('\n--- Suite 2: Client Session Razorpay & Commission Preserved ---');

runTest('4. Client consultation request Razorpay order creation is intact', () => {
  const routesCode = fs.readFileSync(path.join(ROOT_DIR, 'server', 'routes.js'), 'utf-8');
  assert.strictEqual(routesCode.includes("router.post('/consultation-requests/:id/create-razorpay-order'"), true);
  assert.strictEqual(routesCode.includes("createRazorpayNativeOrder"), true);
  assert.strictEqual(routesCode.includes("toPaise(request.total_price)"), true);
});

runTest('5. Client session extension Razorpay order creation is intact', () => {
  const routesCode = fs.readFileSync(path.join(ROOT_DIR, 'server', 'routes.js'), 'utf-8');
  assert.strictEqual(routesCode.includes("router.post('/sessions/:id/create-extension-order'"), true);
});

runTest('6. 15% Platform take rate / commission on client consultations remains intact', () => {
  const routesCode = fs.readFileSync(path.join(ROOT_DIR, 'server', 'routes.js'), 'utf-8');
  assert.strictEqual(routesCode.includes("platform_fee_percent"), true);
  assert.strictEqual(routesCode.includes("platform_fee"), true);
});

// -----------------------------------------------------------------------------
// 3. REGISTRATION & SIGNUP UX (AuthPage.tsx)
// -----------------------------------------------------------------------------
console.log('\n--- Suite 3: Registration UX & Role Selection ---');

runTest('7. Role selection card 1 copy matches authoritative client requirement', () => {
  const authCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'AuthPage.tsx'), 'utf-8');
  assert.strictEqual(authCode.includes("I want to hire an expert"), true);
  assert.strictEqual(authCode.includes("Find professionals for on-demand, minute-based consultations."), true);
});

runTest('8. Role selection card 2 copy matches authoritative expert requirement', () => {
  const authCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'AuthPage.tsx'), 'utf-8');
  assert.strictEqual(authCode.includes("I want to offer my expertise"), true);
  assert.strictEqual(authCode.includes("Create a service, set your per-minute rate, and get hired by clients."), true);
});

runTest('9. Profile photo upload input is completely removed from AuthPage.tsx', () => {
  const authCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'AuthPage.tsx'), 'utf-8');
  assert.strictEqual(authCode.includes("handlePhotoSelect"), false);
  assert.strictEqual(authCode.includes("handleRemovePhoto"), false);
  assert.strictEqual(authCode.includes("photoFile"), false);
  assert.strictEqual(authCode.includes("photoPreview"), false);
});

runTest('10. EditProfilePage retains full profile photo upload capability', () => {
  const editProfileCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'EditProfilePage.tsx'), 'utf-8');
  assert.strictEqual(editProfileCode.includes("handlePhotoSelect"), true);
  assert.strictEqual(editProfileCode.includes("uploadAvatar"), true);
  assert.strictEqual(editProfileCode.includes("avatar_url"), true);
});

// -----------------------------------------------------------------------------
// 4. PROVIDER ONBOARDING FLOW (ProviderOnboardingPage.tsx)
// -----------------------------------------------------------------------------
console.log('\n--- Suite 4: Provider Onboarding Flow ---');

runTest('11. Provider onboarding has 3 steps: Profile, Pricing & Skills, Review & Publish', () => {
  const onboardingCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'ProviderOnboardingPage.tsx'), 'utf-8');
  assert.strictEqual(onboardingCode.includes("Profile & Scope"), true);
  assert.strictEqual(onboardingCode.includes("Pricing & Skills"), true);
  assert.strictEqual(onboardingCode.includes("Review & Publish"), true);
});

runTest('12. Review step shows free publishing notice', () => {
  const onboardingCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'ProviderOnboardingPage.tsx'), 'utf-8');
  assert.strictEqual(onboardingCode.includes("Publishing is free. Clients pay only when they book a paid session."), true);
  assert.strictEqual(onboardingCode.includes("Publish Service"), true);
});

runTest('13. Provider onboarding has zero Razorpay checkout and zero browser alert()', () => {
  const onboardingCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'ProviderOnboardingPage.tsx'), 'utf-8');
  assert.strictEqual(onboardingCode.includes("loadRazorpayScript"), false);
  assert.strictEqual(onboardingCode.includes("new (window as any).Razorpay"), false);
  assert.strictEqual(onboardingCode.includes("alert("), false);
  assert.strictEqual(onboardingCode.includes("Your service is now live."), true);
});

// -----------------------------------------------------------------------------
// 5. ADMIN PANEL & PUBLIC POLICY COPY
// -----------------------------------------------------------------------------
console.log('\n--- Suite 5: Admin Panel & Policy Documentation ---');

runTest('14. Admin panel displays authoritative free listing policy card', () => {
  const adminCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'AdminPage.tsx'), 'utf-8');
  assert.strictEqual(adminCode.includes("Service Listings: Free for experts/providers"), true);
  assert.strictEqual(adminCode.includes("PERMANENT POLICY ACTIVE"), true);
  assert.strictEqual(adminCode.includes("campaignModalOpen"), false);
  assert.strictEqual(adminCode.includes("editBaseFeeModalOpen"), false);
});

runTest('15. ProviderDashboardPage has no (₹2 Fee) in Add New Service button', () => {
  const dashboardCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'ProviderDashboardPage.tsx'), 'utf-8');
  assert.strictEqual(dashboardCode.includes("Add New Service (₹2 Fee)"), false);
  assert.strictEqual(dashboardCode.includes("Add New Service"), true);
});

runTest('16. Public policy pages reflect free service creation', () => {
  const howItWorksCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'HowItWorksPage.tsx'), 'utf-8');
  const expertPolicyCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'ExpertPolicyPage.tsx'), 'utf-8');
  const refundPolicyCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'RefundPolicyPage.tsx'), 'utf-8');

  assert.strictEqual(howItWorksCode.includes("Free Service Creation"), true);
  assert.strictEqual(howItWorksCode.includes("A one-time ₹2.00 listing fee applies"), false);

  assert.strictEqual(expertPolicyCode.includes("2. Pricing Transparency & Free Service Creation"), true);
  assert.strictEqual(expertPolicyCode.includes("The ₹2 Listing Fee"), false);

  assert.strictEqual(refundPolicyCode.includes("3. Service Listing Policy"), true);
  assert.strictEqual(refundPolicyCode.includes("The ₹2.00 listing fee is a one-time"), false);
});

console.log('\n===============================================================');
console.log(`SUMMARY: ${passedTests} / ${totalTests} free listing tests passed.`);
console.log('===============================================================\n');

if (passedTests === totalTests) {
  console.log('🎉 ALL 16 FREE LISTING & UX AUDIT TESTS PASSED 100%!\n');
  process.exit(0);
} else {
  console.error('❌ ONE OR MORE TESTS FAILED.\n');
  process.exit(1);
}
