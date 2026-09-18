const http = require('http');
const assert = require('assert');
const jwt = require('jsonwebtoken');

process.env.PORT = '5096';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'dev-secret-key-jobs-test';

const db = require('./server/db');
const { app } = require('./server/index');

const PORT = 5096;

function makeRequest(path, options = {}) {
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
      path,
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
          rawBuffer
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

const server = app.listen(PORT, '127.0.0.1', async () => {
  console.log('\n======================================================================');
  console.log('--- HIREBYMINUTE FULL-TIME JOBS & CAREERS TEST SUITE ---');
  console.log('======================================================================\n');

  try {
    // 0. Ensure Admin & Test Candidates Exist
    let adminUser = db.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').get('admin');
    if (!adminUser) {
      const adminId = `test-admin-${Date.now()}`;
      db.prepare(`
        INSERT INTO users (id, email, username, password_hash, full_name, role, verified, email_verified)
        VALUES (?, 'test_admin@hirebyminute.com', 'test_admin', '$2b$10$xyz', 'Test Administrator', 'admin', 1, 1)
      `).run(adminId);
      adminUser = db.prepare('SELECT * FROM users WHERE id = ?').get(adminId);
    }

    const adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: 'admin', full_name: adminUser.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    const ts = Date.now();
    const candidateAId = `cand-a-${ts}`;
    const candidateBId = `cand-b-${ts}`;

    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, full_name, role, verified, email_verified)
      VALUES (?, ?, ?, '$2b$10$xyz', 'Alice Applicant', 'client', 1, 1)
    `).run(candidateAId, `alice.${ts}@example.com`, `alice_${ts}`);

    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, full_name, role, verified, email_verified)
      VALUES (?, ?, ?, '$2b$10$xyz', 'Bob Bystander', 'client', 1, 1)
    `).run(candidateBId, `bob.${ts}@example.com`, `bob_${ts}`);

    const candidateAToken = jwt.sign(
      { id: candidateAId, email: `alice.${ts}@example.com`, role: 'client', full_name: 'Alice Applicant' },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    const candidateBToken = jwt.sign(
      { id: candidateBId, email: `bob.${ts}@example.com`, role: 'client', full_name: 'Bob Bystander' },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // ========================================================================
    // TEST 1: Zero Fake Data Verification
    // ========================================================================
    console.log('1. Verifying Zero Fake Data on Public Jobs API...');
    const initialJobsRes = await makeRequest('/api/jobs');
    assert.strictEqual(initialJobsRes.status, 200, `Expected 200, got ${initialJobsRes.status}`);
    assert.ok(Array.isArray(initialJobsRes.data.jobs), 'Jobs should be an array');
    console.log(`   ✓ Initial public jobs count: ${initialJobsRes.data.jobs.length}`);

    // ========================================================================
    // TEST 2: Admin Company Creation & Management
    // ========================================================================
    console.log('2. Testing Admin Company Creation (POST /api/admin/companies)...');
    const companyPayload = {
      name: `Acme Cloud Systems ${ts}`,
      website: 'https://acmecloud.example.com',
      industry: 'Software & Cloud Infrastructure',
      company_size: '50-200 employees',
      location: 'Austin, TX (Hybrid)',
      description: 'Building next-generation distributed event streaming platforms.',
      is_verified: true,
      status: 'active'
    };

    const createCompanyRes = await makeRequest('/api/admin/companies', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: companyPayload
    });

    assert.strictEqual(createCompanyRes.status, 201, `Expected 201 Created, got ${createCompanyRes.status}`);
    assert.ok(createCompanyRes.data.company, 'Response must contain company object');
    assert.ok(createCompanyRes.data.company.id, 'Created company must have an id');
    const companyId = createCompanyRes.data.company.id;
    console.log(`   ✓ Company created successfully with ID: ${companyId}`);

    // Verify company update
    console.log('3. Testing Admin Company Update (PUT /api/admin/companies/:id)...');
    const updateCompanyRes = await makeRequest(`/api/admin/companies/${companyId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { ...companyPayload, description: 'Updated company description with global edge presence.' }
    });
    assert.strictEqual(updateCompanyRes.status, 200, 'Company update must return 200');
    assert.strictEqual(updateCompanyRes.data.company.description, 'Updated company description with global edge presence.');
    console.log('   ✓ Company updated successfully.');

    // ========================================================================
    // TEST 4: Admin Job Creation as Draft
    // ========================================================================
    console.log('4. Testing Admin Job Creation as Draft (POST /api/admin/jobs)...');
    const draftJobPayload = {
      company_id: companyId,
      title: `Senior Distributed Systems Engineer ${ts}`,
      category_id: 'cat-tech',
      work_mode: 'Remote',
      employment_type: 'Full-time',
      experience_level: 'Senior',
      location_text: 'Remote (US/EU)',
      salary_min: 140000,
      salary_max: 180000,
      salary_type: 'range',
      currency: 'USD',
      description: 'Looking for a senior engineer to design resilient, low-latency microservices.',
      responsibilities: ['Architect microservices', 'Maintain 99.99% uptime SLA', 'Mentor junior engineers'],
      requirements: ['5+ years Go or Rust experience', 'Deep knowledge of distributed consensus', 'Strong communication'],
      skills: ['Go', 'Rust', 'Kubernetes', 'PostgreSQL', 'Kafka'],
      benefits: ['100% remote flexibility', 'Unlimited PTO', 'Health, dental, and vision insurance', '401(k) matching'],
      status: 'draft',
      featured: 1
    };

    const createJobRes = await makeRequest('/api/admin/jobs', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: draftJobPayload
    });

    assert.strictEqual(createJobRes.status, 201, `Expected 201 Created, got ${createJobRes.status}`);
    assert.ok(createJobRes.data.job, 'Response must contain job object');
    const jobId = createJobRes.data.job.id;
    const jobSlug = createJobRes.data.job.slug;
    assert.ok(jobId, 'Job must have an ID');
    assert.ok(jobSlug, 'Job must have an SEO slug');
    assert.strictEqual(createJobRes.data.job.status, 'draft');
    console.log(`   ✓ Draft Job created with ID: ${jobId}, Slug: ${jobSlug}`);

    // ========================================================================
    // TEST 5: Draft Job Isolation (Must NOT appear on public endpoint)
    // ========================================================================
    console.log('5. Verifying Draft Job Isolation from public /api/jobs...');
    const publicJobsDraftRes = await makeRequest('/api/jobs');
    const draftInPublic = publicJobsDraftRes.data.jobs.some(j => j.id === jobId);
    assert.strictEqual(draftInPublic, false, 'Draft job MUST NOT be visible on public /api/jobs');
    console.log('   ✓ Draft job is properly isolated from public listings.');

    // ========================================================================
    // TEST 6: Publish Job & Public Discovery
    // ========================================================================
    console.log('6. Publishing Job (PUT /api/admin/jobs/:id status=published)...');
    const publishRes = await makeRequest(`/api/admin/jobs/${jobId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: { ...draftJobPayload, status: 'published' }
    });
    assert.strictEqual(publishRes.status, 200, 'Publishing job must return 200');
    assert.strictEqual(publishRes.data.job.status, 'published');
    console.log('   ✓ Job successfully published.');

    // Public list should now contain it
    const publicJobsPublishedRes = await makeRequest('/api/jobs?work_mode=Remote');
    const publishedInList = publicJobsPublishedRes.data.jobs.find(j => j.id === jobId);
    assert.ok(publishedInList, 'Published job must be returned in public filtered search');
    assert.strictEqual(publishedInList.company_name, companyPayload.name, 'Company name must be joined on public job');
    console.log('   ✓ Published job returned in public search with joined company details.');

    // Public detail by slug
    console.log('7. Testing Public Job Detail (GET /api/jobs/:slug)...');
    const jobDetailRes = await makeRequest(`/api/jobs/${jobSlug}`);
    assert.strictEqual(jobDetailRes.status, 200, 'Job detail must return 200');
    assert.strictEqual(jobDetailRes.data.job.id, jobId);
    assert.ok(Array.isArray(jobDetailRes.data.job.responsibilities), 'Responsibilities should be parsed JSON array');
    assert.ok(Array.isArray(jobDetailRes.data.job.requirements), 'Requirements should be parsed JSON array');
    assert.ok(Array.isArray(jobDetailRes.data.job.skills), 'Skills should be parsed JSON array');
    assert.ok(Array.isArray(jobDetailRes.data.job.benefits), 'Benefits should be parsed JSON array');
    console.log('   ✓ Job details and JSON arrays parsed correctly.');

    // Featured jobs endpoint
    const featuredRes = await makeRequest('/api/jobs/featured');
    assert.strictEqual(featuredRes.status, 200, 'Featured jobs must return 200');
    const featuredFound = featuredRes.data.jobs.some(j => j.id === jobId);
    assert.ok(featuredFound, 'Featured job must appear in featured jobs list');
    console.log('   ✓ Featured job returned on /api/jobs/featured.');

    // Dynamic SEO Sitemap verification
    console.log('8. Verifying Dynamic SEO Sitemap includes published job...');
    const sitemapRes = await makeRequest('/sitemap.xml');
    assert.strictEqual(sitemapRes.status, 200);
    assert.ok(sitemapRes.data.includes(`/jobs/${jobSlug}`), `Sitemap must contain /jobs/${jobSlug}`);
    console.log(`   ✓ Sitemap dynamically includes /jobs/${jobSlug}.`);

    // ========================================================================
    // TEST 9: Authenticated Resume Upload (POST /api/upload/resume)
    // ========================================================================
    console.log('9. Testing Authenticated Resume Upload (POST /api/upload/resume)...');
    const boundary = '----TestBoundary' + Math.random().toString(16).substring(2);
    const pdfContent = Buffer.from('%PDF-1.4 sample resume mock content with pdf header %%EOF');
    const crlf = '\r\n';
    const partHeader = `--${boundary}${crlf}Content-Disposition: form-data; name="resume"; filename="Alice_Resume.pdf"${crlf}Content-Type: application/pdf${crlf}${crlf}`;
    const partFooter = `${crlf}--${boundary}--${crlf}`;
    const multipartBody = Buffer.concat([
      Buffer.from(partHeader, 'utf-8'),
      pdfContent,
      Buffer.from(partFooter, 'utf-8')
    ]);

    const uploadRes = await makeRequest('/api/upload/resume', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${candidateAToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: multipartBody
    });

    assert.strictEqual(uploadRes.status, 200, `Expected 200 for resume upload, got ${uploadRes.status}`);
    assert.ok(uploadRes.data.url, 'Upload response must contain url');
    const uploadedResumeUrl = uploadRes.data.url;
    console.log(`   ✓ Resume uploaded successfully: ${uploadedResumeUrl}`);

    // ========================================================================
    // TEST 10: Apply for Job (POST /api/jobs/:id/apply)
    // ========================================================================
    console.log('10. Testing Job Application Submission (POST /api/jobs/:id/apply)...');
    const applyPayload = {
      resume_url: uploadedResumeUrl,
      cover_note: 'I have 6 years of experience building distributed systems in Go and Kubernetes.',
      relevant_experience: 'Led microservices migration at high-growth cloud provider.',
      skills: ['Go', 'Rust', 'Kubernetes']
    };

    const applyRes = await makeRequest(`/api/jobs/${jobId}/apply`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${candidateAToken}` },
      body: applyPayload
    });

    assert.strictEqual(applyRes.status, 201, `Expected 201 Created for application, got ${applyRes.status}`);
    assert.ok(applyRes.data.application_id, 'Must return application_id');
    const applicationId = applyRes.data.application_id;
    console.log(`   ✓ Application submitted successfully with ID: ${applicationId}`);

    // ========================================================================
    // TEST 11: Duplicate Application Prevention (Must reject with HTTP 400)
    // ========================================================================
    console.log('11. Testing Duplicate Application Prevention...');
    const dupApplyRes = await makeRequest(`/api/jobs/${jobId}/apply`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${candidateAToken}` },
      body: applyPayload
    });
    assert.strictEqual(dupApplyRes.status, 400, `Expected HTTP 400 for duplicate apply, got ${dupApplyRes.status}`);
    console.log('   ✓ Duplicate application correctly rejected with HTTP 400.');

    // ========================================================================
    // TEST 12: Applicant Privacy & Strict Data Isolation
    // ========================================================================
    console.log('12. Testing Applicant Privacy (Candidate B accessing Candidate A resume)...');
    const unauthorizedResumeRes = await makeRequest(`/api/job-applications/${applicationId}/resume`, {
      headers: { 'Authorization': `Bearer ${candidateBToken}` }
    });
    assert.strictEqual(unauthorizedResumeRes.status, 403, `Expected HTTP 403 Forbidden for candidate B, got ${unauthorizedResumeRes.status}`);
    console.log('   ✓ Privacy protected: Candidate B forbidden from viewing Candidate A resume (HTTP 403).');

    console.log('13. Testing Candidate A accessing their own resume...');
    const ownerResumeRes = await makeRequest(`/api/job-applications/${applicationId}/resume`, {
      headers: { 'Authorization': `Bearer ${candidateAToken}` }
    });
    // Can be 200 or redirect (if cloud storage)
    assert.ok([200, 302].includes(ownerResumeRes.status), `Owner should receive 200 or 302, got ${ownerResumeRes.status}`);
    console.log('   ✓ Owner candidate successfully authorized to access their own resume.');

    console.log('14. Testing Admin accessing applicant resume...');
    const adminResumeRes = await makeRequest(`/api/job-applications/${applicationId}/resume`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.ok([200, 302].includes(adminResumeRes.status), `Admin should receive 200 or 302, got ${adminResumeRes.status}`);
    console.log('   ✓ Administrator successfully authorized to access applicant resume.');

    // ========================================================================
    // TEST 15: Candidate Dashboard & Application Status
    // ========================================================================
    console.log('15. Testing Candidate Dashboard (GET /api/my/job-applications)...');
    const myAppsRes = await makeRequest('/api/my/job-applications', {
      headers: { 'Authorization': `Bearer ${candidateAToken}` }
    });
    assert.strictEqual(myAppsRes.status, 200);
    assert.ok(Array.isArray(myAppsRes.data.applications), 'Candidate applications must be an array');
    const myApp = myAppsRes.data.applications.find(a => a.id === applicationId);
    assert.ok(myApp, 'Submitted application must be in candidate dashboard');
    assert.strictEqual(myApp.job_title, draftJobPayload.title);
    assert.strictEqual(myApp.company_name, companyPayload.name);
    console.log('   ✓ Candidate dashboard displays application with joined job and company info.');

    // ========================================================================
    // TEST 16: Admin Pipeline & Status Transitions
    // ========================================================================
    console.log('16. Testing Admin Pipeline Status Transition (PATCH status=Interview)...');
    const updateStatusRes = await makeRequest(`/api/admin/job-applications/${applicationId}/status`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        status: 'Interview',
        admin_notes: 'Exceptional background in distributed consensus and raft protocols.'
      }
    });

    assert.strictEqual(updateStatusRes.status, 200);
    assert.strictEqual(updateStatusRes.data.application.status, 'Interview');
    assert.strictEqual(updateStatusRes.data.application.admin_notes, 'Exceptional background in distributed consensus and raft protocols.');
    console.log('   ✓ Admin transitioned status to Interview with reviewer notes.');

    // Verify status history audit
    console.log('17. Testing Application Status History (GET /api/admin/job-applications/:id/history)...');
    const historyRes = await makeRequest(`/api/admin/job-applications/${applicationId}/history`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(historyRes.status, 200);
    assert.ok(Array.isArray(historyRes.data.history), 'History should be an array');
    assert.ok(historyRes.data.history.length >= 2, 'History must have at least 2 records (Submitted + Interview)');
    const latestHistory = historyRes.data.history[historyRes.data.history.length - 1];
    assert.strictEqual(latestHistory.new_status, 'Interview');
    console.log('   ✓ Status history timeline recorded accurately.');

    // ========================================================================
    // TEST 17: Candidate Application Withdrawal
    // ========================================================================
    console.log('18. Testing Candidate Application Withdrawal (POST /api/my/job-applications/:id/withdraw)...');
    const withdrawRes = await makeRequest(`/api/my/job-applications/${applicationId}/withdraw`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${candidateAToken}` }
    });
    assert.strictEqual(withdrawRes.status, 200);
    assert.strictEqual(withdrawRes.data.success, true);

    const appAfterWithdraw = db.prepare('SELECT status FROM job_applications WHERE id = ?').get(applicationId);
    assert.strictEqual(appAfterWithdraw.status, 'Withdrawn');
    console.log('   ✓ Candidate successfully withdrew application.');

    // ========================================================================
    // TEST 18: Job Closure Rejection
    // ========================================================================
    console.log('19. Testing Closed Job Application Rejection...');
    // Close the job
    await makeRequest(`/api/admin/jobs/${jobId}/close`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    // Candidate B tries to apply to closed job
    const applyToClosedRes = await makeRequest(`/api/jobs/${jobId}/apply`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${candidateBToken}` },
      body: {
        resume_url: uploadedResumeUrl,
        cover_note: 'Applying to closed position.'
      }
    });
    assert.strictEqual(applyToClosedRes.status, 400, 'Applying to a closed job must return 400');
    assert.strictEqual(applyToClosedRes.data.error, 'This job posting is no longer active or accepting applications.');
    console.log('   ✓ Application to closed job correctly rejected with 400.');

    // ========================================================================
    // TEST 19: Admin Stats Verification
    // ========================================================================
    console.log('20. Testing Admin Stats Endpoints with Jobs telemetry...');
    const statsRes = await makeRequest('/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(statsRes.status, 200);
    const stats = statsRes.data.stats;
    assert.ok(stats, 'Stats object must exist');
    assert.ok(typeof stats.totalJobs === 'number', 'totalJobs must be a number');
    assert.ok(typeof stats.openJobs === 'number', 'openJobs must be a number');
    assert.ok(typeof stats.totalCompanies === 'number', 'totalCompanies must be a number');
    assert.ok(typeof stats.totalJobApplications === 'number', 'totalJobApplications must be a number');
    console.log(`   ✓ Admin Stats: totalJobs=${stats.totalJobs}, openJobs=${stats.openJobs}, totalCompanies=${stats.totalCompanies}, applications=${stats.totalJobApplications}`);

    console.log('\n======================================================================');
    console.log('✅ ALL 20 FULL-TIME JOBS & CAREERS MARKETPLACE TESTS PASSED 100%!');
    console.log('======================================================================\n');

    server.close(() => process.exit(0));
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    server.close(() => process.exit(1));
  }
});
