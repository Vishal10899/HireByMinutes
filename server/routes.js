const express = require('express');
const router = express.Router();
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const emailService = require('./services/emailService');
const storageService = require('./services/storageService');

// Multer memory storage adapter (enables streaming to Cloudflare R2 / AWS S3 / Object Storage on Render Free)
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const disallowed = ['.exe', '.bat', '.cmd', '.sh', '.php', '.phtml', '.cgi', '.dll', '.msi', '.vbs', '.scr', '.jar'];
    if (disallowed.includes(ext)) {
      return cb(new Error('Executable file types are restricted for security reasons.'));
    }
    cb(null, true);
  }
});

function logAuditAction(adminUser, action, targetType, targetId, details = {}) {
  try {
    const id = `audit-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_type, target_id, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, adminUser.id, adminUser.full_name, action, targetType, targetId, JSON.stringify(details));
  } catch (err) {
    console.error('Failed to write audit log', err);
  }
}

// Helper to strip sensitive password data from user records and parse structured fields
function sanitizeUser(user) {
  if (!user) return null;
  const safe = { ...user };
  delete safe.password_hash;

  if (safe.languages_json && typeof safe.languages_json === 'string') {
    try {
      safe.languages = JSON.parse(safe.languages_json);
    } catch {
      safe.languages = ['English'];
    }
  } else if (!safe.languages) {
    safe.languages = ['English'];
  }

  if (safe.skills_json && typeof safe.skills_json === 'string') {
    try {
      safe.skills = JSON.parse(safe.skills_json);
    } catch {
      safe.skills = [];
    }
  } else if (!safe.skills) {
    safe.skills = [];
  }

  if (!safe.username) {
    safe.username = (safe.full_name || safe.email?.split('@')[0] || safe.id)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  return safe;
}

// Server-Authoritative Listing / Registration Fee Calculator (with Temporary Campaigns & Automatic Expiration)
function getEffectiveListingFee() {
  let baseFee = 2.00;
  try {
    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'listing_fee_usd'").get();
    if (setting && setting.value !== undefined) {
      const parsed = parseFloat(setting.value);
      if (!isNaN(parsed)) baseFee = parsed;
    }
  } catch (e) {
    baseFee = parseFloat(process.env.LISTING_FEE_USD) || 2.00;
  }

  const now = Date.now();
  const nowIso = new Date().toISOString();

  try {
    const campaigns = db.prepare(`
      SELECT * FROM registration_campaigns 
      WHERE status != 'cancelled' 
      ORDER BY created_at DESC
    `).all();

    const updateStatus = db.prepare('UPDATE registration_campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

    let activeCampaign = null;
    const upcomingCampaigns = [];

    for (const camp of campaigns) {
      const startMs = new Date(camp.start_time).getTime();
      const endMs = new Date(camp.end_time).getTime();

      if (now > endMs) {
        if (camp.status !== 'expired') {
          updateStatus.run('expired', camp.id);
          camp.status = 'expired';
        }
      } else if (now < startMs) {
        if (camp.status !== 'scheduled' && camp.is_active === 1) {
          updateStatus.run('scheduled', camp.id);
          camp.status = 'scheduled';
        }
        upcomingCampaigns.push(camp);
      } else {
        // now >= startMs && now <= endMs
        if (camp.is_active === 1) {
          if (camp.status !== 'active') {
            updateStatus.run('active', camp.id);
            camp.status = 'active';
          }
          if (!activeCampaign) {
            activeCampaign = camp;
          }
        }
      }
    }

    if (activeCampaign) {
      const endMs = new Date(activeCampaign.end_time).getTime();
      const remainingSeconds = Math.max(0, Math.floor((endMs - now) / 1000));
      return {
        fee: Number(activeCampaign.fee_usd),
        baseFee,
        isPromotionActive: true,
        activeCampaign: {
          ...activeCampaign,
          remaining_seconds: remainingSeconds
        },
        upcomingCampaigns,
        serverTime: nowIso
      };
    }

    return {
      fee: baseFee,
      baseFee,
      isPromotionActive: false,
      activeCampaign: null,
      upcomingCampaigns,
      serverTime: nowIso
    };
  } catch (err) {
    console.error('[getEffectiveListingFee Error]', err.message);
    return {
      fee: baseFee,
      baseFee,
      isPromotionActive: false,
      activeCampaign: null,
      upcomingCampaigns: [],
      serverTime: nowIso
    };
  }
}

const crypto = require('crypto');

module.exports = function(timerEngine, io) {
  // Initialize email service with database reference
  emailService.init(db);

  // Production Health Monitoring Endpoints
  const handleHealth = (req, res) => {
    try {
      const result = db.prepare('SELECT 1 as alive').get();
      if (result && result.alive === 1) {
        const memoryUsage = process.memoryUsage();
        return res.status(200).json({
          status: 'healthy',
          platform: 'HireByMinutes',
          version: '2.4.0',
          environment: process.env.NODE_ENV || 'development',
          database: 'connected',
          uptimeSeconds: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
          memory: {
            rssMb: Math.round(memoryUsage.rss / (1024 * 1024)),
            heapUsedMb: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
            heapTotalMb: Math.round(memoryUsage.heapTotal / (1024 * 1024))
          }
        });
      }
      return res.status(503).json({ status: 'unhealthy', error: 'Database check failed' });
    } catch (err) {
      return res.status(503).json({ status: 'unhealthy', error: err.message });
    }
  };
  router.get('/health', handleHealth);
  router.head('/health', handleHealth);
  router.get('/healthz', handleHealth);

  // Public Platform Registration / Listing Fee Status Endpoint
  router.get('/platform/registration-fee', (req, res) => {
    const feeData = getEffectiveListingFee();
    res.json(feeData);
  });

  // --- HELPER AUTH MIDDLEWARES ---
  const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const userId = authHeader ? authHeader.replace('Bearer ', '') : req.query.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }
    const user = db.prepare(`
      SELECT id, email, username, full_name, role, avatar_url, bio, headline, location,
             country, state_region, city, area,
             languages_json, skills_json, experience_years, rating, review_count, 
             sessions_completed, verified, email_verified, is_suspended, response_time, member_since, created_at 
      FROM users WHERE id = ?
    `).get(userId);
    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }
    if (user.is_suspended) {
      return res.status(403).json({ error: 'Your account is suspended. Please contact platform administration.' });
    }
    req.user = user;
    next();
  };

  const adminAuthMiddleware = (req, res, next) => {
    authMiddleware(req, res, () => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied: Administrator privileges required.' });
      }
      next();
    });
  };

  // ==========================================
  // AUTHENTICATION & EMAIL VERIFICATION
  // ==========================================
  router.get('/auth/me', authMiddleware, (req, res) => {
    res.json({ user: sanitizeUser(req.user) });
  });

  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cleanEmail);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.is_suspended) {
      return res.status(403).json({ error: 'This account has been suspended by administration.' });
    }

    // Verify password securely using bcrypt
    let isMatch = false;
    if (user.password_hash) {
      try {
        if (user.password_hash.startsWith('$2')) {
          isMatch = bcrypt.compareSync(password, user.password_hash);
        } else {
          // Automatic migration of legacy unhashed password upon successful authentication
          isMatch = (password === user.password_hash);
          if (isMatch) {
            const newHash = bcrypt.hashSync(password, 10);
            db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
          }
        }
      } catch {
        isMatch = false;
      }
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    res.json({
      user: sanitizeUser(user),
      token: user.id,
      message: `Welcome back, ${user.full_name}`
    });
  });

  // Register with Email Verification OTP Flow
  router.post('/auth/register', async (req, res) => {
    const { email, password, full_name, role = 'client', headline = '', bio = '' } = req.body;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ error: 'Full name is required.' });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one letter and one number.' });
    }

    // Disallow registering directly as admin from public registration
    const assignedRole = role === 'admin' ? 'client' : (role === 'provider' ? 'provider' : 'client');

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    // Auto-generate or sanitize permanent username
    let username = req.body.username ? req.body.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') : '';
    if (!username) {
      username = (full_name.trim() || cleanEmail.split('@')[0])
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    // Ensure username uniqueness
    const existingUserWithUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(username);
    if (existingUserWithUsername) {
      username = `${username}_${Math.floor(100 + Math.random() * 900)}`;
    }

    // Hash password with bcrypt (salt rounds = 10)
    const passwordHash = bcrypt.hashSync(password, 10);
    const id = `usr-${uuidv4().slice(0, 8)}`;
    const avatar_url = req.body.avatar_url && req.body.avatar_url.trim()
      ? req.body.avatar_url.trim()
      : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(full_name.trim())}`;

    const location = req.body.location ? req.body.location.trim() : '';
    const country = req.body.country ? req.body.country.trim() : 'United States';
    const state_region = req.body.state_region ? req.body.state_region.trim() : '';
    const city = req.body.city ? req.body.city.trim() : '';
    const area = req.body.area ? req.body.area.trim() : '';
    const languages = Array.isArray(req.body.languages) ? JSON.stringify(req.body.languages) : '["English"]';
    const skills = Array.isArray(req.body.skills) ? JSON.stringify(req.body.skills) : '[]';
    const experience_years = req.body.experience_years ? parseInt(req.body.experience_years, 10) : 5;

    // Accounts start UNVERIFIED (email_verified = 0)
    db.prepare(`
      INSERT INTO users (
        id, email, username, password_hash, full_name, role, avatar_url, bio, headline, location,
        country, state_region, city, area,
        languages_json, skills_json, experience_years, verified, email_verified
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `).run(
      id,
      cleanEmail,
      username,
      passwordHash,
      full_name.trim(),
      assignedRole,
      avatar_url,
      bio.trim(),
      headline.trim(),
      location,
      country,
      state_region,
      city,
      area,
      languages,
      skills,
      experience_years
    );

    // Cryptographically secure 6-digit OTP generation
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(rawOtp + id).digest('hex');
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10;
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO email_verification_tokens (id, user_id, email, code_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`evt-${uuidv4().slice(0, 8)}`, id, cleanEmail, otpHash, expiresAt, nowIso);

    // Dispatch verification OTP email
    emailService.sendVerificationOtp({
      email: cleanEmail,
      name: full_name.trim(),
      otp: rawOtp,
      expiryMinutes,
      userId: id
    }).catch(err => console.error('Failed to send verification email', err));

    const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    res.status(201).json({
      user: sanitizeUser(newUser),
      token: newUser.id,
      requires_verification: true,
      email: cleanEmail,
      message: 'Account created. We have sent a 6-digit verification code to your email.'
    });
  });

  // Verify Email OTP
  router.post('/auth/verify-email-otp', (req, res) => {
    const { email, code } = req.body;
    let targetEmail = email ? email.trim().toLowerCase() : null;
    let userId = null;

    // Extract from auth token if provided
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const tokenUser = db.prepare('SELECT * FROM users WHERE id = ?').get(authHeader.replace('Bearer ', ''));
      if (tokenUser) {
        targetEmail = targetEmail || tokenUser.email;
        userId = tokenUser.id;
      }
    }

    if (!targetEmail) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    if (!code || !String(code).trim() || String(code).trim().length !== 6) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit verification code.' });
    }

    const cleanCode = String(code).trim();

    // Retrieve active token for user
    const tokenRecord = db.prepare(`
      SELECT * FROM email_verification_tokens 
      WHERE LOWER(email) = ? AND used_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(targetEmail);

    if (!tokenRecord) {
      return res.status(400).json({ error: 'No active verification code found. Please request a new one.' });
    }

    // Check expiration
    const now = new Date();
    if (now > new Date(tokenRecord.expires_at)) {
      return res.status(400).json({ error: 'This verification code has expired. Please request a new code.' });
    }

    // Check maximum attempts (5 max)
    const maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 5;
    if (tokenRecord.attempts >= maxAttempts) {
      return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new verification code.' });
    }

    // Verify SHA-256 hash with timing safety
    const candidateHash = crypto.createHash('sha256').update(cleanCode + tokenRecord.user_id).digest('hex');
    const isMatch = crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(tokenRecord.code_hash));

    if (!isMatch) {
      const nextAttempts = tokenRecord.attempts + 1;
      db.prepare(`UPDATE email_verification_tokens SET attempts = ? WHERE id = ?`).run(nextAttempts, tokenRecord.id);
      const remaining = maxAttempts - nextAttempts;
      return res.status(400).json({
        error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'Please request a new code.'}`
      });
    }

    // Success: Mark token used & user email_verified = 1
    db.prepare(`UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?`).run(tokenRecord.id);
    db.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).run(tokenRecord.user_id);

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(tokenRecord.user_id);

    res.json({
      success: true,
      verified: true,
      user: sanitizeUser(updatedUser),
      message: 'Email verified successfully! Welcome to HireByMinutes.'
    });
  });

  // Resend Verification OTP (with 60s cooldown and rate limiting)
  router.post('/auth/resend-verification-otp', (req, res) => {
    const { email } = req.body;
    let targetEmail = email ? email.trim().toLowerCase() : null;

    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const tokenUser = db.prepare('SELECT * FROM users WHERE id = ?').get(authHeader.replace('Bearer ', ''));
      if (tokenUser) {
        targetEmail = targetEmail || tokenUser.email;
      }
    }

    if (!targetEmail) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(targetEmail);
    if (!user) {
      // Return generic response to avoid enumeration
      return res.json({ success: true, message: 'If an account exists, a new code has been sent.' });
    }

    if (user.email_verified) {
      return res.status(400).json({ error: 'This email is already verified. You can sign in directly.' });
    }

    // Check 60-second cooldown
    const cooldownSeconds = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 10) || 60;
    const lastToken = db.prepare(`
      SELECT * FROM email_verification_tokens 
      WHERE LOWER(email) = ? 
      ORDER BY created_at DESC LIMIT 1
    `).get(targetEmail);

    if (lastToken) {
      const parsedTime = (lastToken.created_at.includes('T') || lastToken.created_at.includes('Z'))
        ? new Date(lastToken.created_at).getTime()
        : new Date(lastToken.created_at.replace(' ', 'T') + 'Z').getTime();
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - parsedTime) / 1000));
      if (elapsedSeconds < cooldownSeconds) {
        const wait = cooldownSeconds - elapsedSeconds;
        return res.status(429).json({
          error: `Please wait ${wait} second${wait === 1 ? '' : 's'} before requesting another code.`,
          retryAfter: wait
        });
      }
    }

    // Invalidate previous active tokens
    db.prepare(`UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE LOWER(email) = ? AND used_at IS NULL`).run(targetEmail);

    // Generate fresh OTP
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(rawOtp + user.id).digest('hex');
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10;
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO email_verification_tokens (id, user_id, email, code_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`evt-${uuidv4().slice(0, 8)}`, user.id, targetEmail, otpHash, expiresAt, nowIso);

    emailService.sendVerificationOtp({
      email: targetEmail,
      name: user.full_name,
      otp: rawOtp,
      expiryMinutes,
      userId: user.id
    }).catch(err => console.error('Failed to resend verification email', err));

    res.json({
      success: true,
      message: 'A new 6-digit verification code has been sent to your email.'
    });
  });

  // Change Unverified Email (allows fixing email typos before OTP completion)
  router.post('/auth/change-unverified-email', (req, res) => {
    const { old_email, new_email } = req.body;
    if (!old_email || !new_email) {
      return res.status(400).json({ error: 'Both old and new email addresses are required.' });
    }

    const cleanOld = old_email.trim().toLowerCase();
    const cleanNew = new_email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanNew)) {
      return res.status(400).json({ error: 'Please enter a valid new email address.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cleanOld);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    if (user.email_verified) {
      return res.status(400).json({ error: 'Cannot change email for already verified accounts using this endpoint.' });
    }

    const existingNew = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanNew);
    if (existingNew) {
      return res.status(409).json({ error: 'An account with this new email already exists.' });
    }

    // Update email
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(cleanNew, user.id);

    // Invalidate old tokens
    db.prepare('UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(user.id);

    // Issue fresh OTP for new email
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(rawOtp + user.id).digest('hex');
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO email_verification_tokens (id, user_id, email, code_hash, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(`evt-${uuidv4().slice(0, 8)}`, user.id, cleanNew, otpHash, expiresAt);

    emailService.sendVerificationOtp({
      email: cleanNew,
      name: user.full_name,
      otp: rawOtp,
      expiryMinutes,
      userId: user.id
    }).catch(err => console.error('Failed to send verification email to new address', err));

    res.json({
      success: true,
      new_email: cleanNew,
      message: 'Email address updated. A new verification code has been sent.'
    });
  });

  // Forgot Password: Request Reset Link
  router.post('/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cleanEmail);

    if (user && !user.is_suspended) {
      // Invalidate existing reset tokens
      db.prepare('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL').run(user.id);

      // Generate cryptographically secure random 32-byte hex token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiryMinutes = parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES, 10) || 30;
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(`prt-${uuidv4().slice(0, 8)}`, user.id, tokenHash, expiresAt);

      emailService.sendPasswordReset({
        email: cleanEmail,
        name: user.full_name,
        resetToken: rawToken,
        expiryMinutes,
        userId: user.id
      }).catch(err => console.error('Failed to send password reset email', err));
    }

    // Generic safe response to prevent email enumeration
    res.json({
      success: true,
      message: 'If an account exists with that email, a password reset link has been sent.'
    });
  });

  // Reset Password: Apply New Password using Reset Token
  router.post('/auth/reset-password', (req, res) => {
    const { email, token, new_password } = req.body;

    if (!token || !new_password) {
      return res.status(400).json({ error: 'Reset token and new password are required.' });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    if (!/[A-Za-z]/.test(new_password) || !/\d/.test(new_password)) {
      return res.status(400).json({ error: 'Password must contain at least one letter and one number.' });
    }

    const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');

    const resetRecord = db.prepare(`
      SELECT * FROM password_reset_tokens 
      WHERE token_hash = ? AND used_at IS NULL
    `).get(tokenHash);

    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid or expired password reset link.' });
    }

    if (new Date() > new Date(resetRecord.expires_at)) {
      return res.status(400).json({ error: 'This password reset link has expired. Please request a new one.' });
    }

    // Update password hash
    const newHash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, resetRecord.user_id);

    // Invalidate reset token
    db.prepare('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(resetRecord.id);

    res.json({
      success: true,
      message: 'Your password has been reset successfully. You can now log in.'
    });
  });

  // Admin Test Email Dispatch Endpoint
  router.post('/admin/test-email', adminAuthMiddleware, async (req, res) => {
    const { to } = req.body;
    const recipient = to || req.user.email;

    try {
      const result = await emailService.sendMail({
        to: recipient,
        subject: 'HireByMinutes System Test Email',
        template: 'test_email',
        html: emailService.wrapHtml({
          title: 'Email Delivery Test',
          contentHtml: `<p class="paragraph">This is a test notification confirming that the HireByMinutes email delivery system is functioning correctly.</p>`
        }),
        text: 'This is a test notification confirming that the HireByMinutes email delivery system is functioning correctly.',
        userId: req.user.id
      });

      res.json({ success: true, result, message: `Test email dispatched to ${recipient}` });
    } catch (err) {
      res.status(500).json({ error: `Failed to dispatch test email: ${err.message}` });
    }
  });

  // ==========================================
  // FILE & PROFILE PHOTO UPLOADS
  // ==========================================
  const avatarUpload = multer({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for profile images
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];

      if (!allowedMimes.includes(file.mimetype) || !allowedExts.includes(ext)) {
        return cb(new Error('Invalid file format. Only JPG, PNG, and WEBP images are supported.'));
      }
      cb(null, true);
    }
  });

  router.post('/upload/avatar', avatarUpload.single('photo'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided for upload.' });
    }
    try {
      const uploadResult = await storageService.upload({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        folder: 'avatars'
      });
      res.json({
        url: uploadResult.url,
        filename: uploadResult.filename,
        size: uploadResult.size,
        mimetype: uploadResult.mimeType,
        provider: uploadResult.provider,
        message: 'Profile photo uploaded successfully.'
      });
    } catch (err) {
      console.error('[Avatar Upload Error]', err.message);
      res.status(500).json({ error: 'Failed to process avatar upload' });
    }
  }, (err, req, res, next) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Image upload failed.' });
    }
    next();
  });

  // ==========================================
  // PROFILE MANAGEMENT (GET & PATCH)
  // ==========================================
  router.get('/users/profile/me', authMiddleware, (req, res) => {
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let service = null;
    if (user.role === 'provider' || user.role === 'admin') {
      const srv = db.prepare(`
        SELECT s.*, c.name as category_name, c.slug as category_slug
        FROM services s
        LEFT JOIN categories c ON s.category_id = c.id
        WHERE s.provider_id = ?
        ORDER BY s.created_at DESC
        LIMIT 1
      `).get(user.id);
      if (srv) {
        service = {
          ...srv,
          skills: JSON.parse(srv.skills_json || '[]'),
          languages: JSON.parse(srv.languages_json || '[]')
        };
      }
    }

    res.json({
      user: sanitizeUser(user),
      service
    });
  });

  router.patch('/users/profile/me', authMiddleware, (req, res) => {
    const {
      full_name,
      avatar_url,
      bio,
      headline,
      location,
      country,
      state_region,
      city,
      area,
      languages,
      skills,
      experience_years,
      // Expert-specific fields
      service_title,
      service_description,
      subcategory,
      category_id,
      price_per_minute,
      available_now
    } = req.body;

    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Validate full name
    const newFullName = full_name !== undefined ? full_name.trim() : user.full_name;
    if (!newFullName) {
      return res.status(400).json({ error: 'Full name cannot be empty.' });
    }

    // Languages and Skills JSON sanitization
    let languagesJson = user.languages_json;
    if (languages !== undefined) {
      const langsArray = Array.isArray(languages)
        ? languages.map(l => String(l).trim()).filter(Boolean)
        : String(languages).split(',').map(l => l.trim()).filter(Boolean);
      languagesJson = JSON.stringify(langsArray.length > 0 ? langsArray : ['English']);
    }

    let skillsJson = user.skills_json;
    if (skills !== undefined) {
      const skillsArray = Array.isArray(skills)
        ? skills.map(s => String(s).trim()).filter(Boolean)
        : String(skills).split(',').map(s => s.trim()).filter(Boolean);
      skillsJson = JSON.stringify(skillsArray);
    }

    const newAvatarUrl = avatar_url !== undefined ? avatar_url : user.avatar_url;
    const newBio = bio !== undefined ? String(bio).trim() : user.bio;
    const newHeadline = headline !== undefined ? String(headline).trim() : user.headline;
    const newLocation = location !== undefined ? String(location).trim() : user.location;
    const newCountry = country !== undefined ? String(country).trim() : (user.country || 'United States');
    const newStateRegion = state_region !== undefined ? String(state_region).trim() : (user.state_region || '');
    const newCity = city !== undefined ? String(city).trim() : (user.city || '');
    const newArea = area !== undefined ? String(area).trim() : (user.area || '');
    const newExpYears = experience_years !== undefined ? Math.max(0, parseInt(experience_years) || 0) : user.experience_years;

    // Update user profile record (Strictly prevents editing username, role, id, verified, rating, etc.)
    db.prepare(`
      UPDATE users 
      SET full_name = ?, avatar_url = ?, bio = ?, headline = ?, location = ?,
          country = ?, state_region = ?, city = ?, area = ?,
          languages_json = ?, skills_json = ?, experience_years = ?
      WHERE id = ?
    `).run(
      newFullName,
      newAvatarUrl,
      newBio,
      newHeadline,
      newLocation,
      newCountry,
      newStateRegion,
      newCity,
      newArea,
      languagesJson,
      skillsJson,
      newExpYears,
      user.id
    );

    // If expert information provided, update the provider's active/primary service
    let updatedService = null;
    if (user.role === 'provider' || user.role === 'admin') {
      const existingService = db.prepare(`SELECT * FROM services WHERE provider_id = ? ORDER BY created_at DESC LIMIT 1`).get(user.id);
      
      if (existingService) {
        let newPrice = existingService.price_per_minute;
        if (price_per_minute !== undefined) {
          const parsedPrice = parseFloat(price_per_minute);
          if (isNaN(parsedPrice) || parsedPrice <= 0 || parsedPrice > 100) {
            return res.status(400).json({ error: 'Rate per minute must be a valid positive number between $0.10 and $100.00' });
          }
          newPrice = Number(parsedPrice.toFixed(2));
        }

        const newServiceTitle = service_title !== undefined && service_title.trim() ? service_title.trim() : existingService.title;
        const newServiceDesc = service_description !== undefined && service_description.trim() ? service_description.trim() : existingService.description;
        const newSubcategory = subcategory !== undefined && subcategory.trim() ? subcategory.trim() : (existingService.subcategory || '');
        const newCategoryId = category_id !== undefined && category_id ? category_id : existingService.category_id;
        const newAvailableNow = available_now !== undefined ? (available_now ? 1 : 0) : existingService.available_now;

        db.prepare(`
          UPDATE services 
          SET title = ?, description = ?, subcategory = ?, category_id = ?, price_per_minute = ?, 
              country = ?, city = ?, skills_json = ?, languages_json = ?, experience_years = ?, available_now = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          newServiceTitle,
          newServiceDesc,
          newSubcategory,
          newCategoryId,
          newPrice,
          newCountry,
          newCity,
          skillsJson,
          languagesJson,
          newExpYears,
          newAvailableNow,
          existingService.id
        );

        const srv = db.prepare(`
          SELECT s.*, c.name as category_name, c.slug as category_slug
          FROM services s
          LEFT JOIN categories c ON s.category_id = c.id
          WHERE s.id = ?
        `).get(existingService.id);

        updatedService = {
          ...srv,
          skills: JSON.parse(srv.skills_json || '[]'),
          languages: JSON.parse(srv.languages_json || '[]')
        };
      }
    }

    const updatedUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);

    res.json({
      success: true,
      user: sanitizeUser(updatedUser),
      service: updatedService,
      message: 'Profile updated successfully.'
    });
  });

  // ==========================================
  // CATEGORIES
  // ==========================================
  router.get('/categories', (req, res) => {
    const categories = db.prepare(`
      SELECT c.*, 
             COUNT(s.id) as active_services_count
      FROM categories c
      LEFT JOIN services s ON c.id = s.category_id AND s.listing_status = 'active'
      WHERE c.active = 1
      GROUP BY c.id
      ORDER BY c.sort_order ASC
    `).all();
    res.json({ categories });
  });

  // ==========================================
  // SERVICES & EXPERTS MARKETPLACE
  // ==========================================
  router.get('/services/featured', (req, res) => {
    const services = db.prepare(`
      SELECT s.*, 
             u.full_name as provider_name, u.avatar_url as provider_avatar, 
             u.headline as provider_headline, u.rating as provider_rating, 
             u.review_count as provider_review_count, u.verified as provider_verified,
             u.response_time as provider_response_time, u.country as provider_country,
             u.city as provider_city, u.state_region as provider_state_region,
             u.area as provider_area, u.languages_json as provider_languages_json,
             c.name as category_name, c.slug as category_slug
      FROM services s
      JOIN users u ON s.provider_id = u.id
      JOIN categories c ON s.category_id = c.id
      WHERE s.listing_status = 'active' AND u.is_suspended = 0
      ORDER BY u.rating DESC, u.sessions_completed DESC
      LIMIT 6
    `).all();

    const formatted = services.map(s => {
      let parsedLangs = [];
      try {
        parsedLangs = JSON.parse(s.languages_json || s.provider_languages_json || '["English"]');
      } catch {
        parsedLangs = ['English'];
      }
      return {
        ...s,
        country: s.country || s.provider_country || 'United States',
        city: s.city || s.provider_city || '',
        state_region: s.provider_state_region || '',
        area: s.provider_area || '',
        skills: JSON.parse(s.skills_json || '[]'),
        languages: parsedLangs
      };
    });

    res.json({ services: formatted });
  });

  router.get('/services', (req, res) => {
    const { category, subcategory, search, minPrice, maxPrice, rating, verified, availableNow, language, country, city } = req.query;

    let query = `
      SELECT s.*, 
             u.full_name as provider_name, u.avatar_url as provider_avatar, 
             u.headline as provider_headline, u.bio as provider_bio, u.rating as provider_rating, 
             u.review_count as provider_review_count, u.verified as provider_verified,
             u.response_time as provider_response_time, u.sessions_completed,
             u.country as provider_country, u.state_region as provider_state_region,
             u.city as provider_city, u.area as provider_area,
             u.languages_json as provider_languages_json,
             c.name as category_name, c.slug as category_slug
      FROM services s
      JOIN users u ON s.provider_id = u.id
      JOIN categories c ON s.category_id = c.id
      WHERE s.listing_status = 'active' AND u.is_suspended = 0
    `;
    const params = [];

    if (category && category !== 'all') {
      query += ` AND (c.slug = ? OR c.id = ?)`;
      params.push(category, category);
    }

    if (subcategory && subcategory !== 'all') {
      query += ` AND (s.subcategory = ? OR s.subcategory LIKE ?)`;
      params.push(subcategory, `%${subcategory}%`);
    }

    if (country && country !== 'all') {
      query += ` AND (u.country = ? OR s.country = ? OR u.country LIKE ?)`;
      params.push(country, country, `%${country}%`);
    }

    if (city && city !== 'all') {
      query += ` AND (u.city LIKE ? OR u.area LIKE ? OR u.state_region LIKE ? OR u.location LIKE ?)`;
      const cityTerm = `%${city}%`;
      params.push(cityTerm, cityTerm, cityTerm, cityTerm);
    }

    if (language && language !== 'all') {
      query += ` AND (s.languages_json LIKE ? OR u.languages_json LIKE ?)`;
      params.push(`%${language}%`, `%${language}%`);
    }

    if (search) {
      query += ` AND (
        s.title LIKE ? OR 
        s.description LIKE ? OR 
        s.subcategory LIKE ? OR
        s.skills_json LIKE ? OR 
        s.languages_json LIKE ? OR 
        u.full_name LIKE ? OR 
        u.username LIKE ? OR
        u.headline LIKE ? OR 
        u.bio LIKE ? OR
        u.country LIKE ? OR
        u.state_region LIKE ? OR
        u.city LIKE ? OR
        u.area LIKE ? OR
        u.location LIKE ? OR
        u.languages_json LIKE ? OR
        c.name LIKE ?
      )`;
      const term = `%${search}%`;
      params.push(
        term, term, term, term, term,
        term, term, term, term, term,
        term, term, term, term, term,
        term
      );
    }

    if (minPrice) {
      query += ` AND s.price_per_minute >= ?`;
      params.push(Number(minPrice));
    }

    if (maxPrice) {
      query += ` AND s.price_per_minute <= ?`;
      params.push(Number(maxPrice));
    }

    if (rating) {
      query += ` AND u.rating >= ?`;
      params.push(Number(rating));
    }

    if (verified === 'true' || verified === '1') {
      query += ` AND u.verified = 1`;
    }

    if (availableNow === 'true' || availableNow === '1') {
      query += ` AND s.available_now = 1`;
    }

    query += ` ORDER BY u.rating DESC, u.sessions_completed DESC`;

    const services = db.prepare(query).all(...params);
    const formatted = services.map(s => {
      let parsedLangs = [];
      try {
        parsedLangs = JSON.parse(s.languages_json || s.provider_languages_json || '["English"]');
      } catch {
        parsedLangs = ['English'];
      }
      return {
        ...s,
        country: s.country || s.provider_country || 'United States',
        city: s.city || s.provider_city || '',
        state_region: s.provider_state_region || '',
        area: s.provider_area || '',
        skills: JSON.parse(s.skills_json || '[]'),
        languages: parsedLangs
      };
    });

    res.json({ services: formatted, count: formatted.length });
  });

  router.get('/services/:id', (req, res) => {
    const service = db.prepare(`
      SELECT s.*, 
             u.id as provider_id, u.full_name as provider_name, u.avatar_url as provider_avatar, 
             u.headline as provider_headline, u.bio as provider_bio, u.rating as provider_rating, 
             u.review_count as provider_review_count, u.verified as provider_verified,
             u.response_time as provider_response_time, u.sessions_completed, u.member_since,
             u.country as provider_country, u.state_region as provider_state_region,
             u.city as provider_city, u.area as provider_area,
             u.languages_json as provider_languages_json,
             c.id as category_id, c.name as category_name, c.slug as category_slug
      FROM services s
      JOIN users u ON s.provider_id = u.id
      JOIN categories c ON s.category_id = c.id
      WHERE s.id = ?
    `).get(req.params.id);

    if (!service) {
      return res.status(404).json({ error: 'Service listing not found.' });
    }

    let parsedLangs = [];
    try {
      parsedLangs = JSON.parse(service.languages_json || service.provider_languages_json || '["English"]');
    } catch {
      parsedLangs = ['English'];
    }

    const formattedService = {
      ...service,
      country: service.country || service.provider_country || 'United States',
      city: service.city || service.provider_city || '',
      state_region: service.provider_state_region || '',
      area: service.provider_area || '',
      skills: JSON.parse(service.skills_json || '[]'),
      languages: parsedLangs
    };

    if (!service) {
      return res.status(404).json({ error: 'Service listing not found.' });
    }

    // Availability
    const availability = db.prepare(`
      SELECT * FROM provider_availability WHERE provider_id = ? AND is_active = 1 ORDER BY day_of_week ASC
    `).all(service.provider_id);

    // Reviews
    const reviews = db.prepare(`
      SELECT r.*, c.full_name as client_name, c.avatar_url as client_avatar
      FROM reviews r
      JOIN users c ON r.client_id = c.id
      WHERE r.service_id = ?
      ORDER BY r.created_at DESC
      LIMIT 10
    `).all(service.id);

    res.json({
      service: formattedService,
      availability,
      reviews
    });
  });

  // Create Service Listing (Provider Onboarding Flow)
  router.post('/services', authMiddleware, (req, res) => {
    const { title, category_id, description, price_per_minute, skills = [], languages = ['English'], experience_years = 5, available_now = 1 } = req.body;

    if (!title || !category_id || !description || !price_per_minute) {
      return res.status(400).json({ error: 'Title, category, description, and price per minute are required.' });
    }

    const id = `srv-${uuidv4().slice(0, 8)}`;
    const feeData = getEffectiveListingFee();
    const isFreePromotion = feeData.fee === 0;

    if (isFreePromotion) {
      // Free promotion active: activate service immediately ($0 fee)
      const paymentId = `promo-free-${uuidv4().slice(0, 8)}`;
      db.prepare(`
        INSERT INTO services (id, provider_id, title, category_id, description, price_per_minute, listing_status, listing_fee_paid, listing_fee_payment_id, skills_json, languages_json, experience_years, available_now)
        VALUES (?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?, ?)
      `).run(
        id,
        req.user.id,
        title.trim(),
        category_id,
        description.trim(),
        Number(price_per_minute),
        paymentId,
        JSON.stringify(skills),
        JSON.stringify(languages),
        Number(experience_years),
        available_now ? 1 : 0
      );

      // Log $0 promotional listing payment record
      db.prepare(`
        INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
        VALUES (?, ?, 'listing_fee', 0.00, 'succeeded', ?, ?)
      `).run(paymentId, req.user.id, id, JSON.stringify({
        service_title: title.trim(),
        campaign_id: feeData.activeCampaign?.id || 'launch-promo',
        description: 'Temporary Launch Promotion: $0 Free Registration & Listing Fee'
      }));

      db.prepare(`UPDATE categories SET service_count = service_count + 1 WHERE id = ?`).run(category_id);

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `notif-${uuidv4().slice(0, 8)}`,
        req.user.id,
        'Service is Live (Free Launch Promotion)',
        `"${title.trim()}" is active and published immediately with $0 listing fee!`,
        'success',
        `/services/${id}`
      );

      if (req.user.role !== 'admin' && req.user.role !== 'provider') {
        db.prepare(`UPDATE users SET role = 'provider' WHERE id = ?`).run(req.user.id);
      }

      const created = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
      return res.status(201).json({
        service: created,
        is_free: true,
        message: 'Free registration campaign active! Your service listing is live immediately with $0 listing fee.'
      });
    } else {
      // Normal listing fee applies: create draft
      db.prepare(`
        INSERT INTO services (id, provider_id, title, category_id, description, price_per_minute, listing_status, listing_fee_paid, skills_json, languages_json, experience_years, available_now)
        VALUES (?, ?, ?, ?, ?, ?, 'pending_payment', 0, ?, ?, ?, ?)
      `).run(
        id,
        req.user.id,
        title.trim(),
        category_id,
        description.trim(),
        Number(price_per_minute),
        JSON.stringify(skills),
        JSON.stringify(languages),
        Number(experience_years),
        available_now ? 1 : 0
      );

      if (req.user.role !== 'admin' && req.user.role !== 'provider') {
        db.prepare(`UPDATE users SET role = 'provider' WHERE id = ?`).run(req.user.id);
      }

      const created = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
      return res.status(201).json({
        service: created,
        is_free: false,
        fee: feeData.fee,
        message: `Service draft created. Pay $${feeData.fee.toFixed(2)} listing fee to publish.`
      });
    }
  });

  // Pay Listing Fee to Activate Service
  router.post('/services/:id/pay-listing-fee', authMiddleware, (req, res) => {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    if (service.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to publish this service.' });
    }

    if (service.listing_status === 'active' && service.listing_fee_paid === 1) {
      return res.json({ success: true, message: 'Service is already active and published.', service });
    }

    const feeData = getEffectiveListingFee();
    const feeAmount = feeData.fee;
    const isFree = feeAmount === 0;
    const paymentId = isFree ? `promo-free-${uuidv4().slice(0, 8)}` : `pay-fee-${uuidv4().slice(0, 8)}`;

    db.prepare(`
      INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
      VALUES (?, ?, 'listing_fee', ?, 'succeeded', ?, ?)
    `).run(paymentId, req.user.id, feeAmount, service.id, JSON.stringify({
      service_title: service.title,
      description: isFree ? 'Free Launch Promotion Registration Waiver' : `HireByMinutes $${feeAmount.toFixed(2)} Service Listing Activation Fee`
    }));

    db.prepare(`
      UPDATE services 
      SET listing_status = 'active', listing_fee_paid = 1, listing_fee_payment_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(paymentId, service.id);

    db.prepare(`UPDATE categories SET service_count = service_count + 1 WHERE id = ?`).run(service.category_id);

    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      req.user.id,
      'Service is Live!',
      `"${service.title}" is now active and ready for bookings.`,
      'success',
      `/services/${service.id}`
    );

    res.json({
      success: true,
      message: isFree ? 'Free launch promotion applied! Service is live.' : 'Your service is now live on HireByMinutes!',
      paymentId,
      fee: feeAmount
    });
  });

  // Create Razorpay Order for Listing Fee (Server-Authoritative)
  router.post('/services/:id/create-listing-order', authMiddleware, async (req, res) => {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    if (service.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to publish this service.' });
    }

    if (service.listing_status === 'active' && service.listing_fee_paid === 1) {
      return res.json({ success: true, already_active: true, message: 'Service is already active.', service });
    }

    const feeData = getEffectiveListingFee();
    const listingFeeUsd = feeData.fee;

    // If promotion is active and fee is 0, activate immediately with no Razorpay order
    if (listingFeeUsd === 0) {
      const paymentId = `promo-free-${uuidv4().slice(0, 8)}`;
      db.prepare(`
        INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
        VALUES (?, ?, 'listing_fee', 0.00, 'succeeded', ?, ?)
      `).run(paymentId, req.user.id, service.id, JSON.stringify({
        service_title: service.title,
        description: 'Temporary Launch Promotion: $0 Free Registration & Listing Fee'
      }));

      db.prepare(`
        UPDATE services 
        SET listing_status = 'active', listing_fee_paid = 1, listing_fee_payment_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(paymentId, service.id);

      db.prepare(`UPDATE categories SET service_count = service_count + 1 WHERE id = ?`).run(service.category_id);

      return res.json({
        free_activated: true,
        amount: 0,
        message: 'Free registration promotion applied! Service is live.'
      });
    }

    const amountInPaise = Math.round(listingFeeUsd * 100);
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_live_placeholder';
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    try {
      if (process.env.NODE_ENV === 'production' && keySecret && !keyId.includes('placeholder')) {
        const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency: 'USD',
            receipt: `fee_${service.id}`,
            notes: {
              service_id: service.id,
              provider_id: service.provider_id,
              service_title: service.title
            }
          })
        });

        if (!rzpRes.ok) {
          const rzpErr = await rzpRes.json();
          throw new Error(rzpErr.error?.description || 'Razorpay order creation failed');
        }

        const rzpOrder = await rzpRes.json();
        return res.json({
          order_id: rzpOrder.id,
          amount: listingFeeUsd,
          amount_paise: amountInPaise,
          currency: rzpOrder.currency || 'USD',
          key_id: keyId,
          service_id: service.id
        });
      } else {
        const simulatedOrderId = `order_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
        return res.json({
          order_id: simulatedOrderId,
          amount: listingFeeUsd,
          amount_paise: amountInPaise,
          currency: 'USD',
          key_id: keyId,
          service_id: service.id
        });
      }
    } catch (err) {
      console.error('[Razorpay Listing Fee Order Error]', err.message);
      return res.status(500).json({ error: `Payment gateway error: ${err.message}` });
    }
  });

  // Verify Razorpay Payment for Listing Fee (Server-Authoritative)
  router.post('/services/:id/verify-listing-payment', authMiddleware, async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    if (service.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to publish this service.' });
    }

    if (service.listing_status === 'active' && service.listing_fee_paid === 1) {
      return res.json({ success: true, message: 'Service is already active and published.', service });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (process.env.NODE_ENV === 'production' && keySecret) {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: 'Missing Razorpay signature verification parameters.' });
      }

      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({ error: 'Invalid Razorpay payment signature. Verification failed.' });
      }
    }

    const feeData = getEffectiveListingFee();
    const listingFeeUsd = feeData.fee;
    const paymentId = razorpay_payment_id || `pay-fee-${uuidv4().slice(0, 8)}`;

    db.prepare(`
      INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
      VALUES (?, ?, 'listing_fee', ?, 'succeeded', ?, ?)
    `).run(paymentId, req.user.id, listingFeeUsd, service.id, JSON.stringify({
      gateway: 'razorpay',
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      service_title: service.title,
      description: `HireByMinutes $${listingFeeUsd.toFixed(2)} Service Listing Activation Fee`
    }));

    db.prepare(`
      UPDATE services 
      SET listing_status = 'active', listing_fee_paid = 1, listing_fee_payment_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(paymentId, service.id);

    db.prepare(`UPDATE categories SET service_count = service_count + 1 WHERE id = ?`).run(service.category_id);

    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      req.user.id,
      'Service is Live (Razorpay Verified)',
      `"${service.title}" is now active and ready for bookings.`,
      'success',
      `/services/${service.id}`
    );

    const updatedService = db.prepare('SELECT * FROM services WHERE id = ?').get(service.id);

    res.json({
      success: true,
      message: 'Razorpay payment verified. Your service is now live on HireByMinutes!',
      service: updatedService,
      paymentId
    });
  });

  // Toggle Service Status
  router.patch('/services/:id/status', authMiddleware, (req, res) => {
    const { status } = req.body;
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    if (service.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    db.prepare(`UPDATE services SET listing_status = ? WHERE id = ?`).run(status, service.id);
    res.json({ success: true, status });
  });

  // ==========================================
  // CONSULTATION REQUESTS (APPROVAL-FIRST FLOW)
  // ==========================================

  // Auto-expiration sweeper (runs in background and on query)
  function checkAndExpireRequests(ioInstance) {
    try {
      const nowIso = new Date().toISOString();
      const expiredList = db.prepare(`
        SELECT cr.*, s.title as service_title, c.full_name as client_name, c.email as client_email,
               p.full_name as provider_name, p.email as provider_email
        FROM consultation_requests cr
        JOIN services s ON cr.service_id = s.id
        JOIN users c ON cr.client_id = c.id
        JOIN users p ON cr.provider_id = p.id
        WHERE cr.status = 'PENDING_EXPERT' AND cr.response_deadline <= ?
      `).all(nowIso);

      if (expiredList.length > 0) {
        const updateStmt = db.prepare(`
          UPDATE consultation_requests 
          SET status = 'EXPIRED', expired_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `);

        for (const reqItem of expiredList) {
          updateStmt.run(reqItem.id);
          
          // Emit socket events
          if (ioInstance) {
            ioInstance.to(`user_${reqItem.client_id}`).emit('consultation_request_expired', {
              requestId: reqItem.id,
              serviceTitle: reqItem.service_title,
              providerName: reqItem.provider_name
            });
            ioInstance.to(`user_${reqItem.provider_id}`).emit('consultation_request_expired', {
              requestId: reqItem.id
            });
          }

          // Email client
          emailService.sendConsultationExpired({
            clientEmail: reqItem.client_email,
            clientName: reqItem.client_name,
            expertName: reqItem.provider_name,
            serviceTitle: reqItem.service_title
          }).catch(err => console.error('Failed to send expired email', err));
        }
      }
    } catch (err) {
      console.error('Error in checkAndExpireRequests:', err);
    }
  }

  // Set periodic background sweeper (every 5 seconds)
  setInterval(() => checkAndExpireRequests(io), 5000);

  // Helper to format consultation request with remaining_seconds
  function formatConsultationRequest(reqItem) {
    if (!reqItem) return null;
    const now = Date.now();
    const deadline = new Date(reqItem.response_deadline).getTime();
    let remaining_seconds = 0;
    if (reqItem.status === 'PENDING_EXPERT') {
      remaining_seconds = Math.max(0, Math.floor((deadline - now) / 1000));
      if (remaining_seconds === 0) {
        reqItem.status = 'EXPIRED';
      }
    }
    return {
      ...reqItem,
      attachments: JSON.parse(reqItem.attachments_json || '[]'),
      remaining_seconds
    };
  }

  // 1. Create Consultation Request (Client sends request; NO PAYMENT, NO SESSION)
  router.post('/consultation-requests', authMiddleware, async (req, res) => {
    const { service_id, duration_minutes, connect_type = 'now', scheduled_start, problem_description = '', attachments = [] } = req.body;
    const client_id = req.user.id;

    if (!service_id || !duration_minutes) {
      return res.status(400).json({ error: 'Service ID and duration are required.' });
    }

    if (!problem_description || !problem_description.trim()) {
      return res.status(400).json({ error: 'Please provide a brief problem description or topic for the expert.' });
    }

    const service = db.prepare(`
      SELECT s.*, u.full_name as provider_name, u.email as provider_email, u.verified as provider_verified
      FROM services s
      JOIN users u ON s.provider_id = u.id
      WHERE s.id = ?
    `).get(service_id);

    if (!service) {
      return res.status(404).json({ error: 'Service listing not found.' });
    }

    if (service.listing_status !== 'active') {
      return res.status(400).json({ error: 'This service is currently not accepting consultation requests.' });
    }

    if (service.provider_id === client_id) {
      return res.status(400).json({ error: 'You cannot request a consultation with yourself.' });
    }

    const duration = parseInt(duration_minutes, 10);
    if (isNaN(duration) || duration < 5 || duration > 300) {
      return res.status(400).json({ error: 'Duration must be between 5 and 300 minutes.' });
    }

    // Price calculated strictly server-side
    const pricePerMinute = service.price_per_minute;
    const totalPrice = Number((duration * pricePerMinute).toFixed(2));

    const startTime = scheduled_start ? new Date(scheduled_start) : new Date();
    const requestId = `cr-${uuidv4().slice(0, 8)}`;
    
    // Server-authoritative 10-minute response deadline
    const responseDeadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO consultation_requests (
        id, client_id, provider_id, service_id, duration_minutes, price_per_minute, total_price,
        connect_type, scheduled_start, problem_description, attachments_json, status, response_deadline
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_EXPERT', ?)
    `).run(
      requestId,
      client_id,
      service.provider_id,
      service_id,
      duration,
      pricePerMinute,
      totalPrice,
      connect_type,
      startTime.toISOString(),
      problem_description.trim(),
      JSON.stringify(attachments),
      responseDeadline
    );

    // Maintain backwards-compatible bookings record for foreign keys
    db.prepare(`
      INSERT OR IGNORE INTO bookings (id, client_id, provider_id, service_id, duration_minutes, total_price, scheduled_start, scheduled_end, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `).run(
      requestId,
      client_id,
      service.provider_id,
      service_id,
      duration,
      totalPrice,
      startTime.toISOString(),
      new Date(startTime.getTime() + duration * 60 * 1000).toISOString(),
      problem_description.trim()
    );

    // In-app notification for Provider
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      service.provider_id,
      'New Consultation Request',
      `${req.user.full_name} requested a ${duration}-minute consultation. Please respond within 10 minutes.`,
      'consultation_request',
      `/provider`
    );

    // Real-time Socket.IO dispatch
    io.to(`user_${service.provider_id}`).emit('consultation_request_created', {
      requestId,
      clientName: req.user.full_name,
      clientAvatar: req.user.avatar_url,
      serviceTitle: service.title,
      durationMinutes: duration,
      connectType: connect_type,
      totalPrice,
      problemDescription: problem_description.trim(),
      responseDeadline,
      remainingSeconds: 600
    });

    // Email dispatch to Expert
    emailService.sendConsultationRequest({
      expertEmail: service.provider_email,
      expertName: service.provider_name,
      clientName: req.user.full_name,
      serviceTitle: service.title,
      durationMinutes: duration,
      connectType: connect_type,
      problemDescription: problem_description.trim(),
      ratePerMinute: pricePerMinute,
      totalPrice,
      requestId,
      expertId: service.provider_id
    }).catch(err => console.error('Failed to send new request email', err));

    const created = db.prepare(`SELECT * FROM consultation_requests WHERE id = ?`).get(requestId);

    res.status(201).json({
      request: formatConsultationRequest(created),
      message: 'Consultation request sent to expert. Response window: 10 minutes. No payment was taken.'
    });
  });

  // 2. Get User's Consultation Requests
  router.get('/consultation-requests', authMiddleware, (req, res) => {
    checkAndExpireRequests(io);

    let query = `
      SELECT cr.*, 
             s.title as service_title, s.category_id,
             c.full_name as client_name, c.avatar_url as client_avatar, c.email as client_email,
             p.full_name as provider_name, p.avatar_url as provider_avatar, p.email as provider_email, p.headline as provider_headline
      FROM consultation_requests cr
      JOIN services s ON cr.service_id = s.id
      JOIN users c ON cr.client_id = c.id
      JOIN users p ON cr.provider_id = p.id
    `;
    const params = [];

    if (req.user.role === 'admin') {
      // Admin sees all
    } else if (req.query.role === 'provider' || req.user.role === 'provider') {
      query += ` WHERE cr.provider_id = ?`;
      params.push(req.user.id);
    } else {
      query += ` WHERE cr.client_id = ?`;
      params.push(req.user.id);
    }

    query += ` ORDER BY cr.created_at DESC`;

    const rawRequests = db.prepare(query).all(...params);
    const requests = rawRequests.map(formatConsultationRequest);

    res.json({ requests, count: requests.length });
  });

  // 3. Get Single Consultation Request by ID
  router.get('/consultation-requests/:id', authMiddleware, (req, res) => {
    checkAndExpireRequests(io);

    const raw = db.prepare(`
      SELECT cr.*, 
             s.title as service_title, s.price_per_minute as service_price_per_minute,
             c.full_name as client_name, c.avatar_url as client_avatar, c.email as client_email,
             p.full_name as provider_name, p.avatar_url as provider_avatar, p.email as provider_email, p.headline as provider_headline
      FROM consultation_requests cr
      JOIN services s ON cr.service_id = s.id
      JOIN users c ON cr.client_id = c.id
      JOIN users p ON cr.provider_id = p.id
      WHERE cr.id = ?
    `).get(req.params.id);

    if (!raw) {
      return res.status(404).json({ error: 'Consultation request not found.' });
    }

    if (raw.client_id !== req.user.id && raw.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to view this consultation request.' });
    }

    res.json({ request: formatConsultationRequest(raw) });
  });

  // 4. Expert Accepts Request (Status -> ACCEPTED; notifies Client to Pay)
  router.post('/consultation-requests/:id/accept', authMiddleware, (req, res) => {
    checkAndExpireRequests(io);

    const request = db.prepare(`
      SELECT cr.*, s.title as service_title,
             c.full_name as client_name, c.email as client_email,
             p.full_name as provider_name, p.email as provider_email
      FROM consultation_requests cr
      JOIN services s ON cr.service_id = s.id
      JOIN users c ON cr.client_id = c.id
      JOIN users p ON cr.provider_id = p.id
      WHERE cr.id = ?
    `).get(req.params.id);

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found.' });
    }

    if (request.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Only the requested expert can accept this request.' });
    }

    if (request.status !== 'PENDING_EXPERT') {
      return res.status(400).json({ error: `Cannot accept request: Current status is ${request.status}.` });
    }

    const now = new Date();
    if (now > new Date(request.response_deadline)) {
      db.prepare(`UPDATE consultation_requests SET status = 'EXPIRED', expired_at = CURRENT_TIMESTAMP WHERE id = ?`).run(request.id);
      return res.status(400).json({ error: 'Request expired. The 10-minute response window has ended.' });
    }

    // Atomic update to ACCEPTED
    db.prepare(`
      UPDATE consultation_requests 
      SET status = 'ACCEPTED', accepted_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(request.id);

    // In-app notification for Client
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      request.client_id,
      'Expert Available ✓',
      `${request.provider_name} has accepted your request. Complete payment to begin.`,
      'success',
      `/client`
    );

    // Real-time Socket.IO dispatch
    io.to(`user_${request.client_id}`).emit('consultation_request_accepted', {
      requestId: request.id,
      providerName: request.provider_name,
      totalPrice: request.total_price,
      serviceTitle: request.service_title
    });
    io.to(`user_${request.client_id}`).emit('consultation_payment_available', {
      requestId: request.id,
      totalPrice: request.total_price
    });

    // Email dispatch to Client
    emailService.sendConsultationAccepted({
      clientEmail: request.client_email,
      clientName: request.client_name,
      expertName: request.provider_name,
      serviceTitle: request.service_title,
      durationMinutes: request.duration_minutes,
      totalPrice: request.total_price,
      requestId: request.id
    }).catch(err => console.error('Failed to send accepted email', err));

    const updated = db.prepare(`SELECT * FROM consultation_requests WHERE id = ?`).get(request.id);

    res.json({
      success: true,
      request: formatConsultationRequest(updated),
      message: 'Request accepted. Client has been notified to complete payment.'
    });
  });

  // 5. Expert Declines Request (Status -> DECLINED; No payment)
  router.post('/consultation-requests/:id/decline', authMiddleware, (req, res) => {
    checkAndExpireRequests(io);

    const request = db.prepare(`
      SELECT cr.*, s.title as service_title,
             c.full_name as client_name, c.email as client_email,
             p.full_name as provider_name
      FROM consultation_requests cr
      JOIN services s ON cr.service_id = s.id
      JOIN users c ON cr.client_id = c.id
      JOIN users p ON cr.provider_id = p.id
      WHERE cr.id = ?
    `).get(req.params.id);

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found.' });
    }

    if (request.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Only the requested expert can decline this request.' });
    }

    if (request.status !== 'PENDING_EXPERT') {
      return res.status(400).json({ error: `Cannot decline request: Current status is ${request.status}.` });
    }

    db.prepare(`
      UPDATE consultation_requests 
      SET status = 'DECLINED', declined_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(request.id);

    // In-app notification for Client
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      request.client_id,
      'Expert Unavailable',
      `${request.provider_name} was unable to accept your consultation request. No payment was taken.`,
      'warning',
      `/services`
    );

    // Socket.IO notification
    io.to(`user_${request.client_id}`).emit('consultation_request_declined', {
      requestId: request.id,
      providerName: request.provider_name,
      serviceTitle: request.service_title
    });

    // Email dispatch to Client
    emailService.sendConsultationDeclined({
      clientEmail: request.client_email,
      clientName: request.client_name,
      expertName: request.provider_name,
      serviceTitle: request.service_title
    }).catch(err => console.error('Failed to send decline email', err));

    const updated = db.prepare(`SELECT * FROM consultation_requests WHERE id = ?`).get(request.id);

    res.json({
      success: true,
      request: formatConsultationRequest(updated),
      message: 'Consultation request declined. Client notified.'
    });
  });

  // 6. Client Pays for ACCEPTED Request (Creates Payment & Session; Connects Room)
  router.post('/consultation-requests/:id/pay', authMiddleware, async (req, res) => {
    checkAndExpireRequests(io);

    const request = db.prepare(`
      SELECT cr.*, s.title as service_title, s.price_per_minute as service_ppm,
             c.full_name as client_name, c.email as client_email,
             p.full_name as provider_name, p.email as provider_email
      FROM consultation_requests cr
      JOIN services s ON cr.service_id = s.id
      JOIN users c ON cr.client_id = c.id
      JOIN users p ON cr.provider_id = p.id
      WHERE cr.id = ?
    `).get(req.params.id);

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found.' });
    }

    if (request.client_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Only the client who created this request can complete payment.' });
    }

    // Idempotency: If already paid, return the existing session cleanly
    if (request.status === 'PAID' && request.session_id) {
      const existingSession = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(request.session_id);
      return res.json({
        success: true,
        session_id: request.session_id,
        session: existingSession,
        message: 'Payment was already processed. Reconnecting to session workspace.'
      });
    }

    // Strict validation: Must be in ACCEPTED status to pay!
    if (request.status !== 'ACCEPTED') {
      return res.status(400).json({
        error: `Payment is not allowed for requests in ${request.status} status. The expert must accept first.`
      });
    }

    // Recalculate price server-side
    const totalPrice = request.total_price;
    const paymentId = `pay-sess-${uuidv4().slice(0, 8)}`;
    const sessionId = `ses-${uuidv4().slice(0, 8)}`;

    const startTime = request.connect_type === 'now' ? new Date() : new Date(request.scheduled_start);
    const endTime = new Date(startTime.getTime() + request.duration_minutes * 60 * 1000);
    const sessionStatus = request.connect_type === 'now' ? 'ACTIVE' : 'SCHEDULED';
    const actualStart = request.connect_type === 'now' ? startTime.toISOString() : null;

    // Database updates in atomic sequence
    db.prepare(`
      INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
      VALUES (?, ?, 'session_payment', ?, 'succeeded', ?, ?)
    `).run(
      paymentId,
      request.client_id,
      totalPrice,
      request.id,
      JSON.stringify({
        service_id: request.service_id,
        service_title: request.service_title,
        duration_minutes: request.duration_minutes,
        provider_id: request.provider_id,
        connect_type: request.connect_type
      })
    );

    // Ensure bookings record exists and is marked COMPLETED
    db.prepare(`
      INSERT INTO bookings (id, client_id, provider_id, service_id, duration_minutes, total_price, scheduled_start, scheduled_end, status, payment_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = 'COMPLETED', payment_id = excluded.payment_id
    `).run(
      request.id,
      request.client_id,
      request.provider_id,
      request.service_id,
      request.duration_minutes,
      totalPrice,
      startTime.toISOString(),
      endTime.toISOString(),
      paymentId,
      request.problem_description || ''
    );

    const actualEnd = request.connect_type === 'now' ? endTime.toISOString() : null;

    db.prepare(`
      INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, actual_start, actual_end, duration_minutes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      request.id,
      request.client_id,
      request.provider_id,
      request.service_id,
      startTime.toISOString(),
      endTime.toISOString(),
      actualStart,
      actualEnd,
      request.duration_minutes,
      sessionStatus
    );

    db.prepare(`
      UPDATE consultation_requests 
      SET status = 'PAID', paid_at = CURRENT_TIMESTAMP, payment_id = ?, session_id = ?
      WHERE id = ?
    `).run(paymentId, sessionId, request.id);

    // Notifications
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      request.provider_id,
      'Payment Confirmed!',
      `${request.client_name} confirmed payment for ${request.duration_minutes}m consultation. Room is live!`,
      'success',
      `/session/${sessionId}`
    );

    // Socket.IO real-time notification to Provider
    io.to(`user_${request.provider_id}`).emit('consultation_payment_completed', {
      requestId: request.id,
      sessionId,
      clientName: request.client_name,
      serviceTitle: request.service_title,
      durationMinutes: request.duration_minutes
    });

    // Email notification to both
    emailService.sendPaymentReceipt({
      clientEmail: request.client_email,
      clientName: request.client_name,
      expertEmail: request.provider_email,
      expertName: request.provider_name,
      serviceTitle: request.service_title,
      durationMinutes: request.duration_minutes,
      totalPrice,
      sessionId
    }).catch(err => console.error('Failed to send payment receipt email', err));

    const createdSession = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId);

    res.json({
      success: true,
      session_id: sessionId,
      session: createdSession,
      payment_id: paymentId,
      message: 'Payment confirmed. Consultation session is ready!'
    });
  });

  // 7. Create Razorpay Order for ACCEPTED Consultation Request
  router.post('/consultation-requests/:id/create-razorpay-order', authMiddleware, async (req, res) => {
    checkAndExpireRequests(io);

    const request = db.prepare(`
      SELECT cr.*, s.title as service_title
      FROM consultation_requests cr
      JOIN services s ON cr.service_id = s.id
      WHERE cr.id = ?
    `).get(req.params.id);

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found.' });
    }

    if (request.client_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Only the client who created this request can initiate payment.' });
    }

    if (request.status !== 'ACCEPTED') {
      return res.status(400).json({
        error: `Cannot create payment order for request in ${request.status} status. The expert must accept first.`
      });
    }

    const amountInPaise = Math.round(request.total_price * 100);
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_live_placeholder';
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    try {
      if (process.env.NODE_ENV === 'production' && keySecret && !keyId.includes('placeholder')) {
        // Native Razorpay Order API call
        const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency: 'USD',
            receipt: request.id,
            notes: {
              request_id: request.id,
              client_id: request.client_id,
              service_title: request.service_title
            }
          })
        });

        if (!rzpRes.ok) {
          const rzpErr = await rzpRes.json();
          throw new Error(rzpErr.error?.description || 'Razorpay order creation failed');
        }

        const rzpOrder = await rzpRes.json();
        return res.json({
          order_id: rzpOrder.id,
          amount: request.total_price,
          amount_paise: amountInPaise,
          currency: rzpOrder.currency || 'USD',
          key_id: keyId,
          request_id: request.id
        });
      } else {
        // Safe Development / Simulation Order
        const simulatedOrderId = `order_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
        return res.json({
          order_id: simulatedOrderId,
          amount: request.total_price,
          amount_paise: amountInPaise,
          currency: 'USD',
          key_id: keyId,
          request_id: request.id
        });
      }
    } catch (err) {
      console.error('[Razorpay Order Error]', err.message);
      return res.status(500).json({ error: `Payment gateway error: ${err.message}` });
    }
  });

  // 8. Verify Razorpay Payment Signature & Transition to Session
  router.post('/consultation-requests/:id/verify-razorpay-payment', authMiddleware, async (req, res) => {
    checkAndExpireRequests(io);

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const request = db.prepare(`
      SELECT cr.*, s.title as service_title, s.price_per_minute as service_ppm,
             c.full_name as client_name, c.email as client_email,
             p.full_name as provider_name, p.email as provider_email
      FROM consultation_requests cr
      JOIN services s ON cr.service_id = s.id
      JOIN users c ON cr.client_id = c.id
      JOIN users p ON cr.provider_id = p.id
      WHERE cr.id = ?
    `).get(req.params.id);

    if (!request) {
      return res.status(404).json({ error: 'Consultation request not found.' });
    }

    if (request.client_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Only the client who created this request can verify payment.' });
    }

    // Idempotency: If already paid, return the existing session
    if (request.status === 'PAID' && request.session_id) {
      const existingSession = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(request.session_id);
      return res.json({
        success: true,
        session_id: request.session_id,
        session: existingSession,
        message: 'Payment was already verified. Connected to active session.'
      });
    }

    if (request.status !== 'ACCEPTED') {
      return res.status(400).json({
        error: `Cannot verify payment: Current request status is ${request.status}. Must be ACCEPTED.`
      });
    }

    // Strict HMAC SHA-256 Signature Verification
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (process.env.NODE_ENV === 'production' && keySecret) {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: 'Missing Razorpay signature verification parameters.' });
      }

      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({ error: 'Invalid Razorpay payment signature. Verification failed.' });
      }
    }

    const totalPrice = request.total_price;
    const paymentId = razorpay_payment_id || `pay-sess-${uuidv4().slice(0, 8)}`;
    const sessionId = `ses-${uuidv4().slice(0, 8)}`;

    const startTime = request.connect_type === 'now' ? new Date() : new Date(request.scheduled_start);
    const endTime = new Date(startTime.getTime() + request.duration_minutes * 60 * 1000);
    const sessionStatus = request.connect_type === 'now' ? 'ACTIVE' : 'SCHEDULED';
    const actualStart = request.connect_type === 'now' ? startTime.toISOString() : null;

    db.prepare(`
      INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
      VALUES (?, ?, 'session_payment', ?, 'succeeded', ?, ?)
    `).run(
      paymentId,
      request.client_id,
      totalPrice,
      request.id,
      JSON.stringify({
        gateway: 'razorpay',
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
        service_title: request.service_title,
        duration_minutes: request.duration_minutes,
        provider_id: request.provider_id
      })
    );

    db.prepare(`
      INSERT INTO bookings (id, client_id, provider_id, service_id, duration_minutes, total_price, scheduled_start, scheduled_end, status, payment_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = 'COMPLETED', payment_id = excluded.payment_id
    `).run(
      request.id,
      request.client_id,
      request.provider_id,
      request.service_id,
      request.duration_minutes,
      totalPrice,
      startTime.toISOString(),
      endTime.toISOString(),
      paymentId,
      request.problem_description || ''
    );

    const actualEnd = request.connect_type === 'now' ? endTime.toISOString() : null;

    db.prepare(`
      INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, actual_start, actual_end, duration_minutes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      request.id,
      request.client_id,
      request.provider_id,
      request.service_id,
      startTime.toISOString(),
      endTime.toISOString(),
      actualStart,
      actualEnd,
      request.duration_minutes,
      sessionStatus
    );

    db.prepare(`
      UPDATE consultation_requests 
      SET status = 'PAID', paid_at = CURRENT_TIMESTAMP, payment_id = ?, session_id = ?
      WHERE id = ?
    `).run(paymentId, sessionId, request.id);

    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      request.provider_id,
      'Payment Verified (Razorpay)',
      `${request.client_name} paid for ${request.duration_minutes}m consultation. Room is live!`,
      'success',
      `/session/${sessionId}`
    );

    io.to(`user_${request.provider_id}`).emit('consultation_payment_completed', {
      requestId: request.id,
      sessionId,
      clientName: request.client_name,
      serviceTitle: request.service_title,
      durationMinutes: request.duration_minutes
    });

    emailService.sendPaymentReceipt({
      clientEmail: request.client_email,
      clientName: request.client_name,
      expertEmail: request.provider_email,
      expertName: request.provider_name,
      serviceTitle: request.service_title,
      durationMinutes: request.duration_minutes,
      totalPrice,
      sessionId
    }).catch(err => console.error('Failed to send payment receipt email', err));

    const createdSession = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId);

    res.json({
      success: true,
      session_id: sessionId,
      session: createdSession,
      payment_id: paymentId,
      message: 'Razorpay payment verified successfully. Consultation workspace ready!'
    });
  });

  // Legacy Bookings list (for dashboard backwards compatibility)
  router.get('/bookings', authMiddleware, (req, res) => {
    let query = `
      SELECT b.*, 
             s.title as service_title, s.price_per_minute,
             c.full_name as client_name, c.avatar_url as client_avatar,
             p.full_name as provider_name, p.avatar_url as provider_avatar
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN users c ON b.client_id = c.id
      JOIN users p ON b.provider_id = p.id
    `;
    const params = [];

    if (req.user.role === 'admin') {
      // All
    } else if (req.query.role === 'provider' || req.user.role === 'provider') {
      query += ` WHERE b.provider_id = ?`;
      params.push(req.user.id);
    } else {
      query += ` WHERE b.client_id = ?`;
      params.push(req.user.id);
    }

    query += ` ORDER BY b.created_at DESC`;

    const bookings = db.prepare(query).all(...params);
    res.json({ bookings, count: bookings.length });
  });
  // ==========================================
  router.get('/sessions/:id', authMiddleware, (req, res) => {
    const details = timerEngine.getSessionDetails(req.params.id);
    if (!details) return res.status(404).json({ error: 'Session not found.' });

    if (details.client_id !== req.user.id && details.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied to this session.' });
    }

    const messages = db.prepare(`
      SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC
    `).all(req.params.id);

    res.json({ session: details, messages });
  });

  router.post('/sessions/:id/start', authMiddleware, (req, res) => {
    try {
      const updated = timerEngine.startSessionNow(req.params.id, req.user.id);
      res.json({ session: updated, message: 'Session is now ACTIVE. Timer is running.' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/sessions/:id/messages', authMiddleware, (req, res) => {
    const content = req.body.content || req.body.message;
    const sessionId = req.params.id;

    if (!timerEngine.isCommunicationAllowed(sessionId, req.user.id)) {
      return res.status(403).json({ error: 'This session has already ended or is not currently active. Communication is locked.' });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content cannot be empty.' });
    }

    const messageId = `msg-${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO messages (id, session_id, sender_id, sender_name, sender_role, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, sessionId, req.user.id, req.user.full_name, req.user.role, content.trim(), now);

    const msgObj = {
      id: messageId,
      session_id: sessionId,
      sender_id: req.user.id,
      sender_name: req.user.full_name,
      sender_role: req.user.role,
      content: content.trim(),
      created_at: now
    };

    io.to(`session_${sessionId}`).emit('new_message', msgObj);
    res.status(201).json({ message: msgObj });
  });

  router.post('/sessions/:id/upload', authMiddleware, upload.single('file'), async (req, res) => {
    const sessionId = req.params.id;

    if (!timerEngine.isCommunicationAllowed(sessionId, req.user.id)) {
      return res.status(403).json({ error: 'This session has already ended. File sharing is disabled.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
      const uploadResult = await storageService.upload({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        folder: 'session_files'
      });

      const fileUrl = uploadResult.url;
      const messageId = `msg-${uuidv4().slice(0, 8)}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO messages (id, session_id, sender_id, sender_name, sender_role, content, file_url, file_name, file_size, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        messageId,
        sessionId,
        req.user.id,
        req.user.full_name,
        req.user.role,
        `Shared a file: ${req.file.originalname}`,
        fileUrl,
        req.file.originalname,
        uploadResult.size,
        now
      );

      const msgObj = {
        id: messageId,
        session_id: sessionId,
        sender_id: req.user.id,
        sender_name: req.user.full_name,
        sender_role: req.user.role,
        content: `Shared a file: ${req.file.originalname}`,
        file_url: fileUrl,
        file_name: req.file.originalname,
        file_size: uploadResult.size,
        created_at: now
      };

      io.to(`session_${sessionId}`).emit('new_message', msgObj);
      res.status(201).json({ message: msgObj });
    } catch (err) {
      console.error('[Session Upload Error]', err.message);
      res.status(500).json({ error: 'Failed to process session file upload' });
    }
  });

  router.post('/sessions/:id/review', authMiddleware, (req, res) => {
    const { rating, comment } = req.body;
    const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(req.params.id);

    if (!session) return res.status(404).json({ error: 'Session not found.' });
    if (session.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the client who booked this session can submit a review.' });
    }
    if (session.status !== 'COMPLETED' && session.status !== 'EXPIRED') {
      return res.status(400).json({ error: 'Reviews can only be submitted after the consultation session has completed.' });
    }

    const existing = db.prepare('SELECT id FROM reviews WHERE session_id = ?').get(session.id);
    if (existing) {
      return res.status(400).json({ error: 'You have already submitted a review for this session.' });
    }

    const reviewId = `rev-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO reviews (id, booking_id, session_id, client_id, provider_id, service_id, rating, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(reviewId, session.booking_id, session.id, session.client_id, session.provider_id, session.service_id, Number(rating), comment);

    const stats = db.prepare(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as count 
      FROM reviews 
      WHERE provider_id = ?
    `).get(session.provider_id);

    db.prepare(`
      UPDATE users 
      SET rating = ?, review_count = ? 
      WHERE id = ?
    `).run(Number(stats.avg_rating.toFixed(2)), stats.count, session.provider_id);

    res.status(201).json({ success: true, message: 'Thank you for your feedback!' });
  });

  // ==========================================
  // DASHBOARDS (CLIENT & PROVIDER)
  // ==========================================
  router.get('/dashboards/client', authMiddleware, (req, res) => {
    const userId = req.user.id;
    checkAndExpireRequests(io);

    const activeSession = db.prepare(`
      SELECT s.*, srv.title as service_title, p.full_name as provider_name, p.avatar_url as provider_avatar, p.headline as provider_headline
      FROM sessions s
      JOIN services srv ON s.service_id = srv.id
      JOIN users p ON s.provider_id = p.id
      WHERE s.client_id = ? AND s.status = 'ACTIVE'
      ORDER BY s.created_at DESC
      LIMIT 1
    `).get(userId);

    const consultationRequestsRaw = db.prepare(`
      SELECT cr.*, srv.title as service_title, p.full_name as provider_name, p.avatar_url as provider_avatar, p.headline as provider_headline
      FROM consultation_requests cr
      JOIN services srv ON cr.service_id = srv.id
      JOIN users p ON cr.provider_id = p.id
      WHERE cr.client_id = ?
      ORDER BY cr.created_at DESC
    `).all(userId);
    const consultationRequests = consultationRequestsRaw.map(formatConsultationRequest);

    const upcomingBookings = db.prepare(`
      SELECT b.*, srv.title as service_title, p.full_name as provider_name, p.avatar_url as provider_avatar, s.id as session_id, s.status as session_status
      FROM bookings b
      JOIN services srv ON b.service_id = srv.id
      JOIN users p ON b.provider_id = p.id
      LEFT JOIN sessions s ON b.id = s.booking_id
      WHERE b.client_id = ? AND b.status IN ('PENDING', 'ACCEPTED')
      ORDER BY b.scheduled_start ASC
    `).all(userId);

    const pastSessions = db.prepare(`
      SELECT s.*, srv.title as service_title, p.full_name as provider_name, p.avatar_url as provider_avatar,
             r.id as review_id, r.rating as review_rating, r.comment as review_comment
      FROM sessions s
      JOIN services srv ON s.service_id = srv.id
      JOIN users p ON s.provider_id = p.id
      LEFT JOIN reviews r ON s.id = r.session_id
      WHERE s.client_id = ? AND s.status = 'COMPLETED'
      ORDER BY s.actual_end DESC
    `).all(userId);

    const payments = db.prepare(`
      SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC
    `).all(userId);

    res.json({
      activeSession,
      consultationRequests,
      upcomingBookings,
      pastSessions,
      payments
    });
  });

  router.get('/dashboards/provider', authMiddleware, (req, res) => {
    const userId = req.user.id;
    checkAndExpireRequests(io);

    const activeSession = db.prepare(`
      SELECT s.*, srv.title as service_title, c.full_name as client_name, c.avatar_url as client_avatar
      FROM sessions s
      JOIN services srv ON s.service_id = srv.id
      JOIN users c ON s.client_id = c.id
      WHERE s.provider_id = ? AND s.status = 'ACTIVE'
      ORDER BY s.created_at DESC
      LIMIT 1
    `).get(userId);

    const pendingRequestsRaw = db.prepare(`
      SELECT cr.*, srv.title as service_title, c.full_name as client_name, c.avatar_url as client_avatar
      FROM consultation_requests cr
      JOIN services srv ON cr.service_id = srv.id
      JOIN users c ON cr.client_id = c.id
      WHERE cr.provider_id = ? AND cr.status = 'PENDING_EXPERT'
      ORDER BY cr.created_at DESC
    `).all(userId);
    const pendingRequests = pendingRequestsRaw.map(formatConsultationRequest);

    const allRequestsRaw = db.prepare(`
      SELECT cr.*, srv.title as service_title, c.full_name as client_name, c.avatar_url as client_avatar
      FROM consultation_requests cr
      JOIN services srv ON cr.service_id = srv.id
      JOIN users c ON cr.client_id = c.id
      WHERE cr.provider_id = ?
      ORDER BY cr.created_at DESC
    `).all(userId);
    const allRequests = allRequestsRaw.map(formatConsultationRequest);

    const upcomingSessions = db.prepare(`
      SELECT s.*, srv.title as service_title, c.full_name as client_name, c.avatar_url as client_avatar,
             COALESCE(cr.total_price, s.duration_minutes * srv.price_per_minute) as total_price
      FROM sessions s
      LEFT JOIN consultation_requests cr ON s.booking_id = cr.id
      JOIN services srv ON s.service_id = srv.id
      JOIN users c ON s.client_id = c.id
      WHERE s.provider_id = ? AND s.status = 'SCHEDULED'
      ORDER BY s.scheduled_start ASC
    `).all(userId);

    const services = db.prepare(`
      SELECT s.*, c.name as category_name
      FROM services s
      JOIN categories c ON s.category_id = c.id
      WHERE s.provider_id = ?
      ORDER BY s.created_at DESC
    `).all(userId);

    const earningsCalc = db.prepare(`
      SELECT SUM(p.amount) as total_earnings, COUNT(s.id) as completed_count
      FROM sessions s
      LEFT JOIN payments p ON s.booking_id = p.reference_id AND p.type = 'session_payment'
      WHERE s.provider_id = ? AND s.status = 'COMPLETED'
    `).get(userId);

    const reviews = db.prepare(`
      SELECT r.*, c.full_name as client_name, c.avatar_url as client_avatar, srv.title as service_title
      FROM reviews r
      JOIN users c ON r.client_id = c.id
      JOIN services srv ON r.service_id = srv.id
      WHERE r.provider_id = ?
      ORDER BY r.created_at DESC
    `).all(userId);

    res.json({
      activeSession,
      pendingRequests,
      upcomingSessions,
      services: services.map(s => ({
        ...s,
        skills: JSON.parse(s.skills_json || '[]'),
        languages: JSON.parse(s.languages_json || '[]')
      })),
      earnings: {
        total: earningsCalc.total_earnings || 0,
        completedSessions: earningsCalc.completed_count || 0
      },
      reviews
    });
  });

  // ==========================================
  // OPPORTUNITIES
  // ==========================================
  router.get('/opportunities', (req, res) => {
    const opps = db.prepare(`
      SELECT o.*, c.name as category_name, u.full_name as creator_name, u.avatar_url as creator_avatar,
             COUNT(a.id) as applications_count
      FROM opportunities o
      JOIN categories c ON o.category_id = c.id
      JOIN users u ON o.creator_id = u.id
      LEFT JOIN applications a ON o.id = a.opportunity_id
      WHERE o.status = 'open'
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `).all();
    res.json({ opportunities: opps });
  });

  router.post('/opportunities', authMiddleware, (req, res) => {
    const { title, category_id, description, duration_minutes, budget } = req.body;
    if (!title || !category_id || !description || !duration_minutes || !budget) {
      return res.status(400).json({ error: 'All fields are required to post an opportunity.' });
    }

    const id = `opp-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO opportunities (id, creator_id, title, category_id, description, duration_minutes, budget, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
    `).run(id, req.user.id, title, category_id, description, Number(duration_minutes), Number(budget));

    const created = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
    res.status(201).json({ opportunity: created, message: 'Opportunity posted successfully.' });
  });

  router.post('/opportunities/:id/apply', authMiddleware, (req, res) => {
    const { message, relevant_experience, proposed_rate, availability } = req.body;
    const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);

    if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });
    if (opp.status !== 'open') {
      return res.status(400).json({ error: 'This opportunity is no longer open for applications.' });
    }
    if (opp.creator_id === req.user.id) {
      return res.status(400).json({ error: 'You cannot apply to an opportunity you posted.' });
    }
    if (!message || !relevant_experience || !availability) {
      return res.status(400).json({ error: 'Message, experience, and availability are required.' });
    }

    const existing = db.prepare('SELECT id FROM applications WHERE opportunity_id = ? AND provider_id = ?').get(opp.id, req.user.id);
    if (existing) {
      return res.status(400).json({ error: 'You have already applied for this opportunity.' });
    }

    const id = `app-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO applications (id, opportunity_id, provider_id, message, relevant_experience, proposed_rate, availability, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, opp.id, req.user.id, message, relevant_experience, proposed_rate ? Number(proposed_rate) : null, availability);

    res.status(201).json({ success: true, message: 'Your application has been submitted.' });
  });

  // User report endpoint
  router.post('/reports', authMiddleware, (req, res) => {
    const { reported_type, reported_id, reported_name = '', reason } = req.body;
    if (!reported_type || !reported_id || !reason) {
      return res.status(400).json({ error: 'Type, target ID, and reason are required.' });
    }

    const id = `rep-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO reports (id, reporter_id, reporter_name, reported_type, reported_id, reported_name, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, req.user.id, req.user.full_name, reported_type, reported_id, reported_name, reason);

    res.status(201).json({ success: true, message: 'Report submitted for review.' });
  });

  // ==========================================
  // FIRST-CLASS ADMIN CONTROL CENTER APIS
  // ==========================================
  
  // 1. Overview Dashboard Stats & Growth Analytics
  router.get('/admin/stats', adminAuthMiddleware, (req, res) => {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalProviders = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'provider'").get().count;
    const totalClients = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'client'").get().count;
    const totalServices = db.prepare('SELECT COUNT(*) as count FROM services').get().count;
    const activeServices = db.prepare("SELECT COUNT(*) as count FROM services WHERE listing_status = 'active'").get().count;
    const totalBookings = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
    const activeBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status IN ('PENDING', 'ACCEPTED')").get().count;
    const totalConsultationRequests = db.prepare('SELECT COUNT(*) as count FROM consultation_requests').get().count;
    const acceptedRequests = db.prepare("SELECT COUNT(*) as count FROM consultation_requests WHERE status IN ('ACCEPTED', 'PAID', 'COMPLETED')").get().count;
    const paidRequests = db.prepare("SELECT COUNT(*) as count FROM consultation_requests WHERE status IN ('PAID', 'COMPLETED')").get().count;
    const activeSessions = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'ACTIVE'").get().count;
    const completedSessions = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'COMPLETED'").get().count;
    const listingRevenue = db.prepare("SELECT SUM(amount) as sum FROM payments WHERE type = 'listing_fee' AND status = 'succeeded'").get().sum || 0;
    const sessionRevenue = db.prepare("SELECT SUM(amount) as sum FROM payments WHERE type = 'session_payment' AND status = 'succeeded'").get().sum || 0;
    const totalRefunds = db.prepare("SELECT SUM(amount) as sum FROM payments WHERE type = 'refund' AND status = 'succeeded'").get().sum || 0;
    const pendingVerifications = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'provider' AND verified = 0 AND is_suspended = 0").get().count;
    const verifiedExperts = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'provider' AND verified = 1").get().count;
    const pendingListings = db.prepare("SELECT COUNT(*) as count FROM services WHERE listing_status = 'pending_payment'").get().count;
    const openOpportunities = db.prepare("SELECT COUNT(*) as count FROM opportunities WHERE status = 'open'").get().count;
    const pendingReports = db.prepare("SELECT COUNT(*) as count FROM reports WHERE status IN ('pending', 'OPEN', 'UNDER_REVIEW')").get().count;
    const totalProfileVisits = db.prepare("SELECT COALESCE(SUM(profile_visits), 0) as count FROM users").get().count || 0;

    const platformTakePercent = 15;
    const platformRevenue = Number((listingRevenue + (sessionRevenue * (platformTakePercent / 100)) - totalRefunds).toFixed(2));
    const expertPayouts = Number((sessionRevenue * ((100 - platformTakePercent) / 100)).toFixed(2));
    const grossRevenue = Number((listingRevenue + sessionRevenue).toFixed(2));
    const netRevenue = Number((grossRevenue - totalRefunds).toFixed(2));

    // Today & This Week Metrics
    const todayIso = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const todayUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= ?").get(todayIso).count;
    const todayExperts = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'provider' AND created_at >= ?").get(todayIso).count;
    const todayRequests = db.prepare("SELECT COUNT(*) as count FROM consultation_requests WHERE created_at >= ?").get(todayIso).count;
    const todayCompletedSessions = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'COMPLETED' AND created_at >= ?").get(todayIso).count;
    const todayRevenue = db.prepare("SELECT SUM(amount) as sum FROM payments WHERE status = 'succeeded' AND created_at >= ?").get(todayIso).sum || 0;

    const weekUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= ?").get(sevenDaysAgo).count;
    const weekExperts = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'provider' AND created_at >= ?").get(sevenDaysAgo).count;
    const weekSessions = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE created_at >= ?").get(sevenDaysAgo).count;
    const weekRevenue = db.prepare("SELECT SUM(amount) as sum FROM payments WHERE status = 'succeeded' AND created_at >= ?").get(sevenDaysAgo).sum || 0;

    // Conversion Rates (Strictly 0% - 100%, real database derived only)
    const completedConsultationRequests = db.prepare("SELECT COUNT(*) as count FROM consultation_requests WHERE status = 'COMPLETED'").get().count;
    const requestToAcceptedRate = totalConsultationRequests > 0 
      ? Math.min(100, Number(((acceptedRequests / totalConsultationRequests) * 100).toFixed(1))) 
      : 0;
    const acceptedToPaidRate = acceptedRequests > 0 
      ? Math.min(100, Number(((paidRequests / acceptedRequests) * 100).toFixed(1))) 
      : 0;
    const effectiveCompleted = completedConsultationRequests > 0 ? completedConsultationRequests : Math.min(completedSessions, paidRequests);
    const paidToCompletedRate = paidRequests > 0 
      ? Math.min(100, Number(((effectiveCompleted / paidRequests) * 100).toFixed(1))) 
      : 0;

    // Analytics: Top Visited Experts, Top Listings, Top Categories, Top Countries
    const topExperts = db.prepare(`
      SELECT id, full_name, headline, rating, review_count, sessions_completed, profile_visits, avatar_url, country
      FROM users WHERE role = 'provider'
      ORDER BY (profile_visits + sessions_completed * 5) DESC LIMIT 5
    `).all().map(sanitizeUser);

    const topListings = db.prepare(`
      SELECT s.id, s.title, s.price_per_minute, s.views_count, u.full_name as provider_name, c.name as category_name,
             (SELECT COUNT(*) FROM bookings WHERE service_id = s.id) as bookings_count
      FROM services s
      JOIN users u ON s.provider_id = u.id
      JOIN categories c ON s.category_id = c.id
      ORDER BY (COALESCE(s.views_count, 0) + (SELECT COUNT(*) FROM bookings WHERE service_id = s.id) * 3) DESC LIMIT 5
    `).all();

    const topCategories = db.prepare(`
      SELECT c.id, c.name, c.slug, c.service_count,
             (SELECT COUNT(*) FROM services s JOIN bookings b ON s.id = b.service_id WHERE s.category_id = c.id) as total_bookings
      FROM categories c
      ORDER BY (c.service_count + (SELECT COUNT(*) FROM services s JOIN bookings b ON s.id = b.service_id WHERE s.category_id = c.id) * 2) DESC LIMIT 6
    `).all();

    res.json({
      stats: {
        totalUsers,
        totalProviders,
        totalClients,
        verifiedExperts,
        totalServices,
        activeServices,
        totalBookings,
        activeBookings,
        totalConsultationRequests,
        activeSessions,
        completedSessions,
        totalProfileVisits,
        grossRevenue,
        listingRevenue,
        sessionRevenue,
        platformRevenue,
        expertPayouts,
        totalRefunds,
        netRevenue,
        pendingVerifications,
        pendingListings,
        openOpportunities,
        pendingReports,
        today: {
          newUsers: todayUsers,
          newExperts: todayExperts,
          newRequests: todayRequests,
          completedSessions: todayCompletedSessions,
          revenue: Number(todayRevenue.toFixed(2))
        },
        growth: {
          weekUsers,
          weekExperts,
          weekSessions,
          weekRevenue: Number(weekRevenue.toFixed(2))
        },
        conversions: {
          requestToAcceptedRate,
          acceptedToPaidRate,
          paidToCompletedRate
        },
        analytics: {
          topExperts,
          topListings,
          topCategories
        }
      }
    });
  });

  // 2. User Management
  router.get('/admin/users', adminAuthMiddleware, (req, res) => {
    const { search, role, status, verified, sort = 'newest' } = req.query;
    let query = `
      SELECT u.*,
             (SELECT COUNT(*) FROM services WHERE provider_id = u.id) as services_count,
             (SELECT COUNT(*) FROM bookings WHERE client_id = u.id OR provider_id = u.id) as bookings_count,
             (SELECT COUNT(*) FROM sessions WHERE client_id = u.id OR provider_id = u.id) as sessions_count,
             (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE user_id = u.id AND status = 'succeeded') as total_spent,
             (SELECT COALESCE(SUM(b.total_price), 0) FROM sessions s JOIN bookings b ON s.booking_id = b.id WHERE s.provider_id = u.id AND s.status = 'COMPLETED') as revenue_generated
      FROM users u
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR u.headline LIKE ? OR u.username LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }
    if (role && role !== 'all') {
      query += ' AND u.role = ?';
      params.push(role);
    }
    if (status === 'suspended') {
      query += ' AND u.is_suspended = 1';
    } else if (status === 'active') {
      query += ' AND u.is_suspended = 0';
    }
    if (verified === '1') {
      query += ' AND u.verified = 1';
    } else if (verified === '0') {
      query += ' AND u.verified = 0';
    }

    if (sort === 'oldest') {
      query += ' ORDER BY u.created_at ASC';
    } else if (sort === 'name') {
      query += ' ORDER BY u.full_name ASC';
    } else if (sort === 'revenue') {
      query += ' ORDER BY revenue_generated DESC';
    } else if (sort === 'sessions') {
      query += ' ORDER BY sessions_count DESC';
    } else {
      query += ' ORDER BY u.created_at DESC';
    }

    const rawUsers = db.prepare(query).all(...params);
    const users = rawUsers.map(sanitizeUser);
    res.json({ users, count: users.length });
  });

  router.get('/admin/users/:id', adminAuthMiddleware, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const services = db.prepare('SELECT * FROM services WHERE provider_id = ?').all(user.id);
    const bookings = db.prepare(`
      SELECT b.*, srv.title as service_title 
      FROM bookings b 
      JOIN services srv ON b.service_id = srv.id 
      WHERE b.client_id = ? OR b.provider_id = ? 
      ORDER BY b.created_at DESC
    `).all(user.id, user.id);

    const sessions = db.prepare(`
      SELECT s.*, srv.title as service_title, b.total_price
      FROM sessions s
      JOIN services srv ON s.service_id = srv.id
      JOIN bookings b ON s.booking_id = b.id
      WHERE s.client_id = ? OR s.provider_id = ?
      ORDER BY s.created_at DESC
    `).all(user.id, user.id);

    const financial = db.prepare(`
      SELECT 
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE user_id = ? AND status = 'succeeded') as total_spent,
        (SELECT COALESCE(SUM(b.total_price), 0) FROM sessions s JOIN bookings b ON s.booking_id = b.id WHERE s.provider_id = ? AND s.status = 'COMPLETED') as total_earned
    `).get(user.id, user.id);

    res.json({
      user: sanitizeUser(user),
      services,
      bookings,
      sessions,
      financial
    });
  });

  // Admin Special Flow: "Add User" (Client or Expert, no listing fee required)
  router.post('/admin/users', adminAuthMiddleware, (req, res) => {
    const {
      full_name,
      email,
      password = 'TempPassword123!',
      role = 'provider',
      headline = '',
      bio = '',
      country = 'United States',
      state_region = '',
      city = '',
      area = '',
      languages = ['English'],
      skills = [],
      experience_years = 5,
      verified = false,
      // Optional expert service details
      service_title = '',
      service_description = '',
      category_id = 'cat-tech',
      subcategory = '',
      price_per_minute = 2.00
    } = req.body;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'A user with this email address already exists.' });
    }

    let username = req.body.username ? req.body.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') : '';
    if (!username) {
      username = (full_name.trim() || cleanEmail.split('@')[0])
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    const existingUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(username);
    if (existingUsername) {
      username = `${username}_${Math.floor(100 + Math.random() * 900)}`;
    }

    const userId = `usr-${uuidv4().slice(0, 8)}`;
    const passwordHash = bcrypt.hashSync(password, 10);
    const avatarUrl = req.body.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(full_name.trim())}`;
    const assignedRole = role === 'provider' ? 'provider' : (role === 'admin' ? 'admin' : 'client');

    db.prepare(`
      INSERT INTO users (
        id, email, username, password_hash, full_name, role, avatar_url, bio, headline, location,
        country, state_region, city, area,
        languages_json, skills_json, experience_years, verified, email_verified,
        created_by_admin, created_by_admin_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
    `).run(
      userId,
      cleanEmail,
      username,
      passwordHash,
      full_name.trim(),
      assignedRole,
      avatarUrl,
      bio.trim(),
      headline.trim(),
      city ? `${city}, ${country}` : country,
      country,
      state_region,
      city,
      area,
      JSON.stringify(languages),
      JSON.stringify(skills),
      Number(experience_years),
      verified ? 1 : 0,
      req.user.id
    );

    let createdService = null;
    // If expert service info provided, create active service immediately (Admin bypasses listing fee)
    if (assignedRole === 'provider' && service_title && service_title.trim()) {
      const serviceId = `srv-${uuidv4().slice(0, 8)}`;
      db.prepare(`
        INSERT INTO services (
          id, provider_id, title, category_id, subcategory, description, price_per_minute,
          listing_status, listing_fee_paid, listing_fee_payment_id,
          skills_json, languages_json, country, city, experience_years, available_now
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, 'admin-complimentary', ?, ?, ?, ?, ?, 1)
      `).run(
        serviceId,
        userId,
        service_title.trim(),
        category_id || 'cat-tech',
        subcategory || 'General Consultation',
        service_description.trim() || `${service_title.trim()} — 1-on-1 consultation by the minute.`,
        Number(price_per_minute) || 2.00,
        JSON.stringify(skills),
        JSON.stringify(languages),
        country,
        city,
        Number(experience_years)
      );

      db.prepare(`UPDATE categories SET service_count = service_count + 1 WHERE id = ?`).run(category_id || 'cat-tech');
      createdService = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
    }

    logAuditAction(req.user, 'USER_CREATED_BY_ADMIN', 'user', userId, {
      full_name: full_name.trim(),
      email: cleanEmail,
      role: assignedRole,
      verified: Boolean(verified),
      service_created: Boolean(createdService)
    });

    const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    res.status(201).json({
      success: true,
      user: sanitizeUser(newUser),
      service: createdService,
      message: `User ${full_name} (${assignedRole}) created successfully.`
    });
  });

  // Edit User Details
  router.patch('/admin/users/:id', adminAuthMiddleware, (req, res) => {
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const {
      full_name,
      headline,
      bio,
      country,
      state_region,
      city,
      area,
      languages,
      skills,
      experience_years,
      verified,
      email_verified,
      role
    } = req.body;

    db.prepare(`
      UPDATE users SET
        full_name = COALESCE(?, full_name),
        headline = COALESCE(?, headline),
        bio = COALESCE(?, bio),
        country = COALESCE(?, country),
        state_region = COALESCE(?, state_region),
        city = COALESCE(?, city),
        area = COALESCE(?, area),
        languages_json = COALESCE(?, languages_json),
        skills_json = COALESCE(?, skills_json),
        experience_years = COALESCE(?, experience_years),
        verified = COALESCE(?, verified),
        email_verified = COALESCE(?, email_verified),
        role = COALESCE(?, role)
      WHERE id = ?
    `).run(
      full_name ? full_name.trim() : null,
      headline !== undefined ? headline.trim() : null,
      bio !== undefined ? bio.trim() : null,
      country ? country.trim() : null,
      state_region !== undefined ? state_region.trim() : null,
      city !== undefined ? city.trim() : null,
      area !== undefined ? area.trim() : null,
      languages ? JSON.stringify(languages) : null,
      skills ? JSON.stringify(skills) : null,
      experience_years !== undefined ? Number(experience_years) : null,
      verified !== undefined ? (verified ? 1 : 0) : null,
      email_verified !== undefined ? (email_verified ? 1 : 0) : null,
      role && ['client', 'provider', 'admin'].includes(role) ? role : null,
      targetUser.id
    );

    logAuditAction(req.user, 'USER_EDITED', 'user', targetUser.id, req.body);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUser.id);
    res.json({ success: true, user: sanitizeUser(updated) });
  });

  // Delete User (with security protection for self)
  router.delete('/admin/users/:id', adminAuthMiddleware, (req, res) => {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own administrator account.' });
    }

    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Cascade deletion
    db.prepare('DELETE FROM services WHERE provider_id = ?').run(targetUser.id);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(targetUser.id);
    db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(targetUser.id);
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(targetUser.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(targetUser.id);

    logAuditAction(req.user, 'USER_DELETED', 'user', targetUser.id, {
      email: targetUser.email,
      full_name: targetUser.full_name,
      role: targetUser.role
    });

    res.json({ success: true, message: `User ${targetUser.full_name} was deleted.` });
  });

  router.patch('/admin/users/:id/verify', adminAuthMiddleware, (req, res) => {
    const { verified, rejection_reason = '' } = req.body;
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    db.prepare('UPDATE users SET verified = ?, verification_rejection_reason = ? WHERE id = ?').run(
      verified ? 1 : 0,
      rejection_reason || null,
      req.params.id
    );

    logAuditAction(req.user, verified ? 'USER_VERIFIED' : 'USER_VERIFICATION_REVOKED', 'user', req.params.id, {
      user_email: targetUser.email,
      user_name: targetUser.full_name,
      rejection_reason
    });

    if (verified && targetUser.role === 'provider') {
      emailService.sendProviderVerified({
        providerEmail: targetUser.email,
        providerName: targetUser.full_name,
        providerId: targetUser.id
      }).catch(err => console.error('Failed to dispatch provider verification email', err));
    }

    res.json({ success: true, verified: verified ? 1 : 0 });
  });

  router.patch('/admin/users/:id/suspend', adminAuthMiddleware, (req, res) => {
    const { suspended } = req.body;
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot suspend your own administrator account.' });
    }

    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    db.prepare('UPDATE users SET is_suspended = ? WHERE id = ?').run(suspended ? 1 : 0, req.params.id);
    logAuditAction(req.user, suspended ? 'USER_SUSPENDED' : 'USER_REACTIVATED', 'user', req.params.id, {
      user_email: targetUser.email,
      user_name: targetUser.full_name
    });

    res.json({ success: true, is_suspended: suspended ? 1 : 0 });
  });

  router.patch('/admin/users/:id/role', adminAuthMiddleware, (req, res) => {
    const { role } = req.body;
    if (!['client', 'provider', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }
    if (req.params.id === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot remove your own administrator privileges.' });
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
    logAuditAction(req.user, 'USER_ROLE_CHANGED', 'user', req.params.id, { new_role: role });
    res.json({ success: true, role });
  });

  // 3. Service Listings Management
  router.get('/admin/services', adminAuthMiddleware, (req, res) => {
    const { search, category, status } = req.query;
    let query = `
      SELECT s.*, u.full_name as provider_name, u.email as provider_email, u.verified as provider_verified,
             u.avatar_url as provider_avatar, c.name as category_name,
             (SELECT COUNT(*) FROM bookings WHERE service_id = s.id) as bookings_count
      FROM services s
      JOIN users u ON s.provider_id = u.id
      JOIN categories c ON s.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ' AND (s.title LIKE ? OR u.full_name LIKE ? OR s.description LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    if (category && category !== 'all') {
      query += ' AND s.category_id = ?';
      params.push(category);
    }
    if (status && status !== 'all') {
      query += ' AND s.listing_status = ?';
      params.push(status);
    }

    query += ' ORDER BY s.created_at DESC';
    const raw = db.prepare(query).all(...params);
    const services = raw.map(s => ({
      ...s,
      skills: JSON.parse(s.skills_json || '[]'),
      languages: JSON.parse(s.languages_json || '[]')
    }));
    res.json({ services, count: services.length });
  });

  router.patch('/admin/services/:id/status', adminAuthMiddleware, (req, res) => {
    const { status } = req.body;
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const dbStatus = status === 'inactive' ? 'paused' : (['draft', 'pending_payment', 'active', 'paused', 'expired', 'removed'].includes(status) ? status : 'paused');
    db.prepare('UPDATE services SET listing_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(dbStatus, req.params.id);
    logAuditAction(req.user, 'SERVICE_STATUS_CHANGED', 'service', req.params.id, {
      title: service.title,
      old_status: service.listing_status,
      new_status: status
    });

    res.json({ success: true, status });
  });

  router.post('/admin/services/:id/publish', adminAuthMiddleware, (req, res) => {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    db.prepare("UPDATE services SET listing_status = 'active', listing_fee_paid = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    logAuditAction(req.user, 'SERVICE_PUBLISHED_BY_ADMIN', 'service', req.params.id, { title: service.title });
    res.json({ success: true, message: 'Service published successfully.' });
  });

  router.delete('/admin/services/:id', adminAuthMiddleware, (req, res) => {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
    db.prepare('UPDATE categories SET service_count = MAX(0, service_count - 1) WHERE id = ?').run(service.category_id);
    logAuditAction(req.user, 'SERVICE_DELETED', 'service', req.params.id, { title: service.title });
    res.json({ success: true, message: 'Service deleted.' });
  });

  // 4. Categories Management
  router.get('/admin/categories', adminAuthMiddleware, (req, res) => {
    const categories = db.prepare(`
      SELECT c.*, COUNT(s.id) as services_count 
      FROM categories c 
      LEFT JOIN services s ON c.id = s.category_id 
      GROUP BY c.id 
      ORDER BY c.sort_order ASC
    `).all();
    res.json({ categories });
  });

  router.post('/admin/categories', adminAuthMiddleware, (req, res) => {
    const { name, slug, icon = 'Tag', description = '', sort_order = 99 } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug are required.' });

    const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
    if (existing) {
      return res.status(409).json({ error: `Category with slug "${slug}" already exists.` });
    }

    const id = `cat-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO categories (id, slug, name, icon, description, sort_order, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, slug, name, icon, description, Number(sort_order));

    logAuditAction(req.user, 'CATEGORY_CREATED', 'category', id, { name, slug });
    res.status(201).json({ success: true, id });
  });

  router.put('/admin/categories/:id', adminAuthMiddleware, (req, res) => {
    const { name, slug, icon, description, sort_order } = req.body;
    db.prepare(`
      UPDATE categories 
      SET name = ?, slug = ?, icon = ?, description = ?, sort_order = ? 
      WHERE id = ?
    `).run(name, slug, icon, description, Number(sort_order), req.params.id);

    logAuditAction(req.user, 'CATEGORY_UPDATED', 'category', req.params.id, { name, slug });
    res.json({ success: true });
  });

  router.patch('/admin/categories/:id/toggle', adminAuthMiddleware, (req, res) => {
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });

    const newActive = cat.active ? 0 : 1;
    db.prepare('UPDATE categories SET active = ? WHERE id = ?').run(newActive, cat.id);
    logAuditAction(req.user, newActive ? 'CATEGORY_ENABLED' : 'CATEGORY_DISABLED', 'category', cat.id, { name: cat.name });

    res.json({ success: true, active: newActive });
  });

  // 5. Consultation Requests Monitoring
  router.get('/admin/consultation-requests', adminAuthMiddleware, (req, res) => {
    checkAndExpireRequests(io);

    const raw = db.prepare(`
      SELECT cr.*, 
             s.title as service_title, s.price_per_minute as service_ppm,
             c.full_name as client_name, c.avatar_url as client_avatar, c.email as client_email,
             p.full_name as provider_name, p.avatar_url as provider_avatar, p.email as provider_email
      FROM consultation_requests cr
      JOIN services s ON cr.service_id = s.id
      JOIN users c ON cr.client_id = c.id
      JOIN users p ON cr.provider_id = p.id
      ORDER BY cr.created_at DESC
    `).all();

    const requests = raw.map(formatConsultationRequest);
    res.json({ requests, count: requests.length });
  });

  // 6. Booking Management & Dispute Inspection
  router.get('/admin/bookings', adminAuthMiddleware, (req, res) => {
    const bookings = db.prepare(`
      SELECT b.*, 
             c.full_name as client_name, c.email as client_email,
             p.full_name as provider_name, p.email as provider_email,
             srv.title as service_title, srv.price_per_minute,
             s.id as session_id, s.status as session_status, s.actual_start, s.actual_end
      FROM bookings b
      JOIN users c ON b.client_id = c.id
      JOIN users p ON b.provider_id = p.id
      JOIN services srv ON b.service_id = srv.id
      LEFT JOIN sessions s ON b.id = s.booking_id
      ORDER BY b.created_at DESC
    `).all();
    res.json({ bookings });
  });

  router.patch('/admin/bookings/:id/cancel', adminAuthMiddleware, (req, res) => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?").run(booking.id);
    db.prepare("UPDATE sessions SET status = 'CANCELLED' WHERE booking_id = ?").run(booking.id);

    // Process refund
    const refundId = `ref-adm-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
      VALUES (?, ?, 'refund', ?, 'succeeded', ?, ?)
    `).run(refundId, booking.client_id, booking.total_price, booking.id, JSON.stringify({ reason: 'Administrative cancellation / dispute resolution' }));

    logAuditAction(req.user, 'BOOKING_CANCELLED_REFUNDED', 'booking', booking.id, {
      amount: booking.total_price,
      client_id: booking.client_id
    });

    res.json({ success: true, message: 'Booking cancelled and client refunded.' });
  });

  // 7. Session Monitoring (Privacy Respecting)
  router.get('/admin/sessions', adminAuthMiddleware, (req, res) => {
    const sessions = db.prepare(`
      SELECT s.*, 
             c.full_name as client_name, c.email as client_email,
             p.full_name as provider_name, p.email as provider_email,
             srv.title as service_title, b.total_price
      FROM sessions s
      JOIN users c ON s.client_id = c.id
      JOIN users p ON s.provider_id = p.id
      JOIN services srv ON s.service_id = srv.id
      JOIN bookings b ON s.booking_id = b.id
      ORDER BY s.created_at DESC
    `).all();

    const formatted = sessions.map(s => {
      let remainingSeconds = 0;
      if (s.status === 'ACTIVE' && s.actual_end) {
        remainingSeconds = Math.max(0, Math.floor((new Date(s.actual_end).getTime() - Date.now()) / 1000));
      }
      return { ...s, remainingSeconds };
    });

    res.json({ sessions: formatted, count: formatted.length });
  });

  // 8. Payments Ledger & Financials
  router.get('/admin/payments', adminAuthMiddleware, (req, res) => {
    const { status, type, search } = req.query;
    let query = `
      SELECT p.*, u.full_name as user_name, u.email as user_email, u.role as user_role
      FROM payments p
      JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (status && status !== 'all') {
      query += ' AND p.status = ?';
      params.push(status);
    }
    if (type && type !== 'all') {
      query += ' AND p.type = ?';
      params.push(type);
    }
    if (search) {
      query += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR p.id LIKE ? OR p.reference_id LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }
    query += ' ORDER BY p.created_at DESC';
    const rawPayments = db.prepare(query).all(...params);

    const platformTakePercent = 15;
    const payments = rawPayments.map(p => {
      let platform_fee = 0;
      let expert_amount = 0;
      if (p.type === 'listing_fee') {
        platform_fee = p.amount;
        expert_amount = 0;
      } else if (p.type === 'session_payment') {
        platform_fee = Number((p.amount * (platformTakePercent / 100)).toFixed(2));
        expert_amount = Number((p.amount * ((100 - platformTakePercent) / 100)).toFixed(2));
      } else if (p.type === 'refund') {
        platform_fee = -Number((p.amount * (platformTakePercent / 100)).toFixed(2));
        expert_amount = -Number((p.amount * ((100 - platformTakePercent) / 100)).toFixed(2));
      }

      return {
        ...p,
        platform_fee,
        expert_amount
      };
    });

    res.json({ payments, count: payments.length });
  });

  // 9. Opportunities Management
  router.get('/admin/opportunities', adminAuthMiddleware, (req, res) => {
    const opps = db.prepare(`
      SELECT o.*, c.name as category_name, u.full_name as creator_name,
             COUNT(a.id) as applications_count
      FROM opportunities o
      JOIN categories c ON o.category_id = c.id
      JOIN users u ON o.creator_id = u.id
      LEFT JOIN applications a ON o.id = a.opportunity_id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `).all();
    res.json({ opportunities: opps, count: opps.length });
  });

  router.post('/admin/opportunities', adminAuthMiddleware, (req, res) => {
    const {
      title,
      description,
      short_description = '',
      category_id,
      subcategory = '',
      location = 'Worldwide',
      languages = ['English'],
      duration_minutes = 45,
      budget = 75,
      deadline = null,
      status = 'open'
    } = req.body;

    if (!title || !category_id || !description) {
      return res.status(400).json({ error: 'Title, category, and description are required.' });
    }

    const id = `opp-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO opportunities (
        id, creator_id, title, short_description, description, category_id, subcategory,
        location, languages_json, duration_minutes, budget, deadline, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.user.id,
      title.trim(),
      short_description.trim() || title.trim(),
      description.trim(),
      category_id,
      subcategory,
      location,
      JSON.stringify(languages),
      Number(duration_minutes) || 45,
      Number(budget) || 75,
      deadline,
      status || 'open'
    );

    logAuditAction(req.user, 'OPPORTUNITY_CREATED_BY_ADMIN', 'opportunity', id, { title, budget });
    const created = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
    res.status(201).json({ success: true, opportunity: created });
  });

  router.patch('/admin/opportunities/:id', adminAuthMiddleware, (req, res) => {
    const { status, title, description, budget, duration_minutes, subcategory, location } = req.body;
    const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });

    db.prepare(`
      UPDATE opportunities SET
        status = COALESCE(?, status),
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        budget = COALESCE(?, budget),
        duration_minutes = COALESCE(?, duration_minutes),
        subcategory = COALESCE(?, subcategory),
        location = COALESCE(?, location)
      WHERE id = ?
    `).run(
      status || null,
      title ? title.trim() : null,
      description ? description.trim() : null,
      budget !== undefined ? Number(budget) : null,
      duration_minutes !== undefined ? Number(duration_minutes) : null,
      subcategory || null,
      location || null,
      opp.id
    );

    logAuditAction(req.user, 'OPPORTUNITY_UPDATED', 'opportunity', opp.id, req.body);
    res.json({ success: true });
  });

  router.post('/admin/opportunities/:id/publish', adminAuthMiddleware, (req, res) => {
    const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });

    db.prepare("UPDATE opportunities SET status = 'open' WHERE id = ?").run(opp.id);
    logAuditAction(req.user, 'OPPORTUNITY_PUBLISHED', 'opportunity', opp.id, { title: opp.title });
    res.json({ success: true, message: 'Opportunity published.' });
  });

  router.delete('/admin/opportunities/:id', adminAuthMiddleware, (req, res) => {
    const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });

    db.prepare('DELETE FROM applications WHERE opportunity_id = ?').run(opp.id);
    db.prepare('DELETE FROM opportunities WHERE id = ?').run(opp.id);
    logAuditAction(req.user, 'OPPORTUNITY_DELETED', 'opportunity', opp.id, { title: opp.title });
    res.json({ success: true, message: 'Opportunity deleted.' });
  });

  router.get('/admin/applications', adminAuthMiddleware, (req, res) => {
    const applications = db.prepare(`
      SELECT a.*, 
             o.title as opportunity_title, o.budget as opportunity_budget, o.status as opportunity_status,
             p.full_name as provider_name, p.email as provider_email, p.avatar_url as provider_avatar, p.rating as provider_rating
      FROM applications a
      JOIN opportunities o ON a.opportunity_id = o.id
      JOIN users p ON a.provider_id = p.id
      ORDER BY a.created_at DESC
    `).all();
    res.json({ applications });
  });

  router.patch('/admin/applications/:id/status', adminAuthMiddleware, (req, res) => {
    const { status } = req.body; // 'accepted' | 'rejected'
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'Application not found' });

    db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(status, app.id);
    logAuditAction(req.user, 'APPLICATION_STATUS_CHANGED', 'application', app.id, { status });
    res.json({ success: true, status });
  });

  // 10. Provider Verifications Queue
  router.get('/admin/verifications', adminAuthMiddleware, (req, res) => {
    const pending = db.prepare(`
      SELECT id, full_name, email, headline, bio, rating, review_count, sessions_completed, member_since, avatar_url, created_at,
             country, city, languages_json, skills_json, experience_years
      FROM users
      WHERE role = 'provider' AND verified = 0 AND is_suspended = 0
      ORDER BY created_at DESC
    `).all();
    const verified = db.prepare(`
      SELECT id, full_name, email, headline, bio, rating, review_count, sessions_completed, member_since, avatar_url, created_at,
             country, city, languages_json, skills_json, experience_years
      FROM users
      WHERE role = 'provider' AND verified = 1
      ORDER BY created_at DESC
    `).all();
    res.json({ pending: pending.map(sanitizeUser), verified: verified.map(sanitizeUser) });
  });

  // 11. Reports & Moderation Queue
  router.get('/admin/reports', adminAuthMiddleware, (req, res) => {
    const reports = db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all();
    res.json({ reports });
  });

  router.patch('/admin/reports/:id', adminAuthMiddleware, (req, res) => {
    const { status, action_taken, admin_notes } = req.body;
    db.prepare(`
      UPDATE reports 
      SET status = ?, action_taken = ?, admin_notes = ? 
      WHERE id = ?
    `).run(status, action_taken || '', admin_notes || '', req.params.id);

    logAuditAction(req.user, 'REPORT_ACTIONED', 'report', req.params.id, { status, action_taken, admin_notes });
    res.json({ success: true });
  });

  // 12. Email Logs & Notification Logs (Sanitized)
  router.get('/admin/email-logs', adminAuthMiddleware, (req, res) => {
    const logs = db.prepare('SELECT id, user_id, recipient, template, subject, status, provider_message_id, error_message, created_at FROM email_logs ORDER BY created_at DESC LIMIT 100').all();
    res.json({ logs, count: logs.length });
  });

  router.get('/admin/notification-logs', adminAuthMiddleware, (req, res) => {
    const notifications = db.prepare(`
      SELECT n.*, u.full_name as user_name, u.email as user_email, u.role as user_role
      FROM notifications n
      JOIN users u ON n.user_id = u.id
      ORDER BY n.created_at DESC
      LIMIT 100
    `).all();
    res.json({ notifications, count: notifications.length });
  });

  // 13. Admin Audit Logs
  router.get('/admin/audit-logs', adminAuthMiddleware, (req, res) => {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
    res.json({ logs, count: logs.length });
  });

  // 14. Platform Settings
  router.get('/admin/settings', adminAuthMiddleware, (req, res) => {
    const settings = db.prepare('SELECT * FROM platform_settings').all();
    const settingsMap = {};
    settings.forEach(s => { settingsMap[s.key] = s.value; });
    res.json({ settings: settingsMap });
  });

  router.put('/admin/settings', adminAuthMiddleware, (req, res) => {
    const { platform_name, listing_fee_usd, platform_fee_percent, default_response_time, payout_schedule } = req.body;

    const updateStmt = db.prepare(`
      INSERT OR REPLACE INTO platform_settings (key, value, description, updated_at)
      VALUES (?, ?, (SELECT description FROM platform_settings WHERE key = ?), CURRENT_TIMESTAMP)
    `);

    if (platform_name) updateStmt.run('platform_name', platform_name, 'platform_name');
    if (listing_fee_usd) updateStmt.run('listing_fee_usd', String(listing_fee_usd), 'listing_fee_usd');
    if (platform_fee_percent) updateStmt.run('platform_fee_percent', String(platform_fee_percent), 'platform_fee_percent');
    if (default_response_time) updateStmt.run('default_response_time', default_response_time, 'default_response_time');
    if (payout_schedule) updateStmt.run('payout_schedule', payout_schedule, 'payout_schedule');

    logAuditAction(req.user, 'PLATFORM_SETTINGS_UPDATED', 'system', 'platform_settings', req.body);
    res.json({ success: true, message: 'Settings updated successfully.' });
  });

  router.post('/admin/change-password', adminAuthMiddleware, (req, res) => {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const hashed = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashed, req.user.id);
    logAuditAction(req.user, 'ADMIN_PASSWORD_CHANGED', 'user', req.user.id, { email: req.user.email });
    res.json({ success: true, message: 'Administrator password updated successfully.' });
  });

  // 15. Registration Campaigns & Promotional Fee Management
  router.get('/admin/campaigns', adminAuthMiddleware, (req, res) => {
    const effective = getEffectiveListingFee();
    const campaigns = db.prepare(`
      SELECT * FROM registration_campaigns ORDER BY created_at DESC
    `).all();
    res.json({ campaigns, effective });
  });

  router.post('/admin/campaigns', adminAuthMiddleware, (req, res) => {
    const { name, description = '', fee_usd = 0.00, start_time, end_time, is_active = 1 } = req.body;
    if (!name || !start_time || !end_time) {
      return res.status(400).json({ error: 'Name, start time, and end time are required.' });
    }

    const startMs = new Date(start_time).getTime();
    const endMs = new Date(end_time).getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      return res.status(400).json({ error: 'Invalid start or end timestamp format.' });
    }
    if (startMs >= endMs) {
      return res.status(400).json({ error: 'End time must be strictly after start time.' });
    }

    const now = Date.now();
    let status = 'scheduled';
    if (now > endMs) status = 'expired';
    else if (now >= startMs && now <= endMs) status = is_active ? 'active' : 'scheduled';

    const id = `camp-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO registration_campaigns (
        id, name, description, fee_usd, start_time, end_time, is_active, status, created_by, created_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      description.trim(),
      Number(fee_usd) || 0.00,
      new Date(start_time).toISOString(),
      new Date(end_time).toISOString(),
      is_active ? 1 : 0,
      status,
      req.user.id,
      req.user.full_name
    );

    logAuditAction(req.user, 'CREATE_REGISTRATION_CAMPAIGN', 'campaign', id, { name, fee_usd, start_time, end_time });

    const created = db.prepare('SELECT * FROM registration_campaigns WHERE id = ?').get(id);
    res.status(201).json({
      success: true,
      campaign: created,
      effective: getEffectiveListingFee()
    });
  });

  router.post('/admin/campaigns/launch-free-24h', adminAuthMiddleware, (req, res) => {
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const id = `camp-${uuidv4().slice(0, 8)}`;

    // Deactivate previous active campaigns
    db.prepare(`UPDATE registration_campaigns SET is_active = 0, status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE status = 'active'`).run();

    db.prepare(`
      INSERT INTO registration_campaigns (
        id, name, description, fee_usd, start_time, end_time, is_active, status, created_by, created_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 'active', ?, ?)
    `).run(
      id,
      'Launch Promotion — Free Expert Registration',
      'Launch Offer: 100% free expert registration and service listing for 24 hours ($0.00 fee).',
      0.00,
      now.toISOString(),
      end.toISOString(),
      req.user.id,
      req.user.full_name
    );

    logAuditAction(req.user, 'ACTIVATE_24H_FREE_PROMOTION', 'campaign', id, { fee_usd: 0.00, start_time: now.toISOString(), end_time: end.toISOString() });

    const created = db.prepare('SELECT * FROM registration_campaigns WHERE id = ?').get(id);
    res.status(201).json({
      success: true,
      message: '24-hour Free Registration promotion activated successfully!',
      campaign: created,
      effective: getEffectiveListingFee()
    });
  });

  router.patch('/admin/campaigns/:id', adminAuthMiddleware, (req, res) => {
    const campaign = db.prepare('SELECT * FROM registration_campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const { is_active, status, fee_usd, name, description, end_time } = req.body;

    let newIsActive = is_active !== undefined ? (is_active ? 1 : 0) : campaign.is_active;
    let newStatus = status !== undefined ? status : campaign.status;
    let newFee = fee_usd !== undefined ? Number(fee_usd) : campaign.fee_usd;
    let newName = name !== undefined ? name.trim() : campaign.name;
    let newDesc = description !== undefined ? description.trim() : campaign.description;
    let newEndTime = end_time !== undefined ? new Date(end_time).toISOString() : campaign.end_time;

    if (newStatus === 'cancelled') {
      newIsActive = 0;
    }

    db.prepare(`
      UPDATE registration_campaigns 
      SET is_active = ?, status = ?, fee_usd = ?, name = ?, description = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newIsActive, newStatus, newFee, newName, newDesc, newEndTime, campaign.id);

    logAuditAction(req.user, 'UPDATE_REGISTRATION_CAMPAIGN', 'campaign', campaign.id, {
      status: newStatus, is_active: newIsActive, fee_usd: newFee
    });

    const updated = db.prepare('SELECT * FROM registration_campaigns WHERE id = ?').get(campaign.id);
    res.json({
      success: true,
      campaign: updated,
      effective: getEffectiveListingFee()
    });
  });

  router.patch('/admin/settings/listing-fee', adminAuthMiddleware, (req, res) => {
    const { listing_fee_usd } = req.body;
    if (listing_fee_usd === undefined || isNaN(parseFloat(listing_fee_usd))) {
      return res.status(400).json({ error: 'Valid listing_fee_usd number is required.' });
    }

    const feeNum = parseFloat(listing_fee_usd);
    db.prepare(`
      INSERT INTO platform_settings (key, value, description)
      VALUES ('listing_fee_usd', ?, 'Base flat fee charged to experts to activate a service listing')
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(feeNum.toFixed(2));

    logAuditAction(req.user, 'UPDATE_BASE_LISTING_FEE', 'platform_settings', 'listing_fee_usd', { new_fee: feeNum });

    res.json({
      success: true,
      base_fee: feeNum,
      effective: getEffectiveListingFee()
    });
  });

  // User Notifications
  router.get('/notifications', authMiddleware, (req, res) => {
    const notifications = db.prepare(`
      SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
    `).all(req.user.id);
    res.json({ notifications });
  });

  router.patch('/notifications/:id/read', authMiddleware, (req, res) => {
    db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`).run(req.params.id, req.user.id);
    res.json({ success: true });
  });

  return router;
};
