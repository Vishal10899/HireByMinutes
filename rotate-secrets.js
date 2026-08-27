const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Generate strong random admin password (18 chars with mixed case, numbers, special characters)
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@%^&*()-_=+';
let adminPass = 'HBM-';
const randomBytes = crypto.randomBytes(16);
for (let i = 0; i < 16; i++) {
  adminPass += chars[randomBytes[i] % chars.length];
}

// Generate 48-byte (96-char hex) cryptographically secure random JWT secret
const jwtSecret = crypto.randomBytes(48).toString('hex');

const envPath = path.join(__dirname, '.env');
const envContent = [
  'PORT=5000',
  'ADMIN_EMAIL="vishalkumar75912@gmail.com"',
  `ADMIN_PASSWORD="${adminPass}"`,
  `JWT_SECRET="${jwtSecret}"`,
  'PLATFORM_NAME="HireByMinutes"',
  'LISTING_FEE_USD="2.00"',
  'PLATFORM_FEE_PERCENT="15"'
].join('\n') + '\n';

fs.writeFileSync(envPath, envContent);

// Also update the database directly
const db = require('./server/db');
db.prepare("UPDATE users SET password_hash = ? WHERE LOWER(email) = 'vishalkumar75912@gmail.com'").run(adminPass);

console.log('--- CREDENTIAL ROTATION SUCCESS ---');
console.log('NEW_ADMIN_PASSWORD:', adminPass);
console.log('JWT_SECRET_ROTATED: YES');
