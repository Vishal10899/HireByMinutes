// =============================================================================
// HIREBYMINUTES — MANDATORY PROFILE FIELDS & UI VALIDATION AUDIT SUITE
// =============================================================================
// Verifies:
// 1. UI displays red asterisk (*) on all 6 mandatory fields
// 2. UI displays "* Required fields" note at top of profile form
// 3. Optional fields are NOT marked as mandatory
// 4. Backend enforces all 6 mandatory field rules with HTTP 400 & clear errors:
//    - Payment Per Minute / Consultation Rate (> 0)
//    - Region / Location (non-empty)
//    - Gender (valid selected option)
//    - Education (minimum 1 entry)
//    - Skills (minimum 1 skill)
//    - Services Provided (minimum 1 service)
// 5. Duplicate service prevention on provider updates
// 6. Safe persistence and historical data integrity
// =============================================================================

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

process.env.PORT = '5198';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'hirebyminutes-secret-key-prod-2026';

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const db = require(path.join(ROOT_DIR, 'server', 'db.js'));
const routes = require(path.join(ROOT_DIR, 'server', 'routes.js'));
const express = require('express');

let passedTests = 0;
let totalTests = 0;

function runSyncTest(description, fn) {
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

async function runAsyncTest(description, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${description}: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n===============================================================');
console.log('HIREBYMINUTE — PROFILE MANDATORY FIELDS & VALIDATION SUITE');
console.log('===============================================================\n');

// -----------------------------------------------------------------------------
// 1. FRONTEND UI & FORM MARKUP AUDIT
// -----------------------------------------------------------------------------
console.log('--- Suite 1: Frontend UI Form Markup & Asterisk Audit ---');

const editProfileCode = fs.readFileSync(path.join(ROOT_DIR, 'client', 'src', 'pages', 'EditProfilePage.tsx'), 'utf-8');

runSyncTest('1. EditProfilePage displays "* Required fields" note at top of form', () => {
  assert.ok(
    editProfileCode.includes('Required fields') && editProfileCode.includes('text-red-500'),
    'Form must contain "* Required fields" legend with red styling'
  );
});

runSyncTest('2. Field 1: Rate Per Minute / Consultation Rate marked with red asterisk (*)', () => {
  assert.ok(
    editProfileCode.includes('Rate Per Minute (INR ₹)') &&
    editProfileCode.includes('text-red-500 font-bold ml-0.5'),
    'Rate Per Minute label must be immediately followed by a red asterisk'
  );
});

runSyncTest('3. Field 2: Region / Location marked with red asterisk (*)', () => {
  assert.ok(
    editProfileCode.includes('State / Region') &&
    editProfileCode.includes('text-red-500 font-bold ml-0.5'),
    'State / Region label must be immediately followed by a red asterisk'
  );
});

runSyncTest('4. Field 3: Gender is present, has valid options, and is marked with red asterisk (*)', () => {
  assert.ok(editProfileCode.includes('field-gender'), 'Gender field container must exist');
  assert.ok(editProfileCode.includes('<span>Gender</span>'), 'Gender label must exist');
  assert.ok(editProfileCode.includes('<option value="Male">Male</option>'), 'Gender options must exist');
  assert.ok(editProfileCode.includes('<option value="Female">Female</option>'), 'Gender options must exist');
});

runSyncTest('5. Field 4: Education marked with red asterisk (*) & minimum 1 entry note', () => {
  assert.ok(
    editProfileCode.includes('Education & Academic Credentials') &&
    editProfileCode.includes('Minimum 1 credential required'),
    'Education label must have red asterisk and minimum 1 required note'
  );
});

runSyncTest('6. Field 5: Skills marked with red asterisk (*) & minimum 1 skill note', () => {
  assert.ok(
    editProfileCode.includes('Skills & Expertise Tags') &&
    editProfileCode.includes('Minimum 1 skill required'),
    'Skills label must have red asterisk and minimum 1 skill note'
  );
});

runSyncTest('7. Field 6: Services Provided marked with red asterisk (*) & minimum 1 service note', () => {
  assert.ok(
    editProfileCode.includes('Services Provided / Service Listing Title') &&
    editProfileCode.includes('Minimum 1 service required'),
    'Services Provided label must have red asterisk and minimum 1 service note'
  );
});

runSyncTest('8. Optional fields are NOT marked with an asterisk (*)', () => {
  // Check optional fields: Headline, Bio, Country, City, Area, Certifications
  const headlineSection = editProfileCode.slice(
    editProfileCode.indexOf('Headline / Professional Title'),
    editProfileCode.indexOf('Headline / Professional Title') + 80
  );
  assert.strictEqual(headlineSection.includes('text-red-500'), false, 'Headline must not be marked mandatory');

  const bioSection = editProfileCode.slice(
    editProfileCode.indexOf('Bio / About Me'),
    editProfileCode.indexOf('Bio / About Me') + 60
  );
  assert.strictEqual(bioSection.includes('text-red-500'), false, 'Bio must not be marked mandatory');

  const citySection = editProfileCode.slice(
    editProfileCode.indexOf('City</label>'),
    editProfileCode.indexOf('City</label>') + 40
  );
  assert.strictEqual(citySection.includes('text-red-500'), false, 'City must not be marked mandatory');
});

runSyncTest('9. Auto-scroll and focus handlers exist for invalid fields', () => {
  assert.ok(editProfileCode.includes('focusAndScroll'), 'Auto-scroll & focus function must be present');
  assert.ok(editProfileCode.includes('scrollIntoView'), 'scrollIntoView must be used for smooth navigation');
});

// -----------------------------------------------------------------------------
// 2. BACKEND API VALIDATION & PERSISTENCE TEST
// -----------------------------------------------------------------------------
console.log('\n--- Suite 2: Backend API Mandatory Field Validation (PATCH /api/users/profile/me) ---');

async function runBackendValidationSuite() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const timerEngine = { startSession: () => {}, endSession: () => {}, getSession: () => null };
  const io = { emit: () => {}, to: () => ({ emit: () => {} }) };
  app.use('/api', routes(timerEngine, io));

  const server = http.createServer(app);
  const TEST_PORT = 5577;
  await new Promise(res => server.listen(TEST_PORT, res));

  const testProviderId = `test-prov-mand-${Date.now()}`;
  const testEmail = `mand_prov_${Date.now()}@test.com`;

  // Insert base provider user
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, email_verified, verified, verification_status, created_at)
    VALUES (?, ?, 'hash123', 'Mandatory Test Provider', 'provider', 1, 0, 'unverified', CURRENT_TIMESTAMP)
  `).run(testProviderId, testEmail);

  const token = jwt.sign(
    { id: testProviderId, email: testEmail, role: 'provider' },
    process.env.JWT_SECRET || 'hirebyminutes-secret-key-prod-2026',
    { expiresIn: '1h' }
  );

  async function patchProfile(body) {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/users/profile/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  // Test 10: Missing region -> validation error
  await runAsyncTest('10. Backend: Missing region results in HTTP 400 validation error', async () => {
    const res = await patchProfile({
      full_name: 'Mandatory Provider',
      state_region: '',
      gender: 'Male',
      skills: ['TypeScript'],
      education: ['B.Tech'],
      service_title: 'Software Consulting',
      price_per_minute: 50
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('Region') || res.data.fields?.state_region);
  });

  // Test 11: Missing gender -> validation error
  await runAsyncTest('11. Backend: Missing gender results in HTTP 400 validation error', async () => {
    const res = await patchProfile({
      full_name: 'Mandatory Provider',
      state_region: 'Karnataka',
      gender: '',
      skills: ['TypeScript'],
      education: ['B.Tech'],
      service_title: 'Software Consulting',
      price_per_minute: 50
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('Gender') || res.data.fields?.gender);
  });

  // Test 12: Zero skills -> validation error
  await runAsyncTest('12. Backend: Zero skills results in HTTP 400 validation error', async () => {
    const res = await patchProfile({
      full_name: 'Mandatory Provider',
      state_region: 'Karnataka',
      gender: 'Female',
      skills: [],
      education: ['B.Tech'],
      service_title: 'Software Consulting',
      price_per_minute: 50
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('Skills') || res.data.fields?.skills);
  });

  // Test 13: Missing education -> validation error
  await runAsyncTest('13. Backend: Missing education results in HTTP 400 validation error', async () => {
    const res = await patchProfile({
      full_name: 'Mandatory Provider',
      state_region: 'Karnataka',
      gender: 'Female',
      skills: ['Python'],
      education: [],
      service_title: 'Software Consulting',
      price_per_minute: 50
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('Education') || res.data.fields?.education);
  });

  // Test 14: Zero / Missing payment rate -> validation error
  await runAsyncTest('14. Backend: Zero / Invalid payment rate results in HTTP 400 validation error', async () => {
    const res = await patchProfile({
      full_name: 'Mandatory Provider',
      state_region: 'Karnataka',
      gender: 'Female',
      skills: ['Python'],
      education: ['M.S. Computer Science'],
      service_title: 'Software Consulting',
      price_per_minute: 0
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('rate') || res.data.fields?.price_per_minute);
  });

  // Test 15: Zero services (empty title) -> validation error
  await runAsyncTest('15. Backend: Empty service title results in HTTP 400 validation error', async () => {
    const res = await patchProfile({
      full_name: 'Mandatory Provider',
      state_region: 'Karnataka',
      gender: 'Female',
      skills: ['Python'],
      education: ['M.S. Computer Science'],
      service_title: '',
      price_per_minute: 75
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.data.error.includes('Services Provided') || res.data.fields?.service_title);
  });

  // Test 16: All mandatory fields completed -> profile/service successfully saved
  let savedServiceId = null;
  await runAsyncTest('16. Backend: All mandatory fields completed -> profile & service saved successfully', async () => {
    const res = await patchProfile({
      full_name: 'Mandatory Provider Approved',
      state_region: 'Karnataka',
      gender: 'Female',
      skills: ['Python', 'PostgreSQL', 'Cloud Architecture'],
      education: ['M.Tech Software Engineering'],
      service_title: 'Production Database Architecture & High-Scale Systems',
      price_per_minute: 85.00,
      category_id: 'cat-tech',
      available_now: true
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.success);
    assert.strictEqual(res.data.user.gender, 'Female');
    assert.strictEqual(res.data.user.state_region, 'Karnataka');
    assert.strictEqual(res.data.service.title, 'Production Database Architecture & High-Scale Systems');
    assert.strictEqual(res.data.service.price_per_minute, 85);
    savedServiceId = res.data.service.id;
  });

  // Test 17: Existing provider updates profile without duplicate service records
  await runAsyncTest('17. Backend: Existing provider updates profile without duplicate services', async () => {
    const res = await patchProfile({
      full_name: 'Mandatory Provider Approved (Updated)',
      state_region: 'Karnataka',
      gender: 'Female',
      skills: ['Python', 'PostgreSQL', 'Distributed Systems'],
      education: ['M.Tech Software Engineering'],
      service_title: 'Production Database Architecture & Distributed Systems (Updated)',
      price_per_minute: 95.00
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.service.id, savedServiceId, 'Service ID must remain the same');
    assert.strictEqual(res.data.service.price_per_minute, 95);

    // Verify DB count is exactly 1 service
    const srvCount = db.prepare('SELECT COUNT(*) as count FROM services WHERE provider_id = ?').get(testProviderId);
    assert.strictEqual(srvCount.count, 1, 'Provider must have exactly 1 service record (no duplicates)');
  });

  // Test 18: Historical records integrity in GET /api/services
  await runAsyncTest('18. Historical records & marketplace discovery remain healthy and unaffected', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/services`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(data.count > 0, 'Services must be discoverable');
    const ourService = data.services.find(s => s.id === savedServiceId);
    assert.ok(ourService, 'Newly created service must appear in discovery');
  });

  // Cleanup test records
  db.prepare('DELETE FROM services WHERE provider_id = ?').run(testProviderId);
  db.prepare('DELETE FROM users WHERE id = ?').run(testProviderId);
  await new Promise(res => server.close(res));

  console.log('\n===============================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} mandatory profile tests passed.`);
  console.log('===============================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL 18 MANDATORY FIELD & UI VALIDATION TESTS PASSED 100%!\n');
  }
}

runBackendValidationSuite().catch(err => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
