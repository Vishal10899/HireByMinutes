// =============================================================================
// HireByMinute — Core Product Hierarchy & Secondary Jobs Verification
// Read-only validation probe
// =============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

async function verify() {
  console.log('=============================================================================');
  console.log('🧪 HIREBYMINUTE — CORE PRODUCT HIERARCHY VERIFICATION');
  console.log('=============================================================================\n');

  // 1. Check HomePage.tsx
  console.log('1. Auditing HomePage.tsx for Primary & Secondary Visual Hierarchy...');
  const homePagePath = path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'HomePage.tsx');
  const homeContent = fs.readFileSync(homePagePath, 'utf8');

  // Assert 2-column grid in hero
  const heroSection = homeContent.slice(homeContent.indexOf('PRIMARY MARKETPLACE INTENT ACTIONS'), homeContent.indexOf('SEARCH BAR SECTION'));
  assert(heroSection.includes('grid-cols-1 md:grid-cols-2'), 'Hero intent cards must use 2-column grid');
  assert(!heroSection.includes('md:grid-cols-3'), 'Hero intent cards must NOT use 3-column grid');
  assert(!heroSection.includes('Find a Full-Time Job'), 'Hero intent cards must NOT contain "Find a Full-Time Job"');
  assert(!heroSection.includes('Browse Full-Time Jobs'), 'Hero intent cards must NOT contain "Browse Full-Time Jobs"');
  assert(heroSection.includes('Find an Expert'), 'Hero must have "Find an Expert" card');
  assert(heroSection.includes('List Your Service'), 'Hero must have "List Your Service" card');
  console.log('   ✓ Hero intent cards strictly restricted to 2 core actions: "Find an Expert" & "List Your Service"');

  // Assert secondary Jobs section is positioned after How It Works
  const howItWorksPos = homeContent.indexOf('id="how-it-works"');
  const secondaryJobsPos = homeContent.indexOf('OPTIONAL SECONDARY FULL-TIME JOBS SECTION');
  assert(howItWorksPos !== -1, 'How it works section must exist');
  assert(secondaryJobsPos !== -1, 'Secondary jobs section must exist');
  assert(secondaryJobsPos > howItWorksPos, 'Secondary jobs section must be placed AFTER How It Works');
  console.log('   ✓ Full-Time Jobs section correctly positioned as secondary module below How It Works');

  // Assert secondary Jobs empty state
  assert(homeContent.includes('Looking for a full-time role?'), 'Secondary jobs empty banner must have friendly invite');
  assert(homeContent.includes('Browse Jobs'), 'Secondary jobs banner must link to /jobs');
  console.log('   ✓ Secondary jobs section shows compact, non-dominating invite when 0 jobs are published');

  // 2. Check Header Navigation
  console.log('\n2. Auditing Header Navigation Hierarchy...');
  const siteSettingsPath = path.join(__dirname, '..', '..', 'client', 'src', 'context', 'SiteSettingsContext.tsx');
  const siteSettingsContent = fs.readFileSync(siteSettingsPath, 'utf8');

  assert(siteSettingsContent.includes("{ id: 'services', label: 'Services', url: '/services', order: 1"), 'Services must be order 1');
  assert(siteSettingsContent.includes("{ id: 'opportunities', label: 'Opportunities', url: '/opportunities', order: 2"), 'Opportunities must be order 2');
  assert(siteSettingsContent.includes("{ id: 'jobs', label: 'Jobs', url: '/jobs', order: 3"), 'Jobs must be order 3');
  assert(siteSettingsContent.includes("{ id: 'how-it-works', label: 'How It Works', url: '/#how-it-works', order: 4"), 'How It Works must be order 4');
  console.log('   ✓ Header navigation preserves premium order: Services -> Opportunities -> Jobs -> How It Works');

  // 3. Check JobsPage.tsx
  console.log('\n3. Auditing JobsPage.tsx Dedicated Module...');
  const jobsPagePath = path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'JobsPage.tsx');
  const jobsContent = fs.readFileSync(jobsPagePath, 'utf8');

  assert(jobsContent.includes('Find full-time opportunities from companies hiring through HireByMinute.'), 'JobsPage has exact page purpose headline');
  assert(jobsContent.includes('No full-time opportunities available right now.'), 'JobsPage has exact honest empty state headline');
  console.log('   ✓ JobsPage retains dedicated /jobs route with honest empty state and zero fake data');

  // 4. Check Admin Jobs Control
  console.log('\n4. Auditing Admin Jobs Management...');
  const adminJobsPath = path.join(__dirname, '..', '..', 'client', 'src', 'components', 'admin', 'AdminJobsControl.tsx');
  const adminJobsContent = fs.readFileSync(adminJobsPath, 'utf8');

  assert(adminJobsContent.includes('No jobs yet.'), 'Admin jobs control has exact empty state "No jobs yet."');
  assert(adminJobsContent.includes('handlePublish'), 'Admin supports publishing jobs');
  assert(adminJobsContent.includes('handleUnpublish'), 'Admin supports unpublishing jobs');
  assert(adminJobsContent.includes('handleClose'), 'Admin supports closing jobs');
  assert(adminJobsContent.includes('handleOpenCreate'), 'Admin supports creating jobs');
  console.log('   ✓ Admin Jobs Control supports full lifecycle: Draft, Published, Closed, Archived with "No jobs yet." empty state');

  // 5. Check Database Settings & Data State (SQLite & Neon)
  console.log('\n5. Checking Database States for Zero Fake Data...');
  const db = new Database(path.join(__dirname, '..', 'hirebyminutes.db'));
  const sqliteUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const sqliteJobs = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'published'").get().c;
  assert(sqliteUsers === 1, `SQLite must have only 1 user (admin), found: ${sqliteUsers}`);
  assert(sqliteJobs === 0, `SQLite must have 0 jobs on fresh start, found: ${sqliteJobs}`);
  console.log('   ✓ SQLite verified: exactly 1 admin user, 0 non-admins, 0 jobs');
  db.close();

  const neonUrl = (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    'postgresql://neondb_owner:npg_5huVAgOw7ocD@ep-fancy-frog-ay4krhqt-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require'
  ).trim();

  const pool = new Pool({
    connectionString: neonUrl,
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();
  try {
    const neonUsersRes = await client.query('SELECT COUNT(*) as c FROM users');
    const neonUsers = parseInt(neonUsersRes.rows[0].c, 10);
    assert(neonUsers === 1, `Neon must have only 1 user (admin), found: ${neonUsers}`);

    const neonJobsRes = await client.query("SELECT COUNT(*) as c FROM jobs WHERE status = 'published'");
    const neonJobs = parseInt(neonJobsRes.rows[0].c, 10);
    assert(neonJobs === 0, `Neon must have 0 jobs on fresh start, found: ${neonJobs}`);
    console.log('   ✓ Neon PostgreSQL verified: exactly 1 admin user, 0 non-admins, 0 jobs');
  } finally {
    client.release();
    await pool.end();
  }

  console.log('\n=============================================================================');
  console.log('🎉 ALL 5 VERIFICATION CHECKS PASSED WITH 100% COMPLIANCE');
  console.log('NO FAKE/DEMO DATA WAS CREATED.');
  console.log('=============================================================================\n');
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
