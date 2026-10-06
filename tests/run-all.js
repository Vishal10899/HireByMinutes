// =============================================================================
// HIREBYMINUTES — MASTER TEST RUNNER
// =============================================================================
// Runs all production test suites sequentially in isolated child processes:
// 1. PostgreSQL Schema & Core Integration (21 tests)
// 2. Full-Time Jobs & Careers Marketplace (20 tests)
// 3. Razorpay Payment Fix & INR Standardization (20 tests)
// 4. Render Deployment & SPA Cold-Start Suite (70 tests)
// =============================================================================

const { fork } = require('child_process');
const path = require('path');

const suites = [
  { name: 'PostgreSQL Integration Suite', file: path.join('integrations', 'postgres.test.js') },
  { name: 'Full-Time Jobs Marketplace Suite', file: path.join('jobs', 'marketplace.test.js') },
  { name: 'Razorpay INR Currency Suite', file: path.join('payments', 'razorpay-currency.test.js') },
  { name: 'Render Deployment & Cold-Start Suite', file: path.join('deployment', 'frontend-coldstart.test.js') },
  { name: 'Admin Panel Persistence & Data Integrity Suite', file: path.join('admin', 'admin-persistence.test.js') },
  { name: 'Free Service Listing & Signup Flow Suite', file: path.join('marketplace', 'free-listing-flow.test.js') },
  { name: 'Expert & Provider Discovery Suite', file: path.join('marketplace', 'provider-discovery.test.js') },
  { name: 'Frontend Runtime & Error Boundary Suite', file: path.join('frontend', 'error-boundary-runtime.test.js') }
];

async function runSuite(suite) {
  return new Promise((resolve) => {
    console.log(`\n======================================================================`);
    console.log(`▶ RUNNING SUITE: ${suite.name} (${suite.file})`);
    console.log(`======================================================================\n`);

    const suitePath = path.join(__dirname, suite.file);
    const child = fork(suitePath, [], { stdio: 'inherit' });

    child.on('exit', (code) => {
      resolve({
        name: suite.name,
        file: suite.file,
        passed: code === 0,
        exitCode: code
      });
    });
  });
}

async function main() {
  const startTime = Date.now();
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║               HIREBYMINUTES AUTOMATED TEST RUNNER                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  const results = [];
  for (const suite of suites) {
    const res = await runSuite(suite);
    results.push(res);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const allPassed = results.every(r => r.passed);

  console.log('\n======================================================================');
  console.log('                    OVERALL TEST SUITE SUMMARY                        ');
  console.log('======================================================================');
  for (const r of results) {
    const symbol = r.passed ? '✓ [PASS]' : '✗ [FAIL]';
    console.log(`  ${symbol} ${r.name.padEnd(45)} (exit: ${r.exitCode})`);
  }
  console.log(`\nTotal Duration: ${durationSec}s`);
  console.log('======================================================================\n');

  if (allPassed) {
    console.log('🎉 ALL HIREBYMINUTES TEST SUITES PASSED 100%!');
    process.exit(0);
  } else {
    console.error('❌ ONE OR MORE TEST SUITES FAILED.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
