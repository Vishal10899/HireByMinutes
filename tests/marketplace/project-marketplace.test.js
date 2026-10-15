// =============================================================================
// HIREBYMINUTES — LONG-TERM PROJECT MARKETPLACE COMPREHENSIVE TEST SUITE
// =============================================================================
// Verifies production-readiness of the Long-Term Project Marketplace (Upwork-style):
// 1. Database schema, tables, indexes, and unique constraints.
// 2. Frontend architecture, pages, routes, and API client methods.
// 3. Client Dashboard dual-entry "What would you like to do?" & "My Projects & Contracts".
// 4. Project creation, discovery feed, filtering, and project details.
// 5. Proposal submission, anti-duplicate uniqueness, anti-self-bid checks.
// 6. Proposal shortlisting, rejection, withdrawal.
// 7. Atomic single-winner hiring transaction and milestone contract creation.
// 8. IDOR authorization protection on proposals and contracts.
// 9. Milestone deliverable submission, revision request, and approval workflow.
// 10. Contract and project completion lifecycle.
// =============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const jwt = require('jsonwebtoken');

process.env.PORT = '5115';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'dev-secret-key-project-marketplace';

const db = require('../../server/db');
const { app } = require('../../server/index');

const PORT = 5115;
const ROOT_DIR = path.resolve(__dirname, '..', '..');

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
      if (isBuffer) {
        req.write(options.body);
      } else {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
    }
    req.end();
  });
}

async function runProjectMarketplaceSuite() {
  console.log('\n======================================================================');
  console.log('HIREBYMINUTES — LONG-TERM PROJECT MARKETPLACE TEST SUITE');
  console.log('======================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function test(desc, fn) {
    totalTests++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${desc}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}`);
      console.error(`     Error: ${err.message}`);
      process.exitCode = 1;
    }
  }

  async function asyncTest(desc, fn) {
    totalTests++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${desc}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}`);
      console.error(`     Error: ${err.message}`);
      process.exitCode = 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Suite 1: Source Code & Architectural Blueprint Audit
  // ---------------------------------------------------------------------------
  console.log('--- Suite 1: Frontend Architecture, Pages & Routes Audit ---');

  const appPath = path.join(ROOT_DIR, 'client', 'src', 'App.tsx');
  assert(fs.existsSync(appPath), 'App.tsx must exist');
  const appCode = fs.readFileSync(appPath, 'utf8');

  const apiPath = path.join(ROOT_DIR, 'client', 'src', 'services', 'api.ts');
  assert(fs.existsSync(apiPath), 'api.ts must exist');
  const apiCode = fs.readFileSync(apiPath, 'utf8');

  const typesPath = path.join(ROOT_DIR, 'client', 'src', 'types', 'index.ts');
  assert(fs.existsSync(typesPath), 'types/index.ts must exist');
  const typesCode = fs.readFileSync(typesPath, 'utf8');

  const clientDashPath = path.join(ROOT_DIR, 'client', 'src', 'pages', 'ClientDashboardPage.tsx');
  assert(fs.existsSync(clientDashPath), 'ClientDashboardPage.tsx must exist');
  const clientDashCode = fs.readFileSync(clientDashPath, 'utf8');

  test('1. App.tsx registers all project marketplace routes', () => {
    assert(appCode.includes('path="/projects"'), 'Must have /projects route');
    assert(appCode.includes('path="/projects/new"'), 'Must have /projects/new route');
    assert(appCode.includes('path="/projects/:id"'), 'Must have /projects/:id route');
    assert(appCode.includes('path="/projects/:id/proposals"'), 'Must have /projects/:id/proposals route');
    assert(appCode.includes('path="/contracts/:id"'), 'Must have /contracts/:id route');
    assert(appCode.includes('ProjectsExplorePage'), 'Must import ProjectsExplorePage');
    assert(appCode.includes('ProjectDetailPage'), 'Must import ProjectDetailPage');
    assert(appCode.includes('ProjectCreatePage'), 'Must import ProjectCreatePage');
    assert(appCode.includes('ProjectProposalsPage'), 'Must import ProjectProposalsPage');
    assert(appCode.includes('ProjectContractPage'), 'Must import ProjectContractPage');
  });

  test('2. api.ts exports all 18 dedicated project & contract endpoints', () => {
    const methods = [
      'createProject', 'getProjects', 'getProject', 'updateProject', 'closeProject', 'getMyProjects',
      'submitProposal', 'getProjectProposals', 'getMyProposals', 'shortlistProposal', 'rejectProposal',
      'withdrawProposal', 'hireProposal', 'getContract', 'getMyContracts', 'submitMilestone',
      'approveMilestone', 'requestMilestoneRevision', 'completeContract'
    ];
    for (const m of methods) {
      assert(apiCode.includes(`${m}:`), `api.ts must export ${m}`);
    }
  });

  test('3. types/index.ts defines comprehensive Project, Proposal, Contract & Milestone models', () => {
    assert(typesCode.includes('export type ProjectStatus'), 'Must declare ProjectStatus');
    assert(typesCode.includes('export type ProposalStatus'), 'Must declare ProposalStatus');
    assert(typesCode.includes('export type ContractStatus'), 'Must declare ContractStatus');
    assert(typesCode.includes('export type MilestoneStatus'), 'Must declare MilestoneStatus');
    assert(typesCode.includes('export interface Project'), 'Must declare Project interface');
    assert(typesCode.includes('export interface ProjectProposal'), 'Must declare ProjectProposal interface');
    assert(typesCode.includes('export interface ProjectMilestone'), 'Must declare ProjectMilestone interface');
    assert(typesCode.includes('export interface ProjectContract'), 'Must declare ProjectContract interface');
  });

  test('4. ClientDashboardPage includes "What would you like to do?" dual entry and "My Projects & Contracts"', () => {
    assert(clientDashCode.includes('What would you like to do?'), 'Must render dual-entry section');
    assert(clientDashCode.includes('Hire an Expert'), 'Must render Hire an Expert card');
    assert(clientDashCode.includes('Post a Project'), 'Must render Post a Project card');
    assert(clientDashCode.includes('My Projects & Contracts'), 'Must render My Projects & Contracts tab');
    assert(clientDashCode.includes('api.getMyProjects()'), 'Must fetch my projects in loadDashboard');
    assert(clientDashCode.includes('api.getMyContracts()'), 'Must fetch my contracts in loadDashboard');
  });

  // ---------------------------------------------------------------------------
  // Suite 2: Database Schema & Invariants Audit
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 2: Database Schema & Table Invariants ---');

  const dbSchemaCode = fs.readFileSync(path.join(ROOT_DIR, 'server', 'db.js'), 'utf8');
  const pgSchemaCode = fs.readFileSync(path.join(ROOT_DIR, 'server', 'scripts', 'initPostgres.js'), 'utf8');

  test('5. Database schemas define projects, proposals, contracts, milestones with constraints', () => {
    assert(dbSchemaCode.includes('CREATE TABLE IF NOT EXISTS projects'), 'SQLite db.js must create projects');
    assert(dbSchemaCode.includes('CREATE TABLE IF NOT EXISTS project_proposals'), 'SQLite db.js must create project_proposals');
    assert(dbSchemaCode.includes('CREATE TABLE IF NOT EXISTS project_contracts'), 'SQLite db.js must create project_contracts');
    assert(dbSchemaCode.includes('CREATE TABLE IF NOT EXISTS project_milestones'), 'SQLite db.js must create project_milestones');
    assert(dbSchemaCode.includes('UNIQUE(project_id, provider_id)'), 'proposals must have UNIQUE(project_id, provider_id)');
    assert(dbSchemaCode.includes('project_id VARCHAR(64) NOT NULL UNIQUE') || dbSchemaCode.includes('UNIQUE(project_id)'), 'contracts must have UNIQUE on project_id');

    assert(pgSchemaCode.includes('CREATE TABLE IF NOT EXISTS projects'), 'initPostgres.js must create projects');
    assert(pgSchemaCode.includes('CREATE TABLE IF NOT EXISTS project_proposals'), 'initPostgres.js must create project_proposals');
    assert(pgSchemaCode.includes('CREATE TABLE IF NOT EXISTS project_contracts'), 'initPostgres.js must create project_contracts');
    assert(pgSchemaCode.includes('CREATE TABLE IF NOT EXISTS project_milestones'), 'initPostgres.js must create project_milestones');
  });

  test('6. SQLite database has active tables for projects, proposals, contracts, milestones', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN ('projects', 'project_proposals', 'project_contracts', 'project_milestones')
    `).all();
    assert.strictEqual(tables.length, 4, 'All 4 project marketplace tables must exist in SQLite');
  });

  // ---------------------------------------------------------------------------
  // Suite 3: API Integration, State Machine & Authorization Lifecycle
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 3: Server API Endpoints, Atomic Hires & Contract Workflows ---');

  return new Promise((resolve) => {
    const server = app.listen(PORT, '127.0.0.1', async () => {
      try {
        const client1Id = 'proj-test-client-1';
        const client2Id = 'proj-test-client-2';
        const provider1Id = 'proj-test-prov-1';
        const provider2Id = 'proj-test-prov-2';

        // Token generation
        const client1Token = jwt.sign({ id: client1Id, email: 'client1@projtest.com', role: 'client' }, process.env.JWT_SECRET);
        const client2Token = jwt.sign({ id: client2Id, email: 'client2@projtest.com', role: 'client' }, process.env.JWT_SECRET);
        const provider1Token = jwt.sign({ id: provider1Id, email: 'prov1@projtest.com', role: 'provider' }, process.env.JWT_SECRET);
        const provider2Token = jwt.sign({ id: provider2Id, email: 'prov2@projtest.com', role: 'provider' }, process.env.JWT_SECRET);

        const authClient1 = { Authorization: `Bearer ${client1Token}` };
        const authClient2 = { Authorization: `Bearer ${client2Token}` };
        const authProv1 = { Authorization: `Bearer ${provider1Token}` };
        const authProv2 = { Authorization: `Bearer ${provider2Token}` };

        // Clean up prior test runs
        db.prepare('DELETE FROM project_milestones WHERE contract_id IN (SELECT id FROM project_contracts WHERE client_id IN (?, ?))').run(client1Id, client2Id);
        db.prepare('DELETE FROM project_contracts WHERE client_id IN (?, ?) OR provider_id IN (?, ?)').run(client1Id, client2Id, provider1Id, provider2Id);
        db.prepare('DELETE FROM project_proposals WHERE provider_id IN (?, ?)').run(provider1Id, provider2Id);
        db.prepare('DELETE FROM projects WHERE client_id IN (?, ?)').run(client1Id, client2Id);
        db.prepare('DELETE FROM users WHERE id IN (?, ?, ?, ?)').run(client1Id, client2Id, provider1Id, provider2Id);

        // Seed users
        const seedUser = db.prepare(`
          INSERT INTO users (id, email, username, password_hash, full_name, role, email_verified, verified)
          VALUES (?, ?, ?, 'hash', ?, ?, 1, 1)
        `);
        seedUser.run(client1Id, 'client1@projtest.com', 'client_1', 'Rohan Mehta', 'client');
        seedUser.run(client2Id, 'client2@projtest.com', 'client_2', 'Neha Sharma', 'client');
        seedUser.run(provider1Id, 'prov1@projtest.com', 'prov_1', 'Kavita Iyer', 'provider');
        seedUser.run(provider2Id, 'prov2@projtest.com', 'prov_2', 'Arjun Verma', 'provider');

        let createdProjectId = null;
        let proposal1Id = null;
        let proposal2Id = null;
        let createdContractId = null;
        let createdMilestoneIds = [];

        // 7. POST /api/projects - Client creates project
        await asyncTest('7. Client creates a milestone project via POST /api/projects', async () => {
          const res = await makeRequest('/api/projects', {
            method: 'POST',
            headers: authClient1,
            body: {
              title: 'Full-Stack Fintech Mobile Application',
              description: 'We need an experienced React Native and Node.js architect to build our KYC and transaction flow.',
              category_id: 'cat-tech',
              project_type: 'fixed',
              budget_type: 'fixed',
              budget_fixed: 85000,
              experience_level: 'expert',
              duration_estimate: '1-3 months',
              deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
              skills_required: ['React Native', 'Node.js', 'PostgreSQL', 'Fintech'],
              screening_questions: ['Have you integrated Indian payment systems before?', 'Share your GitHub or portfolio.']
            }
          });

          assert.strictEqual(res.status, 201, `Expected 201 Created, got ${res.status}: ${res.rawText}`);
          assert.strictEqual(res.data.success, true);
          assert(res.data.project && res.data.project.id);
          assert.strictEqual(res.data.project.status, 'OPEN');
          assert.strictEqual(res.data.project.budget_fixed, 85000);
          createdProjectId = res.data.project.id;
        });

        // 8. GET /api/projects - Discovery Feed & Filtering
        await asyncTest('8. Public project discovery feed returns open projects with category and text filters', async () => {
          const res = await makeRequest(`/api/projects?search=Fintech&category=cat-tech`);
          assert.strictEqual(res.status, 200);
          assert(Array.isArray(res.data.projects));
          const match = res.data.projects.find(p => p.id === createdProjectId);
          assert(match, 'Feed must return the created fintech project');
          assert.strictEqual(match.title, 'Full-Stack Fintech Mobile Application');
          assert.strictEqual(match.status, 'OPEN');
        });

        // 9. GET /api/projects/:id - Detailed view
        await asyncTest('9. GET /api/projects/:id returns full specification and owner status', async () => {
          const res = await makeRequest(`/api/projects/${createdProjectId}`, {
            headers: authClient1
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.project.id, createdProjectId);
          assert.strictEqual(res.data.project.is_owner, true);
          assert(Array.isArray(res.data.project.screening_questions));
          assert.strictEqual(res.data.project.screening_questions.length, 2);
        });

        // 10. Anti-Self-Hire: Client cannot submit proposal to own project
        await asyncTest('10. Client cannot submit a proposal to their own project', async () => {
          const res = await makeRequest(`/api/projects/${createdProjectId}/proposals`, {
            method: 'POST',
            headers: authClient1,
            body: {
              cover_letter: 'I want to do this myself.',
              bid_amount: 50000
            }
          });
          assert.strictEqual(res.status, 400, 'Owner bid should be rejected with 400');
          assert(res.rawText.includes('cannot submit a proposal to your own project'));
        });

        // 11. Provider 1 submits proposal with milestones
        await asyncTest('11. Provider 1 submits a proposal with proposed milestones', async () => {
          const res = await makeRequest(`/api/projects/${createdProjectId}/proposals`, {
            method: 'POST',
            headers: authProv1,
            body: {
              cover_letter: 'I have 7 years of mobile fintech engineering experience including UPI and Aadhaar eKYC integrations.',
              bid_amount: 80000,
              estimated_duration: '6 weeks',
              screening_answers: [
                { question: 'Have you integrated Indian payment systems before?', answer: 'Yes, integrated Razorpay and NPCI UPI gateway.' },
                { question: 'Share your GitHub or portfolio.', answer: 'https://github.com/kavita-dev' }
              ],
              proposed_milestones: [
                { title: 'Milestone 1: Architecture & KYC Flow', amount: 35000, due_date: new Date(Date.now() + 14 * 86400000).toISOString() },
                { title: 'Milestone 2: Payments & Core Transactions', amount: 45000, due_date: new Date(Date.now() + 30 * 86400000).toISOString() }
              ]
            }
          });

          assert.strictEqual(res.status, 201, `Expected 201 Created, got ${res.status}: ${res.rawText}`);
          assert.strictEqual(res.data.success, true);
          assert(res.data.proposal && res.data.proposal.id);
          assert.strictEqual(res.data.proposal.status, 'SUBMITTED');
          assert.strictEqual(res.data.proposal.bid_amount, 80000);
          proposal1Id = res.data.proposal.id;
        });

        // 12. Duplicate Prevention: Provider 1 submitting a second proposal is rejected
        await asyncTest('12. Duplicate proposal submission by the same specialist is strictly rejected', async () => {
          const res = await makeRequest(`/api/projects/${createdProjectId}/proposals`, {
            method: 'POST',
            headers: authProv1,
            body: {
              cover_letter: 'Second duplicate proposal attempt.',
              bid_amount: 75000
            }
          });
          assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
          assert(res.rawText.includes('already submitted a proposal'));
        });

        // 13. Provider 2 submits a competing proposal
        await asyncTest('13. Provider 2 submits competing proposal', async () => {
          const res = await makeRequest(`/api/projects/${createdProjectId}/proposals`, {
            method: 'POST',
            headers: authProv2,
            body: {
              cover_letter: 'Full stack engineer ready to build your fintech MVP quickly.',
              bid_amount: 70000,
              estimated_duration: '4 weeks',
              proposed_milestones: [
                { title: 'Full MVP Delivery', amount: 70000 }
              ]
            }
          });
          assert.strictEqual(res.status, 201);
          proposal2Id = res.data.proposal.id;
        });

        // 14. IDOR Protection: Non-owner Client 2 cannot list proposals for Client 1's project
        await asyncTest('14. IDOR Protection: Non-owner client cannot view proposals for another client\'s project', async () => {
          const res = await makeRequest(`/api/projects/${createdProjectId}/proposals`, {
            headers: authClient2
          });
          assert.strictEqual(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
          assert(res.rawText.includes('Only the project owner can view proposals'));
        });

        // 15. Client 1 lists proposals
        await asyncTest('15. Project owner can view all submitted candidate proposals with screening answers', async () => {
          const res = await makeRequest(`/api/projects/${createdProjectId}/proposals`, {
            headers: authClient1
          });
          assert.strictEqual(res.status, 200);
          assert(Array.isArray(res.data.proposals));
          assert.strictEqual(res.data.proposals.length, 2);
        });

        // 16. Shortlist Provider 1
        await asyncTest('16. Client shortlists candidate proposal via POST /api/proposals/:id/shortlist', async () => {
          const res = await makeRequest(`/api/proposals/${proposal1Id}/shortlist`, {
            method: 'POST',
            headers: authClient1
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.proposal.status, 'SHORTLISTED');
        });

        // 17. Provider 2 withdraws proposal
        await asyncTest('17. Provider 2 can withdraw their proposal before hiring', async () => {
          const res = await makeRequest(`/api/proposals/${proposal2Id}/withdraw`, {
            method: 'POST',
            headers: authProv2
          });
          assert.strictEqual(res.status, 200);
          assert.strictEqual(res.data.proposal.status, 'WITHDRAWN');
        });

        // 18. Atomic Single-Winner Hire Action
        await asyncTest('18. Atomic Hire: Creates contract, seeds milestones, sets project IN_PROGRESS, marks HIRED', async () => {
          const res = await makeRequest(`/api/proposals/${proposal1Id}/hire`, {
            method: 'POST',
            headers: authClient1,
            body: {
              milestones: [
                { title: 'Milestone 1: Architecture & KYC Flow', amount: 35000, description: 'Wireframes, schema, and Aadhaar flow' },
                { title: 'Milestone 2: Payments & Core Transactions', amount: 45000, description: 'UPI integration and automated testing' }
              ]
            }
          });

          assert([200, 201].includes(res.status), `Expected 200 or 201 Created, got ${res.status}: ${res.rawText}`);
          assert.strictEqual(res.data.success, true);
          assert(res.data.contract && res.data.contract.id);
          assert.strictEqual(res.data.contract.status, 'ACTIVE');
          assert.strictEqual(res.data.contract.agreed_amount, 80000);
          createdContractId = res.data.contract.id;
          createdMilestoneIds = (res.data.contract.milestones || []).map(m => m.id);
          assert(createdMilestoneIds.length >= 1, 'Contract must have milestones');

          // Verify project status is now IN_PROGRESS
          const projCheck = db.prepare('SELECT status FROM projects WHERE id = ?').get(createdProjectId);
          assert.strictEqual(projCheck.status, 'IN_PROGRESS');

          // Verify winning proposal status is HIRED
          const propCheck = db.prepare('SELECT status FROM project_proposals WHERE id = ?').get(proposal1Id);
          assert.strictEqual(propCheck.status, 'HIRED');
        });

        // 19. Single-Winner Invariant Enforcement: Cannot hire another proposal for same project
        await asyncTest('19. Single-Winner Invariant: Attempting to hire another proposal on an in-progress project fails', async () => {
          const res = await makeRequest(`/api/proposals/${proposal2Id}/hire`, {
            method: 'POST',
            headers: authClient1
          });
          assert.strictEqual(res.status, 400);
          assert(res.rawText.includes('Cannot hire') || res.rawText.includes('IN_PROGRESS') || res.rawText.includes('already'));
        });

        // 20. Contract Workspace & Access Control
        await asyncTest('20. Contract workspace enforces strict participant authorization', async () => {
          // Client 1 (owner) can view
          const resClient = await makeRequest(`/api/contracts/${createdContractId}`, {
            headers: authClient1
          });
          assert.strictEqual(resClient.status, 200);
          assert.strictEqual(resClient.data.contract.id, createdContractId);

          // Provider 1 (hired specialist) can view
          const resProv = await makeRequest(`/api/contracts/${createdContractId}`, {
            headers: authProv1
          });
          assert.strictEqual(resProv.status, 200);

          // Client 2 (unrelated third party) is rejected with 403 Forbidden
          const resStranger = await makeRequest(`/api/contracts/${createdContractId}`, {
            headers: authClient2
          });
          assert.strictEqual(resStranger.status, 403);
        });

        // 21. Milestone Workflow: Submission -> Revision Request -> Re-submission -> Approval
        await asyncTest('21. Milestone Workflow: Submission, Revision Request, Re-submission & Approval', async () => {
          const m1Id = createdMilestoneIds[0];

          // Provider 1 submits deliverables for milestone 1
          const submitRes = await makeRequest(`/api/contracts/${createdContractId}/milestones/${m1Id}/submit`, {
            method: 'POST',
            headers: authProv1,
            body: {
              deliverable_notes: 'Completed architecture diagrams and initial KYC endpoint integration.',
              deliverable_url: 'https://github.com/client-org/fintech-app/pull/1'
            }
          });
          assert.strictEqual(submitRes.status, 200);
          assert.strictEqual(submitRes.data.milestone.status, 'SUBMITTED');

          // Client requests revision with feedback
          const revisionRes = await makeRequest(`/api/contracts/${createdContractId}/milestones/${m1Id}/request-revision`, {
            method: 'POST',
            headers: authClient1,
            body: {
              revision_feedback: 'Please add unit tests for the error fallback path when KYC service returns timeout.'
            }
          });
          assert.strictEqual(revisionRes.status, 200);
          assert.strictEqual(revisionRes.data.milestone.status, 'REVISION_REQUESTED');
          assert.strictEqual(revisionRes.data.contract.status, 'REVISION_REQUESTED');

          // Provider re-submits with unit tests
          const resubmitRes = await makeRequest(`/api/contracts/${createdContractId}/milestones/${m1Id}/submit`, {
            method: 'POST',
            headers: authProv1,
            body: {
              deliverable_notes: 'Added comprehensive test suite covering all timeout conditions.',
              deliverable_url: 'https://github.com/client-org/fintech-app/pull/1'
            }
          });
          assert.strictEqual(resubmitRes.status, 200);
          assert.strictEqual(resubmitRes.data.milestone.status, 'SUBMITTED');

          // Client approves milestone 1
          const approveRes = await makeRequest(`/api/contracts/${createdContractId}/milestones/${m1Id}/approve`, {
            method: 'POST',
            headers: authClient1
          });
          assert.strictEqual(approveRes.status, 200);
          assert.strictEqual(approveRes.data.milestone.status, 'APPROVED');
        });

        // 22. Contract Auto-Completion upon all milestones approved
        await asyncTest('22. Completing all milestones marks contract and project as COMPLETED', async () => {
          const m2Id = createdMilestoneIds[1];

          // Provider submits milestone 2
          await makeRequest(`/api/contracts/${createdContractId}/milestones/${m2Id}/submit`, {
            method: 'POST',
            headers: authProv1,
            body: {
              deliverable_notes: 'Final payments and UPI gateway deliverable complete.',
              deliverable_url: 'https://github.com/client-org/fintech-app/releases/tag/v1.0'
            }
          });

          // Client approves milestone 2
          const approveRes = await makeRequest(`/api/contracts/${createdContractId}/milestones/${m2Id}/approve`, {
            method: 'POST',
            headers: authClient1
          });
          assert.strictEqual(approveRes.status, 200);
          assert.strictEqual(approveRes.data.contract.status, 'COMPLETED');

          // Verify project is marked COMPLETED
          const finalProj = db.prepare('SELECT status FROM projects WHERE id = ?').get(createdProjectId);
          assert.strictEqual(finalProj.status, 'COMPLETED');
        });

        // 23. Aggregated Views: GET /api/my/projects and GET /api/my/contracts
        await asyncTest('23. Client and Provider personal management feeds return projects and contracts', async () => {
          const myProjectsRes = await makeRequest('/api/my/projects', { headers: authClient1 });
          assert.strictEqual(myProjectsRes.status, 200);
          assert(myProjectsRes.data.projects.some(p => p.id === createdProjectId));

          const myContractsRes = await makeRequest('/api/my/contracts', { headers: authClient1 });
          assert.strictEqual(myContractsRes.status, 200);
          assert(myContractsRes.data.contracts.some(c => c.id === createdContractId));

          const providerContractsRes = await makeRequest('/api/my/contracts', { headers: authProv1 });
          assert.strictEqual(providerContractsRes.status, 200);
          assert(providerContractsRes.data.contracts.some(c => c.id === createdContractId));
        });

        // 24. Contract Review: Client submits review for completed contract
        await asyncTest('24. Client submits rating and review for completed contract via POST /api/contracts/:id/review', async () => {
          const reviewRes = await makeRequest(`/api/contracts/${createdContractId}/review`, {
            method: 'POST',
            headers: authClient1,
            body: {
              rating: 5,
              comment: 'Outstanding technical execution! Delivered clean, robust architecture on time.'
            }
          });
          assert.strictEqual(reviewRes.status, 200);
          assert.strictEqual(reviewRes.data.contract.client_rating, 5);
          assert.strictEqual(reviewRes.data.contract.client_review, 'Outstanding technical execution! Delivered clean, robust architecture on time.');

          // Verify provider's aggregate rating and review count were updated
          const updatedProv = db.prepare('SELECT rating, review_count FROM users WHERE id = ?').get(provider1Id);
          assert.strictEqual(updatedProv.review_count, 1);
          assert.strictEqual(updatedProv.rating, 5.0);
        });

        // 25. Contract Review Security: Non-client and duplicate review rejection
        await asyncTest('25. Contract review security strictly rejects non-clients, duplicates, and invalid ratings', async () => {
          // Provider attempts to review their own contract
          const provReviewRes = await makeRequest(`/api/contracts/${createdContractId}/review`, {
            method: 'POST',
            headers: authProv1,
            body: { rating: 5, comment: 'I did a great job!' }
          });
          assert.strictEqual(provReviewRes.status, 403);

          // Duplicate review by client
          const duplicateReviewRes = await makeRequest(`/api/contracts/${createdContractId}/review`, {
            method: 'POST',
            headers: authClient1,
            body: { rating: 4, comment: 'Second review attempt' }
          });
          assert.strictEqual(duplicateReviewRes.status, 400);

          // Invalid rating (> 5)
          const invalidRatingRes = await makeRequest(`/api/contracts/${createdContractId}/review`, {
            method: 'POST',
            headers: authClient2,
            body: { rating: 10, comment: 'Invalid rating value' }
          });
          assert(invalidRatingRes.status === 400 || invalidRatingRes.status === 403);
        });

        // 26. Project Editing: PATCH /api/projects/:id permitted updates
        await asyncTest('26. Project owner can edit permitted scope and budget fields of an open project', async () => {
          // Create an open project with client 2
          const newProjRes = await makeRequest('/api/projects', {
            method: 'POST',
            headers: authClient2,
            body: {
              title: 'Mobile App Architecture Spec - Initial',
              description: 'Initial architecture specification for microservices migration and real-time pub/sub.',
              budget_type: 'fixed',
              budget_min: 15000,
              skills: ['Node.js', 'Redis'],
              status: 'OPEN'
            }
          });
          assert.strictEqual(newProjRes.status, 201);
          const editProjId = newProjRes.data.project.id;

          // Edit project description, budget, and deliverables
          const editRes = await makeRequest(`/api/projects/${editProjId}`, {
            method: 'PATCH',
            headers: authClient2,
            body: {
              title: 'Mobile App Architecture Spec - Revised',
              budget_max: 20000,
              deliverables: ['System Diagrams', 'Security Threat Model']
            }
          });
          assert.strictEqual(editRes.status, 200);
          assert.strictEqual(editRes.data.project.title, 'Mobile App Architecture Spec - Revised');
          assert.strictEqual(editRes.data.project.deliverables.length, 2);

          // Non-owner client 1 cannot edit client 2's project
          const unauthorizedEdit = await makeRequest(`/api/projects/${editProjId}`, {
            method: 'PATCH',
            headers: authClient1,
            body: { title: 'Hacked Title' }
          });
          assert.strictEqual(unauthorizedEdit.status, 403);
        });

        console.log('\n======================================================================');
        console.log(`PROJECT MARKETPLACE SUITE RESULT: ${passedTests}/${totalTests} Tests Passed`);
        console.log('======================================================================\n');

        if (passedTests === totalTests) {
          console.log('🎉 ALL PROJECT MARKETPLACE TESTS PASSED 100%!\n');
          server.close(() => {
            process.exit(0);
          });
        } else {
          console.error('❌ SOME PROJECT MARKETPLACE TESTS FAILED.');
          server.close(() => {
            process.exit(1);
          });
        }
      } catch (err) {
        console.error('Fatal test error:', err);
        server.close(() => {
          process.exitCode = 1;
          resolve(false);
        });
      }
    });
  });
}

runProjectMarketplaceSuite().then(success => {
  if (!success) {
    process.exit(1);
  }
});
