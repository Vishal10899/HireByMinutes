// HireByMinute — Phase 4: Header & Navigation Control Automated Verification Suite
// Tests logo, site name, navigation labels, and navigation ordering lifecycle

// Uses native global fetch available in Node.js 18+

const BASE_URL = 'http://localhost:5000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'vishalkumar75912@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1Agust@1999';

let adminToken = '';

async function runTests() {
  console.log('=============================================================================');
  console.log('🧪 TESTING PHASE 4: HEADER / NAVIGATION CONTROL AUDIT');
  console.log('=============================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // Phase 1: Public Platform Settings Endpoint
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 1: Public Platform Settings Endpoint ---');
    const pubRes = await fetch(`${BASE_URL}/api/platform/settings`);
    assert(pubRes.status === 200, 'GET /api/platform/settings returns HTTP 200');

    const pubData = await pubRes.json();
    assert(typeof pubData.platform_name === 'string', 'Public settings includes platform_name string');
    assert(Array.isArray(pubData.header_navigation), 'Public settings includes header_navigation array');
    assert(pubData.header_navigation.length >= 3, 'header_navigation contains initial items');
    assert(pubData.header_navigation[0].order === 1, 'Initial first item has order === 1');

    // -------------------------------------------------------------------------
    // Phase 2: Admin Authentication
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 2: Admin Authentication ---');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200, 'Admin login succeeded');
    assert(!!loginData.token, 'Admin received valid authentication token');
    adminToken = loginData.token;

    // -------------------------------------------------------------------------
    // Phase 3: Security & Authorization Guard
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 3: Security & Authorization Guard ---');
    const unauthPut = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform_name: 'Hacked Platform' })
    });
    assert(unauthPut.status === 401 || unauthPut.status === 403, 'Unauthenticated PUT /api/admin/settings is blocked (401/403)');

    const unauthReset = await fetch(`${BASE_URL}/api/admin/settings/reset-header-nav`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    assert(unauthReset.status === 401 || unauthReset.status === 403, 'Unauthenticated POST /api/admin/settings/reset-header-nav is blocked (401/403)');

    // -------------------------------------------------------------------------
    // Phase 4: Admin Updates Site Name, Logo, Navigation Labels & Order
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 4: Updating Site Name, Logo, Navigation Labels & Order ---');
    const testCustomNav = [
      { id: 'opportunities', label: 'Explore Opportunities', url: '/opportunities', order: 1, is_visible: true, is_external: false },
      { id: 'services', label: 'Browse Verified Experts', url: '/services', order: 2, is_visible: true, is_external: false },
      { id: 'how-it-works', label: 'Consultation Guide', url: '/#how-it-works', order: 3, is_visible: true, is_external: false },
      { id: 'custom-community', label: 'Global Community', url: 'https://community.hirebyminute.com', order: 4, is_visible: true, is_external: true }
    ];

    const updateRes = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        platform_name: 'HireByMinute Global',
        logo_url: 'https://hirebyminute.com/assets/custom-logo-test.png',
        header_navigation: testCustomNav
      })
    });
    assert(updateRes.status === 200, 'Admin PUT /api/admin/settings returns HTTP 200');

    // Verify on Public Endpoint
    const updatedPubRes = await fetch(`${BASE_URL}/api/platform/settings`);
    const updatedPubData = await updatedPubRes.json();
    assert(updatedPubData.platform_name === 'HireByMinute Global', 'Public platform_name updated to "HireByMinute Global"');
    assert(updatedPubData.logo_url === 'https://hirebyminute.com/assets/custom-logo-test.png', 'Public logo_url updated');
    assert(updatedPubData.header_navigation.length === 4, 'header_navigation now contains 4 items');
    assert(updatedPubData.header_navigation[0].label === 'Explore Opportunities', 'First item label renamed to "Explore Opportunities"');
    assert(updatedPubData.header_navigation[0].order === 1, 'First item order is 1');
    assert(updatedPubData.header_navigation[1].label === 'Browse Verified Experts', 'Second item label renamed to "Browse Verified Experts"');
    assert(updatedPubData.header_navigation[1].order === 2, 'Second item order is 2');
    assert(updatedPubData.header_navigation[3].is_external === true, 'Fourth item flagged as external link');

    // -------------------------------------------------------------------------
    // Phase 5: Re-ordering Navigation Items
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 5: Re-ordering Navigation Items ---');
    const reorderedNav = [
      { id: 'services', label: 'Browse Verified Experts', url: '/services', order: 1, is_visible: true, is_external: false },
      { id: 'opportunities', label: 'Explore Opportunities', url: '/opportunities', order: 2, is_visible: true, is_external: false },
      { id: 'how-it-works', label: 'Consultation Guide', url: '/#how-it-works', order: 3, is_visible: true, is_external: false }
    ];

    const reorderRes = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        header_navigation: reorderedNav
      })
    });
    assert(reorderRes.status === 200, 'Re-ordered navigation update returns HTTP 200');

    const reorderedPubRes = await fetch(`${BASE_URL}/api/platform/settings`);
    const reorderedPubData = await reorderedPubRes.json();
    assert(reorderedPubData.header_navigation[0].id === 'services', 'Order reversed: "services" is now position #1');
    assert(reorderedPubData.header_navigation[1].id === 'opportunities', '"opportunities" is now position #2');

    // -------------------------------------------------------------------------
    // Phase 6: Reset to System Defaults
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 6: Reset to System Defaults ---');
    const resetRes = await fetch(`${BASE_URL}/api/admin/settings/reset-header-nav`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });
    assert(resetRes.status === 200, 'POST /api/admin/settings/reset-header-nav returns HTTP 200');

    // Also restore clean site_name and logo_url to production standard
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        platform_name: 'HireByMinute',
        logo_url: ''
      })
    });

    const resetPubRes = await fetch(`${BASE_URL}/api/platform/settings`);
    const resetPubData = await resetPubRes.json();
    assert(resetPubData.platform_name === 'HireByMinute', 'Site name restored to "HireByMinute"');
    assert(resetPubData.logo_url === '', 'Logo URL reset to empty string (default vector icon)');
    assert(resetPubData.header_navigation.length === 3, 'header_navigation restored to exactly 3 default items');
    assert(resetPubData.header_navigation[0].label === 'Services', 'Default #1 label is "Services"');
    assert(resetPubData.header_navigation[1].label === 'Opportunities', 'Default #2 label is "Opportunities"');
    assert(resetPubData.header_navigation[2].label === 'How It Works', 'Default #3 label is "How It Works"');

  } catch (err) {
    console.error('Unhandled error during audit:', err);
    failed++;
  }

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed}/${passed + failed} checks passed (${Math.round((passed / (passed + failed || 1)) * 100)}%)`);
  console.log('=============================================================================');

  if (failed === 0) {
    console.log('\n🎉 ALL PHASE 4 HEADER / NAVIGATION CONTROL AUDIT CHECKS PASSED!');
    process.exit(0);
  } else {
    console.error('\n❌ SOME CHECKS FAILED.');
    process.exit(1);
  }
}

runTests();
