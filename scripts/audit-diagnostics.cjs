const fs = require('fs');
const dotenv = require('dotenv');
const db = require('../server/db');

console.log('=== ENVIRONMENT VARIABLE INSPECTION ===');
if (fs.existsSync('.env')) {
  const env = dotenv.parse(fs.readFileSync('.env', 'utf8'));
  for (const k of Object.keys(env)) {
    if (k.toLowerCase().includes('razorpay') || k.toLowerCase().includes('payout') || k.toLowerCase().includes('indobid') || k.toLowerCase().includes('turn') || k.toLowerCase().includes('stun')) {
      const val = env[k];
      console.log(`ENV: ${k} => exists: true, length: ${val ? val.length : 0}, prefix: ${val ? val.slice(0, 8) : ''}`);
    }
  }
} else {
  console.log('No .env file found.');
}

console.log('\n=== PLATFORM_SETTINGS TABLE INSPECTION ===');
try {
  const settings = db.prepare("SELECT key, value FROM platform_settings WHERE key LIKE '%razorpay%' OR key LIKE '%payout%' OR key LIKE '%turn%' OR key LIKE '%indobid%'").all();
  if (settings.length === 0) {
    console.log('No matching settings in platform_settings table.');
  } else {
    for (const s of settings) {
      console.log(`DB Setting: ${s.key} => length: ${s.value ? s.value.length : 0}, prefix: ${s.value ? s.value.slice(0, 8) : ''}`);
    }
  }
} catch (e) {
  console.log('DB Read error:', e.message);
}
