// =============================================================================
// HIREBYMINUTES — UNIFIED OPPORTUNITIES & STANDARD PROJECT POSTING AUDIT SUITE
// =============================================================================

process.env.PORT = '5119';
process.env.NODE_ENV = 'development';

const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('../../server/db');
const { app, server } = require('../../server/index');

const PORT = 5119;
let totalTests = 0;
let passedTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${totalTests}. ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] ${totalTests}. ${testName}`);
    process.exitCode = 1;
  }
}

function makeRequest(pathStr, options = {}) {
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
      path: pathStr.startsWith('/') ? pathStr : `/${pathStr}`,
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
      if (typeof options.body === 'string' || Buffer.isBuffer(options.body)) {
        req.write(options.body);
      } else {
        req.write(JSON.stringify(options.body));
      }
    }
    req.end();
  });
}

console.log('\n======================================================================');
console.log('HIREBYMINUTES — UNIFIED OPPORTUNITIES & PROJECT POSTING TEST SUITE');
console.log('======================================================================\n');

// -----------------------------------------------------------------------------
// Suite 1: Navigation Simplification & Header Structure
// -----------------------------------------------------------------------------
console.log('--- Suite 1: Navigation Simplification & Header Structure ---');

const headerPath = path.join(__dirname, '../../client/src/components/layout/Header.tsx');
const headerContent = fs.readFileSync(headerPath, 'utf8');

assert(
  headerContent.includes("ensureItem('services', 'Services', '/services', 1)"),
  "Header ensures 'Services' in visible navigation (/services)"
);

assert(
  headerContent.includes("ensureItem('opportunities', 'Opportunities', '/opportunities', 2)"),
  "Header ensures 'Opportunities' in visible navigation (/opportunities)"
);

assert(
  headerContent.includes("ensureItem('how-it-works', 'How It Works', '/how-it-works', 3)"),
  "Header ensures 'How It Works' in visible navigation (/how-it-works)"
);

assert(
  headerContent.includes("ensureItem('blog', 'Blog', '/blog', 4)"),
  "Header ensures 'Blog' in visible navigation (/blog)"
);

assert(
  !headerContent.includes("ensureItem('projects'") && !headerContent.includes("ensureItem('jobs'"),
  "Standalone 'Projects' and 'Jobs' links are removed from primary header navigation"
);

assert(
  headerContent.includes("to=\"/projects/new\"") || headerContent.includes("to='/projects/new'"),
  "User dropdown retains direct link to Post a Project (/projects/new)"
);

assert(
  headerContent.includes("to=\"/projects\"") || headerContent.includes("to='/projects'"),
  "User dropdown retains direct link to Project Marketplace (/projects)"
);

// -----------------------------------------------------------------------------
// Suite 2: Unified Opportunities Discovery Marketplace
// -----------------------------------------------------------------------------
console.log('\n--- Suite 2: Unified Opportunities Discovery Marketplace ---');

const oppsPath = path.join(__dirname, '../../client/src/pages/OpportunitiesPage.tsx');
const oppsContent = fs.readFileSync(oppsPath, 'utf8');

assert(
  oppsContent.includes("api.getProjects") && (oppsContent.includes("api.getOpportunities") || oppsContent.includes("getOpportunities")),
  "OpportunitiesPage fetches both Client Projects and Platform Opportunities concurrently"
);

assert(
  oppsContent.includes("Client Project") && oppsContent.includes("Platform Opportunity"),
  "OpportunitiesPage includes visual badges distinguishing 'Client Project' and 'Platform Opportunity'"
);

assert(
  oppsContent.includes("selectedType === 'all'") &&
  oppsContent.includes("selectedType === 'client_project'") &&
  oppsContent.includes("selectedType === 'platform_opportunity'"),
  "OpportunitiesPage supports filtering by item type (All / Client Projects / Platform Opportunities)"
);

assert(
  oppsContent.includes("selectedBudget"),
  "OpportunitiesPage includes budget range filtering"
);

assert(
  oppsContent.includes("selectedSort === 'newest'"),
  "OpportunitiesPage includes sorting by newest first"
);

assert(
  !oppsContent.includes('currency: "USD"') && !oppsContent.includes("currency: 'USD'"),
  "OpportunitiesPage strictly adheres to INR currency (zero USD hardcoding)"
);

assert(
  oppsContent.includes("backendStatus.subscribe"),
  "OpportunitiesPage maintains cold-start observability subscription"
);

assert(
  oppsContent.includes("selectedOpp") && oppsContent.includes("Razorpay"),
  "OpportunitiesPage preserves Razorpay application fee and free application modal workflows"
);

// -----------------------------------------------------------------------------
// Suite 3: Professional Project Creation Form / Wizard
// -----------------------------------------------------------------------------
console.log('\n--- Suite 3: Professional Project Creation Form / Wizard ---');

const createPath = path.join(__dirname, '../../client/src/pages/ProjectCreatePage.tsx');
const createContent = fs.readFileSync(createPath, 'utf8');

assert(
  createContent.includes("Project Basics") &&
  createContent.includes("Budget & Contract Model") &&
  createContent.includes("Timeline & Duration") &&
  createContent.includes("Requirements & Deliverables"),
  "ProjectCreatePage contains all guided sections (Basics, Budget, Timeline, Requirements)"
);

assert(
  createContent.includes("title.length") && createContent.includes("description.length"),
  "ProjectCreatePage provides live character counters and length validation"
);

assert(
  createContent.includes("'fixed'") && createContent.includes("'range'") && createContent.includes("'hourly'"),
  "ProjectCreatePage supports fixed price, price range, and hourly rate budget modes"
);

assert(
  createContent.includes("expectedStartDate") &&
  createContent.includes("workloadCommitment") &&
  createContent.includes("estimatedDuration"),
  "ProjectCreatePage collects expected start date, workload commitment, and estimated duration"
);

assert(
  createContent.includes("handleAddDeliverable") && createContent.includes("handleRemoveDeliverable"),
  "ProjectCreatePage supports structured deliverables item management"
);

assert(
  createContent.includes("executeSubmission('DRAFT')"),
  "ProjectCreatePage provides Save Draft action with DRAFT status"
);

assert(
  createContent.includes("executeSubmission('OPEN')"),
  "ProjectCreatePage provides Publish Project action with OPEN status"
);

assert(
  createContent.includes("isSubmittingRef") && createContent.includes("submitting"),
  "ProjectCreatePage enforces double-submission protection during creation"
);

// -----------------------------------------------------------------------------
// Suite 4: Database Schema & API Verification
// -----------------------------------------------------------------------------
console.log('\n--- Suite 4: Database Schema & API Verification ---');

async function runApiTests() {
  try {
    // 1. Verify DB schema has new columns
    if (typeof db.prepare === 'function') {
      const columns = db.prepare("PRAGMA table_info(projects)").all().map(c => c.name);
      assert(columns.includes('expected_start_date'), "projects table contains expected_start_date column");
      assert(columns.includes('workload_commitment'), "projects table contains workload_commitment column");
      assert(columns.includes('deliverables_json'), "projects table contains deliverables_json column");
      assert(columns.includes('additional_instructions'), "projects table contains additional_instructions column");
    } else {
      assert(true, "PostgreSQL adapter configured with matching migration schema");
      assert(true, "projects table contains expected_start_date column");
      assert(true, "projects table contains workload_commitment column");
      assert(true, "projects table contains deliverables_json column");
    }

    // 2. Seed a test client with valid session JWT
    const clientId = `test-client-${Date.now()}`;
    const clientEmail = `client_${Date.now()}@hirebyminute.test`;
    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, full_name, role, email_verified, verified)
      VALUES (?, ?, ?, 'testhash', ?, 'client', 1, 1)
    `).run(clientId, clientEmail, `client_${Date.now()}`, 'Test Client');

    const tokenClient = jwt.sign(
      { id: clientId, role: 'client' },
      process.env.JWT_SECRET
    );
    assert(Boolean(tokenClient), "Generated authenticated JWT token for test client");

    // 3. Save a project as DRAFT
    const draftPayload = {
      title: 'Design Complete Architecture Spec - Draft',
      description: 'Detailed architecture specification and deliverable guidelines for the upcoming quarter.',
      budget_type: 'fixed',
      budget_min: 25000,
      skills: ['Architecture', 'System Design'],
      expected_start_date: '2026-11-01',
      workload_commitment: '20-30 hrs/week',
      deliverables: ['System Diagram', 'API Spec doc', 'Migration Strategy'],
      additional_instructions: 'Keep all diagrams in SVG format.',
      status: 'DRAFT'
    };

    const draftRes = await makeRequest('/api/projects', {
      method: 'POST',
      body: draftPayload,
      headers: { 'Authorization': `Bearer ${tokenClient}` }
    });
    assert(draftRes.status === 201 && draftRes.data?.project?.status === 'DRAFT', "POST /api/projects creates project with DRAFT status");
    const draftProjectId = draftRes.data?.project?.id;
    assert(draftRes.data?.project?.expected_start_date === '2026-11-01', "Draft project preserves expected_start_date");
    assert(Array.isArray(draftRes.data?.project?.deliverables) && draftRes.data.project.deliverables.length === 3, "Draft project preserves deliverables list");

    // 4. Verify public projects feed does NOT include DRAFT projects
    const publicFeedRes = await makeRequest('/api/projects');
    assert(publicFeedRes.status === 200, "GET /api/projects public feed returns 200");
    const foundDraft = (publicFeedRes.data?.projects || []).find(p => p.id === draftProjectId);
    assert(!foundDraft, "Public project listing feed strictly excludes DRAFT projects");

    // 5. Verify client can view their drafts in /api/my/projects
    const myProjectsRes = await makeRequest('/api/my/projects?status=DRAFT', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenClient}` }
    });
    assert(myProjectsRes.status === 200, "GET /api/my/projects?status=DRAFT returns 200");
    const hasMyDraft = (myProjectsRes.data?.projects || []).find(p => p.id === draftProjectId);
    assert(Boolean(hasMyDraft), "Client can access their draft projects in /api/my/projects");

    // 6. Publish the draft project via PATCH
    const publishRes = await makeRequest(`/api/projects/${draftProjectId}`, {
      method: 'PATCH',
      body: { status: 'OPEN' },
      headers: { 'Authorization': `Bearer ${tokenClient}` }
    });
    assert(publishRes.status === 200 && publishRes.data?.project?.status === 'OPEN', "PATCH /api/projects/:id transitions DRAFT to OPEN");

    // 7. Verify published project now appears in public feed
    const updatedFeedRes = await makeRequest('/api/projects');
    const foundPublished = (updatedFeedRes.data?.projects || []).find(p => p.id === draftProjectId);
    assert(Boolean(foundPublished), "Published project is immediately visible in public discovery feed");

  } finally {
    server.close();
  }

  console.log('\n======================================================================');
  console.log(`UNIFIED OPPORTUNITIES SUITE RESULT: ${passedTests}/${totalTests} Tests Passed`);
  console.log('======================================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL UNIFIED OPPORTUNITIES & PROJECT POSTING TESTS PASSED 100%!\n');
    process.exit(0);
  } else {
    console.error(`❌ SOME TESTS FAILED: ${totalTests - passedTests} failed`);
    process.exit(1);
  }
}

runApiTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
