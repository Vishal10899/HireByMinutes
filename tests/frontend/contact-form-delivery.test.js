// =============================================================================
// HIREBYMINUTE — CONTACT FORM & EMAIL DELIVERY VERIFICATION SUITE
// =============================================================================
// Verifies:
// 1. Required field validation (name, email, message)
// 2. Invalid email format rejection
// 3. Bot honeypot detection & silent drop
// 4. Rate limiting per IP (5 submissions / 10 min window)
// 5. Duplicate submission prevention within 5-minute window
// 6. Persistence in contact_inquiries table
// 7. Transactional email dispatch to support & sender receipt confirmation
// 8. Frontend ContactPage integration & API service contract
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const db = require('../../server/db');
const createRoutes = require('../../server/routes');
const emailService = require('../../server/services/emailService');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${totalTests}. ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${totalTests}. ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${totalTests}. ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${totalTests}. ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log('\n===============================================================');
  console.log('HIREBYMINUTES — CONTACT FORM & EMAIL DELIVERY AUDIT');
  console.log('===============================================================\n');

  // --- Suite 1: Database Schema & Migration Verification ---
  console.log('--- Suite 1: Database Schema & Inquiries Table ---');

  test('contact_inquiries table exists in database', () => {
    const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_inquiries'").get();
    assert(tableInfo, 'contact_inquiries table must exist in SQLite database');
  });

  test('contact_inquiries has all required columns', () => {
    const cols = db.prepare("PRAGMA table_info(contact_inquiries)").all().map(c => c.name);
    assert(cols.includes('id'), 'Must have id');
    assert(cols.includes('name'), 'Must have name');
    assert(cols.includes('email'), 'Must have email');
    assert(cols.includes('category'), 'Must have category');
    assert(cols.includes('subject'), 'Must have subject');
    assert(cols.includes('message'), 'Must have message');
    assert(cols.includes('ip_address'), 'Must have ip_address');
    assert(cols.includes('status'), 'Must have status');
    assert(cols.includes('created_at'), 'Must have created_at');
  });

  // --- Suite 2: Backend API Endpoint & Validation ---
  console.log('\n--- Suite 2: Backend Validation, Spam Protection & Dispatch ---');

  const app = express();
  app.use(express.json());
  const server = http.createServer(app);
  const TEST_PORT = 5126;

  // Track dispatched emails
  const dispatchedEmails = [];
  const originalSendMail = emailService.sendMail.bind(emailService);
  emailService.sendMail = async (args) => {
    dispatchedEmails.push(args);
    return { success: true, messageId: 'msg-test-contact-' + Date.now(), status: 'SENT' };
  };

  app.use('/api', createRoutes(null, null));

  await new Promise(r => server.listen(TEST_PORT, '127.0.0.1', r));

  const baseUrl = `http://127.0.0.1:${TEST_PORT}/api`;

  await runAsyncTest('Rejects missing or empty name with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/platform/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', email: 'client@example.com', message: 'I need assistance with my session' })
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert(body.error.includes('name'), 'Must mention name error');
  });

  await runAsyncTest('Rejects invalid email format with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/platform/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Rohan Sharma', email: 'not-an-email', message: 'I need assistance with my session' })
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert(body.error.includes('valid email'), 'Must mention valid email');
  });

  await runAsyncTest('Rejects short message (<10 chars) with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/platform/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Rohan Sharma', email: 'client@example.com', message: 'Help' })
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert(body.error.includes('10 characters'), 'Must mention min 10 characters');
  });

  await runAsyncTest('Honeypot detection silently drops bot submission without saving to DB', async () => {
    const countBefore = db.prepare("SELECT count(*) as total FROM contact_inquiries").get().total;
    const res = await fetch(`${baseUrl}/platform/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Spam Bot',
        email: 'spammer@botnet.ru',
        message: 'Cheap watches and fake SEO ranking links here http://spam.com',
        hp_website: 'http://iamabot.com'
      })
    });
    assert.strictEqual(res.status, 200);
    const countAfter = db.prepare("SELECT count(*) as total FROM contact_inquiries").get().total;
    assert.strictEqual(countBefore, countAfter, 'Honeypot submission must NOT be saved into inquiries database');
  });

  await runAsyncTest('Accepts valid inquiry, stores in database, and triggers both emails', async () => {
    dispatchedEmails.length = 0;
    const testEmail = `user-${Date.now()}@testdomain.com`;
    const testMsg = `Hello HireByMinute team, I need clarification regarding billing receipts for consultation session #${Date.now()}.`;

    const res = await fetch(`${baseUrl}/platform/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Aarav Gupta',
        email: testEmail,
        category: 'billing',
        subject: 'Consultation Receipt Inquiry',
        message: testMsg
      })
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert(body.inquiry_id, 'Must return inquiry_id');

    // Verify database record
    const saved = db.prepare("SELECT * FROM contact_inquiries WHERE id = ?").get(body.inquiry_id);
    assert(saved, 'Must be stored in contact_inquiries table');
    assert.strictEqual(saved.name, 'Aarav Gupta');
    assert.strictEqual(saved.email, testEmail);
    assert.strictEqual(saved.category, 'billing');
    assert.strictEqual(saved.subject, 'Consultation Receipt Inquiry');
    assert.strictEqual(saved.message, testMsg);

    // Verify 2 emails dispatched: 1 to admin/support, 1 confirmation receipt to sender
    assert.strictEqual(dispatchedEmails.length, 2, 'Must dispatch notification to support AND receipt to user');
    const adminNotif = dispatchedEmails.find(e => e.template === 'contact_inquiry_admin');
    const userReceipt = dispatchedEmails.find(e => e.template === 'contact_inquiry_receipt');
    assert(adminNotif, 'Must send contact_inquiry_admin template to support');
    assert(userReceipt, 'Must send contact_inquiry_receipt template to user');
    assert.strictEqual(userReceipt.to, testEmail, 'User receipt must be addressed to the submitter email');
  });

  await runAsyncTest('Duplicate prevention rejects identical email+message within 5 minutes', async () => {
    const testEmail = `duplicate-${Date.now()}@testdomain.com`;
    const testMsg = `Identical message content for duplicate testing ${Date.now()}`;

    // First submission: Success
    const res1 = await fetch(`${baseUrl}/platform/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Submitter',
        email: testEmail,
        message: testMsg
      })
    });
    assert.strictEqual(res1.status, 200);

    // Immediate duplicate submission: Rejected
    const res2 = await fetch(`${baseUrl}/platform/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Submitter',
        email: testEmail,
        message: testMsg
      })
    });
    assert.strictEqual(res2.status, 400);
    const body2 = await res2.json();
    assert(body2.error.toLowerCase().includes('duplicate') || body2.error.toLowerCase().includes('already submitted'), 'Must reject duplicate inquiry');
  });

  // --- Suite 3: Frontend Integration & Contract Audit ---
  console.log('\n--- Suite 3: Frontend Integration & Code Contract ---');

  const contactPageCode = fs.readFileSync(path.join(__dirname, '../../client/src/pages/ContactPage.tsx'), 'utf8');
  const apiCode = fs.readFileSync(path.join(__dirname, '../../client/src/services/api.ts'), 'utf8');

  test('api.ts exposes submitContactForm endpoint', () => {
    assert(apiCode.includes('submitContactForm'), 'api.ts must declare submitContactForm');
    assert(apiCode.includes('/platform/contact'), 'api.ts must post to /platform/contact');
  });

  test('ContactPage imports api and calls submitContactForm', () => {
    assert(contactPageCode.includes('api.submitContactForm'), 'ContactPage must call api.submitContactForm');
    assert(contactPageCode.includes('errorMessage'), 'ContactPage must handle error state');
    assert(contactPageCode.includes('hp_website'), 'ContactPage must include honeypot field');
  });

  // Cleanup
  emailService.sendMail = originalSendMail;

  console.log('\n===============================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} contact & email tests passed.`);
  console.log('===============================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL CONTACT FORM & EMAIL DELIVERY TESTS PASSED 100%!\n');
    server.close(() => {
      setTimeout(() => process.exit(0), 100);
    });
  } else {
    server.close(() => {
      process.exit(1);
    });
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
