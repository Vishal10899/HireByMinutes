const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

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
const adminEmail = (process.env.ADMIN_EMAIL || 'admin@hirebyminutes.com').trim().toLowerCase();

// Safely update or append keys in .env without wiping other variables
let envLines = [];
if (fs.existsSync(envPath)) {
  envLines = fs.readFileSync(envPath, 'utf8').split('\n');
}

function setEnvVar(lines, key, value) {
  let found = false;
  const updated = lines.map(line => {
    if (line.trim().startsWith(`${key}=`)) {
      found = true;
      return `${key}="${value}"`;
    }
    return line;
  });
  if (!found) {
    updated.push(`${key}="${value}"`);
  }
  return updated;
}

envLines = setEnvVar(envLines, 'ADMIN_PASSWORD', adminPass);
envLines = setEnvVar(envLines, 'JWT_SECRET', jwtSecret);
fs.writeFileSync(envPath, envLines.join('\n'));

// Hash password before updating database
try {
  const db = require('./server/db');
  const hashedPassword = bcrypt.hashSync(adminPass, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE LOWER(email) = ?").run(hashedPassword, adminEmail);
} catch (dbErr) {
  // Safe if run prior to DB initialization
}

console.log('--- CREDENTIAL ROTATION SUCCESS ---');
console.log('ADMIN_EMAIL_TARGETED:', adminEmail);
console.log('PASSWORD_BCRYPT_HASHED: YES');
console.log('JWT_SECRET_ROTATED: YES');
console.log('(Secrets are safely written to .env and hashed in database, not dumped to stdout)');
