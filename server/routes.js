const express = require('express');
const router = express.Router();
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const emailService = require('./services/emailService');
const storageService = require('./services/storageService');
const crypto = require('crypto');
const { CURRENCY, CURRENCY_SYMBOL, toPaise, toRupees, formatINR, resolveRazorpayCredentials, getRazorpaySafeDiagnostics } = require('./currency');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-jwt-secret-hirebyminutes-key' : null);
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required in production.');
}

function generateToken(user) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is missing. Cannot sign token.');
  }
  return jwt.sign(
    {
      id: user.id,
      role: user.role
    },
    JWT_SECRET,
    {
      expiresIn: '7d'
    }
  );
}

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

// Authoritative Platform Commission helper: dynamically retrieves commission percent from database
function getPlatformCommissionPercent() {
  try {
    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'platform_fee_percent'").get();
    if (setting && setting.value !== undefined && setting.value !== null) {
      const val = parseFloat(setting.value);
      if (!isNaN(val) && val >= 0 && val <= 100) return val;
    }
  } catch (e) {
    // Database query fallback
  }
  return 15;
}

// Helper to strip sensitive password data from user records and parse structured fields
function sanitizeUser(user) {
  if (!user) return null;
  const safe = { ...user };
  delete safe.password_hash;

  // Normalize PostgreSQL NUMERIC / aggregate fields to numbers to prevent string .toFixed errors
  if ('total_spent' in safe) {
    safe.total_spent = Number(safe.total_spent) || 0;
  }
  if ('revenue_generated' in safe) {
    safe.revenue_generated = Number(safe.revenue_generated) || 0;
  }
  if ('services_count' in safe) {
    safe.services_count = Number(safe.services_count) || 0;
  }
  if ('bookings_count' in safe) {
    safe.bookings_count = Number(safe.bookings_count) || 0;
  }
  if ('sessions_count' in safe) {
    safe.sessions_count = Number(safe.sessions_count) || 0;
  }

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

  if (safe.education_json && typeof safe.education_json === 'string') {
    try {
      safe.education = JSON.parse(safe.education_json);
    } catch {
      safe.education = [];
    }
  } else if (!safe.education) {
    safe.education = [];
  }

  if (safe.certifications_json && typeof safe.certifications_json === 'string') {
    try {
      safe.certifications = JSON.parse(safe.certifications_json);
    } catch {
      safe.certifications = [];
    }
  } else if (!safe.certifications) {
    safe.certifications = [];
  }

  return safe;
}

// Server-Authoritative Listing Policy: Service creation is 100% FREE on HireByMinute
function getEffectiveListingFee() {
  return {
    fee: 0,
    baseFee: 0,
    currency: CURRENCY,
    currency_symbol: CURRENCY_SYMBOL,
    isFree: true,
    isPromotionActive: false,
    activeCampaign: null,
    upcomingCampaigns: [],
    serverTime: new Date().toISOString()
  };
}

// Helper to retrieve database-configured platform settings for payment gateway fallback
function getDatabasePaymentSettings() {
  try {
    const rows = db.prepare(`
      SELECT key, value FROM platform_settings
      WHERE key IN ('razorpay_key_id', 'razorpay_key_secret', 'razorpay_webhook_secret')
    `).all();
    const map = {};
    if (rows && rows.length > 0) {
      rows.forEach(r => { map[r.key] = r.value; });
    }
    return map;
  } catch {
    return {};
  }
}

// Helper to resolve authoritative Razorpay credentials across environment variables and database settings
function getEffectiveRazorpayCredentials() {
  const dbSettings = getDatabasePaymentSettings();
  return resolveRazorpayCredentials(process.env, dbSettings);
}

// Server-Authoritative Razorpay Native Order Dispatch Helper (Strictly INR)
async function createRazorpayNativeOrder({ amountPaise, receipt, notes = {} }) {
  const resolved = getEffectiveRazorpayCredentials();
  const keyId = resolved.keyId;
  const keySecret = resolved.keySecret;

  const isProduction = process.env.NODE_ENV === 'production';
  const hasRealKeys = resolved.isConfigured;

  if (isProduction || hasRealKeys) {
    if (!keyId || !keySecret) {
      console.error('[Razorpay Safe Diagnostic] Missing credentials in environment/settings.', getRazorpaySafeDiagnostics(process.env, getDatabasePaymentSettings()));
      const err = new Error('Payment could not be initialized due to missing gateway credentials. Please try again or contact support.');
      err.statusCode = 502;
      throw err;
    }

    if (keyId.startsWith('rzp_test_') && isProduction) {
      console.warn('[Razorpay Warning Safe Diagnostic] Test mode key detected in production environment.', getRazorpaySafeDiagnostics(process.env, getDatabasePaymentSettings()));
    }

    if (resolved.isSwapped) {
      console.warn('[Razorpay Credential Inversion Corrected] Using automatically corrected Key ID and Secret for gateway order.');
    }

    let effectiveKeyId = keyId;
    let effectiveKeySecret = keySecret;
    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    let rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: CURRENCY, // Explicitly INR
        receipt: String(receipt).slice(0, 40),
        notes: {
          ...notes,
          currency: CURRENCY
        }
      })
    });

    // If 401 Authentication failed and we haven't already swapped, attempt automatic recovery with inverted credentials
    if (rzpRes.status === 401 && !resolved.isSwapped && keySecret && keyId) {
      console.warn('[Razorpay Order Inverted Retry] Primary credentials rejected with 401. Testing inverted (swapped) Key ID/Secret pair...');
      const swappedAuth = 'Basic ' + Buffer.from(`${keySecret}:${keyId}`).toString('base64');
      const swappedRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': swappedAuth,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: CURRENCY,
          receipt: String(receipt).slice(0, 40),
          notes: {
            ...notes,
            currency: CURRENCY
          }
        })
      });

      if (swappedRes.ok) {
        console.log('[Razorpay Order Inverted Recovery SUCCESS] Inverted Key ID/Secret pair authenticated successfully! Using inverted credentials.');
        rzpRes = swappedRes;
        effectiveKeyId = keySecret;
        effectiveKeySecret = keyId;
      }
    }

    if (!rzpRes.ok) {
      let rzpErr = {};
      try {
        rzpErr = await rzpRes.json();
      } catch {}
      const safeDiag = {
        status: rzpRes.status,
        code: rzpErr.error?.code || 'UNKNOWN_ERROR',
        description: rzpErr.error?.description || 'Gateway rejected order creation',
        source: rzpErr.error?.source || 'gateway',
        step: rzpErr.error?.step || 'order_create',
        reason: rzpErr.error?.reason || 'unspecified',
        diagnostics: getRazorpaySafeDiagnostics(process.env, getDatabasePaymentSettings())
      };
      console.error('[Razorpay Order Creation Failed Safe Diagnostic]', safeDiag);

      // Log failure to audit_logs for production traceability
      try {
        const auditId = `audit-${uuidv4().replace(/-/g, '').slice(0, 8)}`;
        db.prepare(`
          INSERT INTO audit_logs (id, admin_id, admin_name, action, target_type, target_id, details_json, created_at)
          VALUES (?, 'system', 'Payment Gateway Monitor', 'PAYMENT_ORDER_CREATION_FAILED', 'payment_gateway', ?, ?, CURRENT_TIMESTAMP)
        `).run(auditId, String(receipt).slice(0, 40), JSON.stringify(safeDiag));
      } catch (auditErr) {
        // Safe if audit logging fails
      }

      const err = new Error(rzpErr.error?.description || 'Payment could not be initialized. Please try again.');
      err.statusCode = 502;
      throw err;
    }

    const rzpOrder = await rzpRes.json();
    return {
      order_id: rzpOrder.id,
      currency: rzpOrder.currency || CURRENCY,
      key_id: effectiveKeyId,
      amount_paise: amountPaise
    };
  } else {
    // Development / test simulation order with zero external dependency
    const simulatedOrderId = `order_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
    return {
      order_id: simulatedOrderId,
      currency: CURRENCY,
      key_id: keyId || 'rzp_test_placeholder',
      amount_paise: amountPaise
    };
  }
}

module.exports = function(timerEngineArg, ioArg, maybeTimer) {
  let timerEngine = (maybeTimer && typeof maybeTimer.extendSession === 'function') ? maybeTimer : timerEngineArg;
  let io = ioArg;
  // Initialize email service with database reference
  emailService.init(db);

  // Production Health Monitoring Endpoints (Extremely lightweight, Render Free safe, no auth, no external API)
  const handleHealth = (req, res) => {
    // Prevent any proxy or CDN caching so pings always reach the Render backend process
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    // Optional deep query probe if specifically requested via ?deep=1 or ?checkDb=true
    if (req.query && (req.query.deep === '1' || req.query.checkDb === 'true')) {
      try {
        const result = db.prepare('SELECT 1 as alive').get();
        if (!result || (result.alive !== 1 && result.alive !== '1' && result.alive !== true)) {
          return res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            timestamp: new Date().toISOString()
          });
        }
      } catch (err) {
        return res.status(503).json({
          status: 'unhealthy',
          database: 'disconnected',
          timestamp: new Date().toISOString()
        });
      }
    }

    const isDbReady = Boolean(db);
    if (!isDbReady) {
      return res.status(503).json({
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString()
      });
    }

    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    const memoryUsage = process.memoryUsage();
    return res.status(200).json({
      status: 'healthy',
      ok: true,
      platform: 'HireByMinute',
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
  };

  const handlePing = (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (req.method === 'HEAD') return res.status(200).end();
    res.status(200).send('pong');
  };

  router.get('/health', handleHealth);
  router.head('/health', handleHealth);
  router.get('/healthz', handleHealth);
  router.get('/ping', handlePing);
  router.head('/ping', handlePing);

  // Public Platform Registration / Listing Fee Status Endpoint
  router.get('/platform/registration-fee', (req, res) => {
    const feeData = getEffectiveListingFee();
    res.json(feeData);
  });

  // Public Platform Settings (Site Identity, Brand Logo, Header Navigation, Header CTA)
  router.get('/platform/settings', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT key, value FROM platform_settings
        WHERE key IN ('platform_name', 'logo_url', 'header_navigation', 'header_cta_label', 'header_cta_url')
      `).all();

      const defaultNav = [
        { id: 'services', label: 'Services', url: '/services', order: 1, is_visible: true, is_external: false },
        { id: 'projects', label: 'Projects', url: '/projects', order: 2, is_visible: true, is_external: false },
        { id: 'opportunities', label: 'Opportunities', url: '/opportunities', order: 3, is_visible: true, is_external: false },
        { id: 'jobs', label: 'Jobs', url: '/jobs', order: 4, is_visible: true, is_external: false },
        { id: 'how-it-works', label: 'How It Works', url: '/how-it-works', order: 5, is_visible: true, is_external: false },
        { id: 'blog', label: 'Blog', url: '/blog', order: 6, is_visible: true, is_external: false }
      ];

      const result = {
        platform_name: 'HireByMinutes',
        logo_url: '',
        header_navigation: defaultNav,
        header_cta_label: 'Get Started',
        header_cta_url: '/signup'
      };

      rows.forEach(r => {
        if (r.key === 'header_navigation') {
          try {
            const parsed = JSON.parse(r.value);
            if (Array.isArray(parsed) && parsed.length > 0) {
              result.header_navigation = parsed.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
            }
          } catch (e) {
            result.header_navigation = defaultNav;
          }
        } else if (r.key === 'platform_name') {
          result.platform_name = r.value || 'HireByMinute';
        } else if (r.key === 'logo_url') {
          result.logo_url = r.value || '';
        } else if (r.key === 'header_cta_label') {
          result.header_cta_label = r.value || 'Sign In / Join';
        } else if (r.key === 'header_cta_url') {
          result.header_cta_url = r.value || '/auth';
        }
      });

      res.json(result);
    } catch (err) {
      console.error('[Platform Settings] Error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve platform settings' });
    }
  });

  // Public Platform Footer Configuration (Guaranteed: Admin Console is strictly excluded)
  router.get('/platform/footer', (req, res) => {
    try {
      const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'footer_settings'").get();
      const defaultFooter = {
        company_description: 'Expertise by the minute.',
        contact_email: 'support@hirebyminutes.com',
        contact_phone: '+1 (800) 555-0199',
        address: 'San Francisco, CA, United States',
        copyright_text: '© {year} HireByMinute. All rights reserved.',
        designer_credit: 'Designed & Developed by Vishal Chaudhary',
        social_links: [
          { platform: 'twitter', url: 'https://twitter.com/hirebyminute', is_visible: true },
          { platform: 'linkedin', url: 'https://linkedin.com/company/hirebyminute', is_visible: true },
          { platform: 'github', url: 'https://github.com/hirebyminute', is_visible: true }
        ],
        sections: {
          platform: [
            { id: 'about', label: 'About Us', url: '/about', order: 1, is_visible: true },
            { id: 'how-it-works', label: 'How It Works', url: '/how-it-works', order: 2, is_visible: true },
            { id: 'services', label: 'Browse Services', url: '/services', order: 3, is_visible: true },
            { id: 'opportunities', label: 'Opportunities', url: '/opportunities', order: 4, is_visible: true, is_new: true }
          ],
          policies: [
            { id: 'terms', label: 'Terms of Service', url: '/terms', order: 1, is_visible: true },
            { id: 'privacy', label: 'Privacy Policy', url: '/privacy', order: 2, is_visible: true },
            { id: 'refund', label: 'Refund & Cancellation', url: '/refund-policy', order: 3, is_visible: true },
            { id: 'expert-policy', label: 'Expert Policy', url: '/expert-policy', order: 4, is_visible: true },
            { id: 'acceptable-use', label: 'Acceptable Use', url: '/acceptable-use', order: 5, is_visible: true }
          ],
          support: [
            { id: 'contact', label: 'Contact / Support', url: '/contact', order: 1, is_visible: true, icon: 'mail' },
            { id: 'become-provider', label: 'Become a Provider', url: '/provider/onboard', order: 2, is_visible: true },
            { id: 'provider-dashboard', label: 'Provider Dashboard', url: '/provider', order: 3, is_visible: true }
          ]
        }
      };

      let footerData = defaultFooter;
      if (setting && setting.value) {
        try {
          const parsed = JSON.parse(setting.value);
          if (parsed && typeof parsed === 'object') {
            footerData = { ...defaultFooter, ...parsed };
          }
        } catch (e) {
          footerData = defaultFooter;
        }
      }

      // Security Audit: Sanitize and strictly filter out any links pointing to /admin or internal admin routes
      if (footerData.sections) {
        Object.keys(footerData.sections).forEach(secKey => {
          if (Array.isArray(footerData.sections[secKey])) {
            footerData.sections[secKey] = footerData.sections[secKey].filter(item => {
              const url = String(item.url || '').toLowerCase();
              const label = String(item.label || '').toLowerCase();
              return !url.includes('/admin') && !label.includes('admin console') && !label.includes('admin portal');
            });
          }
        });
      }

      res.json({ footer: footerData });
    } catch (err) {
      console.error('[Footer Settings] Error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve footer settings' });
    }
  });

  // Public Platform Contact Information
  router.get('/platform/contact', (req, res) => {
    try {
      const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'contact_settings'").get();
      const defaultContact = {
        support_email: 'support@hirebyminute.com',
        business_email: 'business@hirebyminute.com',
        phone: '+1 (800) 555-0199',
        support_hours: 'Monday – Friday: 9:00 AM – 6:00 PM EST (24/7 Escalation Desk)',
        address: 'San Francisco, CA, United States',
        whatsapp_url: '',
        contact_form_enabled: true
      };

      let contactData = defaultContact;
      if (setting && setting.value) {
        try {
          const parsed = JSON.parse(setting.value);
          if (parsed && typeof parsed === 'object') {
            contactData = { ...defaultContact, ...parsed };
          }
        } catch (e) {
          contactData = defaultContact;
        }
      }

      res.json({ contact: contactData });
    } catch (err) {
      console.error('[Contact Settings] Error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve contact settings' });
    }
  });

  // In-memory contact submission rate limiter (IP -> timestamps array)
  const contactSubmissionRateMap = new Map();

  // Public Platform Contact Form Submission
  const handleContactSubmission = async (req, res) => {
    try {
      const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

      // 1. Check if contact form is enabled in settings
      const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'contact_settings'").get();
      let contactSettings = {};
      if (setting && setting.value) {
        try { contactSettings = JSON.parse(setting.value); } catch (e) {}
      }
      if (contactSettings.contact_form_enabled === false) {
        return res.status(403).json({ error: 'The contact form is temporarily disabled. Please email support directly.' });
      }

      // 2. Honeypot check (bots fill hidden field hp_website)
      if (req.body.hp_website) {
        console.warn(`[Contact Form Bot Detected] Honeypot triggered from IP ${clientIp}`);
        return res.status(200).json({ success: true, message: 'Your support inquiry has been received.' });
      }

      // 3. Validation
      const rawName = String(req.body.name || '').trim();
      const rawEmail = String(req.body.email || '').trim().toLowerCase();
      const rawSubject = String(req.body.subject || '').trim();
      const rawCategory = String(req.body.category || 'general').trim().toLowerCase();
      const rawMessage = String(req.body.message || '').trim();

      if (!rawName || rawName.length < 2 || rawName.length > 100) {
        return res.status(400).json({ error: 'Please provide your full name (2–100 characters).' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!rawEmail || !emailRegex.test(rawEmail) || rawEmail.length > 255) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }

      if (!rawMessage || rawMessage.length < 10) {
        return res.status(400).json({ error: 'Please enter a detailed message (minimum 10 characters).' });
      }
      if (rawMessage.length > 5000) {
        return res.status(400).json({ error: 'Message cannot exceed 5,000 characters.' });
      }

      // 4. Rate Limiting (Max 5 submissions per 10 minutes per IP)
      const now = Date.now();
      const ipHistory = (contactSubmissionRateMap.get(clientIp) || []).filter(t => now - t < 10 * 60 * 1000);
      if (ipHistory.length >= 5) {
        return res.status(429).json({ error: 'Too many submissions from your connection. Please wait 10 minutes before submitting again.' });
      }
      ipHistory.push(now);
      contactSubmissionRateMap.set(clientIp, ipHistory);

      // 5. Duplicate Prevention (Identical email + message within last 5 minutes)
      try {
        const recentDuplicate = db.prepare(`
          SELECT id FROM contact_inquiries
          WHERE email = ? AND message = ? AND created_at > datetime('now', '-5 minutes')
          LIMIT 1
        `).get(rawEmail, rawMessage);
        if (recentDuplicate) {
          return res.status(400).json({ error: 'A message with identical content was already submitted recently. Please allow time for our team to review it.' });
        }
      } catch (dupCheckErr) {
        // Non-blocking fallback if query dialect differs
      }

      // 6. Persistence in contact_inquiries
      const inquiryId = `inq-${Date.now()}-${uuidv4().slice(0, 6)}`;
      try {
        db.prepare(`
          INSERT INTO contact_inquiries (id, name, email, category, subject, message, ip_address, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
        `).run(inquiryId, rawName, rawEmail, rawCategory, rawSubject || null, rawMessage, String(clientIp).slice(0, 64));
      } catch (insertErr) {
        console.error('[Contact Submission DB Error]:', insertErr.message);
      }

      // 7. Dispatch Transactional Notifications via EmailService
      const supportDest = contactSettings.support_email || 'support@hirebyminute.com';
      try {
        await emailService.sendContactNotification({
          recipientEmail: supportDest,
          name: rawName,
          email: rawEmail,
          category: rawCategory,
          subject: rawSubject,
          message: rawMessage,
          inquiryId
        });
      } catch (notifErr) {
        console.warn('[Contact Support Email Warning]:', notifErr.message);
      }

      try {
        await emailService.sendContactConfirmation({
          email: rawEmail,
          name: rawName,
          subject: rawSubject,
          category: rawCategory,
          message: rawMessage,
          inquiryId
        });
      } catch (confErr) {
        console.warn('[Contact Sender Confirmation Warning]:', confErr.message);
      }

      return res.status(200).json({
        success: true,
        inquiry_id: inquiryId,
        message: 'Thank you for reaching out. Your inquiry has been received and logged. Our team will get back to you within 24 hours.'
      });
    } catch (err) {
      console.error('[Contact Submission Error]:', err.message);
      return res.status(500).json({ error: 'Failed to process inquiry. Please try again or email us directly.' });
    }
  };

  router.post('/platform/contact', handleContactSubmission);
  router.post('/contact', handleContactSubmission);

  // Public Homepage Settings
  router.get('/platform/homepage', (req, res) => {
    try {
      const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'homepage_settings'").get();
      const defaultHomepage = {
        hero_headline: 'What brings you here?',
        hero_subheadline: 'Hire expertise by the minute, or turn your expertise into a service people can book.',
        hero_badge_text: '⚡ Instant 1-on-1 Consultations • Pay Per Exact Minute',
        primary_cta_label: 'Find an Expert',
        primary_cta_url: '/services',
        secondary_cta_label: 'Become a Service Provider',
        secondary_cta_url: '/provider/onboard',
        search_placeholder: 'Search experts, skills, or services...',
        popular_tags: ['Python developer', 'Figma teardown', 'RAG architect', 'B2B growth audit', 'Tax advisor', 'AI Prompt Engineer', 'Fractional CTO'],
        intent_client_title: 'Find an expert',
        intent_client_desc: 'Pay only for the exact minutes you spend with a vetted professional. No retainers or minimum commitments.',
        intent_client_button: 'Browse Experts',
        intent_provider_title: 'List your service',
        intent_provider_desc: 'Set your own per-minute rate, choose your hours, and get booked by clients who value your time.',
        intent_provider_button: 'Become a Service Provider',
        how_it_works_title: 'How HireByMinute works',
        how_it_works_subtitle: 'From finding the right person to finishing your timed consultation in four easy steps.',
        how_it_works_steps: [
          { step: '01', title: 'Find an Expert', description: 'Find someone who knows exactly what you need without wading through bloated project agencies.' },
          { step: '02', title: 'Choose Your Time', description: 'Choose exactly how many minutes or hours you need: 15m, 30m, 45m, or custom duration.' },
          { step: '03', title: 'Live Timed Session', description: 'Chat, call, video, or share files while the server-authoritative countdown clock is active.' },
          { step: '04', title: 'Session Completes', description: 'When time ends, communication closes naturally. No scope creep, surprise invoices, or billing disputes.' }
        ],
        cta_title: 'Ready to experience precision consulting?',
        cta_subtitle: 'Connect with verified specialists right now and pay strictly for the minutes you use.',
        cta_button_label: 'Get Started Today',
        cta_button_url: '/services',
        visibility: {
          hero: true,
          intent_cards: true,
          search: true,
          popular_categories: true,
          featured_experts: true,
          how_it_works: true,
          cta: true
        }
      };

      let homepageData = defaultHomepage;
      if (setting && setting.value) {
        try {
          const parsed = JSON.parse(setting.value);
          if (parsed && typeof parsed === 'object') {
            homepageData = { ...defaultHomepage, ...parsed };
          }
        } catch (e) {
          homepageData = defaultHomepage;
        }
      }

      res.json({ homepage: homepageData });
    } catch (err) {
      console.error('[Homepage Settings] Error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve homepage settings' });
    }
  });

  // Public SEO Metadata & Social Sharing Tags
  router.get('/platform/seo', (req, res) => {
    try {
      const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'seo_settings'").get();
      const defaultSeo = {
        site_title: 'HireByMinute — Instant 1-on-1 Consultations by the Minute',
        meta_description: 'Connect with verified experts instantly for 1-on-1 audio/video consultations. Pay only for the exact minutes you use with zero upfront retainers.',
        canonical_url: 'https://hirebyminute.com',
        og_title: 'HireByMinute — Instant 1-on-1 Consultations by the Minute',
        og_description: 'Pay strictly for the minutes you consult. Real-time audio/video consultations with verified experts.',
        og_image: 'https://hirebyminute.com/og-image.png',
        twitter_card: 'summary_large_image',
        twitter_site: '@hirebyminute'
      };

      let seoData = defaultSeo;
      if (setting && setting.value) {
        try {
          const parsed = JSON.parse(setting.value);
          if (parsed && typeof parsed === 'object') {
            seoData = { ...defaultSeo, ...parsed };
          }
        } catch (e) {
          seoData = defaultSeo;
        }
      }

      res.json({ seo: seoData });
    } catch (err) {
      console.error('[SEO Settings] Error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve SEO settings' });
    }
  });

  // Public FAQs Endpoint
  router.get('/faqs', (req, res) => {
    try {
      const faqs = db.prepare('SELECT id, question, answer, category, sort_order, is_published FROM faqs WHERE is_published = 1 ORDER BY sort_order ASC, created_at ASC').all();
      res.json({ faqs: faqs || [] });
    } catch (err) {
      console.error('[FAQs] Error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve FAQs' });
    }
  });
  router.get('/platform/faqs', (req, res) => res.redirect(307, '/api/faqs'));

  // Public Platform Statistics Endpoint (Authentic platform metrics)
  router.get('/platform/stats', (req, res) => {
    try {
      const expertCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'provider' AND verified = 1").get()?.c || 0;
      const totalProviders = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'provider'").get()?.c || 0;
      const consultationsCompleted = db.prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'completed'").get()?.c || 0;
      const totalSessions = db.prepare("SELECT COUNT(*) as c FROM sessions").get()?.c || 0;
      const avgRatingRow = db.prepare("SELECT AVG(rating) as avg, COUNT(*) as c FROM reviews WHERE is_hidden = 0").get();
      const avgRating = avgRatingRow?.avg ? Number(Number(avgRatingRow.avg).toFixed(1)) : 4.9;

      res.json({
        verified_experts: expertCount > 0 ? expertCount : totalProviders,
        consultations_completed: consultationsCompleted,
        total_sessions: totalSessions,
        average_rating: avgRatingRow?.avg ? Number(Number(avgRatingRow.avg).toFixed(1)) : null,
        payment_protection: 'Approval-First Billing'
      });
    } catch (err) {
      console.error('[Platform Stats] Error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve platform stats' });
    }
  });

  // Public Reviews / Testimonials Endpoint (Authentic non-hidden reviews)
  router.get('/reviews/public', (req, res) => {
    try {
      const reviews = db.prepare(`
        SELECT r.id, r.rating, r.comment, r.created_at,
               c.full_name as client_name, c.avatar_url as client_avatar, c.headline as client_headline,
               p.full_name as provider_name, srv.title as service_title
        FROM reviews r
        JOIN users c ON r.client_id = c.id
        JOIN users p ON r.provider_id = p.id
        JOIN services srv ON r.service_id = srv.id
        WHERE r.is_hidden = 0
        ORDER BY r.rating DESC, r.created_at DESC
        LIMIT 6
      `).all().map(r => ({
        ...r,
        rating: Number(r.rating) || 5
      }));
      res.json({ reviews: reviews || [] });
    } catch (err) {
      console.error('[Public Reviews Error]:', err.message);
      res.status(500).json({ error: 'Failed to retrieve public reviews' });
    }
  });

  // --- HELPER AUTH MIDDLEWARES ---
  const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return res.status(401).json({ error: 'Authentication token is missing.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Session expired. Please sign in again.' });
      }
      return res.status(401).json({ error: 'Invalid authentication token.' });
    }

    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Invalid token payload.' });
    }

    const user = db.prepare(`
      SELECT id, email, username, full_name, role, avatar_url, bio, headline, location,
             country, state_region, city, area,
             languages_json, skills_json, experience_years, rating, review_count,
             sessions_completed, verified, email_verified, is_suspended, response_time, member_since, created_at
      FROM users WHERE id = ?
    `).get(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }
    if (user.is_suspended) {
      return res.status(403).json({ error: 'Your account is suspended. Please contact platform administration.' });
    }
    if (user.role !== 'admin' && !user.email_verified) {
      return res.status(403).json({
        error: 'Email verification required. Please verify your email address to access platform features.',
        requires_verification: true,
        email: user.email
      });
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

    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cleanEmail);

    if (process.env.DEBUG_AUTH === 'true') {
      console.log(`[Auth Diagnostic] Login lookup - email: ${cleanEmail}, adapter: ${db.isPostgres ? 'PostgreSQL' : 'SQLite'}, found: ${Boolean(user)}`);
    }

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

    // Strictly require email verification for non-admin accounts before session issuance
    if (user.role !== 'admin' && !user.email_verified) {
      return res.status(403).json({
        error: 'Please verify your email address to complete sign-in.',
        requires_verification: true,
        email: user.email || cleanEmail
      });
    }

    res.json({
      user: sanitizeUser(user),
      token: generateToken(user),
      message: `Welcome back, ${user.full_name}`
    });
  });

  // Register with Email Verification OTP Flow
  router.post('/auth/register', async (req, res) => {
    const { email, password, full_name, role = 'client', headline = '', bio = '' } = req.body;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ error: 'Full name is required.' });
    }

    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
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

    const existing = db.prepare('SELECT id, email_verified FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({
        error: 'An account with this email address already exists.',
        requires_verification: existing.email_verified === 0 || existing.email_verified === false,
        email: cleanEmail
      });
    }

    // Auto-generate or validate case-insensitive permanent username
    const explicitUsername = req.body.username && req.body.username.trim();
    let username = '';
    if (explicitUsername) {
      username = explicitUsername.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      if (username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
      }
      const existingUserWithUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(username);
      if (existingUserWithUsername) {
        return res.status(409).json({ error: 'This username is already taken. Please choose another username.' });
      }
    } else {
      username = (full_name.trim() || cleanEmail.split('@')[0])
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '');
      if (!username) username = `user_${uuidv4().slice(0, 6)}`;
      let candidate = username;
      let suffix = 100;
      while (db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(candidate)) {
        candidate = `${username}_${suffix++}`;
      }
      username = candidate;
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
    try {
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
    } catch (insertErr) {
      const errStr = (insertErr.message || '').toLowerCase();
      if (errStr.includes('unique') || insertErr.code === '23505') {
        if (errStr.includes('email') || errStr.includes('idx_users_email_lower')) {
          return res.status(409).json({ error: 'An account with this email address already exists.' });
        }
        return res.status(409).json({ error: 'This username is already taken. Please choose another username.' });
      }
      throw insertErr;
    }

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

    // Dispatch verification OTP email and await delivery confirmation
    const sendResult = await emailService.sendVerificationOtp({
      email: cleanEmail,
      name: full_name.trim(),
      otp: rawOtp,
      expiryMinutes,
      userId: id
    });

    if (!sendResult.success) {
      // Rollback unverified user record to prevent orphaned unverified accounts
      try {
        db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
      } catch (rollbackErr) {
        console.error('Failed to rollback unverified registration record:', rollbackErr);
      }
      return res.status(502).json({
        error: `Unable to dispatch verification email: ${sendResult.error || 'Provider delivery error'}. Please check your email address and try again.`,
        email_failed: true,
        email: cleanEmail
      });
    }

    const createdUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    res.status(201).json({
      requires_verification: true,
      email: cleanEmail,
      user: sanitizeUser(createdUser),
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
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.replace(/^Bearer\s+/i, '').trim(), JWT_SECRET);
        if (decoded && decoded.id) {
          const tokenUser = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
          if (tokenUser) {
            targetEmail = targetEmail || tokenUser.email;
            userId = tokenUser.id;
          }
        }
      } catch {
        // Fall back to email parameter
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
    const candidateBuf = Buffer.from(candidateHash);
    const tokenBuf = Buffer.from(tokenRecord.code_hash);
    const isMatch = candidateBuf.length === tokenBuf.length && crypto.timingSafeEqual(candidateBuf, tokenBuf);

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
      token: generateToken(updatedUser),
      message: 'Email verified successfully! Welcome to HireByMinute.'
    });
  });

  // Resend Verification OTP (with 60s cooldown and rate limiting)
  router.post('/auth/resend-verification-otp', async (req, res) => {
    const { email } = req.body;
    let targetEmail = email ? email.trim().toLowerCase() : null;

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.replace(/^Bearer\s+/i, '').trim(), JWT_SECRET);
        if (decoded && decoded.id) {
          const tokenUser = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
          if (tokenUser) {
            targetEmail = targetEmail || tokenUser.email;
          }
        }
      } catch {
        // Fall back to email from body
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

    const sendResult = await emailService.sendVerificationOtp({
      email: targetEmail,
      name: user.full_name,
      otp: rawOtp,
      expiryMinutes,
      userId: user.id
    });

    if (!sendResult.success) {
      return res.status(502).json({
        error: `Could not send verification email: ${sendResult.error || 'Provider delivery error'}. Please try again later.`,
        email_failed: true
      });
    }

    res.json({
      success: true,
      message: 'A new 6-digit verification code has been sent to your email.'
    });
  });

  // Change Unverified Email (allows fixing email typos before OTP completion)
  router.post('/auth/change-unverified-email', async (req, res) => {
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

    const sendResult = await emailService.sendVerificationOtp({
      email: cleanNew,
      name: user.full_name,
      otp: rawOtp,
      expiryMinutes,
      userId: user.id
    });

    if (!sendResult.success) {
      // Rollback email change on failure
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(cleanOld, user.id);
      return res.status(502).json({
        error: `Could not send verification email to ${cleanNew}: ${sendResult.error || 'Provider delivery error'}. Email address was not changed.`,
        email_failed: true
      });
    }

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
        subject: 'HireByMinute System Test Email',
        template: 'test_email',
        html: emailService.wrapHtml({
          title: 'Email Delivery Test',
          contentHtml: `<p class="paragraph">This is a test notification confirming that the HireByMinute email delivery system is functioning correctly.</p>`
        }),
        text: 'This is a test notification confirming that the HireByMinute email delivery system is functioning correctly.',
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

  const logoUpload = multer({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for logo
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/svg+xml'];
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];

      if (!allowedMimes.includes(file.mimetype) || !allowedExts.includes(ext)) {
        return cb(new Error('Invalid logo format. Supported formats: PNG, JPG, WEBP, SVG.'));
      }
      cb(null, true);
    }
  });

  router.post('/admin/upload-logo', adminAuthMiddleware, logoUpload.single('logo'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No logo file provided for upload.' });
    }
    try {
      const uploadResult = await storageService.upload({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        folder: 'branding'
      });
      const logoUrl = uploadResult.url;
      const updateStmt = db.prepare(`
        INSERT OR REPLACE INTO platform_settings (key, value, description, updated_at)
        VALUES ('logo_url', ?, 'Custom brand logo image URL', CURRENT_TIMESTAMP)
      `);
      updateStmt.run(logoUrl);
      logAuditAction(req.user, 'BRAND_LOGO_UPLOADED', 'system', 'platform_settings', { logoUrl });
      res.json({
        success: true,
        url: logoUrl,
        filename: uploadResult.filename,
        message: 'Brand logo uploaded and applied successfully.'
      });
    } catch (err) {
      console.error('[Admin Logo Upload Error]', err.message);
      res.status(500).json({ error: 'Failed to process logo upload' });
    }
  }, (err, req, res, next) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Logo upload failed.' });
    }
    next();
  });

  const resumeUpload = multer({
    storage: memoryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for resumes
    fileFilter: (req, file, cb) => {
      const allowedMimes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExts = ['.pdf', '.doc', '.docx'];

      if (!allowedMimes.includes(file.mimetype) && !allowedExts.includes(ext)) {
        return cb(new Error('Invalid resume document format. Supported formats: PDF, DOC, DOCX.'));
      }
      cb(null, true);
    }
  });

  router.post('/upload/resume', authMiddleware, resumeUpload.single('resume'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No resume document provided for upload.' });
    }
    try {
      const uploadResult = await storageService.upload({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype || 'application/pdf',
        folder: 'resumes'
      });
      res.json({
        url: uploadResult.url,
        filename: uploadResult.filename,
        size: uploadResult.size,
        mimetype: uploadResult.mimeType,
        provider: uploadResult.provider,
        message: 'Resume uploaded successfully.'
      });
    } catch (err) {
      console.error('[Resume Upload Error]', err.message);
      res.status(500).json({ error: 'Failed to process resume upload: ' + err.message });
    }
  }, (err, req, res, next) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Resume upload failed.' });
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
      education,
      certifications,
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

    const educationJson = education !== undefined
      ? JSON.stringify(Array.isArray(education) ? education : [])
      : (user.education_json || '[]');

    const certificationsJson = certifications !== undefined
      ? JSON.stringify(Array.isArray(certifications) ? certifications : [])
      : (user.certifications_json || '[]');

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
          languages_json = ?, skills_json = ?, experience_years = ?,
          education_json = ?, certifications_json = ?
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
      educationJson,
      certificationsJson,
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
          if (isNaN(parsedPrice) || parsedPrice <= 0 || parsedPrice > 10000) {
            return res.status(400).json({ error: 'Rate per minute must be a valid positive number between ₹1.00 and ₹10,000.00' });
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
      LEFT JOIN services s ON c.id = s.category_id AND LOWER(s.listing_status) IN ('active', 'published')
      WHERE c.active = 1
      GROUP BY c.id
      ORDER BY c.sort_order ASC
    `).all().map(c => {
      let subcats = [];
      try {
        subcats = JSON.parse(c.subcategories_json || '[]');
      } catch {
        subcats = [];
      }
      return {
        ...c,
        sort_order: Number(c.sort_order) || 0,
        active_services_count: Number(c.active_services_count) || 0,
        subcategories: Array.isArray(subcats) ? subcats : [],
        is_regulated: Boolean(c.is_regulated)
      };
    });
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
      WHERE LOWER(s.listing_status) IN ('active', 'published') AND (u.is_suspended = 0 OR u.is_suspended IS NULL) AND u.email_verified = 1
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
        provider_rating: s.provider_rating != null ? Number(s.provider_rating) : 5.0,
        price_per_minute: Number(s.price_per_minute) || 0,
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
    const { category, subcategory, search, minPrice, maxPrice, rating, verified, availableNow, language, country, city, skill, experience, minCompletedSessions, sort } = req.query;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 24));
    const offset = (page - 1) * limit;

    let whereClause = ` WHERE LOWER(s.listing_status) IN ('active', 'published') AND (u.is_suspended = 0 OR u.is_suspended IS NULL) AND u.email_verified = 1`;
    const params = [];

    if (category && category !== 'all') {
      whereClause += ` AND (c.slug = ? OR c.id = ?)`;
      params.push(category, category);
    }

    if (subcategory && subcategory !== 'all') {
      whereClause += ` AND (s.subcategory = ? OR s.subcategory LIKE ?)`;
      params.push(subcategory, `%${subcategory}%`);
    }

    if (country && country !== 'all') {
      whereClause += ` AND (u.country = ? OR s.country = ? OR u.country LIKE ?)`;
      params.push(country, country, `%${country}%`);
    }

    if (city && city !== 'all') {
      whereClause += ` AND (u.city LIKE ? OR u.area LIKE ? OR u.state_region LIKE ? OR u.location LIKE ?)`;
      const cityTerm = `%${city}%`;
      params.push(cityTerm, cityTerm, cityTerm, cityTerm);
    }

    if (language && language !== 'all') {
      whereClause += ` AND (s.languages_json LIKE ? OR u.languages_json LIKE ?)`;
      params.push(`%${language}%`, `%${language}%`);
    }

    if (skill && skill.trim()) {
      whereClause += ` AND (s.skills_json LIKE ? OR u.skills_json LIKE ?)`;
      params.push(`%${skill.trim()}%`, `%${skill.trim()}%`);
    }

    if (experience) {
      whereClause += ` AND (s.experience_years >= ? OR u.experience_years >= ?)`;
      params.push(Number(experience), Number(experience));
    }

    if (minCompletedSessions) {
      whereClause += ` AND u.sessions_completed >= ?`;
      params.push(Number(minCompletedSessions));
    }

    if (search) {
      whereClause += ` AND (
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
      whereClause += ` AND s.price_per_minute >= ?`;
      params.push(Number(minPrice));
    }

    if (maxPrice) {
      whereClause += ` AND s.price_per_minute <= ?`;
      params.push(Number(maxPrice));
    }

    if (rating) {
      whereClause += ` AND u.rating >= ?`;
      params.push(Number(rating));
    }

    if (verified === 'true' || verified === '1') {
      whereClause += ` AND u.verified = 1`;
    }

    if (availableNow === 'true' || availableNow === '1') {
      whereClause += ` AND s.available_now = 1`;
    }

    // Dynamic sorting
    let orderByClause = '';
    if (sort === 'rating') {
      orderByClause = ` ORDER BY u.rating DESC, u.review_count DESC, u.sessions_completed DESC`;
    } else if (sort === 'price_asc') {
      orderByClause = ` ORDER BY s.price_per_minute ASC, u.rating DESC`;
    } else if (sort === 'price_desc') {
      orderByClause = ` ORDER BY s.price_per_minute DESC, u.rating DESC`;
    } else if (sort === 'experience') {
      orderByClause = ` ORDER BY s.experience_years DESC, u.rating DESC`;
    } else if (sort === 'available_now') {
      orderByClause = ` ORDER BY s.available_now DESC, u.rating DESC, u.sessions_completed DESC`;
    } else {
      // Default: Best match
      orderByClause = ` ORDER BY s.available_now DESC, u.rating DESC, u.sessions_completed DESC`;
    }

    // Count total matching services for pagination
    const countSql = `
      SELECT COUNT(*) as total
      FROM services s
      JOIN users u ON s.provider_id = u.id
      JOIN categories c ON s.category_id = c.id
      ${whereClause}
    `;
    const totalRow = db.prepare(countSql).get(...params);
    const total = totalRow ? (typeof totalRow.total === 'number' ? totalRow.total : parseInt(totalRow.total, 10)) : 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // Fetch paginated slice
    const query = `
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
      ${whereClause}
      ${orderByClause}
      LIMIT ? OFFSET ?
    `;

    const services = db.prepare(query).all(...params, limit, offset);

    // Efficiently query active sessions for all providers
    const activeSessionRows = db.prepare(`SELECT provider_id FROM sessions WHERE status = 'ACTIVE'`).all();
    const busyProviders = new Set(activeSessionRows.map(r => r.provider_id));

    const formatted = services.map(s => {
      let parsedLangs = [];
      try {
        parsedLangs = JSON.parse(s.languages_json || s.provider_languages_json || '["English"]');
      } catch {
        parsedLangs = ['English'];
      }

      let availability_status = 'OFFLINE';
      if (s.available_now === 1) {
        availability_status = busyProviders.has(s.provider_id) ? 'BUSY' : 'AVAILABLE NOW';
      }

      return {
        ...s,
        provider_rating: s.provider_rating != null ? Number(s.provider_rating) : 5.0,
        price_per_minute: Number(s.price_per_minute) || 0,
        country: s.country || s.provider_country || 'United States',
        city: s.city || s.provider_city || '',
        state_region: s.provider_state_region || '',
        area: s.provider_area || '',
        skills: JSON.parse(s.skills_json || '[]'),
        languages: parsedLangs,
        availability_status
      };
    });

    res.json({
      services: formatted,
      count: formatted.length,
      total,
      page,
      limit,
      totalPages
    });
  });

  router.get('/services/:id', (req, res) => {
    try {
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
        WHERE s.id = ? AND LOWER(s.listing_status) IN ('active', 'published') AND (u.is_suspended = 0 OR u.is_suspended IS NULL) AND u.email_verified = 1
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

      let total_session_minutes = 0;
      try {
        const totalMinutesRow = db.prepare(`
          SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes
          FROM sessions
          WHERE provider_id = ? AND status = 'COMPLETED'
        `).get(service.provider_id);
        total_session_minutes = totalMinutesRow ? (parseInt(totalMinutesRow.total_minutes, 10) || 0) : 0;
      } catch (err) {
        console.warn('[GET /services/:id] total_session_minutes query notice:', err.message);
      }

      let isBusy = false;
      try {
        const activeSessionRow = db.prepare(`
          SELECT COUNT(*) as count
          FROM sessions
          WHERE provider_id = ? AND status = 'ACTIVE'
        `).get(service.provider_id);
        isBusy = (parseInt(activeSessionRow?.count, 10) || 0) > 0;
      } catch (err) {
        console.warn('[GET /services/:id] activeSessionRow query notice:', err.message);
      }

      let availability_status = 'OFFLINE';
      if (service.available_now === 1) {
        availability_status = isBusy ? 'BUSY' : 'AVAILABLE NOW';
      }

      const formattedService = {
        ...service,
        provider_rating: service.provider_rating != null ? Number(service.provider_rating) : 5.0,
        price_per_minute: Number(service.price_per_minute) || 0,
        country: service.country || service.provider_country || 'United States',
        city: service.city || service.provider_city || '',
        state_region: service.provider_state_region || '',
        area: service.provider_area || '',
        skills: JSON.parse(service.skills_json || '[]'),
        languages: parsedLangs,
        total_session_minutes,
        availability_status
      };

      // Availability
      let availability = [];
      try {
        availability = db.prepare(`
          SELECT * FROM provider_availability WHERE provider_id = ? AND is_active = 1 ORDER BY day_of_week ASC
        `).all(service.provider_id);
      } catch (err) {
        console.warn('[GET /services/:id] availability query notice:', err.message);
        availability = [];
      }

      // Reviews with fallback
      let reviews = [];
      try {
        reviews = db.prepare(`
          SELECT r.*, c.full_name as client_name, c.avatar_url as client_avatar
          FROM reviews r
          JOIN users c ON r.client_id = c.id
          WHERE r.service_id = ? AND COALESCE(r.is_hidden, 0) = 0
          ORDER BY r.created_at DESC
          LIMIT 10
        `).all(service.id);
      } catch (err) {
        try {
          reviews = db.prepare(`
            SELECT r.*, c.full_name as client_name, c.avatar_url as client_avatar
            FROM reviews r
            JOIN users c ON r.client_id = c.id
            WHERE r.service_id = ?
            ORDER BY r.created_at DESC
            LIMIT 10
          `).all(service.id);
        } catch {
          reviews = [];
        }
      }

      res.json({
        service: formattedService,
        availability: availability || [],
        reviews: reviews || []
      });
    } catch (err) {
      console.error('[GET /services/:id Error]', req.params.id, err);
      res.status(500).json({ error: 'Failed to fetch service detail: ' + err.message });
    }
  });

  // Create Service Listing (Provider Service Creation — 100% Free on HireByMinute)
  router.post('/services', authMiddleware, (req, res) => {
    if (req.user.role !== 'provider' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only registered experts can create or manage service listings.' });
    }

    const { title, category_id, description, price_per_minute, skills = [], languages = ['English'], experience_years = 5, available_now = 1 } = req.body;

    if (!title || !category_id || !description || !price_per_minute) {
      return res.status(400).json({ error: 'Title, category, description, and price per minute are required.' });
    }

    const id = `srv-${uuidv4().slice(0, 8)}`;

    db.prepare(`
      INSERT INTO services (
        id, provider_id, title, category_id, description, price_per_minute,
        listing_status, listing_fee_paid, listing_fee_payment_id, skills_json, languages_json,
        experience_years, available_now
      )
      VALUES (?, ?, ?, ?, ?, ?, 'active', 1, NULL, ?, ?, ?, ?)
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

    db.prepare(`UPDATE categories SET service_count = service_count + 1 WHERE id = ?`).run(category_id);

    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      req.user.id,
      'Service is Live',
      `"${title.trim()}" is now published and active on the marketplace.`,
      'success',
      `/services/${id}`
    );

    const created = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
    return res.status(201).json({
      success: true,
      service: created,
      is_free: true,
      fee: 0,
      currency: CURRENCY,
      currency_symbol: CURRENCY_SYMBOL,
      message: 'Your service is now live.'
    });
  });

  // Publish / Activate Service Directly (Free on HireByMinute)
  router.post('/services/:id/publish', authMiddleware, (req, res) => {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    if (service.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to publish this service.' });
    }
    if (req.user.role !== 'provider' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only expert accounts can publish services.' });
    }

    const wasActive = service.listing_status === 'active';
    db.prepare(`
      UPDATE services
      SET listing_status = 'active', listing_fee_paid = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(service.id);

    if (!wasActive) {
      db.prepare(`UPDATE categories SET service_count = service_count + 1 WHERE id = ?`).run(service.category_id);
    }

    const updated = db.prepare('SELECT * FROM services WHERE id = ?').get(service.id);
    res.json({
      success: true,
      service: updated,
      is_free: true,
      message: 'Your service is now live.'
    });
  });

  // Legacy activation compatibility handlers (100% Free - Safe and immediate)
  router.post('/services/:id/pay-listing-fee', authMiddleware, (req, res) => {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    if (service.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to publish this service.' });
    }

    const wasActive = service.listing_status === 'active';
    db.prepare(`
      UPDATE services
      SET listing_status = 'active', listing_fee_paid = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(service.id);

    if (!wasActive) {
      db.prepare(`UPDATE categories SET service_count = service_count + 1 WHERE id = ?`).run(service.category_id);
    }

    const updated = db.prepare('SELECT * FROM services WHERE id = ?').get(service.id);
    res.json({
      success: true,
      free_activated: true,
      service: updated,
      is_free: true,
      fee: 0,
      currency: CURRENCY,
      message: 'Your service is now live.'
    });
  });

  router.post('/services/:id/create-listing-order', authMiddleware, (req, res) => {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    if (service.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to publish this service.' });
    }

    const wasActive = service.listing_status === 'active';
    db.prepare(`
      UPDATE services
      SET listing_status = 'active', listing_fee_paid = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(service.id);

    if (!wasActive) {
      db.prepare(`UPDATE categories SET service_count = service_count + 1 WHERE id = ?`).run(service.category_id);
    }

    const updated = db.prepare('SELECT * FROM services WHERE id = ?').get(service.id);
    return res.json({
      success: true,
      free_activated: true,
      amount: 0,
      currency: CURRENCY,
      service: updated,
      message: 'Your service is now live.'
    });
  });

  router.post('/services/:id/verify-listing-payment', authMiddleware, (req, res) => {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    if (service.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to publish this service.' });
    }

    const wasActive = service.listing_status === 'active';
    db.prepare(`
      UPDATE services
      SET listing_status = 'active', listing_fee_paid = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(service.id);

    if (!wasActive) {
      db.prepare(`UPDATE categories SET service_count = service_count + 1 WHERE id = ?`).run(service.category_id);
    }

    const updated = db.prepare('SELECT * FROM services WHERE id = ?').get(service.id);
    res.json({
      success: true,
      service: updated,
      is_free: true,
      message: 'Your service is now live.'
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

  // Auto-expiration sweeper (runs asynchronously in background and on query)
  async function checkAndExpireRequests(ioInstance) {
    try {
      const nowIso = new Date().toISOString();
      const sqlQuery = `
        SELECT cr.*, s.title as service_title, c.full_name as client_name, c.email as client_email,
               p.full_name as provider_name, p.email as provider_email
        FROM consultation_requests cr
        JOIN services s ON cr.service_id = s.id
        JOIN users c ON cr.client_id = c.id
        JOIN users p ON cr.provider_id = p.id
        WHERE cr.status = 'PENDING_EXPERT' AND cr.response_deadline <= ?
      `;
      const expiredList = typeof db.allAsync === 'function'
        ? await db.allAsync(sqlQuery, nowIso)
        : db.prepare(sqlQuery).all(nowIso);

      if (expiredList && expiredList.length > 0) {
        for (const reqItem of expiredList) {
          if (typeof db.runAsync === 'function') {
            await db.runAsync(`
              UPDATE consultation_requests
              SET status = 'EXPIRED', expired_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, reqItem.id);
          } else {
            db.prepare(`
              UPDATE consultation_requests
              SET status = 'EXPIRED', expired_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(reqItem.id);
          }

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

  // Helper to normalize and sanitize problem description / topic strings
  function normalizeTopicText(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let text = raw.trim();
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === 'string') text = parsed.trim();
      } catch {
        text = text.replace(/^["']+|["']+$/g, '').trim();
      }
    }
    text = text.replace(/\\"/g, '"').replace(/\\'/g, "'").trim();
    while ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      text = text.slice(1, -1).trim();
    }
    return text;
  }

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
      total_price: Number(reqItem.total_price) || 0,
      duration_minutes: Number(reqItem.duration_minutes) || 0,
      service_ppm: Number(reqItem.service_ppm) || 0,
      problem_description: normalizeTopicText(reqItem.problem_description),
      attachments: JSON.parse(reqItem.attachments_json || '[]'),
      remaining_seconds
    };
  }

  // 1. Create Consultation Request (Client sends request; NO PAYMENT, NO SESSION)
  router.post('/consultation-requests', authMiddleware, async (req, res) => {
    const { service_id, duration_minutes, connect_type = 'now', scheduled_start, problem_description = '', attachments = [], redeem_reward_points = false } = req.body;
    const client_id = req.user.id;

    if (req.user.role === 'provider') {
      return res.status(403).json({ error: 'Expert accounts cannot book consultations. Please switch to or use a client account to hire experts.' });
    }

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
    const minAllowed = redeem_reward_points ? 5 : 15;
    if (isNaN(duration) || duration < minAllowed || duration > 300) {
      return res.status(400).json({ error: `Duration must be between ${minAllowed} and 300 minutes. Minimum initial consultation is ${minAllowed} minutes.` });
    }

    // Price calculated strictly server-side
    const pricePerMinute = service.price_per_minute;
    const grossPrice = Number((duration * pricePerMinute).toFixed(2));

    // Handle reward points redemption (1,000 pts = 5-minute credit capped at reward_max_credit_inr)
    let rewardPointsRedeemed = 0;
    let rewardDiscountAmount = 0;
    if (redeem_reward_points) {
      const clientUser = db.prepare('SELECT reward_points_balance FROM users WHERE id = ?').get(client_id);
      const pointsBal = clientUser?.reward_points_balance || 0;
      if (pointsBal < 1000) {
        return res.status(400).json({ error: 'Insufficient reward points balance. You need at least 1,000 points to redeem a 5-minute consultation credit.' });
      }

      let maxCredit = 500.00;
      try {
        const setRow = db.prepare("SELECT value FROM platform_settings WHERE key = 'reward_max_credit_inr'").get();
        if (setRow && !isNaN(Number(setRow.value))) maxCredit = Number(setRow.value);
      } catch (e) {}

      const fiveMinVal = 5 * pricePerMinute;
      rewardDiscountAmount = Math.min(fiveMinVal, maxCredit);
      rewardDiscountAmount = Math.min(rewardDiscountAmount, grossPrice);
      rewardDiscountAmount = Number(rewardDiscountAmount.toFixed(2));
      rewardPointsRedeemed = 1000;
    }

    const totalPrice = Number((grossPrice - rewardDiscountAmount).toFixed(2));

    const startTime = scheduled_start ? new Date(scheduled_start) : new Date();
    const requestId = `cr-${uuidv4().slice(0, 8)}`;

    // Server-authoritative 10-minute response deadline
    const responseDeadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO consultation_requests (
        id, client_id, provider_id, service_id, duration_minutes, price_per_minute, total_price,
        connect_type, scheduled_start, problem_description, attachments_json, status, response_deadline,
        reward_points_redeemed, reward_discount_amount
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_EXPERT', ?, ?, ?)
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
      normalizeTopicText(problem_description),
      JSON.stringify(attachments),
      responseDeadline,
      rewardPointsRedeemed,
      rewardDiscountAmount
    );

    // Maintain backwards-compatible bookings record for foreign keys
    db.prepare(`
      INSERT OR IGNORE INTO bookings (id, client_id, provider_id, service_id, duration_minutes, total_price, scheduled_start, scheduled_end, status, notes, reward_points_redeemed, reward_discount_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
    `).run(
      requestId,
      client_id,
      service.provider_id,
      service_id,
      duration,
      totalPrice,
      startTime.toISOString(),
      new Date(startTime.getTime() + duration * 60 * 1000).toISOString(),
      normalizeTopicText(problem_description),
      rewardPointsRedeemed,
      rewardDiscountAmount
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

  // Client Cancels PENDING_EXPERT or ACCEPTED Consultation Request
  router.post('/consultation-requests/:id/cancel', authMiddleware, (req, res) => {
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

    if (request.client_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Only the requesting client can cancel this request.' });
    }

    if (!['PENDING_EXPERT', 'ACCEPTED'].includes(request.status) || request.session_id || request.payment_id) {
      return res.status(400).json({ error: `Cannot cancel request: Current status is ${request.status} or request is already associated with a payment/session.` });
    }

    db.prepare(`
      UPDATE consultation_requests
      SET status = 'CANCELLED'
      WHERE id = ?
    `).run(request.id);

    // Cancel any linked pending booking
    db.prepare(`
      UPDATE bookings
      SET status = 'CANCELLED'
      WHERE id = ? OR notes LIKE ?
    `).run(request.id, `%${request.id}%`);

    // In-app notification for Provider
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      request.provider_id,
      'Consultation Request Cancelled',
      `${request.client_name} cancelled their consultation request for "${request.service_title}".`,
      'info',
      `/provider`
    );

    // Socket.IO notification
    io.to(`user_${request.provider_id}`).emit('consultation_request_cancelled', {
      requestId: request.id,
      clientName: request.client_name,
      serviceTitle: request.service_title
    });

    const updated = db.prepare(`SELECT * FROM consultation_requests WHERE id = ?`).get(request.id);

    res.json({
      success: true,
      request: formatConsultationRequest(updated),
      message: 'Consultation request cancelled.'
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

    // Loyalty reward redemption: If request is 100% covered by redeemed points (total_price <= 0)
    if (Number(request.total_price) <= 0 && Number(request.reward_points_redeemed) >= 1000) {
      if (request.status === 'PAID') {
        const existingSession = request.session_id
          ? db.prepare('SELECT * FROM sessions WHERE id = ?').get(request.session_id)
          : db.prepare('SELECT * FROM sessions WHERE booking_id = ?').get(request.id);
        return res.json({
          success: true,
          session_id: existingSession?.id || request.session_id,
          session: existingSession,
          payment_id: request.payment_id,
          message: 'Reward consultation was already activated.'
        });
      }

      if (request.status !== 'ACCEPTED') {
        return res.status(400).json({
          error: `Cannot activate session: Current request status is ${request.status}. Must be ACCEPTED by expert first.`
        });
      }

      // Check if points were already deducted for this request
      const existingRedeem = db.prepare(`SELECT id FROM reward_points_ledger WHERE booking_id = ? AND entry_type = 'redeemed_consultation'`).get(request.id);
      if (!existingRedeem) {
        // Atomic deduction: ensure user has >= 1000 points at execution time
        const updateResult = db.prepare('UPDATE users SET reward_points_balance = reward_points_balance - 1000 WHERE id = ? AND reward_points_balance >= 1000').run(request.client_id);
        if (updateResult.changes === 0) {
          return res.status(400).json({ error: 'Insufficient reward points balance. 1,000 points required.' });
        }
        const rwdId = `rwd-red-${uuidv4().slice(0, 8)}`;
        db.prepare(`
          INSERT INTO reward_points_ledger (id, user_id, session_id, booking_id, entry_type, points, status, description)
          VALUES (?, ?, NULL, ?, 'redeemed_consultation', -1000, 'available', ?)
        `).run(rwdId, request.client_id, request.id, `Redeemed 1,000 points for free consultation with ${request.provider_name}`);
      }

      const paymentId = `pay-rwd-${uuidv4().slice(0, 8)}`;
      const sessionId = `ses-${uuidv4().slice(0, 8)}`;
      const startTime = request.connect_type === 'now' ? new Date() : new Date(request.scheduled_start);
      const endTime = new Date(startTime.getTime() + request.duration_minutes * 60 * 1000);
      const actualStart = request.connect_type === 'now' ? startTime.toISOString() : null;
      const actualEnd = request.connect_type === 'now' ? endTime.toISOString() : null;
      const sessionStatus = request.connect_type === 'now' ? 'ACTIVE' : 'SCHEDULED';

      db.prepare(`
        INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
        VALUES (?, ?, 'session_payment', 0.00, 'succeeded', ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).run(paymentId, request.client_id, request.id, JSON.stringify({ reward_redemption: true, points: 1000 }));

      db.prepare(`
        INSERT INTO bookings (id, client_id, provider_id, service_id, duration_minutes, total_price, scheduled_start, scheduled_end, status, payment_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
        ON CONFLICT(id) DO UPDATE SET status = 'COMPLETED', payment_id = excluded.payment_id
      `).run(request.id, request.client_id, request.provider_id, request.service_id, request.duration_minutes, request.total_price || 0, startTime.toISOString(), endTime.toISOString(), paymentId);

      db.prepare(`
        INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, actual_start, actual_end, duration_minutes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).run(sessionId, request.id, request.client_id, request.provider_id, request.service_id, startTime.toISOString(), endTime.toISOString(), actualStart, actualEnd, request.duration_minutes, sessionStatus);

      db.prepare(`UPDATE consultation_requests SET status = 'PAID', session_id = ?, payment_id = ? WHERE id = ?`).run(sessionId, paymentId, request.id);
      db.prepare(`UPDATE bookings SET status = 'COMPLETED', payment_id = ? WHERE id = ?`).run(paymentId, request.id);

      const createdSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      const updatedReq = db.prepare('SELECT * FROM consultation_requests WHERE id = ?').get(request.id);
      return res.json({
        success: true,
        session_id: sessionId,
        session: createdSession,
        payment_id: paymentId,
        request: updatedReq,
        message: 'Reward points redeemed! Your consultation session is active.'
      });
    }

    // Strict security: Direct unverified payments are completely eliminated.
    // Callers must use the Razorpay checkout flow (create order -> checkout -> verify payment).
    return res.status(400).json({
      error: 'Unverified direct payments are disabled. Please complete payment via Razorpay checkout to enter the session.',
      requires_checkout: true
    });
  });

  // 7. Create Razorpay Order for ACCEPTED Consultation Request
  router.post('/consultation-requests/:id/create-razorpay-order', authMiddleware, async (req, res) => {
    checkAndExpireRequests(io);

    const request = db.prepare(`
      SELECT cr.*, s.title as service_title, s.price_per_minute as service_ppm
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

    if (request.status !== 'ACCEPTED' || request.session_id || request.payment_id) {
      return res.status(400).json({
        error: `Cannot create payment order for request: Status is ${request.status} and it has already been paid or linked to a session.`
      });
    }

    if (Number(request.total_price) <= 0 && Number(request.reward_points_redeemed) >= 1000) {
      return res.json({
        is_free_reward: true,
        amount: 0,
        amount_paise: 0,
        currency: CURRENCY,
        request_id: request.id,
        message: 'Consultation is 100% covered by redeemed reward points. Call /pay to activate directly.'
      });
    }

    // Authoritative Server-side Price Calculation: duration_minutes * service.price_per_minute
    const durationMinutes = Number(request.duration_minutes) || 0;
    const ratePerMinute = Number(request.service_ppm || request.price_per_minute) || 0;
    const grossAmount = Number((durationMinutes * ratePerMinute).toFixed(2));
    const discount = Number(request.reward_discount_amount || 0);
    const calculatedAmount = Math.max(0, Number((grossAmount - discount).toFixed(2)));
    request.total_price = calculatedAmount > 0 ? calculatedAmount : request.total_price;
    const amountInPaise = toPaise(request.total_price);

    try {
      const order = await createRazorpayNativeOrder({
        amountPaise: amountInPaise,
        receipt: request.id,
        notes: {
          request_id: request.id,
          client_id: request.client_id,
          service_title: request.service_title
        }
      });

      return res.json({
        order_id: order.order_id,
        amount: request.total_price,
        amount_paise: amountInPaise,
        currency: order.currency,
        key_id: order.key_id,
        request_id: request.id
      });
    } catch (err) {
      console.error('[Razorpay Order Error]', err.message);
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message || 'Payment could not be initialized. Please try again.' });
    }
  });

  // 8. Verify Razorpay Payment Signature & Transition to Session
  router.post('/consultation-requests/:id/verify-razorpay-payment', authMiddleware, async (req, res) => {
    checkAndExpireRequests(io);

    try {
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

      // Idempotency: If already paid (by webhook or concurrent request), return the existing session
      if (request.status === 'PAID') {
        let existingSession = request.session_id
          ? db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(request.session_id)
          : db.prepare(`SELECT * FROM sessions WHERE booking_id = ?`).get(request.id);

        if (!existingSession) {
          // If session was not yet created, create it now to heal state
          const newSessionId = `ses-${uuidv4().slice(0, 8)}`;
          const startTime = request.connect_type === 'now' ? new Date() : new Date(request.scheduled_start);
          const endTime = new Date(startTime.getTime() + request.duration_minutes * 60 * 1000);
          const actualStart = request.connect_type === 'now' ? startTime.toISOString() : null;
          const actualEnd = request.connect_type === 'now' ? endTime.toISOString() : null;
          const sessionStatus = request.connect_type === 'now' ? 'ACTIVE' : 'SCHEDULED';

          db.prepare(`
            INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, actual_start, actual_end, duration_minutes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING
          `).run(
            newSessionId,
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

          db.prepare(`UPDATE consultation_requests SET session_id = ? WHERE id = ?`).run(newSessionId, request.id);
          existingSession = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(newSessionId);
        }

        return res.json({
          success: true,
          session_id: existingSession?.id || request.session_id,
          session: existingSession,
          payment_id: request.payment_id || razorpay_payment_id,
          message: 'Payment was already verified. Connected to active session.'
        });
      }

      if (request.status !== 'ACCEPTED') {
        return res.status(400).json({
          error: `Cannot verify payment: Current request status is ${request.status}. Must be ACCEPTED.`
        });
      }

      // Strict HMAC SHA-256 Signature Verification
      const resolvedCredentials = getEffectiveRazorpayCredentials();
      const rawSecret = resolvedCredentials.keySecret || (process.env.NODE_ENV !== 'production' ? 'dev_razorpay_secret_key_12345' : null);
      const keySecret = rawSecret ? rawSecret.trim().replace(/^["']|["']$/g, '') : null;
      const fallbackKey = resolvedCredentials.keyId ? resolvedCredentials.keyId.trim().replace(/^["']|["']$/g, '') : '';

      if (!keySecret) {
        return res.status(500).json({ error: 'Server configuration error: RAZORPAY_KEY_SECRET is required.' });
      }

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: 'Missing Razorpay signature verification parameters.' });
      }

      const generatedSignature1 = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      const generatedSignature2 = fallbackKey
        ? crypto.createHmac('sha256', fallbackKey).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex')
        : '';

      const match1 = generatedSignature1 === razorpay_signature;
      const match2 = Boolean(generatedSignature2 && generatedSignature2 === razorpay_signature);

      if (!match1 && !match2) {
        console.warn(`[Razorpay Signature Verification Failed] Request ${request.id}: Received signature did not match authoritative HMAC.`);
        try {
          const auditId = `audit-${uuidv4().replace(/-/g, '').slice(0, 8)}`;
          db.prepare(`
            INSERT INTO audit_logs (id, admin_id, admin_name, action, target_type, target_id, details_json, created_at)
            VALUES (?, 'system', 'Payment Gateway Monitor', 'PAYMENT_SIGNATURE_VERIFICATION_FAILED', 'consultation_request', ?, ?, CURRENT_TIMESTAMP)
          `).run(auditId, request.id, JSON.stringify({
            order_id: razorpay_order_id,
            payment_id: razorpay_payment_id
          }));
        } catch {}
        return res.status(400).json({ error: 'Invalid Razorpay payment signature. Verification failed.' });
      }

      // Replay Protection & Idempotency check for payment ID
      if (razorpay_payment_id) {
        const existingPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(razorpay_payment_id);
        if (existingPayment) {
          if (existingPayment.reference_id === request.id) {
            let existingSession = request.session_id
              ? db.prepare('SELECT * FROM sessions WHERE id = ?').get(request.session_id)
              : db.prepare('SELECT * FROM sessions WHERE booking_id = ?').get(request.id);

            if (!existingSession) {
              const newSessionId = `ses-${uuidv4().slice(0, 8)}`;
              const startTime = request.connect_type === 'now' ? new Date() : new Date(request.scheduled_start);
              const endTime = new Date(startTime.getTime() + request.duration_minutes * 60 * 1000);
              const actualStart = request.connect_type === 'now' ? startTime.toISOString() : null;
              const actualEnd = request.connect_type === 'now' ? endTime.toISOString() : null;
              const sessionStatus = request.connect_type === 'now' ? 'ACTIVE' : 'SCHEDULED';

              db.prepare(`
                INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, actual_start, actual_end, duration_minutes, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING
              `).run(
                newSessionId,
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

              db.prepare(`UPDATE consultation_requests SET session_id = ?, status = 'PAID' WHERE id = ?`).run(newSessionId, request.id);
              existingSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(newSessionId);
            }

            return res.json({
              success: true,
              session_id: existingSession?.id || request.session_id,
              session: existingSession,
              payment_id: razorpay_payment_id,
              message: 'Payment was already verified. Connected to active session.'
            });
          }
          return res.status(409).json({ error: 'Payment ID has already been recorded for another transaction.' });
        }
      }

      const totalPrice = request.total_price;
      const paymentId = razorpay_payment_id || `pay-sess-${uuidv4().slice(0, 8)}`;
      const sessionId = `ses-${uuidv4().slice(0, 8)}`;

      const startTime = request.connect_type === 'now' ? new Date() : new Date(request.scheduled_start);
      const endTime = new Date(startTime.getTime() + request.duration_minutes * 60 * 1000);
      const sessionStatus = request.connect_type === 'now' ? 'ACTIVE' : 'SCHEDULED';
      const actualStart = request.connect_type === 'now' ? startTime.toISOString() : null;
      const actualEnd = request.connect_type === 'now' ? endTime.toISOString() : null;

      db.prepare(`
        INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
        VALUES (?, ?, 'session_payment', ?, 'succeeded', ?, ?)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status
      `).run(
        paymentId,
        request.client_id,
        totalPrice,
        request.id,
        JSON.stringify({
          gateway: 'razorpay',
          order_id: razorpay_order_id,
          payment_id: razorpay_payment_id,
          currency: CURRENCY,
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

      db.prepare(`
        INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, actual_start, actual_end, duration_minutes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
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

      if (Number(request.reward_points_redeemed) >= 1000) {
        const existingRedeem = db.prepare(`SELECT id FROM reward_points_ledger WHERE booking_id = ? AND entry_type = 'redeemed_consultation'`).get(request.id);
        if (!existingRedeem) {
          db.prepare('UPDATE users SET reward_points_balance = MAX(0, reward_points_balance - 1000) WHERE id = ?').run(request.client_id);
          db.prepare(`
            INSERT INTO reward_points_ledger (id, user_id, session_id, booking_id, entry_type, points, status, description)
            VALUES (?, ?, ?, ?, 'redeemed_consultation', -1000, 'available', ?)
          `).run(`rwd-red-${uuidv4().slice(0, 8)}`, request.client_id, sessionId, request.id, `Redeemed 1,000 points for credit towards consultation with ${request.provider_name}`);
        }
      }

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

      // Real-time Socket.IO emission to BOTH provider AND client
      const paymentCompletedPayload = {
        requestId: request.id,
        sessionId,
        clientName: request.client_name,
        providerName: request.provider_name,
        serviceTitle: request.service_title,
        durationMinutes: request.duration_minutes,
        totalPrice,
        status: 'PAID'
      };
      io.to(`user_${request.provider_id}`).emit('consultation_payment_completed', paymentCompletedPayload);
      io.to(`user_${request.client_id}`).emit('consultation_payment_completed', paymentCompletedPayload);
      io.to(`user_${request.provider_id}`).emit('session_started', { sessionId, requestId: request.id });
      io.to(`user_${request.client_id}`).emit('session_started', { sessionId, requestId: request.id });
      io.to(`session_${sessionId}`).emit('session_started', { sessionId, requestId: request.id });

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
    } catch (verifyErr) {
      console.error('[Razorpay Verify Error]:', verifyErr);
      res.status(500).json({ error: verifyErr.message || 'Payment verification failed due to internal error.' });
    }
  });

  // ==========================================
  // RAZORPAY PRODUCTION WEBHOOK HANDLER
  // ==========================================
  const handleRazorpayWebhook = (req, res) => {
    const resolvedCredentials = getEffectiveRazorpayCredentials();
    const rawWebhookSecret = resolvedCredentials.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || (process.env.NODE_ENV !== 'production' ? 'whsec_test_secret_for_razorpay_98765' : null);
    const webhookSecret = rawWebhookSecret ? rawWebhookSecret.trim().replace(/^["']|["']$/g, '') : null;
    if (!webhookSecret) {
      console.warn('[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET is not configured on server.');
      return res.status(500).json({ error: 'Webhook secret not configured on server' });
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!signature || !req.rawBody) {
      return res.status(400).json({ error: 'Missing webhook signature or raw payload body' });
    }

    // Cryptographic signature verification over raw request bytes
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.warn('[Razorpay Webhook] Invalid webhook signature. Discarding payload.');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body;
    const eventId = event.id || req.headers['x-razorpay-event-id'];
    const eventType = event.event;

    // Webhook Idempotency: Check if event was already processed
    if (eventId) {
      try {
        const existingEvent = db.prepare('SELECT event_id FROM processed_webhook_events WHERE event_id = ?').get(eventId);
        if (existingEvent) {
          return res.status(200).json({ status: 'ok', message: 'Event already processed' });
        }
      } catch {
        // Continue if table read error
      }
    }

    try {
      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        const paymentEntity = event.payload?.payment?.entity;
        const orderEntity = event.payload?.order?.entity;
        const notes = paymentEntity?.notes || orderEntity?.notes || {};
        const receipt = orderEntity?.receipt || '';
        const paymentId = paymentEntity?.id;
        const orderId = paymentEntity?.order_id || orderEntity?.id;
        const amountInr = paymentEntity?.amount ? toRupees(paymentEntity.amount) : 0;

        // Case A: Consultation Request Payment
        const requestId = notes.request_id || (receipt.startsWith('cr-') ? receipt : null);
        if (requestId) {
          const request = db.prepare(`
            SELECT cr.*, s.title as service_title, s.price_per_minute as service_ppm,
                   c.full_name as client_name, c.email as client_email,
                   p.full_name as provider_name, p.email as provider_email
            FROM consultation_requests cr
            JOIN services s ON cr.service_id = s.id
            JOIN users c ON cr.client_id = c.id
            JOIN users p ON cr.provider_id = p.id
            WHERE cr.id = ?
          `).get(requestId);

          if (request && request.status !== 'PAID') {
            const sessionId = `ses-${uuidv4().slice(0, 8)}`;
            const startTime = request.connect_type === 'now' ? new Date() : new Date(request.scheduled_start);
            const endTime = new Date(startTime.getTime() + request.duration_minutes * 60 * 1000);
            const sessionStatus = request.connect_type === 'now' ? 'ACTIVE' : 'SCHEDULED';
            const actualStart = request.connect_type === 'now' ? startTime.toISOString() : null;
            const actualEnd = request.connect_type === 'now' ? endTime.toISOString() : null;
            const pId = paymentId || `pay-wh-${uuidv4().slice(0, 8)}`;

            // Idempotently record payment
            const existingPay = db.prepare('SELECT id FROM payments WHERE id = ?').get(pId);
            if (!existingPay) {
              db.prepare(`
                INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
                VALUES (?, ?, 'session_payment', ?, 'succeeded', ?, ?)
                ON CONFLICT(id) DO UPDATE SET status = excluded.status
              `).run(pId, request.client_id, request.total_price, request.id, JSON.stringify({
                gateway: 'razorpay_webhook',
                order_id: orderId,
                payment_id: pId,
                currency: CURRENCY,
                event_id: eventId
              }));
            }

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
              request.total_price,
              startTime.toISOString(),
              endTime.toISOString(),
              pId,
              request.problem_description || ''
            );

            db.prepare(`
              INSERT INTO sessions (id, booking_id, client_id, provider_id, service_id, scheduled_start, scheduled_end, actual_start, actual_end, duration_minutes, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO NOTHING
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
            `).run(pId, sessionId, request.id);

            db.prepare(`
              INSERT INTO notifications (id, user_id, title, message, type, link)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(
              `notif-${uuidv4().slice(0, 8)}`,
              request.provider_id,
              'Payment Verified (Webhook)',
              `${request.client_name} confirmed payment for ${request.duration_minutes}m consultation. Room is live!`,
              'success',
              `/session/${sessionId}`
            );

            db.prepare(`
              INSERT INTO notifications (id, user_id, title, message, type, link)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(
              `notif-${uuidv4().slice(0, 8)}`,
              request.client_id,
              'Payment Confirmed',
              `Payment confirmed for ${request.service_title}. Your consultation room is live!`,
              'success',
              `/session/${sessionId}`
            );

            const paymentCompletedPayload = {
              requestId: request.id,
              sessionId,
              clientName: request.client_name,
              providerName: request.provider_name,
              serviceTitle: request.service_title,
              durationMinutes: request.duration_minutes,
              totalPrice: request.total_price,
              status: 'PAID'
            };
            io.to(`user_${request.provider_id}`).emit('consultation_payment_completed', paymentCompletedPayload);
            io.to(`user_${request.client_id}`).emit('consultation_payment_completed', paymentCompletedPayload);
            io.to(`user_${request.provider_id}`).emit('session_started', { sessionId, requestId: request.id });
            io.to(`user_${request.client_id}`).emit('session_started', { sessionId, requestId: request.id });
            io.to(`session_${sessionId}`).emit('session_started', { sessionId, requestId: request.id });

            emailService.sendPaymentReceipt({
              clientEmail: request.client_email,
              clientName: request.client_name,
              expertEmail: request.provider_email,
              expertName: request.provider_name,
              serviceTitle: request.service_title,
              durationMinutes: request.duration_minutes,
              totalPrice: request.total_price,
              sessionId
            }).catch(err => console.error('[Webhook Receipt Email Error]:', err.message));
          }
        }

        // Case B: Listing Fee Payment
        const serviceId = notes.service_id || (receipt.startsWith('fee_') ? receipt.replace('fee_', '') : null);
        if (serviceId) {
          const service = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
          if (service && service.listing_status !== 'active') {
            const pId = paymentId || `pay-fee-wh-${uuidv4().slice(0, 8)}`;
            const existingPay = db.prepare('SELECT id FROM payments WHERE id = ?').get(pId);
            const { fee: listingFee } = getEffectiveListingFee();
            if (!existingPay) {
              db.prepare(`
                INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
                VALUES (?, ?, 'listing_fee', ?, 'succeeded', ?, ?)
              `).run(pId, service.provider_id, amountInr || listingFee, service.id, JSON.stringify({
                gateway: 'razorpay_webhook',
                order_id: orderId,
                payment_id: pId,
                currency: CURRENCY,
                event_id: eventId
              }));
            }

            db.prepare(`
              UPDATE services
              SET listing_status = 'active', listing_fee_paid = 1, listing_fee_payment_id = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(pId, service.id);

            db.prepare('UPDATE categories SET service_count = service_count + 1 WHERE id = ?').run(service.category_id);

            db.prepare(`
              INSERT INTO notifications (id, user_id, title, message, type, link)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(
              `notif-${uuidv4().slice(0, 8)}`,
              service.provider_id,
              'Service Published (Webhook Verified)',
              `"${service.title}" is now active and ready for bookings.`,
              'success',
              `/services/${service.id}`
            );
          }
        }

        // Case C: Session Extension Payment
        const extensionSessionId = notes.session_id || (receipt.startsWith('ext_') ? receipt.split('_')[1] : null);
        if (extensionSessionId && !requestId && !serviceId) {
          const session = db.prepare('SELECT * FROM sessions WHERE id = ? OR id LIKE ?').get(extensionSessionId, `%${extensionSessionId}%`);
          if (session && session.status === 'ACTIVE') {
            const pId = paymentId || `pay-ext-wh-${uuidv4().slice(0, 8)}`;
            const existingPay = db.prepare('SELECT id FROM payments WHERE id = ?').get(pId);
            if (!existingPay) {
              const serviceRate = db.prepare('SELECT price_per_minute FROM services WHERE id = ?').get(session.service_id)?.price_per_minute || 1;
              const addMins = notes.additional_minutes ? parseInt(notes.additional_minutes, 10) : (
                amountInr > 0 ? Math.round(amountInr / serviceRate) : 15
              );
              const extensionAmount = amountInr || Number((addMins * serviceRate).toFixed(2));

              db.prepare(`
                INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
                VALUES (?, ?, 'session_payment', ?, 'succeeded', ?, ?)
              `).run(pId, session.client_id, extensionAmount, session.id, JSON.stringify({
                extension: true,
                additional_minutes: addMins,
                session_id: session.id,
                order_id: orderId,
                payment_id: pId,
                currency: CURRENCY,
                gateway: 'razorpay_webhook',
                event_id: eventId
              }));

              db.prepare(`
                UPDATE bookings
                SET duration_minutes = duration_minutes + ?, total_price = total_price + ?
                WHERE id = ?
              `).run(addMins, extensionAmount, session.booking_id);

              const updatedSession = timerEngine.extendSession(session.id, addMins);

              io.to(`session_${session.id}`).emit('session_extended', {
                sessionId: session.id,
                additionalMinutes: addMins,
                newDurationMinutes: updatedSession ? updatedSession.duration_minutes : session.duration_minutes + addMins,
                newActualEnd: updatedSession ? updatedSession.actual_end : null,
                remainingSeconds: updatedSession ? updatedSession.remainingSeconds : 0,
                message: `Session extended by +${addMins} minutes! (Webhook verified)`
              });

              db.prepare(`
                INSERT INTO notifications (id, user_id, title, message, type, link)
                VALUES (?, ?, 'Session Extended (Webhook)', ?, 'info', ?)
              `).run(
                `notif-${uuidv4().slice(0, 8)}`,
                session.provider_id,
                `Client has extended the live consultation by +${addMins} minutes.`,
                `/session/${session.id}`
              );
            }
          }
        }

        // Case D: Opportunity Application Fee
        const oppId = notes.opportunity_id || (receipt.startsWith('app_') ? receipt.split('_')[1] : null);
        if (oppId && !requestId && !serviceId) {
          const opp = db.prepare('SELECT * FROM opportunities WHERE id = ? OR id LIKE ?').get(oppId, `%${oppId}%`);
          if (opp) {
            const pId = paymentId || `pay-app-wh-${uuidv4().slice(0, 8)}`;
            const existingPay = db.prepare('SELECT id FROM payments WHERE id = ?').get(pId);
            if (!existingPay) {
              const providerId = notes.provider_id || notes.user_id;
              const appFee = Number(opp.entry_fee_inr || opp.entry_fee_usd || 2.00);
              db.prepare(`
                INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
                VALUES (?, ?, 'application_fee', ?, 'succeeded', ?, ?)
              `).run(pId, providerId || opp.creator_id, amountInr || appFee, opp.id, JSON.stringify({
                opportunity_id: opp.id,
                opportunity_title: opp.title,
                order_id: orderId,
                payment_id: pId,
                currency: CURRENCY,
                gateway: 'razorpay_webhook',
                event_id: eventId
              }));

              if (providerId) {
                db.prepare(`
                  UPDATE applications
                  SET payment_id = ?
                  WHERE opportunity_id = ? AND provider_id = ? AND payment_id IS NULL
                `).run(pId, opp.id, providerId);
              }

              db.prepare(`
                INSERT INTO notifications (id, user_id, title, message, type, link)
                VALUES (?, ?, 'New Application Submitted', ?, 'info', ?)
              `).run(
                `notif-${uuidv4().slice(0, 8)}`,
                opp.creator_id,
                `A provider submitted an application for "${opp.title}" (Fee Verified).`,
                `/opportunities/${opp.id}`
              );
            }
          }
        }
      } else if (eventType === 'payment.failed') {
        const paymentEntity = event.payload?.payment?.entity;
        const notes = paymentEntity?.notes || {};
        const requestId = notes.request_id;
        const paymentId = paymentEntity?.id;
        const errorCode = paymentEntity?.error_code || 'PAYMENT_FAILED';
        const errorDesc = paymentEntity?.error_description || 'Payment was declined or failed by issuing bank.';

        logAuditAction(
          { id: 'system', full_name: 'Razorpay Webhook Engine', email: 'gateway@hirebyminute.com', role: 'admin' },
          'PAYMENT_FAILED_WEBHOOK',
          'payment',
          paymentId || 'unknown',
          { request_id: requestId, error_code: errorCode, error_description: errorDesc }
        );

        if (requestId) {
          const request = db.prepare(`
            SELECT cr.client_id, s.title as service_title
            FROM consultation_requests cr
            LEFT JOIN services s ON cr.service_id = s.id
            WHERE cr.id = ?
          `).get(requestId);
          if (request) {
            db.prepare(`
              INSERT INTO notifications (id, user_id, title, message, type, link)
              VALUES (?, ?, 'Payment Attempt Failed', ?, 'warning', ?)
            `).run(
              `notif-${uuidv4().slice(0, 8)}`,
              request.client_id,
              `Payment for "${request.service_title || 'Consultation'}" was unsuccessful: ${errorDesc}. You may re-attempt checkout.`,
              '/client'
            );
          }
        }
      } else if (eventType === 'refund.processed' || eventType === 'refund.created') {
        const refundEntity = event.payload?.refund?.entity;
        const paymentEntity = event.payload?.payment?.entity;
        const paymentId = refundEntity?.payment_id || paymentEntity?.id;
        const refundAmountInr = refundEntity?.amount ? toRupees(refundEntity.amount) : 0;

        if (paymentId) {
          const origPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
          if (origPayment) {
            db.prepare("UPDATE payments SET status = 'refunded' WHERE id = ?").run(paymentId);

            const booking = db.prepare('SELECT * FROM bookings WHERE payment_id = ? OR id = ?').get(paymentId, origPayment.reference_id);
            if (booking) {
              db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?").run(booking.id);
              db.prepare("UPDATE sessions SET status = 'CANCELLED' WHERE booking_id = ?").run(booking.id);
              db.prepare("UPDATE consultation_requests SET status = 'CANCELLED' WHERE id = ?").run(booking.id);

              const existingEarning = db.prepare(`
                SELECT * FROM financial_ledger
                WHERE (booking_id = ? OR session_id IN (SELECT id FROM sessions WHERE booking_id = ?))
                  AND entry_type = 'net_earning'
              `).get(booking.id, booking.id);

              if (existingEarning) {
                const existingReversal = db.prepare(`
                  SELECT id FROM financial_ledger
                  WHERE (booking_id = ? OR session_id = ?) AND entry_type = 'refund_reversal'
                `).get(booking.id, existingEarning.session_id);

                if (!existingReversal) {
                  const reversalId = `fin-rev-${uuidv4().slice(0, 8)}`;
                  const netPaise = existingEarning.amount_paise;
                  db.prepare(`
                    INSERT INTO financial_ledger (id, user_id, session_id, booking_id, entry_type, amount_paise, balance_type, currency, description, metadata_json)
                    VALUES (?, ?, ?, ?, 'refund_reversal', ?, 'available', 'INR', ?, ?)
                  `).run(
                    reversalId,
                    booking.provider_id,
                    existingEarning.session_id,
                    booking.id,
                    -netPaise,
                    `Earnings clawback due to processed refund`,
                    JSON.stringify({ original_ledger_id: existingEarning.id, refund_payment_id: paymentId })
                  );

                  db.prepare(`
                    UPDATE users SET payout_balance_paise = MAX(0, COALESCE(payout_balance_paise, 0) - ?) WHERE id = ?
                  `).run(netPaise, booking.provider_id);
                }
              }

              const redeemedRecord = db.prepare(`
                SELECT * FROM reward_points_ledger
                WHERE booking_id = ? AND entry_type = 'redeemed_consultation'
              `).get(booking.id);

              if (redeemedRecord) {
                const alreadyRestored = db.prepare(`
                  SELECT id FROM reward_points_ledger
                  WHERE booking_id = ? AND entry_type = 'refund_restoration'
                `).get(booking.id);

                if (!alreadyRestored) {
                  db.prepare('UPDATE users SET reward_points_balance = reward_points_balance + 1000 WHERE id = ?').run(booking.client_id);
                  const rwdRestId = `rwd-rst-${uuidv4().slice(0, 8)}`;
                  db.prepare(`
                    INSERT INTO reward_points_ledger (id, user_id, session_id, booking_id, entry_type, points, status, description)
                    VALUES (?, ?, NULL, ?, 'refund_restoration', 1000, 'available', ?)
                  `).run(rwdRestId, booking.client_id, booking.id, `Restored 1,000 reward points due to refunded consultation`);
                }
              }

              const earnedRecord = db.prepare(`
                SELECT * FROM reward_points_ledger
                WHERE booking_id = ? AND entry_type = 'earned_session'
              `).get(booking.id);

              if (earnedRecord) {
                const alreadyRevoked = db.prepare(`
                  SELECT id FROM reward_points_ledger
                  WHERE booking_id = ? AND entry_type = 'earned_revocation'
                `).get(booking.id);

                if (!alreadyRevoked) {
                  const pts = earnedRecord.points;
                  db.prepare('UPDATE users SET reward_points_balance = MAX(0, reward_points_balance - ?) WHERE id = ?').run(pts, booking.client_id);
                  const rwdRevId = `rwd-rev-${uuidv4().slice(0, 8)}`;
                  db.prepare(`
                    INSERT INTO reward_points_ledger (id, user_id, session_id, booking_id, entry_type, points, status, description)
                    VALUES (?, ?, NULL, ?, 'earned_revocation', -?, 'available', ?)
                  `).run(rwdRevId, booking.client_id, booking.id, pts, `Revoked ${pts} reward points due to refunded consultation`);
                }
              }

              db.prepare(`
                INSERT INTO notifications (id, user_id, title, message, type, link)
                VALUES (?, ?, 'Refund Processed', ?, 'info', ?)
              `).run(
                `notif-${uuidv4().slice(0, 8)}`,
                booking.client_id,
                `A refund of ₹${refundAmountInr || booking.total_price} has been processed for your consultation.`,
                '/client'
              );

              db.prepare(`
                INSERT INTO notifications (id, user_id, title, message, type, link)
                VALUES (?, ?, 'Consultation Refunded', ?, 'warning', ?)
              `).run(
                `notif-${uuidv4().slice(0, 8)}`,
                booking.provider_id,
                `Consultation #${booking.id} was refunded. Ledger earnings adjusted accordingly.`,
                '/provider'
              );
            }
          }
        }
      }

      // Mark event as processed in idempotency ledger
      if (eventId) {
        try {
          db.prepare('INSERT INTO processed_webhook_events (event_id, event_type) VALUES (?, ?) ON CONFLICT DO NOTHING').run(eventId, eventType);
        } catch {
          // Non-blocking
        }
      }
    } catch (whErr) {
      console.error('[Razorpay Webhook Error]:', whErr.message);
      return res.status(500).json({ error: 'Webhook processing error' });
    }

    res.status(200).json({ status: 'ok', processed: true });
  };

  router.post('/payments/razorpay-webhook', handleRazorpayWebhook);
  router.post('/webhooks/razorpay', handleRazorpayWebhook);

  // ==========================================
  // WEBRTC ICE & TURN SERVER ENDPOINTS
  // ==========================================
  const getIceConfig = () => {
    const stunUrls = (process.env.STUN_SERVER_URL || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const iceServers = [{ urls: stunUrls }];

    if (process.env.TURN_SERVER_URL) {
      const turnUrls = process.env.TURN_SERVER_URL.split(',').map(s => s.trim()).filter(Boolean);
      const turnConfig = { urls: turnUrls };
      if (process.env.TURN_USERNAME) turnConfig.username = process.env.TURN_USERNAME;
      if (process.env.TURN_CREDENTIAL) turnConfig.credential = process.env.TURN_CREDENTIAL;
      iceServers.push(turnConfig);
    }

    return iceServers;
  };

  router.get('/webrtc/ice-servers', authMiddleware, (req, res) => {
    res.json({ iceServers: getIceConfig() });
  });

  router.get('/sessions/:id/ice-servers', authMiddleware, (req, res) => {
    const session = db.prepare('SELECT client_id, provider_id FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.client_id !== req.user.id && session.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to access ICE configuration for this session.' });
    }
    res.json({ iceServers: getIceConfig(), sessionId: req.params.id });
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

  // End session manually by client or expert
  router.post('/sessions/:id/end', authMiddleware, (req, res) => {
    const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    if (session.client_id !== req.user.id && session.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: You are not a participant in this session.' });
    }
    if (session.status === 'COMPLETED' || session.status === 'EXPIRED') {
      return res.json({ success: true, message: 'Session already completed.', session });
    }

    const { completeSession } = require('./sessionLifecycle');
    const updatedSession = completeSession(session.id, { io, completedBy: req.user.id });
    res.json({ success: true, session: updatedSession, message: 'Session concluded successfully.' });
  });

  // Create Razorpay Order for Live Session Extension (Server-Authoritative)
  router.post('/sessions/:id/create-extension-order', authMiddleware, async (req, res) => {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    if (session.client_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Only the client can extend this session.' });
    }
    if (session.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only active live sessions can be extended.' });
    }

    const additionalMinutes = parseInt(req.body.additional_minutes, 10);
    if (isNaN(additionalMinutes) || additionalMinutes < 1 || additionalMinutes > 120) {
      return res.status(400).json({ error: 'Additional minutes must be between 1 and 120.' });
    }

    const service = db.prepare('SELECT price_per_minute, title FROM services WHERE id = ?').get(session.service_id);
    const ratePerMinute = service ? service.price_per_minute : 1.00;
    const extensionAmount = Number((additionalMinutes * ratePerMinute).toFixed(2));
    const amountInPaise = toPaise(extensionAmount);

    try {
      const order = await createRazorpayNativeOrder({
        amountPaise: amountInPaise,
        receipt: `ext_${session.id.slice(0, 8)}_${Date.now()}`,
        notes: {
          session_id: session.id,
          additional_minutes: additionalMinutes,
          client_id: req.user.id
        }
      });

      return res.json({
        order_id: order.order_id,
        amount: extensionAmount,
        amount_paise: amountInPaise,
        currency: order.currency,
        key_id: order.key_id,
        additional_minutes: additionalMinutes,
        rate_per_minute: ratePerMinute
      });
    } catch (err) {
      console.error('[Session Extension Order Error]', err.message);
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message || 'Payment could not be initialized. Please try again.' });
    }
  });

  // Verify Razorpay Payment for Live Session Extension
  router.post('/sessions/:id/verify-extension-payment', authMiddleware, async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, additional_minutes } = req.body;
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    if (session.client_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Only the client can extend this session.' });
    }
    if (session.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Cannot extend an inactive or completed session.' });
    }

    const addMins = parseInt(additional_minutes, 10);
    if (isNaN(addMins) || addMins < 1 || addMins > 120) {
      return res.status(400).json({ error: 'Invalid extension duration.' });
    }

    const resolvedCredentials = getEffectiveRazorpayCredentials();
    const rawSecret = resolvedCredentials.keySecret || (process.env.NODE_ENV !== 'production' ? 'dev_razorpay_secret_key_12345' : null);
    const keySecret = rawSecret ? rawSecret.trim().replace(/^["']|["']$/g, '') : null;
    if (!keySecret) {
      return res.status(500).json({ error: 'Server configuration error: RAZORPAY_KEY_SECRET is required.' });
    }
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

    // Replay Protection & Idempotency check
    const existingPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(razorpay_payment_id);
    if (existingPayment) {
      return res.status(409).json({ error: 'Payment ID has already been processed for this or another transaction.' });
    }

    const service = db.prepare('SELECT price_per_minute, title FROM services WHERE id = ?').get(session.service_id);
    const ratePerMinute = service ? service.price_per_minute : 1.00;
    const extensionAmount = Number((addMins * ratePerMinute).toFixed(2));

    // Record payment
    db.prepare(`
      INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
      VALUES (?, ?, 'session_payment', ?, 'succeeded', ?, ?)
    `).run(
      razorpay_payment_id,
      req.user.id,
      extensionAmount,
      session.id,
      JSON.stringify({
        extension: true,
        additional_minutes: addMins,
        session_id: session.id,
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
        currency: CURRENCY,
        service_title: service?.title
      })
    );

    // Update booking total
    db.prepare(`
      UPDATE bookings
      SET duration_minutes = duration_minutes + ?, total_price = total_price + ?
      WHERE id = ?
    `).run(addMins, extensionAmount, session.booking_id);

    // Use timerEngine to extend the session and clear warnings
    const updatedSession = timerEngine.extendSession(session.id, addMins);

    // Real-time Socket.IO dispatch
    io.to(`session_${session.id}`).emit('session_extended', {
      sessionId: session.id,
      additionalMinutes: addMins,
      newDurationMinutes: updatedSession.duration_minutes,
      newActualEnd: updatedSession.actual_end,
      remainingSeconds: updatedSession.remainingSeconds,
      message: `Session extended by +${addMins} minutes! New duration: ${updatedSession.duration_minutes} mins.`
    });

    // In-app notification for expert
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, 'Session Extended', ?, 'info', ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      session.provider_id,
      `Client has extended the live consultation by +${addMins} minutes.`,
      `/session/${session.id}`
    );

    res.json({
      success: true,
      message: `Session extended by +${addMins} minutes successfully!`,
      session: updatedSession,
      additional_minutes: addMins
    });
  });

  // ==========================================
  // DASHBOARDS (CLIENT & PROVIDER)
  // ==========================================
  function buildClientDashboardData(userId) {
    checkAndExpireRequests(io);

    // 1. All valid sessions for this client
    const sessions = db.prepare(`
      SELECT s.*, srv.title as service_title, srv.price_per_minute, srv.category_id,
             c.name as category_name,
             p.id as provider_id, p.full_name as provider_name, p.avatar_url as provider_avatar,
             p.headline as provider_headline, p.rating as provider_rating, p.review_count as provider_review_count,
             r.id as review_id, r.rating as review_rating, r.comment as review_comment
      FROM sessions s
      JOIN services srv ON s.service_id = srv.id
      LEFT JOIN categories c ON srv.category_id = c.id
      JOIN users p ON s.provider_id = p.id
      LEFT JOIN reviews r ON s.id = r.session_id
      WHERE s.client_id = ?
      ORDER BY COALESCE(s.actual_end, s.scheduled_start, s.created_at) DESC
    `).all(userId);

    // 2. All consultation requests for this client
    const consultationRequestsRaw = db.prepare(`
      SELECT cr.*, srv.title as service_title, srv.category_id,
             c.name as category_name,
             p.id as provider_id, p.full_name as provider_name, p.avatar_url as provider_avatar,
             p.headline as provider_headline, p.rating as provider_rating
      FROM consultation_requests cr
      JOIN services srv ON cr.service_id = srv.id
      LEFT JOIN categories c ON srv.category_id = c.id
      JOIN users p ON cr.provider_id = p.id
      WHERE cr.client_id = ?
      ORDER BY cr.created_at DESC
    `).all(userId);
    const consultationRequests = consultationRequestsRaw.map(cr => {
      const formatted = formatConsultationRequest(cr);
      if (!formatted) return null;
      const linkedSes = formatted.session_id
        ? sessions.find(s => s.id === formatted.session_id)
        : sessions.find(s => s.booking_id === formatted.id);
      if (linkedSes?.status === 'COMPLETED' || formatted.status === 'COMPLETED') {
        formatted.status = 'COMPLETED';
      } else if (linkedSes?.status === 'EXPIRED' || formatted.status === 'EXPIRED') {
        formatted.status = 'EXPIRED';
      } else if (linkedSes?.status === 'ACTIVE' || formatted.status === 'ACTIVE') {
        formatted.status = 'ACTIVE';
      }
      if (linkedSes && !formatted.session_id) {
        formatted.session_id = linkedSes.id;
      }
      return formatted;
    }).filter(Boolean);

    // 3. All bookings for this client
    const bookings = db.prepare(`
      SELECT b.*, srv.title as service_title, srv.category_id,
             c.name as category_name,
             p.id as provider_id, p.full_name as provider_name, p.avatar_url as provider_avatar,
             p.headline as provider_headline,
             s.id as session_id, s.status as session_status, s.duration_minutes as session_duration_minutes
      FROM bookings b
      JOIN services srv ON b.service_id = srv.id
      LEFT JOIN categories c ON srv.category_id = c.id
      JOIN users p ON b.provider_id = p.id
      LEFT JOIN sessions s ON b.id = s.booking_id
      WHERE b.client_id = ?
      ORDER BY b.scheduled_start DESC
    `).all(userId);

    // 4. Enriched payments
    const paymentsRaw = db.prepare(`
      SELECT
        p.id, p.type, p.amount, p.status, p.reference_id, p.metadata_json, p.created_at,
        COALESCE(srv.id, srv_ses.id, srv_cr.id) as service_id,
        COALESCE(srv.title, srv_ses.title, srv_cr.title, opp.title, 'Consultation Session') as service_title,
        COALESCE(cat.name, cat_ses.name, cat_cr.name, 'General Consultation') as category_name,
        COALESCE(exp.id, exp_ses.id, exp_cr.id) as provider_id,
        COALESCE(exp.full_name, exp_ses.full_name, exp_cr.full_name, 'Marketplace Expert') as provider_name,
        COALESCE(exp.avatar_url, exp_ses.avatar_url, exp_cr.avatar_url) as provider_avatar,
        COALESCE(s.id, s_ses.id, cr.session_id) as session_id,
        COALESCE(b.id, b_ses.id, cr.id) as booking_id
      FROM payments p
      LEFT JOIN bookings b ON (b.id = p.reference_id OR b.payment_id = p.id)
      LEFT JOIN services srv ON b.service_id = srv.id
      LEFT JOIN categories cat ON srv.category_id = cat.id
      LEFT JOIN users exp ON b.provider_id = exp.id
      LEFT JOIN sessions s ON b.id = s.booking_id
      LEFT JOIN sessions s_ses ON (s_ses.id = p.reference_id)
      LEFT JOIN bookings b_ses ON (s_ses.booking_id = b_ses.id)
      LEFT JOIN services srv_ses ON s_ses.service_id = srv_ses.id
      LEFT JOIN categories cat_ses ON srv_ses.category_id = cat_ses.id
      LEFT JOIN users exp_ses ON s_ses.provider_id = exp_ses.id
      LEFT JOIN consultation_requests cr ON (cr.id = p.reference_id OR cr.payment_id = p.id)
      LEFT JOIN services srv_cr ON cr.service_id = srv_cr.id
      LEFT JOIN categories cat_cr ON srv_cr.category_id = cat_cr.id
      LEFT JOIN users exp_cr ON cr.provider_id = exp_cr.id
      LEFT JOIN opportunities opp ON (p.type = 'application_fee' AND opp.id = p.reference_id)
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `).all(userId);

    // Map refunds
    const refundedPaymentIds = new Set();
    const paymentRefundMap = new Map();
    for (const p of paymentsRaw) {
      if (p.status === 'refunded') {
        refundedPaymentIds.add(p.id);
        paymentRefundMap.set(p.id, Math.round(Number(p.amount || 0) * 100));
      }
      if (p.type === 'refund' && p.status === 'succeeded') {
        let origId = null;
        try {
          const meta = JSON.parse(p.metadata_json || '{}');
          origId = meta.original_payment_id;
        } catch {}
        if (origId) {
          const amtPaise = Math.round(Number(p.amount || 0) * 100);
          paymentRefundMap.set(origId, (paymentRefundMap.get(origId) || 0) + amtPaise);
        }
      }
    }

    const payments = paymentsRaw.map(p => {
      const grossInr = Number(p.amount || 0);
      const grossPaise = Math.round(grossInr * 100);
      let refundPaise = 0;
      if (p.status === 'refunded') {
        refundPaise = grossPaise;
      } else if (paymentRefundMap.has(p.id)) {
        refundPaise = Math.min(grossPaise, paymentRefundMap.get(p.id));
      }

      const netPaise = p.type === 'refund' ? 0 : Math.max(0, grossPaise - refundPaise);
      const refundInr = Number((refundPaise / 100).toFixed(2));
      const netInr = Number((netPaise / 100).toFixed(2));

      let parsedMeta = {};
      try {
        parsedMeta = JSON.parse(p.metadata_json || '{}');
      } catch {}

      return {
        ...p,
        amount: grossInr,
        refund_amount: refundInr,
        net_amount: netInr,
        is_refunded: p.status === 'refunded' || refundPaise > 0,
        gateway: parsedMeta.gateway || 'Razorpay',
        order_id: parsedMeta.order_id || null
      };
    });

    // Services Received / Unified Consultations
    const seenConsultationKeys = new Set();
    const consultations = [];

    for (const cr of consultationRequests) {
      const key = cr.session_id ? `ses-${cr.session_id}` : `cr-${cr.id}`;
      seenConsultationKeys.add(key);

      const linkedSes = cr.session_id ? sessions.find(s => s.id === cr.session_id) : sessions.find(s => s.booking_id === cr.id);
      const linkedPayment = payments.find(p => p.reference_id === cr.id || (cr.session_id && p.reference_id === cr.session_id));

      const isRefunded = linkedPayment?.is_refunded || false;
      let displayStatus = cr.status;
      if (isRefunded) displayStatus = 'REFUNDED';
      else if (linkedSes?.status === 'COMPLETED' || cr.status === 'COMPLETED') displayStatus = 'COMPLETED';
      else if (linkedSes?.status === 'EXPIRED' || cr.status === 'EXPIRED') displayStatus = 'EXPIRED';
      else if (linkedSes?.status === 'ACTIVE' || cr.status === 'ACTIVE') displayStatus = 'ACTIVE';
      else if (linkedSes?.status === 'CANCELLED' || cr.status === 'CANCELLED') displayStatus = 'CANCELLED';
      else if (cr.status === 'DECLINED') displayStatus = 'DECLINED';

      consultations.push({
        id: cr.id,
        consultation_key: key,
        request_id: cr.id,
        session_id: cr.session_id || linkedSes?.id || null,
        booking_id: linkedSes?.booking_id || null,
        expert_id: cr.provider_id,
        expert_name: cr.provider_name,
        expert_avatar: cr.provider_avatar,
        expert_headline: cr.provider_headline,
        service_id: cr.service_id,
        service_title: cr.service_title,
        category_name: cr.category_name || 'Consultation',
        request_date: cr.created_at,
        consultation_date: linkedSes?.actual_start || cr.scheduled_start || cr.created_at,
        duration_minutes: linkedSes?.duration_minutes || cr.duration_minutes,
        status: displayStatus,
        original_status: cr.status,
        gross_amount: Number(cr.total_price || 0),
        refund_amount: linkedPayment?.refund_amount || 0,
        net_amount: isRefunded ? 0 : Number(cr.total_price || 0),
        is_refunded: isRefunded,
        problem_description: normalizeTopicText(cr.problem_description),
        review_rating: linkedSes?.review_rating || null,
        review_comment: linkedSes?.review_comment || null,
        review_id: linkedSes?.review_id || null,
        remaining_seconds: cr.remaining_seconds
      });
    }

    for (const ses of sessions) {
      const key = `ses-${ses.id}`;
      if (!seenConsultationKeys.has(key)) {
        seenConsultationKeys.add(key);
        const linkedPayment = payments.find(p => p.reference_id === ses.id || p.reference_id === ses.booking_id);
        const isRefunded = linkedPayment?.is_refunded || ses.status === 'CANCELLED';

        consultations.push({
          id: ses.id,
          consultation_key: key,
          request_id: null,
          session_id: ses.id,
          booking_id: ses.booking_id,
          expert_id: ses.provider_id,
          expert_name: ses.provider_name,
          expert_avatar: ses.provider_avatar,
          expert_headline: ses.provider_headline,
          service_id: ses.service_id,
          service_title: ses.service_title,
          category_name: ses.category_name || 'Consultation',
          request_date: ses.created_at,
          consultation_date: ses.actual_start || ses.scheduled_start || ses.created_at,
          duration_minutes: ses.duration_minutes,
          status: isRefunded ? 'REFUNDED' : ses.status,
          original_status: ses.status,
          gross_amount: Number(linkedPayment?.amount || (ses.price_per_minute * ses.duration_minutes) || 0),
          refund_amount: linkedPayment?.refund_amount || 0,
          net_amount: isRefunded ? 0 : Number(linkedPayment?.amount || 0),
          is_refunded: isRefunded,
          problem_description: null,
          review_rating: ses.review_rating || null,
          review_comment: ses.review_comment || null,
          review_id: ses.review_id || null,
          remaining_seconds: 0
        });
      }
    }

    consultations.sort((a, b) => new Date(b.consultation_date || b.request_date).getTime() - new Date(a.consultation_date || a.request_date).getTime());

    // Net Total Spent in Integer Paise
    let totalCapturedPaise = 0;
    let totalRefundPaise = 0;
    for (const p of payments) {
      if (p.type === 'session_payment' && (p.status === 'succeeded' || p.status === 'refunded')) {
        totalCapturedPaise += Math.round(Number(p.amount || 0) * 100);
        totalRefundPaise += Math.round(Number(p.refund_amount || 0) * 100);
      }
    }
    const totalCapturedInr = Number((totalCapturedPaise / 100).toFixed(2));
    const totalRefundedInr = Number((totalRefundPaise / 100).toFixed(2));
    const netTotalSpent = Number((Math.max(0, totalCapturedPaise - totalRefundPaise) / 100).toFixed(2));

    // Distinct Experts Hired
    const expertIdsRow = db.prepare(`
      SELECT DISTINCT provider_id FROM (
        SELECT provider_id FROM sessions WHERE client_id = ? AND status IN ('ACTIVE', 'COMPLETED')
        UNION
        SELECT provider_id FROM bookings WHERE client_id = ? AND status IN ('ACCEPTED', 'PAID', 'COMPLETED')
        UNION
        SELECT provider_id FROM consultation_requests WHERE client_id = ? AND status IN ('PAID', 'COMPLETED')
      )
    `).all(userId, userId, userId);
    const totalExpertsHired = expertIdsRow.length;

    // Verified Session Minutes Delivered
    const totalSessionMinutes = db.prepare(`
      SELECT COALESCE(SUM(duration_minutes), 0) as mins FROM sessions WHERE client_id = ? AND status = 'COMPLETED'
    `).get(userId)?.mins || 0;

    const completedSessionsCount = db.prepare(`
      SELECT COUNT(*) as count FROM sessions WHERE client_id = ? AND status = 'COMPLETED'
    `).get(userId)?.count || 0;

    const activeSessionsCount = db.prepare(`
      SELECT COUNT(*) as count FROM sessions WHERE client_id = ? AND status = 'ACTIVE'
    `).get(userId)?.count || 0;

    const pendingRequestsCount = db.prepare(`
      SELECT COUNT(*) as count FROM consultation_requests WHERE client_id = ? AND status = 'PENDING_EXPERT'
    `).get(userId)?.count || 0;

    const totalConsultations = consultations.length;

    const ratingsGiven = db.prepare(`
      SELECT COUNT(*) as count FROM reviews WHERE client_id = ?
    `).get(userId)?.count || 0;

    // Previously Hired Experts
    const previouslyHiredExperts = expertIdsRow.map(row => {
      const pId = row.provider_id;
      const providerUser = db.prepare(`
        SELECT id, full_name, avatar_url, headline, rating, review_count FROM users WHERE id = ?
      `).get(pId) || { id: pId, full_name: 'Expert', headline: 'Consultant' };

      const latestSession = db.prepare(`
        SELECT s.*, srv.title as service_title, srv.price_per_minute, srv.category_id, c.name as category_name
        FROM sessions s
        JOIN services srv ON s.service_id = srv.id
        LEFT JOIN categories c ON srv.category_id = c.id
        WHERE s.client_id = ? AND s.provider_id = ? AND s.status IN ('ACTIVE', 'COMPLETED')
        ORDER BY COALESCE(s.actual_end, s.scheduled_start, s.created_at) DESC
        LIMIT 1
      `).get(userId, pId);

      const latestBooking = db.prepare(`
        SELECT b.*, srv.title as service_title, srv.price_per_minute, srv.category_id, c.name as category_name
        FROM bookings b
        JOIN services srv ON b.service_id = srv.id
        LEFT JOIN categories c ON srv.category_id = c.id
        WHERE b.client_id = ? AND b.provider_id = ?
        ORDER BY b.scheduled_start DESC
        LIMIT 1
      `).get(userId, pId);

      const latestReq = db.prepare(`
        SELECT cr.*, srv.title as service_title, srv.price_per_minute, srv.category_id, c.name as category_name
        FROM consultation_requests cr
        JOIN services srv ON cr.service_id = srv.id
        LEFT JOIN categories c ON srv.category_id = c.id
        WHERE cr.client_id = ? AND cr.provider_id = ?
        ORDER BY cr.created_at DESC
        LIMIT 1
      `).get(userId, pId);

      const serviceId = latestSession?.service_id || latestBooking?.service_id || latestReq?.service_id;
      const serviceTitle = latestSession?.service_title || latestBooking?.service_title || latestReq?.service_title || 'Expert Consultation';
      const categoryName = latestSession?.category_name || latestBooking?.category_name || latestReq?.category_name || 'Consultation';
      const pricePerMinute = Number(latestSession?.price_per_minute || latestBooking?.price_per_minute || latestReq?.price_per_minute || 50);

      const expertConsultations = consultations.filter(c => (c.expert_id === pId || c.provider_id === pId));
      const expertCompletedConsultations = expertConsultations.filter(c => c.status === 'COMPLETED');
      const expertConsultationsCount = expertConsultations.length || 1;
      const completedSessionsCount = expertCompletedConsultations.length;

      const expertDeliveredMins = db.prepare(`
        SELECT COALESCE(SUM(duration_minutes), 0) as mins FROM sessions WHERE client_id = ? AND provider_id = ? AND status = 'COMPLETED'
      `).get(userId, pId)?.mins || 0;

      let expertNetSpentPaise = 0;
      for (const p of payments) {
        if (p.provider_id === pId && p.type === 'session_payment' && p.status === 'succeeded') {
          const grossPaise = Math.round(Number(p.amount || 0) * 100);
          const refPaise = Math.round(Number(p.refund_amount || 0) * 100);
          expertNetSpentPaise += Math.max(0, grossPaise - refPaise);
        }
      }
      const expertTotalSpentInr = Number((expertNetSpentPaise / 100).toFixed(2));

      const activeSes = db.prepare(`
        SELECT id FROM sessions WHERE client_id = ? AND provider_id = ? AND status = 'ACTIVE' LIMIT 1
      `).get(userId, pId);
      const pendingReq = db.prepare(`
        SELECT id, status FROM consultation_requests WHERE client_id = ? AND provider_id = ? AND status IN ('PENDING_EXPERT', 'ACCEPTED') ORDER BY created_at DESC LIMIT 1
      `).get(userId, pId);

      let currentStatus = null;
      if (activeSes) currentStatus = 'ACTIVE_SESSION';
      else if (pendingReq?.status === 'ACCEPTED') currentStatus = 'PAYMENT_PENDING';
      else if (pendingReq?.status === 'PENDING_EXPERT') currentStatus = 'AWAITING_EXPERT';

      const lastDate = latestSession?.actual_end || latestSession?.scheduled_start || latestBooking?.scheduled_start || latestReq?.created_at;

      return {
        provider_id: providerUser.id,
        provider_name: providerUser.full_name,
        provider_avatar: providerUser.avatar_url,
        provider_headline: providerUser.headline || 'Marketplace Expert',
        provider_rating: Number(providerUser.rating || 5.0),
        provider_review_count: Number(providerUser.review_count || 0),
        service_id: serviceId,
        service_title: serviceTitle,
        category_name: categoryName,
        price_per_minute: pricePerMinute,
        last_consultation_date: lastDate,
        total_consultations: expertConsultationsCount,
        completed_sessions_count: completedSessionsCount,
        completed_sessions: expertCompletedConsultations.map(c => ({
          id: c.id,
          session_id: c.session_id,
          duration_minutes: c.duration_minutes,
          consultation_date: c.consultation_date,
          problem_description: c.problem_description,
          amount: c.net_amount || c.gross_amount,
          review_rating: c.review_rating,
          review_comment: c.review_comment
        })),
        total_minutes: expertDeliveredMins,
        total_spent_inr: expertTotalSpentInr,
        current_status: currentStatus,
        active_session_id: activeSes?.id || null,
        pending_request_id: pendingReq?.id || null
      };
    }).sort((a, b) => new Date(b.last_consultation_date || 0).getTime() - new Date(a.last_consultation_date || 0).getTime());

    // Recommendations
    const usedCategories = Array.from(new Set(sessions.map(s => s.category_id).filter(Boolean)));
    let recSql = `
      SELECT s.*,
             u.full_name as provider_name, u.avatar_url as provider_avatar,
             u.headline as provider_headline, u.rating as provider_rating,
             u.review_count as provider_review_count, u.verified as provider_verified,
             u.response_time as provider_response_time,
             c.name as category_name, c.slug as category_slug
      FROM services s
      JOIN users u ON s.provider_id = u.id
      JOIN categories c ON s.category_id = c.id
      WHERE LOWER(s.listing_status) IN ('active', 'published')
        AND u.id != ?
        AND COALESCE(u.is_suspended, 0) = 0
    `;
    const recParams = [userId];
    if (usedCategories.length > 0) {
      const placeholders = usedCategories.map(() => '?').join(',');
      recSql += ` AND (s.category_id IN (${placeholders}) OR u.rating >= 4.8)`;
      recParams.push(...usedCategories);
    } else {
      recSql += ` AND u.rating >= 4.5`;
    }
    recSql += ` ORDER BY u.rating DESC, u.sessions_completed DESC LIMIT 6`;
    const recommendedExperts = db.prepare(recSql).all(...recParams).map(s => {
      let skills = [];
      try { skills = JSON.parse(s.skills_json || '[]'); } catch { skills = []; }
      return { ...s, skills };
    });

    return {
      activeSession: sessions.find(s => s.status === 'ACTIVE') || null,
      consultationRequests,
      upcomingBookings: bookings.filter(b => ['PENDING', 'ACCEPTED'].includes(b.status)),
      pastSessions: sessions.filter(s => s.status === 'COMPLETED'),
      payments,
      consultations,
      previouslyHiredExperts,
      previously_hired_experts: previouslyHiredExperts,
      recommendedExperts,
      spending_summary: {
        total_captured_inr: totalCapturedInr,
        total_refunded_inr: totalRefundedInr,
        net_spent_inr: netTotalSpent
      },
      stats: {
        totalExpertsHired,
        totalConsultations,
        completedConsultations: completedSessionsCount,
        activeConsultations: activeSessionsCount,
        totalSessionMinutes,
        totalAmountPaid: netTotalSpent,
        totalSpent: netTotalSpent,
        completedSessions: completedSessionsCount,
        pendingRequests: pendingRequestsCount,
        ratingsGiven,
        clientRating: 5.0
      }
    };
  }

  router.get('/dashboards/client', authMiddleware, (req, res) => {
    try {
      const data = buildClientDashboardData(req.user.id);
      res.json({
        success: true,
        ...data,
        summary: {
          ...data.stats,
          experts_hired: data.stats.totalExpertsHired,
          total_consultations: data.stats.totalConsultations,
          consultation_minutes: data.stats.totalSessionMinutes,
          total_spent: data.stats.totalSpent,
          completed_sessions: data.stats.completedSessions,
          pending_requests: data.stats.pendingRequests
        }
      });
    } catch (err) {
      console.error('[Client Dashboard Error]', err);
      res.status(500).json({ error: 'Failed to load client dashboard records.' });
    }
  });

  router.get('/client/summary', authMiddleware, (req, res) => {
    try {
      const data = buildClientDashboardData(req.user.id);
      const summaryObj = {
        ...data.stats,
        experts_hired: data.stats.totalExpertsHired,
        total_consultations: data.stats.totalConsultations,
        consultation_minutes: data.stats.totalSessionMinutes,
        total_spent: data.stats.totalSpent,
        completed_sessions: data.stats.completedSessions,
        pending_requests: data.stats.pendingRequests
      };
      res.json({
        success: true,
        stats: data.stats,
        summary: summaryObj
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load client summary.' });
    }
  });

  router.get('/client/experts', authMiddleware, (req, res) => {
    try {
      const data = buildClientDashboardData(req.user.id);
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
      const start = (page - 1) * limit;
      const paginated = data.previouslyHiredExperts.slice(start, start + limit);
      const expertsMapped = paginated.map(e => ({
        ...e,
        id: e.provider_id,
        name: e.provider_name,
        avatar: e.provider_avatar,
        headline: e.provider_headline,
        rating: e.provider_rating,
        review_count: e.provider_review_count,
        verified_minutes: e.total_minutes,
        net_spent: e.total_spent_inr,
        completed_sessions_count: e.completed_sessions_count || 0,
        completed_sessions: e.completed_sessions || []
      }));
      res.json({
        success: true,
        experts: expertsMapped,
        total: data.previouslyHiredExperts.length,
        page,
        totalPages: Math.ceil(data.previouslyHiredExperts.length / limit) || 1,
        pagination: {
          total: data.previouslyHiredExperts.length,
          page,
          totalPages: Math.ceil(data.previouslyHiredExperts.length / limit) || 1
        }
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load previously hired experts.' });
    }
  });

  router.get('/client/consultations', authMiddleware, (req, res) => {
    try {
      const data = buildClientDashboardData(req.user.id);
      let list = data.consultations;
      const statusFilter = (req.query.status || 'all').toLowerCase();
      if (statusFilter === 'active' || statusFilter === 'upcoming') {
        list = list.filter(c => ['PENDING_EXPERT', 'ACCEPTED', 'PAID', 'ACTIVE', 'SCHEDULED'].includes(c.status) && c.status !== 'COMPLETED');
      } else if (statusFilter === 'completed') {
        list = list.filter(c => c.status === 'COMPLETED');
      } else if (statusFilter === 'cancelled' || statusFilter === 'refunded') {
        list = list.filter(c => ['DECLINED', 'EXPIRED', 'CANCELLED', 'REFUNDED'].includes(c.status) || c.is_refunded);
      }
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
      const start = (page - 1) * limit;
      const paginated = list.slice(start, start + limit);
      res.json({
        success: true,
        consultations: paginated,
        total: list.length,
        page,
        totalPages: Math.ceil(list.length / limit) || 1,
        pagination: {
          total: list.length,
          page,
          totalPages: Math.ceil(list.length / limit) || 1
        }
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load consultation history.' });
    }
  });

  router.get('/client/payments', authMiddleware, (req, res) => {
    try {
      const data = buildClientDashboardData(req.user.id);
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
      const start = (page - 1) * limit;
      const paginated = data.payments.slice(start, start + limit);

      let totalCapturedPaise = 0;
      let totalRefundedPaise = 0;
      for (const p of data.payments) {
        if (p.type === 'session_payment' && (p.status === 'succeeded' || p.status === 'refunded')) {
          totalCapturedPaise += Math.round(Number(p.amount || 0) * 100);
          totalRefundedPaise += Math.round(Number(p.refund_amount || 0) * 100);
        }
      }
      const totalCapturedInr = Number((totalCapturedPaise / 100).toFixed(2));
      const totalRefundedInr = Number((totalRefundedPaise / 100).toFixed(2));

      res.json({
        success: true,
        payments: paginated,
        total: data.payments.length,
        page,
        totalPages: Math.ceil(data.payments.length / limit) || 1,
        pagination: {
          total: data.payments.length,
          page,
          totalPages: Math.ceil(data.payments.length / limit) || 1
        },
        summary: {
          totalCaptured: totalCapturedInr,
          totalRefunded: totalRefundedInr,
          netSpent: data.stats.totalSpent,
          total_captured_inr: totalCapturedInr,
          total_refunded_inr: totalRefundedInr,
          net_spent_inr: data.stats.totalSpent
        }
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load payment history.' });
    }
  });

  router.get('/dashboards/provider', authMiddleware, (req, res) => {
    if (req.user.role !== 'provider' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Provider account required.' });
    }
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

    // Pending requests with client reputation data (strictly sanitized, zero private billing data)
    const pendingRequestsRaw = db.prepare(`
      SELECT cr.*, srv.title as service_title,
             c.full_name as client_name, c.avatar_url as client_avatar,
             c.sessions_completed as client_sessions_completed,
             c.member_since as client_member_since,
             c.rating as client_rating
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
      SELECT COALESCE(SUM(p.amount), 0) as total_earnings, COUNT(DISTINCT s.id) as completed_count
      FROM sessions s
      LEFT JOIN payments p ON s.booking_id = p.reference_id AND p.type = 'session_payment' AND p.status = 'succeeded'
      WHERE s.provider_id = ? AND s.status = 'COMPLETED'
    `).get(userId);

    const todayIso = new Date().toISOString().slice(0, 10);
    const todayEarningsCalc = db.prepare(`
      SELECT COALESCE(SUM(p.amount), 0) as today_earnings
      FROM sessions s
      JOIN payments p ON s.booking_id = p.reference_id AND p.type = 'session_payment' AND p.status = 'succeeded'
      WHERE s.provider_id = ? AND s.status = 'COMPLETED' AND p.created_at >= ?
    `).get(userId, todayIso);

    const totalMinutesCalc = db.prepare(`
      SELECT COALESCE(SUM(duration_minutes), 0) as mins FROM sessions WHERE provider_id = ? AND status = 'COMPLETED'
    `).get(userId);

    const grossEarnings = Number(earningsCalc.total_earnings || 0);
    const commPct = getPlatformCommissionPercent();
    const commRate = commPct / 100;
    const providerRate = (100 - commPct) / 100;
    const platformFee15 = Number((grossEarnings * commRate).toFixed(2));
    const netEarnings = Number((grossEarnings * providerRate).toFixed(2));
    const todayGross = Number(todayEarningsCalc.today_earnings || 0);
    const todayNet = Number((todayGross * providerRate).toFixed(2));

    // Completed sessions breakdown showing dynamic platform fee from settings
    const completedSessionsBreakdown = db.prepare(`
      SELECT s.id, s.actual_end, s.duration_minutes,
             srv.title as service_title,
             c.full_name as client_name, c.avatar_url as client_avatar,
             COALESCE(p.amount, b.total_price) as gross_amount
      FROM sessions s
      JOIN services srv ON s.service_id = srv.id
      JOIN users c ON s.client_id = c.id
      JOIN bookings b ON s.booking_id = b.id
      LEFT JOIN payments p ON s.booking_id = p.reference_id AND p.type = 'session_payment' AND p.status = 'succeeded'
      WHERE s.provider_id = ? AND s.status = 'COMPLETED'
      ORDER BY s.actual_end DESC
      LIMIT 20
    `).all(userId).map(item => {
      const gross = Number(item.gross_amount || 0);
      const fee = Number((gross * commRate).toFixed(2));
      const net = Number((gross * providerRate).toFixed(2));
      return {
        ...item,
        gross_amount: gross,
        platform_fee: fee,
        net_earned: net
      };
    });

    const reviews = db.prepare(`
      SELECT r.*, c.full_name as client_name, c.avatar_url as client_avatar, srv.title as service_title
      FROM reviews r
      JOIN users c ON r.client_id = c.id
      JOIN services srv ON r.service_id = srv.id
      WHERE r.provider_id = ? AND COALESCE(r.is_hidden, 0) = 0
      ORDER BY r.created_at DESC
    `).all(userId);

    // Calculate REAL response metrics from consultation_requests
    const expertRequests = db.prepare(`
      SELECT id, status, created_at, accepted_at, declined_at, expired_at
      FROM consultation_requests
      WHERE provider_id = ?
    `).all(userId);

    const totalRequests = expertRequests.length;
    const answeredRequests = expertRequests.filter(r => r.accepted_at || r.declined_at || ['ACCEPTED', 'DECLINED', 'PAID', 'COMPLETED'].includes(r.status));
    const responseRate = totalRequests > 0 ? Math.round((answeredRequests.length / totalRequests) * 100) : 100;

    let responseTimeText = 'Within 15 mins';
    if (answeredRequests.length > 0) {
      let totalMins = 0;
      let countWithTiming = 0;
      for (const r of answeredRequests) {
        const respondedAt = r.accepted_at || r.declined_at;
        if (respondedAt && r.created_at) {
          const diffMs = new Date(respondedAt).getTime() - new Date(r.created_at).getTime();
          const diffMins = Math.max(0.5, diffMs / (60 * 1000));
          totalMins += diffMins;
          countWithTiming++;
        }
      }
      if (countWithTiming > 0) {
        const avgMins = Math.round(totalMins / countWithTiming);
        if (avgMins <= 1) responseTimeText = '< 1 min';
        else if (avgMins < 60) responseTimeText = `Within ${avgMins} mins`;
        else responseTimeText = `Within ${Math.round(avgMins / 60)} hrs`;
      }
    }

    // Platform Ranking calculation (Merit-based composite methodology)
    // Formula: (Rating * 20) + (ResponseRate * 0.3) + min(30, CompletedSessions * 3) + (Verified ? 10 : 0) - (ExpiredRequests * 5)
    const allProviders = db.prepare(`
      SELECT u.id, u.rating, u.sessions_completed, u.verified,
             (SELECT COUNT(*) FROM consultation_requests WHERE provider_id = u.id) as req_total,
             (SELECT COUNT(*) FROM consultation_requests WHERE provider_id = u.id AND (accepted_at IS NOT NULL OR declined_at IS NOT NULL OR status IN ('ACCEPTED', 'DECLINED', 'PAID', 'COMPLETED'))) as req_answered,
             (SELECT COUNT(*) FROM consultation_requests WHERE provider_id = u.id AND status = 'EXPIRED') as req_expired
      FROM users u
      WHERE u.role = 'provider' AND COALESCE(u.is_suspended, 0) = 0
    `).all();

    const scoredProviders = allProviders.map(p => {
      const pTotal = Number(p.req_total || 0);
      const pAnswered = Number(p.req_answered || 0);
      const pExpired = Number(p.req_expired || 0);
      const pRate = pTotal > 0 ? (pAnswered / pTotal) * 100 : 100;
      const ratingScore = (Number(p.rating || 5.0)) * 20;
      const rateScore = pRate * 0.3;
      const sessionScore = Math.min(30, (Number(p.sessions_completed || 0)) * 3);
      const verifiedScore = p.verified ? 10 : 0;
      const penalty = pExpired * 5;
      const totalScore = ratingScore + rateScore + sessionScore + verifiedScore - penalty;
      return { id: p.id, score: totalScore };
    }).sort((a, b) => b.score - a.score);

    const rankIndex = scoredProviders.findIndex(p => p.id === userId);
    const platformRank = rankIndex >= 0 ? rankIndex + 1 : 1;
    const totalRanked = Math.max(1, scoredProviders.length);

    const currentProviderUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const userScore = scoredProviders.find(p => p.id === userId)?.score || 100;
    const tier = userScore >= 120 ? 'Platinum Tier' : (userScore >= 90 ? 'Gold Tier' : 'Silver Tier');

    const providerObj = {
      ...(currentProviderUser ? sanitizeUser(currentProviderUser) : req.user),
      response_rate: `${responseRate}%`,
      response_time: responseTimeText,
      platform_ranking: {
        rank: platformRank,
        total_ranked: totalRanked,
        rank_score: Math.round(userScore),
        tier,
        methodology: 'Calculated from 40% client review rating, 30% request response rate and speed, 20% consultation completions, and 10% verified credentials. Paid placement is strictly prohibited.'
      }
    };

    res.json({
      provider: providerObj,
      activeSession,
      pendingRequests,
      upcomingSessions,
      services: services.map(s => ({
        ...s,
        skills: JSON.parse(s.skills_json || '[]'),
        languages: JSON.parse(s.languages_json || '[]')
      })),
      earnings: {
        total: netEarnings,
        gross: grossEarnings,
        platformFee: platformFee15,
        todayNet,
        todayGross,
        completedSessions: earningsCalc.completed_count || 0,
        totalSessionMinutes: totalMinutesCalc.mins || 0
      },
      completedSessionsBreakdown,
      reviews,
      metrics: {
        responseRate,
        responseTime: responseTimeText,
        ranking: platformRank,
        totalRanked,
        rankingMethodology: 'Calculated from 40% client review rating, 30% request response rate and speed, 20% consultation completions, and 10% verified credentials. Paid placement is strictly prohibited.'
      }
    });
  });

  router.post('/provider/reviews/:id/reply', authMiddleware, (req, res) => {
    if (req.user.role !== 'provider' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only expert providers can reply to reviews.' });
    }

    const { reply } = req.body;
    if (!reply || !reply.trim()) {
      return res.status(400).json({ error: 'Reply text cannot be empty.' });
    }

    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found.' });

    if (review.provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only reply to reviews on your own consultations.' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE reviews SET provider_reply = ?, provider_replied_at = ? WHERE id = ?').run(
      reply.trim(), now, review.id
    );

    const updatedReview = db.prepare('SELECT * FROM reviews WHERE id = ?').get(review.id);

    res.json({
      success: true,
      message: 'Reply saved successfully.',
      provider_reply: reply.trim(),
      provider_replied_at: now,
      review: updatedReview
    });
  });

  router.post('/provider/toggle-availability', authMiddleware, (req, res) => {
    try {
      if (req.user.role !== 'provider' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only expert accounts can toggle availability.' });
      }
      const { available_now } = req.body;
      const targetState = (available_now === undefined || available_now) ? 1 : 0;
      db.prepare(`UPDATE services SET available_now = ? WHERE provider_id = ?`).run(targetState, req.user.id);
      res.json({ success: true, available_now: targetState === 1 });
    } catch (err) {
      console.error('Failed to toggle provider availability:', err);
      res.status(500).json({ error: 'Failed to update availability' });
    }
  });

  // ==========================================
  // EXPLICIT ROLE SWITCHING (Client <-> Expert)
  // ==========================================
  router.post('/auth/switch-role', authMiddleware, (req, res) => {
    const target_role = req.body.target_role || req.body.role;
    if (!target_role || (target_role !== 'client' && target_role !== 'provider')) {
      return res.status(400).json({ error: 'Valid target_role (client or provider) is required.' });
    }
    if (req.user.role === 'admin') {
      return res.status(400).json({ error: 'Admin accounts have permanent administrative privileges.' });
    }
    if (req.user.role === target_role) {
      return res.json({ success: true, message: `Account is already set to ${target_role}.`, user: req.user });
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(target_role, req.user.id);
    const updatedUser = db.prepare('SELECT id, email, username, full_name, role, avatar_url, bio, headline, rating, review_count, sessions_completed, verified, email_verified FROM users WHERE id = ?').get(req.user.id);
    const token = generateToken(updatedUser);

    res.json({
      success: true,
      role: target_role,
      user: updatedUser,
      token,
      message: `Account role successfully switched to ${target_role === 'provider' ? 'Expert' : 'Client'}.`
    });
  });

  // ==========================================
  // EXPERT PORTFOLIO PROJECTS (CRUD)
  // ==========================================
  router.get('/provider/portfolio', authMiddleware, (req, res) => {
    if (req.user.role !== 'provider' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only expert accounts have a portfolio.' });
    }
    const projects = db.prepare('SELECT * FROM portfolio_projects WHERE user_id = ? ORDER BY display_order ASC, created_at DESC').all(req.user.id);
    res.json({
      projects: projects.map(p => ({
        ...p,
        skills: JSON.parse(p.skills_json || '[]')
      }))
    });
  });

  router.post('/provider/portfolio', authMiddleware, (req, res) => {
    if (req.user.role !== 'provider' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only expert accounts can create portfolio projects.' });
    }
    const { title, description = '', skills = [], project_url = '', image_url = '', display_order = 0 } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Project title is required.' });
    }
    const count = db.prepare('SELECT COUNT(*) as count FROM portfolio_projects WHERE user_id = ?').get(req.user.id)?.count || 0;
    if (count >= 20) {
      return res.status(400).json({ error: 'Maximum of 20 portfolio projects permitted per expert.' });
    }

    const projectId = `proj-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO portfolio_projects (id, user_id, title, description, skills_json, project_url, image_url, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      projectId,
      req.user.id,
      title.trim().slice(0, 255),
      (description || '').slice(0, 5000),
      JSON.stringify(Array.isArray(skills) ? skills.slice(0, 15) : []),
      project_url ? project_url.trim().slice(0, 500) : null,
      image_url ? image_url.trim().slice(0, 500) : null,
      Number(display_order) || 0
    );

    const created = db.prepare('SELECT * FROM portfolio_projects WHERE id = ?').get(projectId);
    res.status(201).json({
      success: true,
      project: { ...created, skills: JSON.parse(created.skills_json || '[]') }
    });
  });

  router.put('/provider/portfolio/:id', authMiddleware, (req, res) => {
    const project = db.prepare('SELECT * FROM portfolio_projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Portfolio project not found.' });
    if (project.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to modify this portfolio project.' });
    }

    const { title, description, skills, project_url, image_url, display_order } = req.body;
    db.prepare(`
      UPDATE portfolio_projects
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          skills_json = COALESCE(?, skills_json),
          project_url = COALESCE(?, project_url),
          image_url = COALESCE(?, image_url),
          display_order = COALESCE(?, display_order),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title ? title.trim().slice(0, 255) : null,
      description !== undefined ? String(description).slice(0, 5000) : null,
      skills !== undefined ? JSON.stringify(Array.isArray(skills) ? skills.slice(0, 15) : []) : null,
      project_url !== undefined ? (project_url ? project_url.trim().slice(0, 500) : null) : null,
      image_url !== undefined ? (image_url ? image_url.trim().slice(0, 500) : null) : null,
      display_order !== undefined ? Number(display_order) : null,
      project.id
    );

    const updated = db.prepare('SELECT * FROM portfolio_projects WHERE id = ?').get(project.id);
    res.json({
      success: true,
      project: { ...updated, skills: JSON.parse(updated.skills_json || '[]') }
    });
  });

  router.delete('/provider/portfolio/:id', authMiddleware, (req, res) => {
    const project = db.prepare('SELECT * FROM portfolio_projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Portfolio project not found.' });
    if (project.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to delete this portfolio project.' });
    }

    db.prepare('DELETE FROM portfolio_projects WHERE id = ?').run(project.id);
    res.json({ success: true, message: 'Portfolio project deleted.' });
  });

  router.get('/users/:id/portfolio', (req, res) => {
    const projects = db.prepare('SELECT * FROM portfolio_projects WHERE user_id = ? ORDER BY display_order ASC, created_at DESC').all(req.params.id);
    res.json({
      projects: projects.map(p => ({
        ...p,
        skills: JSON.parse(p.skills_json || '[]')
      }))
    });
  });

  // ==========================================
  // EXPERT PROFILE MANAGEMENT & COMPLETENESS
  // ==========================================
  router.put('/provider/profile', authMiddleware, (req, res) => {
    if (req.user.role !== 'provider' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only expert accounts can update expert profile details.' });
    }

    const { headline, bio, skills, languages, experience_years, education, certifications, default_price_per_minute } = req.body;

    db.prepare(`
      UPDATE users
      SET headline = COALESCE(?, headline),
          bio = COALESCE(?, bio),
          skills_json = COALESCE(?, skills_json),
          languages_json = COALESCE(?, languages_json),
          experience_years = COALESCE(?, experience_years),
          education_json = COALESCE(?, education_json),
          certifications_json = COALESCE(?, certifications_json)
      WHERE id = ?
    `).run(
      headline !== undefined ? String(headline).trim().slice(0, 255) : null,
      bio !== undefined ? String(bio).trim().slice(0, 5000) : null,
      skills !== undefined ? JSON.stringify(Array.isArray(skills) ? skills : []) : null,
      languages !== undefined ? JSON.stringify(Array.isArray(languages) ? languages : ['English']) : null,
      experience_years !== undefined ? Number(experience_years) : null,
      education !== undefined ? JSON.stringify(Array.isArray(education) ? education : []) : null,
      certifications !== undefined ? JSON.stringify(Array.isArray(certifications) ? certifications : []) : null,
      req.user.id
    );

    // If default_price_per_minute is provided, update active services
    if (default_price_per_minute && !isNaN(Number(default_price_per_minute))) {
      db.prepare(`UPDATE services SET price_per_minute = ? WHERE provider_id = ?`).run(Number(default_price_per_minute), req.user.id);
    }

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({
      success: true,
      user: {
        ...updatedUser,
        skills: JSON.parse(updatedUser.skills_json || '[]'),
        languages: JSON.parse(updatedUser.languages_json || '["English"]'),
        education: JSON.parse(updatedUser.education_json || '[]'),
        certifications: JSON.parse(updatedUser.certifications_json || '[]')
      },
      message: 'Expert profile updated successfully.'
    });
  });

  router.get('/users/:id/public-profile', (req, res) => {
    const user = db.prepare(`
      SELECT id, full_name, username, avatar_url, headline, bio, location, country, state_region, city,
             rating, review_count, sessions_completed, verified, response_time, member_since,
             skills_json, languages_json, experience_years, education_json, certifications_json
      FROM users WHERE id = ?
    `).get(req.params.id);

    if (!user) return res.status(404).json({ error: 'Expert not found.' });

    const services = db.prepare(`
      SELECT s.*, c.name as category_name
      FROM services s
      JOIN categories c ON s.category_id = c.id
      WHERE s.provider_id = ? AND s.listing_status = 'active'
      ORDER BY s.is_featured DESC, s.created_at DESC
    `).all(req.params.id);

    const portfolio = db.prepare('SELECT * FROM portfolio_projects WHERE user_id = ? ORDER BY display_order ASC, created_at DESC').all(req.params.id);

    const reviews = db.prepare(`
      SELECT r.id, r.rating, r.comment, r.created_at, c.full_name as client_name, c.avatar_url as client_avatar, srv.title as service_title
      FROM reviews r
      JOIN users c ON r.client_id = c.id
      JOIN services srv ON r.service_id = srv.id
      WHERE r.provider_id = ? AND COALESCE(r.is_hidden, 0) = 0
      ORDER BY r.created_at DESC
      LIMIT 20
    `).all(req.params.id);

    res.json({
      profile: {
        ...user,
        skills: JSON.parse(user.skills_json || '[]'),
        languages: JSON.parse(user.languages_json || '["English"]'),
        education: JSON.parse(user.education_json || '[]'),
        certifications: JSON.parse(user.certifications_json || '[]'),
        services: services.map(s => ({
          ...s,
          skills: JSON.parse(s.skills_json || '[]'),
          languages: JSON.parse(s.languages_json || '[]')
        })),
        portfolio: portfolio.map(p => ({
          ...p,
          skills: JSON.parse(p.skills_json || '[]')
        })),
        reviews
      }
    });
  });

  // ==========================================
  // EXPERT PAYOUT ACCOUNT & WALLET
  // ==========================================
  router.get('/provider/payout-account', authMiddleware, (req, res) => {
    if (req.user.role !== 'provider' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only expert accounts can manage payout details.' });
    }
    const acc = db.prepare('SELECT id, user_id, account_holder_name, account_number_masked, ifsc_code, bank_name, account_type, verification_status, created_at, updated_at FROM expert_bank_accounts WHERE user_id = ?').get(req.user.id);
    res.json({ account: acc || null, payoutAccount: acc || null });
  });

  router.post('/provider/payout-account', authMiddleware, (req, res) => {
    if (req.user.role !== 'provider' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only expert accounts can register bank accounts.' });
    }
    const { account_holder_name, account_number, confirm_account_number, ifsc_code, bank_name, account_type = 'savings' } = req.body;

    if (!account_holder_name || account_holder_name.trim().length < 3) {
      return res.status(400).json({ error: 'Please enter a valid account holder name (minimum 3 characters).' });
    }
    const cleanAccNum = (account_number || '').trim().replace(/\s+/g, '');
    const cleanConfirm = (confirm_account_number || '').trim().replace(/\s+/g, '');
    if (!/^\d{9,18}$/.test(cleanAccNum)) {
      return res.status(400).json({ error: 'Bank account number must be between 9 and 18 digits.' });
    }
    if (confirm_account_number && cleanAccNum !== cleanConfirm) {
      return res.status(400).json({ error: 'Account number confirmation does not match.' });
    }
    const cleanIfsc = (ifsc_code || '').trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      return res.status(400).json({ error: 'Please enter a valid 11-character Indian IFSC code (e.g., HDFC0001234).' });
    }
    if (!bank_name || bank_name.trim().length < 2) {
      return res.status(400).json({ error: 'Please enter a valid bank name.' });
    }

    const last4 = cleanAccNum.slice(-4);
    const masked = `•••• •••• •••• ${last4}`;
    const id = `bank-${uuidv4().slice(0, 8)}`;

    db.prepare(`
      INSERT INTO expert_bank_accounts (
        id, user_id, account_holder_name, account_number_last4, account_number_masked,
        ifsc_code, bank_name, account_type, verification_status, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_verification', CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        account_holder_name = excluded.account_holder_name,
        account_number_last4 = excluded.account_number_last4,
        account_number_masked = excluded.account_number_masked,
        ifsc_code = excluded.ifsc_code,
        bank_name = excluded.bank_name,
        account_type = excluded.account_type,
        verification_status = 'pending_verification',
        updated_at = CURRENT_TIMESTAMP
    `).run(
      id,
      req.user.id,
      account_holder_name.trim().slice(0, 255),
      last4,
      masked,
      cleanIfsc,
      bank_name.trim().slice(0, 255),
      account_type === 'current' ? 'current' : 'savings'
    );

    const saved = db.prepare('SELECT id, user_id, account_holder_name, account_number_masked, ifsc_code, bank_name, account_type, verification_status FROM expert_bank_accounts WHERE user_id = ?').get(req.user.id);
    res.json({
      success: true,
      message: 'Bank account details saved securely. Verification is in progress.',
      account: saved,
      payoutAccount: saved
    });
  });

  router.get('/provider/wallet', authMiddleware, (req, res) => {
    if (req.user.role !== 'provider' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only expert accounts have an earnings wallet.' });
    }

    const commPct = getPlatformCommissionPercent();
    const commRate = commPct / 100;
    const providerRate = (100 - commPct) / 100;

    const earningsCalc = db.prepare(`
      SELECT COALESCE(SUM(p.amount), 0) as total_gross, COUNT(DISTINCT s.id) as completed_sessions
      FROM sessions s
      LEFT JOIN payments p ON s.booking_id = p.reference_id AND p.type = 'session_payment' AND p.status = 'succeeded'
      WHERE s.provider_id = ? AND s.status = 'COMPLETED'
    `).get(req.user.id);

    const grossEarnings = Number(earningsCalc?.total_gross || 0);
    const platformCommission = Number((grossEarnings * commRate).toFixed(2));
    const netEarnings = Number((grossEarnings * providerRate).toFixed(2));

    const userRow = db.prepare('SELECT payout_balance_paise FROM users WHERE id = ?').get(req.user.id);
    const availablePaise = userRow?.payout_balance_paise || Math.round(netEarnings * 100);
    const availableBalance = Number((availablePaise / 100).toFixed(2));

    const transactions = db.prepare(`
      SELECT id, entry_type, amount_paise, balance_type, currency, description, created_at
      FROM financial_ledger
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.id).map(t => ({
      ...t,
      amount_inr: (t.amount_paise / 100).toFixed(2)
    }));

    const bankAccount = db.prepare('SELECT account_number_masked, bank_name, verification_status FROM expert_bank_accounts WHERE user_id = ?').get(req.user.id);

    res.json({
      grossEarnings,
      platformCommission,
      commissionPercent: commPct,
      netEarnings,
      availableBalance,
      pendingBalance: 0,
      totalWithdrawn: 0,
      payoutsEnabled: false,
      payoutStatusNotice: 'Automated marketplace bank transfers are pending merchant transfer onboarding. Available earnings will be disbursed in platform batch settlement distributions.',
      bankAccount: bankAccount || null,
      transactions
    });
  });

  router.post('/provider/payouts/request', authMiddleware, (req, res) => {
    if (req.user.role !== 'provider' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only expert accounts can request payouts.' });
    }
    return res.status(400).json({
      error: 'Direct API withdrawals are currently disabled while marketplace automated transfer onboarding is in review. Your available earnings remain safely credited to your ledger for administrative batch settlement.',
      payouts_enabled: false
    });
  });

  // ==========================================
  // CLIENT LOYALTY REWARDS
  // ==========================================
  router.get('/rewards/me', authMiddleware, (req, res) => {
    const userRow = db.prepare('SELECT reward_points_balance FROM users WHERE id = ?').get(req.user.id);
    const currentPoints = userRow?.reward_points_balance || 0;

    const earnedRow = db.prepare(`SELECT COALESCE(SUM(points), 0) as total FROM reward_points_ledger WHERE user_id = ? AND points > 0`).get(req.user.id);
    const redeemedRow = db.prepare(`SELECT COALESCE(SUM(ABS(points)), 0) as total FROM reward_points_ledger WHERE user_id = ? AND points < 0`).get(req.user.id);

    const history = db.prepare(`
      SELECT id, entry_type, points, status, description, created_at
      FROM reward_points_ledger
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.id);

    const threshold = 1000;
    const progressPercent = Math.min(100, Math.floor(((currentPoints % threshold) / threshold) * 100));
    const eligibleCredits = Math.floor(currentPoints / threshold);

    res.json({
      availablePoints: currentPoints,
      reward_points_balance: currentPoints,
      lifetimeEarned: earnedRow?.total || 0,
      lifetimeRedeemed: redeemedRow?.total || 0,
      redemptionThreshold: threshold,
      redemption_threshold: threshold,
      freeConsultationMinutesPerRedemption: 5,
      free_minutes: 5,
      can_redeem: currentPoints >= threshold,
      progressPercent: currentPoints >= threshold ? 100 : progressPercent,
      eligibleCredits,
      pointsNeededForNextCredit: Math.max(0, threshold - (currentPoints % threshold)),
      history
    });
  });

  // ==========================================
  // ADMIN REWARDS & FINANCIAL LEDGER
  // ==========================================
  router.get('/admin/rewards/settings', adminAuthMiddleware, (req, res) => {
    const keys = ['reward_points_per_minute', 'reward_redemption_threshold', 'reward_free_minutes', 'reward_max_credit_inr', 'payouts_enabled'];
    const settings = {};
    for (const k of keys) {
      const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(k);
      settings[k] = row ? row.value : null;
    }
    res.json({ settings });
  });

  router.put('/admin/rewards/settings', adminAuthMiddleware, (req, res) => {
    const { reward_points_per_minute, reward_redemption_threshold, reward_free_minutes, reward_max_credit_inr, payouts_enabled } = req.body;
    const updateStmt = db.prepare(`
      INSERT INTO platform_settings (key, value, description)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    if (reward_points_per_minute !== undefined) updateStmt.run('reward_points_per_minute', String(reward_points_per_minute), 'Points awarded per completed consultation minute');
    if (reward_redemption_threshold !== undefined) updateStmt.run('reward_redemption_threshold', String(reward_redemption_threshold), 'Points required for 5-minute reward credit');
    if (reward_free_minutes !== undefined) updateStmt.run('reward_free_minutes', String(reward_free_minutes), 'Minutes credited per reward redemption');
    if (reward_max_credit_inr !== undefined) updateStmt.run('reward_max_credit_inr', String(reward_max_credit_inr), 'Maximum INR credit value for 5-minute reward session');
    if (payouts_enabled !== undefined) updateStmt.run('payouts_enabled', String(payouts_enabled), 'Automated provider payouts flag');

    res.json({ success: true, message: 'Reward settings updated successfully.' });
  });

  router.get('/admin/rewards/ledger', adminAuthMiddleware, (req, res) => {
    const entries = db.prepare(`
      SELECT r.*, u.full_name as user_name, u.email as user_email
      FROM reward_points_ledger r
      JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
      LIMIT 100
    `).all();
    res.json({ entries });
  });

  router.get('/admin/financial/ledger', adminAuthMiddleware, (req, res) => {
    const entries = db.prepare(`
      SELECT f.*, u.full_name as user_name, u.email as user_email
      FROM financial_ledger f
      JOIN users u ON f.user_id = u.id
      ORDER BY f.created_at DESC
      LIMIT 100
    `).all();
    res.json({ entries });
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

  // Create Razorpay Order for Opportunity Application Entry Fee (INR ₹)
  router.post('/opportunities/:id/create-application-order', authMiddleware, async (req, res) => {
    const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });
    if (opp.status !== 'open') {
      return res.status(400).json({ error: 'This opportunity is no longer accepting applications.' });
    }
    if (opp.creator_id === req.user.id) {
      return res.status(400).json({ error: 'You cannot apply to an opportunity you created.' });
    }

    const existing = db.prepare('SELECT id FROM applications WHERE opportunity_id = ? AND provider_id = ?').get(opp.id, req.user.id);
    if (existing) {
      return res.status(400).json({ error: 'You have already submitted an application for this opportunity.' });
    }

    const isFree = (opp.pricing_type || 'free') === 'free' || Number(opp.entry_fee_inr || opp.entry_fee_usd || 0) <= 0;
    if (isFree) {
      return res.json({
        is_free: true,
        amount: 0.00,
        amount_paise: 0,
        currency: CURRENCY,
        key_id: getEffectiveRazorpayCredentials().keyId || 'rzp_live_placeholder',
        opportunity_id: opp.id
      });
    }

    const appFee = Number(opp.entry_fee_inr || opp.entry_fee_usd || 2.00);
    const amountInPaise = toPaise(appFee);

    try {
      const order = await createRazorpayNativeOrder({
        amountPaise: amountInPaise,
        receipt: `app_${opp.id.slice(0, 8)}_${Date.now()}`,
        notes: {
          opportunity_id: opp.id,
          provider_id: req.user.id
        }
      });

      return res.json({
        is_free: false,
        order_id: order.order_id,
        amount: appFee,
        amount_paise: amountInPaise,
        currency: order.currency,
        key_id: order.key_id,
        opportunity_id: opp.id
      });
    } catch (err) {
      console.error('[Opportunity Application Order Error]', err.message);
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({ error: err.message || 'Payment could not be initialized. Please try again.' });
    }
  });

  // Verify Razorpay Payment and Submit Application for Opportunity Entry Fee
  router.post('/opportunities/:id/verify-application-payment', authMiddleware, async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, message, relevant_experience, proposed_rate, availability } = req.body;
    const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });
    if (opp.status !== 'open') {
      return res.status(400).json({ error: 'This opportunity is no longer accepting applications.' });
    }
    if (opp.creator_id === req.user.id) {
      return res.status(400).json({ error: 'You cannot apply to an opportunity you created.' });
    }
    if (!message || !relevant_experience || !availability) {
      return res.status(400).json({ error: 'Message, experience, and availability are required.' });
    }

    const existing = db.prepare('SELECT id FROM applications WHERE opportunity_id = ? AND provider_id = ?').get(opp.id, req.user.id);
    if (existing) {
      return res.status(400).json({ error: 'You have already submitted an application for this opportunity.' });
    }

    // Verify HMAC SHA-256 signature
    const resolvedCredentials = getEffectiveRazorpayCredentials();
    const rawSecret = resolvedCredentials.keySecret || (process.env.NODE_ENV !== 'production' ? 'dev_razorpay_secret_key_12345' : null);
    const keySecret = rawSecret ? rawSecret.trim().replace(/^["']|["']$/g, '') : null;
    if (!keySecret) {
      return res.status(500).json({ error: 'Server configuration error: RAZORPAY_KEY_SECRET is required.' });
    }
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

    // Replay Protection & Idempotency check
    const existingPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(razorpay_payment_id);
    if (existingPayment) {
      return res.status(409).json({ error: 'Payment ID has already been processed for this or another transaction.' });
    }

    const appFee = Number(opp.entry_fee_inr || opp.entry_fee_usd || 2.00);
    const appId = `app-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
      VALUES (?, ?, 'application_fee', ?, 'succeeded', ?, ?)
    `).run(
      razorpay_payment_id,
      req.user.id,
      appFee,
      appId,
      JSON.stringify({
        opportunity_id: opp.id,
        opportunity_title: opp.title,
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
        currency: CURRENCY
      })
    );

    db.prepare(`
      INSERT INTO applications (id, opportunity_id, provider_id, message, relevant_experience, proposed_rate, availability, status, payment_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(appId, opp.id, req.user.id, message, relevant_experience, proposed_rate ? Number(proposed_rate) : null, availability, razorpay_payment_id);

    // Notify opportunity creator
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, 'New Application Received', ?, 'info', ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      opp.creator_id,
      `${req.user.full_name} applied for "${opp.title}".`,
      `/opportunities`
    );

    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
    res.status(201).json({
      success: true,
      application_id: appId,
      application,
      payment_id: razorpay_payment_id,
      message: 'Application submitted and entry fee verified successfully!'
    });
  });

  // Direct application endpoint with authoritative server-side fee verification
  router.post('/opportunities/:id/apply', authMiddleware, (req, res) => {
    const { message, relevant_experience, proposed_rate, availability, payment_id } = req.body;
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

    const isFree = (opp.pricing_type || 'free') === 'free' || Number(opp.entry_fee_usd || 0) <= 0;
    let verifiedPaymentId = null;

    if (!isFree) {
      if (!payment_id) {
        return res.status(402).json({
          error: `This opportunity requires a verified application fee of $${Number(opp.entry_fee_usd).toFixed(2)}. Please complete payment before submitting.`
        });
      }
      const payment = db.prepare(`
        SELECT * FROM payments
        WHERE id = ? AND user_id = ? AND type = 'application_fee' AND status = 'succeeded'
      `).get(payment_id, req.user.id);

      if (!payment || Number(payment.amount) < Number(opp.entry_fee_usd)) {
        return res.status(402).json({
          error: 'Valid payment record for the required application fee was not found or payment amount was insufficient.'
        });
      }
      verifiedPaymentId = payment.id;
    }

    const id = `app-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO applications (id, opportunity_id, provider_id, message, relevant_experience, proposed_rate, availability, payment_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, opp.id, req.user.id, message, relevant_experience, proposed_rate ? Number(proposed_rate) : null, availability, verifiedPaymentId);

    // Notify opportunity creator
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, 'New Application Received', ?, 'info', ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      opp.creator_id,
      `${req.user.full_name} applied for "${opp.title}".`,
      `/opportunities`
    );

    res.status(201).json({ success: true, message: 'Your application has been submitted successfully.' });
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
    const totalJobs = db.prepare('SELECT COUNT(*) as count FROM jobs').get().count;
    const openJobs = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'published' AND (application_deadline IS NULL OR application_deadline >= CURRENT_TIMESTAMP)").get().count;
    const totalCompanies = db.prepare("SELECT COUNT(*) as count FROM companies WHERE status = 'active'").get().count;
    const totalJobApplications = db.prepare('SELECT COUNT(*) as count FROM job_applications').get().count;

    const platformTakePercent = getPlatformCommissionPercent();
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
        currency: CURRENCY,
        currency_symbol: CURRENCY_SYMBOL,
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
        totalJobs,
        openJobs,
        totalCompanies,
        totalJobApplications,
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
      financial: {
        total_spent: Number(financial?.total_spent) || 0,
        total_earned: Number(financial?.total_earned) || 0
      }
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

    // Auto-generate or validate case-insensitive permanent username
    const explicitUsername = req.body.username && req.body.username.trim();
    let username = '';
    if (explicitUsername) {
      username = explicitUsername.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      if (username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
      }
      const existingUserWithUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(username);
      if (existingUserWithUsername) {
        return res.status(409).json({ error: 'This username is already taken. Please choose another username.' });
      }
    } else {
      username = (full_name.trim() || cleanEmail.split('@')[0])
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '');
      if (!username) username = `user_${uuidv4().slice(0, 6)}`;
      let candidate = username;
      let suffix = 100;
      while (db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(candidate)) {
        candidate = `${username}_${suffix++}`;
      }
      username = candidate;
    }

    const userId = `usr-${uuidv4().slice(0, 8)}`;
    const passwordHash = bcrypt.hashSync(password, 10);
    const avatarUrl = req.body.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(full_name.trim())}`;
    const assignedRole = role === 'provider' ? 'provider' : (role === 'admin' ? 'admin' : 'client');

    try {
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
    } catch (insertErr) {
      const errStr = (insertErr.message || '').toLowerCase();
      if (errStr.includes('unique') || insertErr.code === '23505') {
        if (errStr.includes('email') || errStr.includes('idx_users_email_lower')) {
          return res.status(409).json({ error: 'A user with this email address already exists.' });
        }
        return res.status(409).json({ error: 'This username is already taken. Please choose another username.' });
      }
      throw insertErr;
    }

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

    res.json({ success: true, is_suspended: suspended ? 1 : 0, suspended: suspended ? 1 : 0 });
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
      price_per_minute: Number(s.price_per_minute) || 0,
      bookings_count: Number(s.bookings_count) || 0,
      views_count: Number(s.views_count) || 0,
      is_featured: Number(s.is_featured) === 1 ? 1 : 0,
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
      ORDER BY c.sort_order ASC, c.name ASC
    `).all().map(c => {
      let subcats = [];
      try {
        subcats = JSON.parse(c.subcategories_json || '[]');
      } catch (e) {
        subcats = [];
      }
      return {
        ...c,
        sort_order: Number(c.sort_order) || 0,
        services_count: Number(c.services_count) || 0,
        subcategories: Array.isArray(subcats) ? subcats : []
      };
    });
    res.json({ categories });
  });

  router.post('/admin/categories', adminAuthMiddleware, (req, res) => {
    const { name, slug, icon = 'Tag', description = '', sort_order = 99, subcategories = [], image_url = '', meta_title = '', meta_description = '', is_regulated = 0 } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug are required.' });

    const cleanSlug = String(slug).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(cleanSlug);
    if (existing) {
      return res.status(409).json({ error: `Category with slug "${cleanSlug}" already exists.` });
    }

    const id = `cat-${uuidv4().slice(0, 8)}`;
    const subcatsJson = JSON.stringify(Array.isArray(subcategories) ? subcategories : []);

    db.prepare(`
      INSERT INTO categories (id, slug, name, icon, description, sort_order, active, subcategories_json, image_url, meta_title, meta_description, is_regulated)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(
      id, cleanSlug, String(name).trim(), String(icon || 'Tag').trim(),
      String(description || '').trim(), Number(sort_order) || 0, subcatsJson,
      String(image_url || '').trim(), String(meta_title || '').trim(),
      String(meta_description || '').trim(), is_regulated ? 1 : 0
    );

    logAuditAction(req.user, 'CATEGORY_CREATED', 'category', id, { name, slug: cleanSlug });
    const created = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    res.status(201).json({ success: true, id, category: created });
  });

  router.put('/admin/categories/reorder', adminAuthMiddleware, (req, res) => {
    const order = req.body.order || req.body.categories;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Order must be an array of { id, sort_order }.' });
    }

    const updateStmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
    for (const item of order) {
      if (item.id && typeof item.sort_order === 'number') {
        updateStmt.run(item.sort_order, item.id);
      }
    }

    logAuditAction(req.user, 'CATEGORIES_REORDERED', 'category', 'all', { count: order.length });
    res.json({ success: true, message: 'Categories order updated successfully.' });
  });

  router.put('/admin/categories/:id', adminAuthMiddleware, (req, res) => {
    if (req.params.id === 'reorder') return res.status(400).json({ error: 'Invalid category ID' });
    const { name, slug, icon, description, sort_order, subcategories, image_url, active, meta_title, meta_description, is_regulated } = req.body;
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });

    const newSlug = slug ? String(slug).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') : cat.slug;
    if (newSlug !== cat.slug) {
      const existing = db.prepare('SELECT id FROM categories WHERE slug = ? AND id != ?').get(newSlug, cat.id);
      if (existing) {
        return res.status(409).json({ error: `Category with slug "${newSlug}" already exists.` });
      }
    }

    const subcatsJson = subcategories !== undefined
      ? JSON.stringify(Array.isArray(subcategories) ? subcategories : [])
      : cat.subcategories_json;

    db.prepare(`
      UPDATE categories
      SET name = COALESCE(?, name),
          slug = ?,
          icon = COALESCE(?, icon),
          description = COALESCE(?, description),
          sort_order = COALESCE(?, sort_order),
          active = COALESCE(?, active),
          subcategories_json = ?,
          image_url = COALESCE(?, image_url),
          meta_title = COALESCE(?, meta_title),
          meta_description = COALESCE(?, meta_description),
          is_regulated = COALESCE(?, is_regulated)
      WHERE id = ?
    `).run(
      name ? String(name).trim() : null,
      newSlug,
      icon ? String(icon).trim() : null,
      description !== undefined ? String(description).trim() : null,
      sort_order !== undefined ? Number(sort_order) : null,
      active !== undefined ? (active ? 1 : 0) : null,
      subcatsJson,
      image_url !== undefined ? String(image_url).trim() : null,
      meta_title !== undefined ? String(meta_title).trim() : null,
      meta_description !== undefined ? String(meta_description).trim() : null,
      is_regulated !== undefined ? (is_regulated ? 1 : 0) : null,
      cat.id
    );

    logAuditAction(req.user, 'CATEGORY_UPDATED', 'category', cat.id, req.body);
    const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id);
    res.json({ success: true, category: updated });
  });

  router.delete('/admin/categories/:id', adminAuthMiddleware, (req, res) => {
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });

    const serviceCountResult = db.prepare('SELECT COUNT(*) as count FROM services WHERE category_id = ?').get(cat.id);
    const serviceCount = serviceCountResult ? (Number(serviceCountResult.count) || 0) : 0;

    if (serviceCount > 0) {
      db.prepare('UPDATE categories SET active = 0 WHERE id = ?').run(cat.id);
      logAuditAction(req.user, 'CATEGORY_SOFT_DEACTIVATED', 'category', cat.id, {
        name: cat.name,
        service_count: serviceCount,
        reason: 'Existing services reference this category. Deactivated instead of deleted to protect listing integrity.'
      });
      return res.json({
        success: true,
        soft_deleted: true,
        message: `Category "${cat.name}" has ${serviceCount} associated services. It has been deactivated instead of permanently deleted to preserve catalog integrity.`
      });
    }

    db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
    logAuditAction(req.user, 'CATEGORY_DELETED', 'category', cat.id, { name: cat.name });
    res.json({ success: true, message: `Category "${cat.name}" deleted successfully.` });
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

  // Helper for automated Razorpay refund API dispatch
  async function dispatchRazorpayRefund({ paymentId, amountPaise, reason = 'Administrative cancellation', notes = {} }) {
    const resolved = getEffectiveRazorpayCredentials();
    const keyId = resolved.keyId;
    const keySecret = resolved.keySecret;

    if (process.env.NODE_ENV === 'production' && resolved.isConfigured) {
      try {
        const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: amountPaise,
            notes: {
              reason,
              ...notes
            }
          })
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          console.warn(`[Razorpay Refund] Gateway returned ${res.status}:`, errJson.error?.description || res.statusText);
          return { success: false, error: errJson.error?.description || 'Gateway refund error', simulated: false };
        }
        const data = await res.json();
        return { success: true, refundId: data.id, status: data.status, raw: data, simulated: false };
      } catch (err) {
        console.error('[Razorpay Refund Exception]:', err.message);
        return { success: false, error: err.message, simulated: false };
      }
    } else {
      return {
        success: true,
        refundId: `rfnd_sim_${uuidv4().replace(/-/g, '').slice(0, 14)}`,
        status: 'processed',
        simulated: true
      };
    }
  }

  router.patch('/admin/bookings/:id/cancel', adminAuthMiddleware, async (req, res) => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?").run(booking.id);
    db.prepare("UPDATE sessions SET status = 'CANCELLED' WHERE booking_id = ?").run(booking.id);
    db.prepare("UPDATE consultation_requests SET status = 'CANCELLED' WHERE id = ?").run(booking.id);

    // Process gateway refund if payment exists
    let refundResult = null;
    if (booking.payment_id) {
      const amountPaise = Math.round(Number(booking.total_price) * 100);
      refundResult = await dispatchRazorpayRefund({
        paymentId: booking.payment_id,
        amountPaise,
        reason: req.body.reason || 'Administrative cancellation / dispute resolution',
        notes: { booking_id: booking.id, client_id: booking.client_id }
      });

      // Update original payment status to refunded
      try {
        db.prepare("UPDATE payments SET status = 'refunded' WHERE id = ?").run(booking.payment_id);
      } catch (e) {
        // Continue
      }
    }

    // Process ledger refund record
    const refundId = `ref-adm-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
      VALUES (?, ?, 'refund', ?, 'succeeded', ?, ?)
    `).run(
      refundId,
      booking.client_id,
      booking.total_price,
      booking.id,
      JSON.stringify({
        reason: req.body.reason || 'Administrative cancellation / dispute resolution',
        gateway_refund: refundResult,
        original_payment_id: booking.payment_id || null
      })
    );

    // Reconcile financial ledger & claw back expert earnings if previously completed
    const existingEarning = db.prepare(`
      SELECT * FROM financial_ledger
      WHERE (booking_id = ? OR session_id IN (SELECT id FROM sessions WHERE booking_id = ?))
        AND entry_type = 'net_earning'
    `).get(booking.id, booking.id);

    if (existingEarning) {
      const existingReversal = db.prepare(`
        SELECT id FROM financial_ledger
        WHERE (booking_id = ? OR session_id = ?) AND entry_type = 'refund_reversal'
      `).get(booking.id, existingEarning.session_id);

      if (!existingReversal) {
        const reversalId = `fin-rev-${uuidv4().slice(0, 8)}`;
        const netPaise = existingEarning.amount_paise;
        db.prepare(`
          INSERT INTO financial_ledger (id, user_id, session_id, booking_id, entry_type, amount_paise, balance_type, currency, description, metadata_json)
          VALUES (?, ?, ?, ?, 'refund_reversal', ?, 'available', 'INR', ?, ?)
        `).run(
          reversalId,
          booking.provider_id,
          existingEarning.session_id,
          booking.id,
          -netPaise,
          `Earnings clawback due to refunded consultation`,
          JSON.stringify({ original_ledger_id: existingEarning.id, refund_id: refundId })
        );

        db.prepare(`
          UPDATE users SET payout_balance_paise = MAX(0, COALESCE(payout_balance_paise, 0) - ?) WHERE id = ?
        `).run(netPaise, booking.provider_id);
      }
    }

    // Restore redeemed reward points to client
    const redeemedRecord = db.prepare(`
      SELECT * FROM reward_points_ledger
      WHERE booking_id = ? AND entry_type = 'redeemed_consultation'
    `).get(booking.id);

    if (redeemedRecord) {
      const alreadyRestored = db.prepare(`
        SELECT id FROM reward_points_ledger
        WHERE booking_id = ? AND entry_type = 'refund_restoration'
      `).get(booking.id);

      if (!alreadyRestored) {
        db.prepare('UPDATE users SET reward_points_balance = reward_points_balance + 1000 WHERE id = ?').run(booking.client_id);
        const rwdRestId = `rwd-rst-${uuidv4().slice(0, 8)}`;
        db.prepare(`
          INSERT INTO reward_points_ledger (id, user_id, session_id, booking_id, entry_type, points, status, description)
          VALUES (?, ?, NULL, ?, 'refund_restoration', 1000, 'available', ?)
        `).run(rwdRestId, booking.client_id, booking.id, `Restored 1,000 reward points due to refunded consultation`);
      }
    }

    // Revoke earned reward points if any
    const earnedRecord = db.prepare(`
      SELECT * FROM reward_points_ledger
      WHERE booking_id = ? AND entry_type = 'earned_session'
    `).get(booking.id);

    if (earnedRecord) {
      const alreadyRevoked = db.prepare(`
        SELECT id FROM reward_points_ledger
        WHERE booking_id = ? AND entry_type = 'earned_revocation'
      `).get(booking.id);

      if (!alreadyRevoked) {
        const pts = earnedRecord.points;
        db.prepare('UPDATE users SET reward_points_balance = MAX(0, reward_points_balance - ?) WHERE id = ?').run(pts, booking.client_id);
        const rwdRevId = `rwd-rev-${uuidv4().slice(0, 8)}`;
        db.prepare(`
          INSERT INTO reward_points_ledger (id, user_id, session_id, booking_id, entry_type, points, status, description)
          VALUES (?, ?, NULL, ?, 'earned_revocation', -?, 'available', ?)
        `).run(rwdRevId, booking.client_id, booking.id, pts, `Revoked ${pts} reward points due to refunded consultation`);
      }
    }

    // Notify client and expert
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, 'Booking Cancelled & Refunded', ?, 'info', ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      booking.client_id,
      `Your consultation #${booking.id} was cancelled by administration and ₹${booking.total_price} refunded.`,
      '/client'
    );

    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, 'Booking Cancelled & Refunded', ?, 'warning', ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      booking.provider_id,
      `Consultation #${booking.id} was cancelled and refunded. Ledger adjusted accordingly.`,
      '/provider'
    );

    logAuditAction(req.user, 'BOOKING_CANCELLED_REFUNDED', 'booking', booking.id, {
      amount: booking.total_price,
      client_id: booking.client_id,
      gateway_refund_id: refundResult?.refundId || null
    });

    res.json({
      success: true,
      message: 'Booking cancelled and client refunded.',
      refundId,
      gatewayRefund: refundResult
    });
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

    const platformTakePercent = getPlatformCommissionPercent();
    const payments = rawPayments.map(p => {
      const numAmount = Number(p.amount) || 0;
      let platform_fee = 0;
      let expert_amount = 0;
      if (p.type === 'listing_fee') {
        platform_fee = numAmount;
        expert_amount = 0;
      } else if (p.type === 'session_payment') {
        platform_fee = Number((numAmount * (platformTakePercent / 100)).toFixed(2));
        expert_amount = Number((numAmount * ((100 - platformTakePercent) / 100)).toFixed(2));
      } else if (p.type === 'refund') {
        platform_fee = -Number((numAmount * (platformTakePercent / 100)).toFixed(2));
        expert_amount = -Number((numAmount * ((100 - platformTakePercent) / 100)).toFixed(2));
      }

      return {
        ...p,
        amount: numAmount,
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
      ORDER BY o.is_featured DESC, o.created_at DESC
    `).all();
    const normalizedOpps = opps.map(o => {
      let skills = [];
      let languages = [];
      try { skills = JSON.parse(o.skills_json || '[]'); } catch (e) { skills = []; }
      try { languages = JSON.parse(o.languages_json || '[]'); } catch (e) { languages = ['English']; }
      return {
        ...o,
        budget: Number(o.budget) || 0,
        entry_fee_usd: Number(o.entry_fee_usd) || 0,
        entry_fee_inr: Number(o.entry_fee_inr || o.entry_fee_usd) || 0,
        duration_minutes: Number(o.duration_minutes) || 0,
        applications_count: Number(o.applications_count) || 0,
        applicant_count: Number(o.applications_count) || 0,
        is_featured: Number(o.is_featured) || 0,
        pricing_type: o.pricing_type || (Number(o.entry_fee_usd) > 0 ? 'paid' : 'free'),
        skills: Array.isArray(skills) ? skills : [],
        languages: Array.isArray(languages) ? languages : ['English']
      };
    });
    res.json({ opportunities: normalizedOpps, count: normalizedOpps.length });
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
      pricing_type = 'free',
      entry_fee_usd = 0.00,
      is_featured = 0,
      skills = [],
      requirements = '',
      attachment_url = '',
      visibility = 'public',
      start_date = null,
      end_date = null,
      status = 'open'
    } = req.body;

    if (!title || !category_id || !description) {
      return res.status(400).json({ error: 'Title, category, and description are required.' });
    }

    const cleanPricingType = pricing_type === 'paid' ? 'paid' : 'free';
    const cleanFee = cleanPricingType === 'paid' ? (Number(entry_fee_usd) || 0.00) : 0.00;
    const id = `opp-${uuidv4().slice(0, 8)}`;

    db.prepare(`
      INSERT INTO opportunities (
        id, creator_id, title, short_description, description, category_id, subcategory,
        location, languages_json, duration_minutes, budget, deadline, pricing_type,
        entry_fee_usd, is_featured, skills_json, requirements, attachment_url, visibility,
        start_date, end_date, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.user.id,
      title.trim(),
      short_description.trim() || title.trim(),
      description.trim(),
      category_id,
      subcategory,
      location,
      JSON.stringify(Array.isArray(languages) ? languages : ['English']),
      Number(duration_minutes) || 45,
      Number(budget) || 75,
      deadline || null,
      cleanPricingType,
      cleanFee,
      is_featured ? 1 : 0,
      JSON.stringify(Array.isArray(skills) ? skills : []),
      requirements ? requirements.trim() : '',
      attachment_url ? attachment_url.trim() : '',
      visibility === 'unlisted' ? 'unlisted' : 'public',
      start_date || null,
      end_date || null,
      status || 'open'
    );

    logAuditAction(req.user, 'OPPORTUNITY_CREATED_BY_ADMIN', 'opportunity', id, { title, budget, pricing_type: cleanPricingType, entry_fee_usd: cleanFee });
    const created = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
    res.status(201).json({ success: true, opportunity: created });
  });

  router.patch('/admin/opportunities/:id', adminAuthMiddleware, (req, res) => {
    const {
      status, title, description, short_description, budget, duration_minutes,
      category_id, subcategory, location, pricing_type, entry_fee_usd, entry_fee_inr, is_featured,
      skills, requirements, attachment_url, visibility, deadline, start_date, end_date
    } = req.body;

    const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });

    const cleanPricingType = pricing_type !== undefined ? (pricing_type === 'paid' ? 'paid' : 'free') : opp.pricing_type;
    const cleanFee = entry_fee_usd !== undefined ? Number(entry_fee_usd) : (entry_fee_inr !== undefined ? Number(entry_fee_inr) : opp.entry_fee_usd);
    const skillsJson = skills !== undefined ? JSON.stringify(Array.isArray(skills) ? skills : []) : opp.skills_json;

    db.prepare(`
      UPDATE opportunities SET
        status = COALESCE(?, status),
        title = COALESCE(?, title),
        category_id = COALESCE(?, category_id),
        description = COALESCE(?, description),
        short_description = COALESCE(?, short_description),
        budget = COALESCE(?, budget),
        duration_minutes = COALESCE(?, duration_minutes),
        subcategory = COALESCE(?, subcategory),
        location = COALESCE(?, location),
        pricing_type = ?,
        entry_fee_usd = ?,
        is_featured = COALESCE(?, is_featured),
        skills_json = ?,
        requirements = COALESCE(?, requirements),
        attachment_url = COALESCE(?, attachment_url),
        visibility = COALESCE(?, visibility),
        deadline = COALESCE(?, deadline),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date)
      WHERE id = ?
    `).run(
      status || null,
      title ? title.trim() : null,
      category_id || null,
      description ? description.trim() : null,
      short_description ? short_description.trim() : null,
      budget !== undefined ? Number(budget) : null,
      duration_minutes !== undefined ? Number(duration_minutes) : null,
      subcategory || null,
      location || null,
      cleanPricingType,
      cleanFee,
      is_featured !== undefined ? (is_featured ? 1 : 0) : null,
      skillsJson,
      requirements !== undefined ? String(requirements).trim() : null,
      attachment_url !== undefined ? String(attachment_url).trim() : null,
      visibility || null,
      deadline || null,
      start_date || null,
      end_date || null,
      opp.id
    );

    logAuditAction(req.user, 'OPPORTUNITY_UPDATED', 'opportunity', opp.id, req.body);
    const updated = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(opp.id);
    res.json({ success: true, opportunity: updated });
  });

  router.post('/admin/opportunities/:id/duplicate', adminAuthMiddleware, (req, res) => {
    const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });

    const newId = `opp-${uuidv4().slice(0, 8)}`;
    const newTitle = `${opp.title} (Copy)`;

    db.prepare(`
      INSERT INTO opportunities (
        id, creator_id, title, short_description, description, category_id, subcategory,
        location, languages_json, duration_minutes, budget, deadline, pricing_type,
        entry_fee_usd, is_featured, skills_json, requirements, attachment_url, visibility,
        start_date, end_date, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
    `).run(
      newId,
      req.user.id,
      newTitle,
      opp.short_description || newTitle,
      opp.description,
      opp.category_id,
      opp.subcategory,
      opp.location,
      opp.languages_json,
      opp.duration_minutes,
      opp.budget,
      opp.deadline,
      opp.pricing_type || 'free',
      opp.entry_fee_usd || 0.00,
      opp.is_featured || 0,
      opp.skills_json || '[]',
      opp.requirements || '',
      opp.attachment_url || '',
      opp.visibility || 'public',
      opp.start_date || null,
      opp.end_date || null
    );

    logAuditAction(req.user, 'OPPORTUNITY_DUPLICATED', 'opportunity', newId, { source_id: opp.id, title: newTitle });
    const created = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(newId);
    res.status(201).json({ success: true, opportunity: created, message: 'Opportunity duplicated successfully.' });
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
    const paymentDiag = getRazorpaySafeDiagnostics(process.env, getDatabasePaymentSettings());
    res.json({ settings: settingsMap, payment_diagnostics: paymentDiag });
  });

  // 14b. Payment Gateway Diagnostics (Admin safe probe)
  router.get('/admin/payments/diagnostics', adminAuthMiddleware, (req, res) => {
    const diag = getRazorpaySafeDiagnostics(process.env, getDatabasePaymentSettings());
    res.json({ success: true, diagnostics: diag });
  });

  router.put('/admin/settings', adminAuthMiddleware, (req, res) => {
    const {
      platform_name,
      listing_fee_inr,
      listing_fee_usd,
      platform_fee_percent,
      default_response_time,
      payout_schedule,
      logo_url,
      header_navigation,
      header_cta_label,
      header_cta_url,
      razorpay_key_id,
      razorpay_key_secret,
      razorpay_webhook_secret
    } = req.body;

    const updateStmt = db.prepare(`
      INSERT OR REPLACE INTO platform_settings (key, value, description, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);

    if (platform_name !== undefined) {
      const cleanName = String(platform_name).trim();
      if (!cleanName) {
        return res.status(400).json({ error: 'Site name cannot be empty.' });
      }
      updateStmt.run('platform_name', cleanName, 'The official platform brand name');
    }
    const targetFee = listing_fee_inr !== undefined ? listing_fee_inr : listing_fee_usd;
    if (targetFee !== undefined) {
      updateStmt.run('listing_fee_inr', String(targetFee), 'One-time fee in INR to publish a service listing');
      updateStmt.run('listing_fee_usd', String(targetFee), 'One-time fee to publish a service listing');
      updateStmt.run('currency', CURRENCY, 'Platform base currency');
      updateStmt.run('currency_symbol', CURRENCY_SYMBOL, 'Platform base currency symbol');
    }

    if (platform_fee_percent !== undefined) {
      const currentSetting = db.prepare("SELECT value FROM platform_settings WHERE key = 'platform_fee_percent'").get();
      const currentRate = currentSetting ? currentSetting.value : '15';
      const cleanRate = String(platform_fee_percent).trim();
      updateStmt.run('platform_fee_percent', cleanRate, 'Standard percentage fee taken from completed session payments');
      if (cleanRate !== currentRate) {
        logAuditAction(req.user, 'PLATFORM_COMMISSION_UPDATED', 'platform_settings', 'platform_fee_percent', {
          old_rate_percent: currentRate,
          new_rate_percent: cleanRate,
          note: 'Historical transactions remain immutable. New rate applies only to future completed sessions.'
        });
      }
    }

    if (default_response_time !== undefined) updateStmt.run('default_response_time', default_response_time, 'Target response time for verified providers');
    if (payout_schedule !== undefined) updateStmt.run('payout_schedule', payout_schedule, 'Frequency of expert earnings settlement');
    if (logo_url !== undefined) {
      updateStmt.run('logo_url', String(logo_url).trim(), 'Custom brand logo image URL');
    }
    if (header_cta_label !== undefined) {
      const cleanLabel = String(header_cta_label).trim();
      if (!cleanLabel) return res.status(400).json({ error: 'Header CTA label cannot be empty.' });
      updateStmt.run('header_cta_label', cleanLabel, 'Header call-to-action button label');
    }
    if (header_cta_url !== undefined) {
      const cleanUrl = String(header_cta_url).trim();
      if (!cleanUrl) return res.status(400).json({ error: 'Header CTA destination URL cannot be empty.' });
      if (cleanUrl.toLowerCase().startsWith('/admin')) {
        return res.status(400).json({ error: 'Header CTA destination cannot point to administration routes.' });
      }
      updateStmt.run('header_cta_url', cleanUrl, 'Header call-to-action destination URL');
    }
    if (header_navigation !== undefined) {
      let navArr = header_navigation;
      if (typeof navArr === 'string') {
        try {
          navArr = JSON.parse(navArr);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid header_navigation JSON format.' });
        }
      }
      if (!Array.isArray(navArr)) {
        return res.status(400).json({ error: 'header_navigation must be an array of navigation items.' });
      }
      const sanitizedNav = navArr.map((item, idx) => ({
        id: String(item.id || `nav-${Date.now()}-${idx}`),
        label: String(item.label || 'Link').trim(),
        url: String(item.url || '/').trim(),
        order: Number(item.order) || (idx + 1),
        is_visible: item.is_visible !== false,
        is_external: Boolean(item.is_external)
      })).sort((a, b) => a.order - b.order);

      // System route protection: ensure admin routes cannot be injected into public navigation
      for (const item of sanitizedNav) {
        const u = item.url.toLowerCase();
        if (u === '/admin' || u.startsWith('/admin/')) {
          return res.status(400).json({ error: 'Administrative routes cannot be exposed in the public header navigation.' });
        }
      }

      updateStmt.run('header_navigation', JSON.stringify(sanitizedNav), 'header_navigation');
    }

    if (razorpay_key_id !== undefined) {
      const cleanKeyId = String(razorpay_key_id).trim().replace(/^["']|["']$/g, '');
      updateStmt.run('razorpay_key_id', cleanKeyId, 'Razorpay API Key ID');
      logAuditAction(req.user, 'PAYMENT_GATEWAY_CONFIG_UPDATED', 'platform_settings', 'razorpay_key_id', {
        key_configured: Boolean(cleanKeyId),
        prefix: cleanKeyId.slice(0, 8)
      });
    }
    if (razorpay_key_secret !== undefined) {
      const cleanKeySecret = String(razorpay_key_secret).trim().replace(/^["']|["']$/g, '');
      updateStmt.run('razorpay_key_secret', cleanKeySecret, 'Razorpay API Key Secret');
      logAuditAction(req.user, 'PAYMENT_GATEWAY_CONFIG_UPDATED', 'platform_settings', 'razorpay_key_secret', {
        secret_configured: Boolean(cleanKeySecret)
      });
    }
    if (razorpay_webhook_secret !== undefined) {
      const cleanWebhook = String(razorpay_webhook_secret).trim().replace(/^["']|["']$/g, '');
      updateStmt.run('razorpay_webhook_secret', cleanWebhook, 'Razorpay Webhook Secret');
    }

    logAuditAction(req.user, 'PLATFORM_SETTINGS_UPDATED', 'system', 'platform_settings', req.body);
    res.json({ success: true, message: 'Settings updated successfully.' });
  });

  router.get('/admin/footer', adminAuthMiddleware, (req, res) => {
    try {
      const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'footer_settings'").get();
      const defaultFooter = {
        company_description: 'Expertise by the minute.',
        contact_email: 'support@hirebyminutes.com',
        contact_phone: '+1 (800) 555-0199',
        address: 'San Francisco, CA, United States',
        copyright_text: '© {year} HireByMinute. All rights reserved.',
        designer_credit: 'Designed & Developed by Vishal Chaudhary',
        social_links: [
          { platform: 'twitter', url: 'https://twitter.com/hirebyminute', is_visible: true },
          { platform: 'linkedin', url: 'https://linkedin.com/company/hirebyminute', is_visible: true },
          { platform: 'github', url: 'https://github.com/hirebyminute', is_visible: true }
        ],
        sections: {
          platform: [
            { id: 'about', label: 'About Us', url: '/about', order: 1, is_visible: true },
            { id: 'how-it-works', label: 'How It Works', url: '/how-it-works', order: 2, is_visible: true },
            { id: 'services', label: 'Browse Services', url: '/services', order: 3, is_visible: true },
            { id: 'opportunities', label: 'Opportunities', url: '/opportunities', order: 4, is_visible: true, is_new: true }
          ],
          policies: [
            { id: 'terms', label: 'Terms of Service', url: '/terms', order: 1, is_visible: true },
            { id: 'privacy', label: 'Privacy Policy', url: '/privacy', order: 2, is_visible: true },
            { id: 'refund', label: 'Refund & Cancellation', url: '/refund-policy', order: 3, is_visible: true },
            { id: 'expert-policy', label: 'Expert Policy', url: '/expert-policy', order: 4, is_visible: true },
            { id: 'acceptable-use', label: 'Acceptable Use', url: '/acceptable-use', order: 5, is_visible: true }
          ],
          support: [
            { id: 'contact', label: 'Contact / Support', url: '/contact', order: 1, is_visible: true, icon: 'mail' },
            { id: 'become-provider', label: 'Become a Provider', url: '/provider/onboard', order: 2, is_visible: true },
            { id: 'provider-dashboard', label: 'Provider Dashboard', url: '/provider', order: 3, is_visible: true }
          ]
        }
      };

      let footerData = defaultFooter;
      if (setting && setting.value) {
        try {
          const parsed = JSON.parse(setting.value);
          if (parsed && typeof parsed === 'object') {
            footerData = { ...defaultFooter, ...parsed };
          }
        } catch (e) {
          footerData = defaultFooter;
        }
      }

      res.json({ footer: footerData });
    } catch (err) {
      console.error('[Admin Footer Settings] Error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve footer settings' });
    }
  });

  router.get('/admin/contact', adminAuthMiddleware, (req, res) => {
    try {
      const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'contact_settings'").get();
      const defaultContact = {
        support_email: 'support@hirebyminute.com',
        business_email: 'business@hirebyminute.com',
        phone: '+1 (800) 555-0199',
        support_hours: 'Monday – Friday: 9:00 AM – 6:00 PM EST (24/7 Escalation Desk)',
        address: 'San Francisco, CA, United States',
        whatsapp_url: '',
        contact_form_enabled: true
      };

      let contactData = defaultContact;
      if (setting && setting.value) {
        try {
          const parsed = JSON.parse(setting.value);
          if (parsed && typeof parsed === 'object') {
            contactData = { ...defaultContact, ...parsed };
          }
        } catch (e) {
          contactData = defaultContact;
        }
      }

      res.json({ contact: contactData });
    } catch (err) {
      console.error('[Admin Contact Settings] Error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve contact settings' });
    }
  });

  router.put('/admin/footer', adminAuthMiddleware, (req, res) => {
    const data = (req.body && req.body.footer) ? req.body.footer : req.body;
    const { company_description, contact_email, contact_phone, address, copyright_text, designer_credit, social_links, sections } = data || {};

    // Security Audit: Explicitly reject any attempts to expose /admin in footer links
    if (sections && typeof sections === 'object') {
      for (const [secName, links] of Object.entries(sections)) {
        if (Array.isArray(links)) {
          for (const item of links) {
            const url = String(item.url || '').toLowerCase();
            const label = String(item.label || '').toLowerCase();
            if (url.includes('/admin') || label.includes('admin console') || label.includes('admin portal')) {
              return res.status(400).json({
                error: 'Security Policy Violation: The Admin Console must not be linked in the public footer. Admin routes remain strictly private.'
              });
            }
          }
        }
      }
    }

    const cleanFooter = {
      company_description: company_description !== undefined ? String(company_description).trim() : 'Expertise by the minute.',
      contact_email: contact_email !== undefined ? String(contact_email).trim() : 'support@hirebyminutes.com',
      contact_phone: contact_phone !== undefined ? String(contact_phone).trim() : '+1 (800) 555-0199',
      address: address !== undefined ? String(address).trim() : 'San Francisco, CA, United States',
      copyright_text: copyright_text !== undefined ? String(copyright_text).trim() : '© {year} HireByMinute. All rights reserved.',
      designer_credit: designer_credit !== undefined ? String(designer_credit).trim() : 'Designed & Developed by Vishal Chaudhary',
      social_links: Array.isArray(social_links) ? social_links : [],
      sections: sections && typeof sections === 'object' ? sections : {}
    };

    db.prepare(`
      INSERT OR REPLACE INTO platform_settings (key, value, description, updated_at)
      VALUES ('footer_settings', ?, 'Configurable footer links, sections, and legal notices', CURRENT_TIMESTAMP)
    `).run(JSON.stringify(cleanFooter));

    logAuditAction(req.user, 'PLATFORM_FOOTER_UPDATED', 'system', 'footer_settings', cleanFooter);
    res.json({ success: true, footer: cleanFooter, message: 'Footer configuration saved successfully.' });
  });

  router.put('/admin/contact', adminAuthMiddleware, (req, res) => {
    const data = (req.body && req.body.contact) ? req.body.contact : req.body;
    const { support_email, business_email, phone, support_hours, address, whatsapp_url, contact_form_enabled } = data || {};

    const cleanContact = {
      support_email: support_email !== undefined ? String(support_email).trim() : 'support@hirebyminute.com',
      business_email: business_email !== undefined ? String(business_email).trim() : 'business@hirebyminute.com',
      phone: phone !== undefined ? String(phone).trim() : '+1 (800) 555-0199',
      support_hours: support_hours !== undefined ? String(support_hours).trim() : 'Monday – Friday: 9:00 AM – 6:00 PM EST (24/7 Escalation Desk)',
      address: address !== undefined ? String(address).trim() : 'San Francisco, CA, United States',
      whatsapp_url: whatsapp_url !== undefined ? String(whatsapp_url).trim() : '',
      contact_form_enabled: contact_form_enabled !== false
    };

    db.prepare(`
      INSERT OR REPLACE INTO platform_settings (key, value, description, updated_at)
      VALUES ('contact_settings', ?, 'Configurable customer support and platform contact channels', CURRENT_TIMESTAMP)
    `).run(JSON.stringify(cleanContact));

    logAuditAction(req.user, 'CONTACT_SETTINGS_UPDATED', 'system', 'contact_settings', cleanContact);
    res.json({ success: true, contact: cleanContact, message: 'Contact settings saved successfully.' });
  });

  // Admin Homepage CMS Control
  router.put('/admin/homepage', adminAuthMiddleware, (req, res) => {
    try {
      const data = (req.body && req.body.homepage) ? req.body.homepage : req.body;
      const {
        hero_headline,
        hero_subheadline,
        hero_badge_text,
        primary_cta_label,
        primary_cta_url,
        secondary_cta_label,
        secondary_cta_url,
        search_placeholder,
        popular_tags,
        intent_client_title,
        intent_client_desc,
        intent_client_button,
        intent_provider_title,
        intent_provider_desc,
        intent_provider_button,
        how_it_works_title,
        how_it_works_subtitle,
        how_it_works_steps,
        cta_title,
        cta_subtitle,
        cta_button_label,
        cta_button_url,
        visibility
      } = data || {};

      const cleanHomepage = {
        hero_headline: hero_headline !== undefined ? String(hero_headline).trim() : 'What brings you here?',
        hero_subheadline: hero_subheadline !== undefined ? String(hero_subheadline).trim() : 'Hire expertise by the minute, or turn your expertise into a service people can book.',
        hero_badge_text: hero_badge_text !== undefined ? String(hero_badge_text).trim() : '⚡ Instant 1-on-1 Consultations • Pay Per Exact Minute',
        primary_cta_label: primary_cta_label !== undefined ? String(primary_cta_label).trim() : 'Find an Expert',
        primary_cta_url: primary_cta_url !== undefined ? String(primary_cta_url).trim() : '/services',
        secondary_cta_label: secondary_cta_label !== undefined ? String(secondary_cta_label).trim() : 'Become a Service Provider',
        secondary_cta_url: secondary_cta_url !== undefined ? String(secondary_cta_url).trim() : '/provider/onboard',
        search_placeholder: search_placeholder !== undefined ? String(search_placeholder).trim() : 'Search experts, skills, or services...',
        popular_tags: Array.isArray(popular_tags) ? popular_tags : [],
        intent_client_title: intent_client_title !== undefined ? String(intent_client_title).trim() : 'Find an expert',
        intent_client_desc: intent_client_desc !== undefined ? String(intent_client_desc).trim() : '',
        intent_client_button: intent_client_button !== undefined ? String(intent_client_button).trim() : 'Browse Experts',
        intent_provider_title: intent_provider_title !== undefined ? String(intent_provider_title).trim() : 'List your service',
        intent_provider_desc: intent_provider_desc !== undefined ? String(intent_provider_desc).trim() : '',
        intent_provider_button: intent_provider_button !== undefined ? String(intent_provider_button).trim() : 'Become a Service Provider',
        how_it_works_title: how_it_works_title !== undefined ? String(how_it_works_title).trim() : 'How HireByMinute works',
        how_it_works_subtitle: how_it_works_subtitle !== undefined ? String(how_it_works_subtitle).trim() : '',
        how_it_works_steps: Array.isArray(how_it_works_steps) ? how_it_works_steps : [],
        cta_title: cta_title !== undefined ? String(cta_title).trim() : 'Ready to experience precision consulting?',
        cta_subtitle: cta_subtitle !== undefined ? String(cta_subtitle).trim() : '',
        cta_button_label: cta_button_label !== undefined ? String(cta_button_label).trim() : 'Get Started Today',
        cta_button_url: cta_button_url !== undefined ? String(cta_button_url).trim() : '/services',
        visibility: visibility && typeof visibility === 'object' ? visibility : {
          hero: true,
          intent_cards: true,
          search: true,
          popular_categories: true,
          featured_experts: true,
          how_it_works: true,
          cta: true
        }
      };

      db.prepare(`
        INSERT OR REPLACE INTO platform_settings (key, value, description, updated_at)
        VALUES ('homepage_settings', ?, 'Configurable homepage content, hero copy, intent cards, and section visibility', CURRENT_TIMESTAMP)
      `).run(JSON.stringify(cleanHomepage));

      logAuditAction(req.user, 'ADMIN_UPDATED_HOMEPAGE', 'system', 'homepage_settings', cleanHomepage);
      res.json({ success: true, homepage: cleanHomepage, message: 'Homepage configuration saved successfully.' });
    } catch (err) {
      console.error('[Admin Homepage] Save error:', err.message);
      res.status(500).json({ error: 'Failed to update homepage settings' });
    }
  });

  // Admin SEO Meta Settings Control
  router.put('/admin/seo', adminAuthMiddleware, (req, res) => {
    try {
      const data = (req.body && req.body.seo) ? req.body.seo : req.body;
      const { site_title, meta_description, canonical_url, og_title, og_description, og_image, twitter_card, twitter_site } = data || {};

      const cleanSeo = {
        site_title: site_title !== undefined ? String(site_title).trim() : 'HireByMinute — Instant 1-on-1 Consultations by the Minute',
        meta_description: meta_description !== undefined ? String(meta_description).trim() : '',
        canonical_url: canonical_url !== undefined ? String(canonical_url).trim() : 'https://hirebyminute.com',
        og_title: og_title !== undefined ? String(og_title).trim() : (site_title || 'HireByMinute'),
        og_description: og_description !== undefined ? String(og_description).trim() : (meta_description || ''),
        og_image: og_image !== undefined ? String(og_image).trim() : 'https://hirebyminute.com/og-image.png',
        twitter_card: twitter_card === 'summary' ? 'summary' : 'summary_large_image',
        twitter_site: twitter_site !== undefined ? String(twitter_site).trim() : '@hirebyminute'
      };

      db.prepare(`
        INSERT OR REPLACE INTO platform_settings (key, value, description, updated_at)
        VALUES ('seo_settings', ?, 'Platform global SEO meta tags, social sharing cards, and crawl policies', CURRENT_TIMESTAMP)
      `).run(JSON.stringify(cleanSeo));

      logAuditAction(req.user, 'ADMIN_UPDATED_SEO', 'system', 'seo_settings', cleanSeo);
      res.json({ success: true, seo: cleanSeo, message: 'SEO configuration saved successfully.' });
    } catch (err) {
      console.error('[Admin SEO] Save error:', err.message);
      res.status(500).json({ error: 'Failed to update SEO settings' });
    }
  });

  // Admin FAQs Management (Full CRUD)
  router.get('/admin/faqs', adminAuthMiddleware, (req, res) => {
    try {
      const faqs = db.prepare('SELECT * FROM faqs ORDER BY sort_order ASC, created_at ASC').all();
      res.json({ faqs: faqs || [] });
    } catch (err) {
      console.error('[Admin FAQs] Fetch error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve FAQs' });
    }
  });

  router.post('/admin/faqs', adminAuthMiddleware, (req, res) => {
    try {
      const { question, answer, category = 'General', sort_order = 0, is_published = 1 } = req.body;
      if (!question || !question.trim()) {
        return res.status(400).json({ error: 'FAQ question is required.' });
      }
      if (!answer || !answer.trim()) {
        return res.status(400).json({ error: 'FAQ answer is required.' });
      }

      const id = `faq-${uuidv4().slice(0, 8)}`;
      db.prepare(`
        INSERT INTO faqs (id, question, answer, category, sort_order, is_published, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(id, question.trim(), answer.trim(), (category || 'General').trim(), Number(sort_order) || 0, is_published ? 1 : 0);

      const created = db.prepare('SELECT * FROM faqs WHERE id = ?').get(id);
      logAuditAction(req.user, 'ADMIN_CREATED_FAQ', 'faq', id, { question, category });
      res.status(201).json({ success: true, faq: created, message: 'FAQ created successfully.' });
    } catch (err) {
      console.error('[Admin FAQs] Create error:', err.message);
      res.status(500).json({ error: 'Failed to create FAQ' });
    }
  });

  router.put('/admin/faqs/:id', adminAuthMiddleware, (req, res) => {
    try {
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM faqs WHERE id = ?').get(id);
      if (!existing) {
        return res.status(404).json({ error: 'FAQ not found.' });
      }

      const { question, answer, category, sort_order, is_published } = req.body;
      const cleanQ = question !== undefined ? String(question).trim() : existing.question;
      const cleanA = answer !== undefined ? String(answer).trim() : existing.answer;
      const cleanC = category !== undefined ? String(category).trim() : existing.category;
      const cleanO = sort_order !== undefined ? (Number(sort_order) || 0) : existing.sort_order;
      const cleanP = is_published !== undefined ? (is_published ? 1 : 0) : existing.is_published;

      db.prepare(`
        UPDATE faqs
        SET question = ?, answer = ?, category = ?, sort_order = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(cleanQ, cleanA, cleanC, cleanO, cleanP, id);

      const updated = db.prepare('SELECT * FROM faqs WHERE id = ?').get(id);
      logAuditAction(req.user, 'ADMIN_UPDATED_FAQ', 'faq', id, { question: cleanQ, is_published: cleanP });
      res.json({ success: true, faq: updated, message: 'FAQ updated successfully.' });
    } catch (err) {
      console.error('[Admin FAQs] Update error:', err.message);
      res.status(500).json({ error: 'Failed to update FAQ' });
    }
  });

  router.delete('/admin/faqs/:id', adminAuthMiddleware, (req, res) => {
    try {
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM faqs WHERE id = ?').get(id);
      if (!existing) {
        return res.status(404).json({ error: 'FAQ not found.' });
      }

      db.prepare('DELETE FROM faqs WHERE id = ?').run(id);
      logAuditAction(req.user, 'ADMIN_DELETED_FAQ', 'faq', id, { question: existing.question });
      res.json({ success: true, message: 'FAQ deleted successfully.' });
    } catch (err) {
      console.error('[Admin FAQs] Delete error:', err.message);
      res.status(500).json({ error: 'Failed to delete FAQ' });
    }
  });

  // ==========================================
  // BANNERS & ANNOUNCEMENTS APIS
  // ==========================================
  router.get('/banners', (req, res) => {
    try {
      const { placement } = req.query;
      let query = `
        SELECT * FROM banners_announcements
        WHERE is_active = 1
          AND (start_date IS NULL OR start_date <= CURRENT_TIMESTAMP)
          AND (end_date IS NULL OR end_date >= CURRENT_TIMESTAMP)
      `;
      const params = [];
      if (placement && placement !== 'all') {
        query += ` AND (placement = ? OR placement = 'global')`;
        params.push(placement);
      }
      query += ` ORDER BY priority DESC, created_at DESC`;

      const banners = db.prepare(query).all(...params).map(b => ({
        ...b,
        priority: Number(b.priority) || 0,
        is_active: Number(b.is_active) === 1
      }));

      res.json({ banners, count: banners.length });
    } catch (err) {
      console.error('[Banners Fetch Error]', err.message);
      res.status(500).json({ error: 'Failed to retrieve announcements' });
    }
  });

  router.get('/admin/banners', adminAuthMiddleware, (req, res) => {
    try {
      const banners = db.prepare(`SELECT * FROM banners_announcements ORDER BY priority DESC, created_at DESC`).all().map(b => ({
        ...b,
        cta_label: b.link_text || '',
        cta_url: b.link_url || '',
        type: (['info', 'announcement', 'warning', 'success', 'promo'].includes(b.bg_color) ? b.bg_color : 'announcement'),
        priority: Number(b.priority) || 0,
        is_active: Number(b.is_active) === 1 ? 1 : 0
      }));
      res.json({ banners, count: banners.length });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve banners' });
    }
  });

  router.post('/admin/banners', adminAuthMiddleware, (req, res) => {
    const {
      title,
      message,
      link_url = '',
      link_text = '',
      cta_url,
      cta_label,
      type,
      placement = 'global',
      priority = 0,
      bg_color = 'moonstone',
      text_color = 'white',
      start_date = null,
      end_date = null,
      is_active = 1
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Banner title and message are required.' });
    }

    const resolvedLinkUrl = String(cta_url !== undefined ? cta_url : link_url || '').trim();
    const resolvedLinkText = String(cta_label !== undefined ? cta_label : link_text || '').trim();
    const resolvedBgColor = String(type || bg_color || 'moonstone').trim();

    const id = `banner-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO banners_announcements (
        id, title, message, link_url, link_text, placement, priority, bg_color, text_color, start_date, end_date, is_active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(title).trim(),
      String(message).trim(),
      resolvedLinkUrl,
      resolvedLinkText,
      String(placement || 'global').trim(),
      Number(priority) || 0,
      resolvedBgColor,
      String(text_color || 'white').trim(),
      start_date ? new Date(start_date).toISOString() : null,
      end_date ? new Date(end_date).toISOString() : null,
      is_active ? 1 : 0,
      req.user.id
    );

    logAuditAction(req.user, 'BANNER_CREATED', 'banner', id, { title, placement });
    const created = db.prepare('SELECT * FROM banners_announcements WHERE id = ?').get(id);
    const normalized = {
      ...created,
      cta_label: created.link_text || '',
      cta_url: created.link_url || '',
      type: (['info', 'announcement', 'warning', 'success', 'promo'].includes(created.bg_color) ? created.bg_color : 'announcement'),
      is_active: Number(created.is_active) === 1 ? 1 : 0
    };
    res.status(201).json({ success: true, banner: normalized });
  });

  router.put('/admin/banners/:id', adminAuthMiddleware, (req, res) => {
    const banner = db.prepare('SELECT * FROM banners_announcements WHERE id = ?').get(req.params.id);
    if (!banner) return res.status(404).json({ error: 'Banner not found' });

    const {
      title,
      message,
      link_url,
      link_text,
      cta_url,
      cta_label,
      type,
      placement,
      priority,
      bg_color,
      text_color,
      start_date,
      end_date,
      is_active
    } = req.body;

    const resolvedLinkUrl = cta_url !== undefined ? cta_url : link_url;
    const resolvedLinkText = cta_label !== undefined ? cta_label : link_text;
    const resolvedBgColor = type !== undefined ? type : bg_color;

    db.prepare(`
      UPDATE banners_announcements SET
        title = COALESCE(?, title),
        message = COALESCE(?, message),
        link_url = COALESCE(?, link_url),
        link_text = COALESCE(?, link_text),
        placement = COALESCE(?, placement),
        priority = COALESCE(?, priority),
        bg_color = COALESCE(?, bg_color),
        text_color = COALESCE(?, text_color),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title ? String(title).trim() : null,
      message ? String(message).trim() : null,
      resolvedLinkUrl !== undefined ? String(resolvedLinkUrl).trim() : null,
      resolvedLinkText !== undefined ? String(resolvedLinkText).trim() : null,
      placement || null,
      priority !== undefined ? Number(priority) : null,
      resolvedBgColor || null,
      text_color || null,
      start_date ? new Date(start_date).toISOString() : null,
      end_date ? new Date(end_date).toISOString() : null,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      banner.id
    );

    logAuditAction(req.user, 'BANNER_UPDATED', 'banner', banner.id, req.body);
    const updated = db.prepare('SELECT * FROM banners_announcements WHERE id = ?').get(banner.id);
    const normalized = {
      ...updated,
      cta_label: updated.link_text || '',
      cta_url: updated.link_url || '',
      type: (['info', 'announcement', 'warning', 'success', 'promo'].includes(updated.bg_color) ? updated.bg_color : 'announcement'),
      is_active: Number(updated.is_active) === 1 ? 1 : 0
    };
    res.json({ success: true, banner: normalized });
  });

  router.patch('/admin/banners/:id/toggle', adminAuthMiddleware, (req, res) => {
    const banner = db.prepare('SELECT * FROM banners_announcements WHERE id = ?').get(req.params.id);
    if (!banner) return res.status(404).json({ error: 'Banner not found' });

    const { is_active } = req.body || {};
    const newActive = is_active !== undefined ? (is_active ? 1 : 0) : (banner.is_active ? 0 : 1);
    db.prepare('UPDATE banners_announcements SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newActive, banner.id);
    logAuditAction(req.user, newActive ? 'BANNER_ACTIVATED' : 'BANNER_DEACTIVATED', 'banner', banner.id, { title: banner.title });
    res.json({ success: true, is_active: newActive });
  });

  router.delete('/admin/banners/:id', adminAuthMiddleware, (req, res) => {
    const banner = db.prepare('SELECT * FROM banners_announcements WHERE id = ?').get(req.params.id);
    if (!banner) return res.status(404).json({ error: 'Banner not found' });

    db.prepare('DELETE FROM banners_announcements WHERE id = ?').run(banner.id);
    logAuditAction(req.user, 'BANNER_DELETED', 'banner', banner.id, { title: banner.title });
    res.json({ success: true, message: 'Banner deleted successfully.' });
  });

  // ==========================================
  // STATIC PAGE CMS APIS
  // ==========================================
  router.get('/cms/pages/:slug', (req, res) => {
    try {
      const page = db.prepare(`SELECT * FROM cms_pages WHERE slug = ? AND status = 'published'`).get(req.params.slug);
      if (!page) {
        return res.status(404).json({ error: `Page "${req.params.slug}" not found or not published.` });
      }
      res.json({ page });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve page' });
    }
  });

  router.get('/admin/cms/pages', adminAuthMiddleware, (req, res) => {
    try {
      const PROTECTED_SYSTEM_PAGES = ['about', 'how-it-works', 'terms', 'privacy', 'refund-policy', 'expert-policy', 'acceptable-use', 'contact', 'faq'];
      const pages = db.prepare(`SELECT id, slug, title, meta_title, meta_description, status, updated_by, created_at, updated_at FROM cms_pages ORDER BY slug ASC`).all().map(p => ({
        ...p,
        is_system: PROTECTED_SYSTEM_PAGES.includes(p.slug) ? 1 : 0
      }));
      res.json({ pages, count: pages.length });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve CMS pages' });
    }
  });

  router.get('/admin/cms/pages/:id', adminAuthMiddleware, (req, res) => {
    try {
      const PROTECTED_SYSTEM_PAGES = ['about', 'how-it-works', 'terms', 'privacy', 'refund-policy', 'expert-policy', 'acceptable-use', 'contact', 'faq'];
      const page = db.prepare(`SELECT * FROM cms_pages WHERE id = ? OR slug = ?`).get(req.params.id, req.params.id);
      if (!page) return res.status(404).json({ error: 'Page not found' });
      res.json({ page: { ...page, is_system: PROTECTED_SYSTEM_PAGES.includes(page.slug) ? 1 : 0 } });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve page' });
    }
  });

  router.post('/admin/cms/pages', adminAuthMiddleware, (req, res) => {
    const { slug, title, meta_title = '', meta_description = '', content, status = 'published' } = req.body;
    if (!slug || !title || !content) {
      return res.status(400).json({ error: 'Slug, title, and content are required.' });
    }

    const cleanSlug = String(slug).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const existing = db.prepare('SELECT id FROM cms_pages WHERE slug = ?').get(cleanSlug);
    if (existing) {
      return res.status(409).json({ error: `CMS page with slug "${cleanSlug}" already exists.` });
    }

    const id = `page-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO cms_pages (id, slug, title, meta_title, meta_description, content, status, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, cleanSlug, String(title).trim(), String(meta_title || '').trim(), String(meta_description || '').trim(), String(content).trim(), status === 'draft' ? 'draft' : 'published', req.user.id);

    logAuditAction(req.user, 'CMS_PAGE_CREATED', 'cms_page', id, { slug: cleanSlug, title });
    const created = db.prepare('SELECT * FROM cms_pages WHERE id = ?').get(id);
    res.status(201).json({ success: true, page: created });
  });

  router.put('/admin/cms/pages/:id', adminAuthMiddleware, (req, res) => {
    const page = db.prepare('SELECT * FROM cms_pages WHERE id = ? OR slug = ?').get(req.params.id, req.params.id);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const { slug, title, meta_title, meta_description, content, status } = req.body;

    let newSlug = page.slug;
    if (slug) {
      newSlug = String(slug).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      if (newSlug !== page.slug) {
        const existing = db.prepare('SELECT id FROM cms_pages WHERE slug = ? AND id != ?').get(newSlug, page.id);
        if (existing) {
          return res.status(409).json({ error: `Slug "${newSlug}" is already taken.` });
        }
      }
    }

    db.prepare(`
      UPDATE cms_pages SET
        slug = ?,
        title = COALESCE(?, title),
        meta_title = COALESCE(?, meta_title),
        meta_description = COALESCE(?, meta_description),
        content = COALESCE(?, content),
        status = COALESCE(?, status),
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      newSlug,
      title ? String(title).trim() : null,
      meta_title !== undefined ? String(meta_title).trim() : null,
      meta_description !== undefined ? String(meta_description).trim() : null,
      content !== undefined ? String(content).trim() : null,
      status || null,
      req.user.id,
      page.id
    );

    logAuditAction(req.user, 'CMS_PAGE_UPDATED', 'cms_page', page.id, { slug: newSlug, title, status });
    const updated = db.prepare('SELECT * FROM cms_pages WHERE id = ?').get(page.id);
    res.json({ success: true, page: updated });
  });

  router.delete('/admin/cms/pages/:id', adminAuthMiddleware, (req, res) => {
    const page = db.prepare('SELECT * FROM cms_pages WHERE id = ? OR slug = ?').get(req.params.id, req.params.id);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const PROTECTED_SYSTEM_PAGES = ['about', 'how-it-works', 'terms', 'privacy', 'refund-policy', 'expert-policy', 'acceptable-use', 'contact', 'faq'];
    if (PROTECTED_SYSTEM_PAGES.includes(page.slug)) {
      return res.status(400).json({
        error: `Cannot delete essential legal/system page "${page.slug}". You can edit its content or mark it as draft instead.`
      });
    }

    db.prepare('DELETE FROM cms_pages WHERE id = ?').run(page.id);
    logAuditAction(req.user, 'CMS_PAGE_DELETED', 'cms_page', page.id, { slug: page.slug, title: page.title });
    res.json({ success: true, message: `Page "${page.title}" deleted successfully.` });
  });

  // ==========================================
  // BLOG & CONTENT PUBLISHING (Section 10 & 11)
  // ==========================================
  router.get('/blog', (req, res) => {
    try {
      const { category, search, page = 1, limit = 12 } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
      const offset = (pageNum - 1) * limitNum;

      let whereClause = "WHERE status = 'published'";
      const params = [];

      if (category) {
        whereClause += " AND (LOWER(category) = LOWER(?) OR category_id = ?)";
        params.push(String(category).trim(), String(category).trim());
      }

      if (search) {
        whereClause += " AND (LOWER(title) LIKE ? OR LOWER(excerpt) LIKE ? OR LOWER(content) LIKE ?)";
        const term = `%${String(search).trim().toLowerCase()}%`;
        params.push(term, term, term);
      }

      const countRow = db.prepare(`SELECT COUNT(*) as count FROM blog_posts ${whereClause}`).get(...params);
      const totalPosts = countRow ? Number(countRow.count) : 0;

      const posts = db.prepare(`
        SELECT id, title, slug, excerpt, author_name, category, featured_image,
               meta_title, meta_description, read_time_minutes, views_count, published_at, created_at
        FROM blog_posts
        ${whereClause}
        ORDER BY published_at DESC, created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, limitNum, offset);

      res.json({
        posts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalPosts,
          totalPages: Math.ceil(totalPosts / limitNum) || 1
        }
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch blog posts: ' + err.message });
    }
  });

  router.get('/blog/categories', (req, res) => {
    try {
      const categories = db.prepare(`
        SELECT category as name, COUNT(id) as post_count
        FROM blog_posts
        WHERE status = 'published'
        GROUP BY category
        ORDER BY post_count DESC
      `).all();
      res.json({ categories });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch blog categories: ' + err.message });
    }
  });

  router.get('/blog/:slug', (req, res) => {
    try {
      const post = db.prepare(`
        SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'
      `).get(req.params.slug);

      if (!post) {
        return res.status(404).json({ error: 'Article not found or not published.' });
      }

      try {
        db.prepare('UPDATE blog_posts SET views_count = views_count + 1 WHERE id = ?').run(post.id);
        post.views_count = (Number(post.views_count) || 0) + 1;
      } catch (e) {}

      let parsedTags = [];
      try {
        parsedTags = JSON.parse(post.tags_json || '[]');
      } catch {
        parsedTags = [];
      }

      const related = db.prepare(`
        SELECT id, title, slug, excerpt, author_name, category, featured_image, read_time_minutes, published_at
        FROM blog_posts
        WHERE status = 'published' AND id != ? AND category = ?
        ORDER BY published_at DESC
        LIMIT 3
      `).all(post.id, post.category);

      res.json({
        post: {
          ...post,
          tags: parsedTags
        },
        related
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve article: ' + err.message });
    }
  });

  // Admin Blog endpoints
  router.get('/admin/blog', adminAuthMiddleware, (req, res) => {
    try {
      const { status, search, page = 1, limit = 20 } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      let whereClause = "WHERE 1=1";
      const params = [];

      if (status && status !== 'all') {
        whereClause += " AND status = ?";
        params.push(status);
      }

      if (search) {
        whereClause += " AND (LOWER(title) LIKE ? OR LOWER(slug) LIKE ?)";
        const term = `%${String(search).trim().toLowerCase()}%`;
        params.push(term, term);
      }

      const countRow = db.prepare(`SELECT COUNT(*) as count FROM blog_posts ${whereClause}`).get(...params);
      const totalPosts = countRow ? Number(countRow.count) : 0;

      const posts = db.prepare(`
        SELECT * FROM blog_posts
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, limitNum, offset).map(p => {
        let tags = [];
        try { tags = JSON.parse(p.tags_json || '[]'); } catch {}
        return { ...p, tags };
      });

      res.json({
        posts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalPosts,
          totalPages: Math.ceil(totalPosts / limitNum) || 1
        }
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch admin blog posts: ' + err.message });
    }
  });

  router.post('/admin/blog', adminAuthMiddleware, (req, res) => {
    try {
      const {
        title, slug, excerpt = '', content, author_name, category = 'Expert Guidance',
        category_id, featured_image = '', tags = [], meta_title = '', meta_description = '',
        canonical_url = '', og_image = '', status = 'draft', read_time_minutes = 5
      } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Article title is required.' });
      }
      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Article content cannot be empty.' });
      }

      let cleanSlug = slug ? String(slug).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') : '';
      if (!cleanSlug) {
        cleanSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }

      const existingSlug = db.prepare('SELECT id FROM blog_posts WHERE slug = ?').get(cleanSlug);
      if (existingSlug) {
        cleanSlug = `${cleanSlug}-${Date.now().toString(36)}`;
      }

      const id = `post-${uuidv4().slice(0, 8)}`;
      const author = author_name?.trim() || req.user.full_name || 'HireByMinute Editorial';
      const now = new Date().toISOString();
      const publishedAt = status === 'published' ? now : null;

      db.prepare(`
        INSERT INTO blog_posts (
          id, title, slug, excerpt, content, author_id, author_name, category, category_id,
          featured_image, tags_json, meta_title, meta_description, canonical_url, og_image,
          status, published_at, read_time_minutes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, title.trim(), cleanSlug, excerpt.trim(), content.trim(), req.user.id, author,
        category.trim(), category_id || null, featured_image.trim(), JSON.stringify(tags || []),
        meta_title.trim() || title.trim(), meta_description.trim() || excerpt.trim(),
        canonical_url.trim() || `https://hirebyminute.com/blog/${cleanSlug}`,
        og_image.trim() || featured_image.trim(), status, publishedAt,
        Number(read_time_minutes) || 5, now, now
      );

      logAuditAction(req.user, 'BLOG_POST_CREATED', 'blog_post', id, { title, slug: cleanSlug, status });
      const created = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(id);
      res.status(201).json({ success: true, post: created });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create blog post: ' + err.message });
    }
  });

  router.put('/admin/blog/:id', adminAuthMiddleware, (req, res) => {
    try {
      const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found.' });

      const {
        title, slug, excerpt, content, author_name, category, category_id,
        featured_image, tags, meta_title, meta_description, canonical_url,
        og_image, status, read_time_minutes
      } = req.body;

      let cleanSlug = post.slug;
      if (slug && slug.trim() !== post.slug) {
        cleanSlug = String(slug).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        const conflict = db.prepare('SELECT id FROM blog_posts WHERE slug = ? AND id != ?').get(cleanSlug, post.id);
        if (conflict) {
          return res.status(409).json({ error: `Slug "${cleanSlug}" is already in use by another article.` });
        }
      }

      const now = new Date().toISOString();
      let publishedAt = post.published_at;
      if (status === 'published' && (!post.published_at || post.status !== 'published')) {
        publishedAt = now;
      }

      db.prepare(`
        UPDATE blog_posts SET
          title = COALESCE(?, title),
          slug = ?,
          excerpt = COALESCE(?, excerpt),
          content = COALESCE(?, content),
          author_name = COALESCE(?, author_name),
          category = COALESCE(?, category),
          category_id = COALESCE(?, category_id),
          featured_image = COALESCE(?, featured_image),
          tags_json = COALESCE(?, tags_json),
          meta_title = COALESCE(?, meta_title),
          meta_description = COALESCE(?, meta_description),
          canonical_url = COALESCE(?, canonical_url),
          og_image = COALESCE(?, og_image),
          status = COALESCE(?, status),
          published_at = ?,
          read_time_minutes = COALESCE(?, read_time_minutes),
          updated_at = ?
        WHERE id = ?
      `).run(
        title ? title.trim() : null,
        cleanSlug,
        excerpt !== undefined ? excerpt.trim() : null,
        content !== undefined ? content.trim() : null,
        author_name ? author_name.trim() : null,
        category ? category.trim() : null,
        category_id !== undefined ? category_id : null,
        featured_image !== undefined ? featured_image.trim() : null,
        tags !== undefined ? JSON.stringify(tags) : null,
        meta_title !== undefined ? meta_title.trim() : null,
        meta_description !== undefined ? meta_description.trim() : null,
        canonical_url !== undefined ? canonical_url.trim() : null,
        og_image !== undefined ? og_image.trim() : null,
        status || null,
        publishedAt,
        read_time_minutes !== undefined ? Number(read_time_minutes) : null,
        now,
        post.id
      );

      logAuditAction(req.user, 'BLOG_POST_UPDATED', 'blog_post', post.id, { title: title || post.title, slug: cleanSlug });
      const updated = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(post.id);
      res.json({ success: true, post: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update blog post: ' + err.message });
    }
  });

  router.delete('/admin/blog/:id', adminAuthMiddleware, (req, res) => {
    try {
      const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found.' });

      db.prepare('DELETE FROM blog_posts WHERE id = ?').run(post.id);
      logAuditAction(req.user, 'BLOG_POST_DELETED', 'blog_post', post.id, { title: post.title });
      res.json({ success: true, message: `Article "${post.title}" deleted.` });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete blog post: ' + err.message });
    }
  });

  router.patch('/admin/blog/:id/status', adminAuthMiddleware, (req, res) => {
    try {
      const { status } = req.body;
      if (!status || !['draft', 'scheduled', 'published', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be draft, scheduled, published, or archived.' });
      }

      const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found.' });

      const now = new Date().toISOString();
      const publishedAt = status === 'published' ? (post.published_at || now) : post.published_at;

      db.prepare('UPDATE blog_posts SET status = ?, published_at = ?, updated_at = ? WHERE id = ?').run(
        status, publishedAt, now, post.id
      );

      logAuditAction(req.user, 'BLOG_POST_STATUS_CHANGED', 'blog_post', post.id, { oldStatus: post.status, newStatus: status });
      const updated = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(post.id);
      res.json({ success: true, status, post: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update status: ' + err.message });
    }
  });

  // Dynamic XML Sitemaps (Section 11)
  router.get('/sitemap.xml', (req, res) => {
    try {
      const baseUrl = 'https://hirebyminute.com';
      const now = new Date().toISOString().slice(0, 10);

      const corePages = [
        { loc: `${baseUrl}/`, priority: '1.0', changefreq: 'daily' },
        { loc: `${baseUrl}/services`, priority: '0.9', changefreq: 'daily' },
        { loc: `${baseUrl}/opportunities`, priority: '0.8', changefreq: 'daily' },
        { loc: `${baseUrl}/blog`, priority: '0.8', changefreq: 'daily' },
        { loc: `${baseUrl}/how-it-works`, priority: '0.8', changefreq: 'weekly' },
        { loc: `${baseUrl}/about`, priority: '0.7', changefreq: 'monthly' },
        { loc: `${baseUrl}/contact`, priority: '0.7', changefreq: 'monthly' },
        { loc: `${baseUrl}/terms`, priority: '0.5', changefreq: 'monthly' },
        { loc: `${baseUrl}/privacy`, priority: '0.5', changefreq: 'monthly' },
        { loc: `${baseUrl}/refund-policy`, priority: '0.5', changefreq: 'monthly' },
        { loc: `${baseUrl}/expert-policy`, priority: '0.5', changefreq: 'monthly' },
        { loc: `${baseUrl}/acceptable-use`, priority: '0.5', changefreq: 'monthly' }
      ];

      const blogPosts = db.prepare(`SELECT slug, updated_at, published_at FROM blog_posts WHERE status = 'published'`).all();
      const categories = db.prepare(`SELECT slug FROM categories WHERE active = 1`).all();
      const services = db.prepare(`
        SELECT s.id, s.updated_at
        FROM services s
        JOIN users u ON s.provider_id = u.id
        WHERE LOWER(s.listing_status) IN ('active', 'published') AND COALESCE(u.is_suspended, 0) = 0
      `).all();

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

      for (const p of corePages) {
        xml += `  <url>\n    <loc>${p.loc}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`;
      }

      for (const c of categories) {
        xml += `  <url>\n    <loc>${baseUrl}/categories/${encodeURIComponent(c.slug)}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
        xml += `  <url>\n    <loc>${baseUrl}/services?category=${encodeURIComponent(c.slug)}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      }

      for (const b of blogPosts) {
        const lastMod = (b.updated_at || b.published_at || now).slice(0, 10);
        xml += `  <url>\n    <loc>${baseUrl}/blog/${encodeURIComponent(b.slug)}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
      }

      for (const s of services) {
        const lastMod = (s.updated_at || now).slice(0, 10);
        xml += `  <url>\n    <loc>${baseUrl}/services/${encodeURIComponent(s.id)}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      }

      xml += `</urlset>`;
      res.header('Content-Type', 'application/xml');
      res.send(xml);
    } catch (e) {
      res.status(500).send('Error generating sitemap');
    }
  });

  router.get('/sitemap-blog.xml', (req, res) => {
    try {
      const baseUrl = 'https://hirebyminute.com';
      const blogPosts = db.prepare(`SELECT slug, updated_at, published_at FROM blog_posts WHERE status = 'published'`).all();
      const now = new Date().toISOString().slice(0, 10);

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

      for (const b of blogPosts) {
        const lastMod = (b.updated_at || b.published_at || now).slice(0, 10);
        xml += `  <url>\n    <loc>${baseUrl}/blog/${encodeURIComponent(b.slug)}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      }

      xml += `</urlset>`;
      res.header('Content-Type', 'application/xml');
      res.send(xml);
    } catch (e) {
      res.status(500).send('Error generating blog sitemap');
    }
  });

  // ==========================================
  // REVIEWS MODERATION APIS
  // ==========================================
  router.get('/admin/reviews', adminAuthMiddleware, (req, res) => {
    try {
      const reviews = db.prepare(`
        SELECT r.*,
               c.full_name as client_name, c.full_name as reviewer_name, c.email as client_email, c.avatar_url as client_avatar, c.avatar_url as reviewer_avatar,
               p.full_name as provider_name, p.email as provider_email, p.avatar_url as provider_avatar,
               srv.title as service_title
        FROM reviews r
        JOIN users c ON r.client_id = c.id
        JOIN users p ON r.provider_id = p.id
        JOIN services srv ON r.service_id = srv.id
        ORDER BY r.created_at DESC
      `).all().map(r => ({
        ...r,
        rating: Number(r.rating) || 5,
        is_hidden: Number(r.is_hidden) === 1 ? 1 : 0
      }));

      res.json({ reviews, count: reviews.length });
    } catch (err) {
      console.error('[Admin Reviews Fetch Error]', err.message);
      res.status(500).json({ error: 'Failed to retrieve reviews' });
    }
  });

  router.patch('/admin/reviews/:id/visibility', adminAuthMiddleware, (req, res) => {
    const { is_hidden, moderation_note } = req.body;
    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const hiddenVal = is_hidden !== undefined ? (is_hidden ? 1 : 0) : (review.is_hidden ? 0 : 1);
    const note = moderation_note !== undefined ? String(moderation_note).trim() : (review.moderation_note || '');

    db.prepare(`
      UPDATE reviews
      SET is_hidden = ?, moderation_note = ?, moderated_by = ?, moderated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hiddenVal, note, req.user.id, review.id);

    logAuditAction(req.user, hiddenVal ? 'REVIEW_HIDDEN' : 'REVIEW_RESTORED', 'review', review.id, {
      moderation_note: note,
      rating: review.rating,
      client_id: review.client_id,
      provider_id: review.provider_id
    });

    res.json({ success: true, is_hidden: hiddenVal, moderation_note: note });
  });

  // Service Moderation: Toggle Featured
  router.patch('/admin/services/:id/feature', adminAuthMiddleware, (req, res) => {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const newFeatured = (service.is_featured && Number(service.is_featured) === 1) ? 0 : 1;
    db.prepare('UPDATE services SET is_featured = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newFeatured, service.id);

    logAuditAction(req.user, newFeatured ? 'SERVICE_FEATURED' : 'SERVICE_UNFEATURED', 'service', service.id, { title: service.title });
    res.json({ success: true, is_featured: newFeatured });
  });

  router.post('/admin/settings/reset-header-nav', adminAuthMiddleware, (req, res) => {
    const defaultNav = [
      { id: 'services', label: 'Services', url: '/services', order: 1, is_visible: true, is_external: false },
      { id: 'opportunities', label: 'Opportunities', url: '/opportunities', order: 2, is_visible: true, is_external: false },
      { id: 'how-it-works', label: 'How It Works', url: '/#how-it-works', order: 3, is_visible: true, is_external: false }
    ];

    const updateStmt = db.prepare(`
      INSERT OR REPLACE INTO platform_settings (key, value, description, updated_at)
      VALUES ('header_navigation', ?, 'Configurable header navigation items and ordering', CURRENT_TIMESTAMP)
    `);
    updateStmt.run(JSON.stringify(defaultNav));

    logAuditAction(req.user, 'RESET_HEADER_NAVIGATION', 'system', 'header_navigation', { defaultNav });
    res.json({ success: true, header_navigation: defaultNav, message: 'Header navigation reset to defaults successfully.' });
  });

  router.post('/admin/change-password', adminAuthMiddleware, (req, res) => {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    if (current_password) {
      const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
      if (user && !bcrypt.compareSync(current_password, user.password_hash)) {
        return res.status(400).json({ error: 'Current password does not match.' });
      }
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
    `).all().map(c => ({ ...c, fee_usd: Number(c.fee_usd) || 0 }));
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
      'Launch Offer: 100% free expert registration and service listing for 24 hours (₹0.00 fee).',
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
    const rawFee = req.body.listing_fee_inr !== undefined ? req.body.listing_fee_inr : req.body.listing_fee_usd;
    if (rawFee === undefined || isNaN(parseFloat(rawFee))) {
      return res.status(400).json({ error: 'Valid listing fee number is required.' });
    }

    const feeNum = parseFloat(rawFee);
    const updateSetting = db.prepare(`
      INSERT INTO platform_settings (key, value, description)
      VALUES (?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    updateSetting.run('listing_fee_inr', feeNum.toFixed(2), 'Base flat fee in INR charged to experts to activate a service listing');
    updateSetting.run('listing_fee_usd', feeNum.toFixed(2), 'Base flat fee charged to experts to activate a service listing');
    updateSetting.run('currency', CURRENCY, 'Platform base currency');
    updateSetting.run('currency_symbol', CURRENCY_SYMBOL, 'Platform base currency symbol');

    logAuditAction(req.user, 'UPDATE_BASE_LISTING_FEE', 'platform_settings', 'listing_fee_inr', { new_fee: feeNum, currency: CURRENCY });

    res.json({
      success: true,
      base_fee: feeNum,
      currency: CURRENCY,
      currency_symbol: CURRENCY_SYMBOL,
      effective: getEffectiveListingFee()
    });
  });

  // ==========================================
  // FULL-TIME JOBS MARKETPLACE & CAREERS
  // ==========================================

  const safeParseJson = (str, fallback) => {
    if (!str) return fallback;
    try {
      const parsed = JSON.parse(str);
      return parsed !== null ? parsed : fallback;
    } catch {
      return fallback;
    }
  };

  const formatJobResponse = (job) => {
    if (!job) return null;
    return {
      ...job,
      responsibilities: typeof job.responsibilities === 'string' ? safeParseJson(job.responsibilities, []) : (job.responsibilities || []),
      requirements: typeof job.requirements === 'string' ? safeParseJson(job.requirements, []) : (job.requirements || []),
      skills: typeof job.skills === 'string' ? safeParseJson(job.skills, []) : (job.skills || []),
      benefits: typeof job.benefits === 'string' ? safeParseJson(job.benefits, []) : (job.benefits || []),
      company: job.company_name ? {
        id: job.company_id,
        name: job.company_name,
        logo_url: job.company_logo,
        website: job.company_website,
        industry: job.company_industry,
        company_size: job.company_size,
        location: job.company_location,
        description: job.company_description
      } : undefined
    };
  };

  const optionalAuthMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization || req.cookies?.token;
    if (authHeader) {
      try {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.prepare('SELECT id, role, email, full_name, is_suspended FROM users WHERE id = ?').get(decoded.id);
        if (user && !user.is_suspended) {
          req.user = user;
        }
      } catch {
        // Ignored for optional auth
      }
    }
    next();
  };

  // 1. Public Jobs Listing (Search, Filter, Pagination)
  router.get('/jobs', (req, res) => {
    const {
      search,
      work_mode,
      experience_level,
      country,
      city,
      category_id,
      salary_min,
      salary_max,
      sort = 'newest',
      page = 1,
      limit = 12
    } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 12));
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = [
      "j.status = 'published'",
      "(j.application_deadline IS NULL OR j.application_deadline >= CURRENT_TIMESTAMP)",
      "c.status = 'active'"
    ];
    let params = [];

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      whereClauses.push("(LOWER(j.title) LIKE ? OR LOWER(j.description) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(j.skills) LIKE ? OR LOWER(j.department) LIKE ?)");
      params.push(q, q, q, q, q);
    }

    if (work_mode && ['Remote', 'Hybrid', 'On-site'].includes(work_mode)) {
      whereClauses.push("j.work_mode = ?");
      params.push(work_mode);
    }

    if (experience_level && experience_level.trim()) {
      whereClauses.push("j.experience_level = ?");
      params.push(experience_level.trim());
    }

    if (country && country.trim()) {
      whereClauses.push("LOWER(j.country) = LOWER(?)");
      params.push(country.trim());
    }

    if (city && city.trim()) {
      whereClauses.push("LOWER(j.city) = LOWER(?)");
      params.push(city.trim());
    }

    if (category_id && category_id.trim()) {
      whereClauses.push("j.category_id = ?");
      params.push(category_id.trim());
    }

    if (salary_min && !isNaN(Number(salary_min))) {
      whereClauses.push("(j.salary_max IS NULL OR j.salary_max >= ?)");
      params.push(Number(salary_min));
    }

    if (salary_max && !isNaN(Number(salary_max))) {
      whereClauses.push("(j.salary_min IS NULL OR j.salary_min <= ?)");
      params.push(Number(salary_max));
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let orderSql = 'ORDER BY j.featured DESC, j.published_at DESC';
    if (sort === 'salary_high') {
      orderSql = 'ORDER BY COALESCE(j.salary_max, j.salary_min, 0) DESC, j.published_at DESC';
    } else if (sort === 'salary_low') {
      orderSql = 'ORDER BY COALESCE(j.salary_min, j.salary_max, 999999999) ASC, j.published_at DESC';
    } else if (sort === 'featured') {
      orderSql = 'ORDER BY j.featured DESC, j.published_at DESC';
    } else if (sort === 'oldest') {
      orderSql = 'ORDER BY j.published_at ASC';
    }

    const countQuery = `
      SELECT COUNT(*) as count
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      ${whereSql}
    `;
    const total = db.prepare(countQuery).get(...params).count;

    const dataQuery = `
      SELECT j.*,
             c.name as company_name, c.logo_url as company_logo, c.website as company_website,
             c.industry as company_industry, c.company_size, c.location as company_location,
             c.description as company_description,
             cat.name as category_name
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      LEFT JOIN categories cat ON j.category_id = cat.id
      ${whereSql}
      ${orderSql}
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataQuery).all(...params, limitNum, offset);
    const jobs = rows.map(formatJobResponse);

    res.json({
      jobs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    });
  });

  // 2. Featured Public Jobs (for Homepage and Showcases)
  router.get('/jobs/featured', (req, res) => {
    const rows = db.prepare(`
      SELECT j.*,
             c.name as company_name, c.logo_url as company_logo, c.website as company_website,
             c.industry as company_industry, c.company_size, c.location as company_location,
             cat.name as category_name
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      LEFT JOIN categories cat ON j.category_id = cat.id
      WHERE j.status = 'published'
        AND j.featured = 1
        AND (j.application_deadline IS NULL OR j.application_deadline >= CURRENT_TIMESTAMP)
        AND c.status = 'active'
      ORDER BY j.published_at DESC
      LIMIT 6
    `).all();
    res.json({ jobs: rows.map(formatJobResponse) });
  });

  // 3. Single Job Position Detail (with Optional User Application State)
  router.get('/jobs/:idOrSlug', optionalAuthMiddleware, (req, res) => {
    const { idOrSlug } = req.params;
    const row = db.prepare(`
      SELECT j.*,
             c.name as company_name, c.logo_url as company_logo, c.website as company_website,
             c.industry as company_industry, c.company_size, c.location as company_location,
             c.description as company_description,
             cat.name as category_name
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      LEFT JOIN categories cat ON j.category_id = cat.id
      WHERE (j.id = ? OR j.slug = ?)
    `).get(idOrSlug, idOrSlug);

    if (!row) {
      return res.status(404).json({ error: 'Job position not found.' });
    }

    const isAdmin = req.user && req.user.role === 'admin';
    if (!isAdmin && row.status !== 'published') {
      return res.status(404).json({ error: 'Job position is not currently available.' });
    }

    const job = formatJobResponse(row);

    let myApplication = null;
    if (req.user) {
      const app = db.prepare(`
        SELECT id, status, resume_url, cover_note, relevant_experience, skills, created_at, updated_at
        FROM job_applications
        WHERE job_id = ? AND applicant_id = ?
      `).get(job.id, req.user.id);
      if (app) {
        myApplication = {
          ...app,
          skills: safeParseJson(app.skills, [])
        };
      }
    }

    res.json({
      job,
      has_applied: Boolean(myApplication),
      my_application: myApplication
    });
  });

  // 4. Submit Job Application (Authenticated Candidate)
  router.post('/jobs/:id/apply', authMiddleware, (req, res) => {
    const job = db.prepare(`
      SELECT j.*, c.name as company_name
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      WHERE j.id = ? OR j.slug = ?
    `).get(req.params.id, req.params.id);

    if (!job) {
      return res.status(404).json({ error: 'Job position not found.' });
    }

    if (job.status !== 'published') {
      return res.status(400).json({ error: 'This job posting is no longer active or accepting applications.' });
    }

    if (job.application_deadline && new Date(job.application_deadline) < new Date()) {
      return res.status(400).json({ error: 'The deadline to apply for this job has expired.' });
    }

    const existing = db.prepare('SELECT id FROM job_applications WHERE job_id = ? AND applicant_id = ?').get(job.id, req.user.id);
    if (existing) {
      return res.status(400).json({ error: 'You have already submitted an application for this position.' });
    }

    const { resume_url, cover_note, relevant_experience, skills } = req.body;

    if (!resume_url) {
      return res.status(400).json({ error: 'A resume document is required to submit your application.' });
    }

    const appId = `jobapp-${uuidv4().slice(0, 8)}`;
    const skillsJson = JSON.stringify(Array.isArray(skills) ? skills : (typeof skills === 'string' ? skills.split(',').map(s => s.trim()).filter(Boolean) : []));

    db.prepare(`
      INSERT INTO job_applications (id, job_id, applicant_id, resume_url, cover_note, relevant_experience, skills, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Submitted')
    `).run(appId, job.id, req.user.id, resume_url, cover_note || '', relevant_experience || '', skillsJson);

    db.prepare(`
      INSERT INTO job_application_status_history (id, application_id, previous_status, new_status, changed_by, notes)
      VALUES (?, ?, NULL, 'Submitted', ?, 'Application submitted by candidate')
    `).run(uuidv4(), appId, req.user.id);

    try {
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, 'job_application', ?)
      `).run(
        uuidv4(),
        req.user.id,
        'Job Application Submitted',
        `Your application for "${job.title}" at ${job.company_name} was successfully submitted.`,
        `/dashboard/client`
      );
    } catch (notifErr) {
      console.warn('[Notification Warning]', notifErr.message);
    }

    res.status(201).json({
      success: true,
      application_id: appId,
      message: 'Your application has been submitted successfully.'
    });
  });

  // 5. Candidate Dashboard: My Job Applications
  router.get('/my/job-applications', authMiddleware, (req, res) => {
    const rows = db.prepare(`
      SELECT ja.id, ja.job_id, ja.status, ja.resume_url, ja.cover_note, ja.relevant_experience, ja.skills,
             ja.created_at, ja.updated_at,
             j.title as job_title, j.slug as job_slug, j.department, j.employment_type, j.work_mode,
             j.location_text, j.status as job_status,
             c.name as company_name, c.logo_url as company_logo, c.location as company_location
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      WHERE ja.applicant_id = ?
      ORDER BY ja.created_at DESC
    `).all(req.user.id);

    const applications = rows.map(r => ({
      ...r,
      skills: safeParseJson(r.skills, [])
    }));

    res.json({ applications });
  });

  // 6. Candidate Withdraws Application
  router.post('/my/job-applications/:id/withdraw', authMiddleware, (req, res) => {
    const app = db.prepare(`
      SELECT ja.*, j.title as job_title
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      WHERE ja.id = ? AND ja.applicant_id = ?
    `).get(req.params.id, req.user.id);

    if (!app) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    if (app.status === 'Withdrawn') {
      return res.status(400).json({ error: 'This application has already been withdrawn.' });
    }

    if (['Hired', 'Rejected'].includes(app.status)) {
      return res.status(400).json({ error: `Cannot withdraw an application that is already marked as ${app.status}.` });
    }

    db.prepare(`
      UPDATE job_applications
      SET status = 'Withdrawn', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(app.id);

    db.prepare(`
      INSERT INTO job_application_status_history (id, application_id, previous_status, new_status, changed_by, notes)
      VALUES (?, ?, ?, 'Withdrawn', ?, 'Application withdrawn by candidate')
    `).run(uuidv4(), app.id, app.status, req.user.id);

    res.json({ success: true, message: 'Application withdrawn successfully.' });
  });

  // 7. Secure Resume Download / Stream (Admin or Application Owner Only)
  router.get('/job-applications/:id/resume', authMiddleware, (req, res) => {
    const app = db.prepare('SELECT id, applicant_id, resume_url FROM job_applications WHERE id = ?').get(req.params.id);
    if (!app) {
      return res.status(404).json({ error: 'Application not found.' });
    }
    if (req.user.role !== 'admin' && req.user.id !== app.applicant_id) {
      return res.status(403).json({ error: 'Forbidden. You do not have permission to access this resume.' });
    }
    if (!app.resume_url) {
      return res.status(404).json({ error: 'No resume attached to this application.' });
    }

    if (app.resume_url.startsWith('http://') || app.resume_url.startsWith('https://')) {
      return res.redirect(app.resume_url);
    }

    const localUploadsDir = path.join(__dirname, 'uploads');
    const filename = path.basename(app.resume_url);
    const filePath = path.join(localUploadsDir, filename);

    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }

    const altPath = path.join(__dirname, app.resume_url.replace(/^\//, ''));
    if (fs.existsSync(altPath)) {
      return res.sendFile(altPath);
    }

    res.status(404).json({ error: 'Resume file not found on server.' });
  });

  // ==========================================
  // ADMIN COMPANIES MANAGEMENT
  // ==========================================

  router.get('/admin/companies', adminAuthMiddleware, (req, res) => {
    const companies = db.prepare(`
      SELECT c.*,
             COUNT(j.id) as total_jobs,
             SUM(CASE WHEN j.status = 'published' THEN 1 ELSE 0 END) as active_jobs
      FROM companies c
      LEFT JOIN jobs j ON c.id = j.company_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all();
    res.json({ companies });
  });

  router.post('/admin/companies', adminAuthMiddleware, (req, res) => {
    const { name, logo_url, website, industry, company_size, location, description, status = 'active' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Company name is required.' });
    }
    const id = `comp-${uuidv4().slice(0, 8)}`;
    const cleanStatus = ['active', 'archived'].includes(status) ? status : 'active';

    db.prepare(`
      INSERT INTO companies (id, name, logo_url, website, industry, company_size, location, description, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      logo_url || null,
      website ? website.trim() : null,
      industry ? industry.trim() : null,
      company_size || null,
      location ? location.trim() : null,
      description ? description.trim() : null,
      cleanStatus
    );

    logAuditAction(req.user, 'ADMIN_COMPANY_CREATED', 'company', id, { name: name.trim() });
    const created = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
    res.status(201).json({ success: true, company: created });
  });

  router.get('/admin/companies/:id', adminAuthMiddleware, (req, res) => {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found.' });
    }
    const jobs = db.prepare(`
      SELECT j.*, (SELECT COUNT(*) FROM job_applications WHERE job_id = j.id) as applications_count
      FROM jobs j
      WHERE j.company_id = ?
      ORDER BY j.created_at DESC
    `).all(company.id).map(formatJobResponse);

    res.json({ company, jobs });
  });

  router.put('/admin/companies/:id', adminAuthMiddleware, (req, res) => {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found.' });
    }
    const { name, logo_url, website, industry, company_size, location, description, status } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Company name is required.' });
    }
    const cleanStatus = status && ['active', 'archived'].includes(status) ? status : company.status;

    db.prepare(`
      UPDATE companies
      SET name = ?, logo_url = ?, website = ?, industry = ?, company_size = ?, location = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name.trim(),
      logo_url !== undefined ? logo_url : company.logo_url,
      website !== undefined ? (website ? website.trim() : null) : company.website,
      industry !== undefined ? (industry ? industry.trim() : null) : company.industry,
      company_size !== undefined ? company_size : company.company_size,
      location !== undefined ? (location ? location.trim() : null) : company.location,
      description !== undefined ? (description ? description.trim() : null) : company.description,
      cleanStatus,
      company.id
    );

    logAuditAction(req.user, 'ADMIN_COMPANY_UPDATED', 'company', company.id, { name: name.trim(), status: cleanStatus });
    const updated = db.prepare('SELECT * FROM companies WHERE id = ?').get(company.id);
    res.json({ success: true, company: updated });
  });

  router.delete('/admin/companies/:id', adminAuthMiddleware, (req, res) => {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found.' });
    }

    db.prepare('DELETE FROM companies WHERE id = ?').run(company.id);
    logAuditAction(req.user, 'ADMIN_COMPANY_DELETED', 'company', company.id, { name: company.name });
    res.json({ success: true, message: 'Company and associated jobs deleted.' });
  });

  // ==========================================
  // ADMIN JOBS MANAGEMENT
  // ==========================================

  router.get('/admin/jobs', adminAuthMiddleware, (req, res) => {
    const { status, company_id, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = [];
    let params = [];

    if (status && ['draft', 'published', 'closed', 'archived'].includes(status)) {
      whereClauses.push("j.status = ?");
      params.push(status);
    }
    if (company_id && company_id.trim()) {
      whereClauses.push("j.company_id = ?");
      params.push(company_id.trim());
    }
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      whereClauses.push("(LOWER(j.title) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(j.department) LIKE ?)");
      params.push(q, q, q);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as count
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      ${whereSql}
    `;
    const total = db.prepare(countQuery).get(...params).count;

    const dataQuery = `
      SELECT j.*,
             c.name as company_name, c.logo_url as company_logo,
             cat.name as category_name,
             (SELECT COUNT(*) FROM job_applications WHERE job_id = j.id) as applications_count
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      LEFT JOIN categories cat ON j.category_id = cat.id
      ${whereSql}
      ORDER BY j.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataQuery).all(...params, limitNum, offset);

    res.json({
      jobs: rows.map(formatJobResponse),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    });
  });

  router.post('/admin/jobs', adminAuthMiddleware, (req, res) => {
    const {
      company_id,
      title,
      slug,
      department,
      category_id,
      description,
      responsibilities = [],
      requirements = [],
      skills = [],
      benefits = [],
      employment_type = 'Full-time',
      work_mode = 'Remote',
      country,
      city,
      location_text,
      experience_level = 'Mid Level',
      min_experience = 0,
      salary_type = 'undisclosed',
      salary_min,
      salary_max,
      currency = 'INR',
      application_deadline,
      status = 'draft',
      featured = 0
    } = req.body;

    if (!company_id || !title || !description) {
      return res.status(400).json({ error: 'Company, job title, and description are required.' });
    }

    const company = db.prepare('SELECT id FROM companies WHERE id = ?').get(company_id);
    if (!company) {
      return res.status(400).json({ error: 'Selected company does not exist.' });
    }

    const id = `job-${uuidv4().slice(0, 8)}`;
    const cleanSlug = slug && slug.trim()
      ? slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      : `${title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${id.slice(4)}`;

    const cleanStatus = ['draft', 'published', 'closed', 'archived'].includes(status) ? status : 'draft';
    const cleanWorkMode = ['Remote', 'Hybrid', 'On-site'].includes(work_mode) ? work_mode : 'Remote';
    const cleanSalaryType = ['range', 'starting_from', 'up_to', 'undisclosed'].includes(salary_type) ? salary_type : 'undisclosed';
    const publishedAt = cleanStatus === 'published' ? new Date().toISOString() : null;

    db.prepare(`
      INSERT INTO jobs (
        id, company_id, title, slug, department, category_id, description,
        responsibilities, requirements, skills, benefits,
        employment_type, work_mode, country, city, location_text,
        experience_level, min_experience, salary_type, salary_min, salary_max, currency,
        application_deadline, status, featured, published_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      id,
      company_id,
      title.trim(),
      cleanSlug,
      department ? department.trim() : null,
      category_id || null,
      description.trim(),
      JSON.stringify(Array.isArray(responsibilities) ? responsibilities : []),
      JSON.stringify(Array.isArray(requirements) ? requirements : []),
      JSON.stringify(Array.isArray(skills) ? skills : []),
      JSON.stringify(Array.isArray(benefits) ? benefits : []),
      employment_type || 'Full-time',
      cleanWorkMode,
      country ? country.trim() : null,
      city ? city.trim() : null,
      location_text ? location_text.trim() : null,
      experience_level || 'Mid Level',
      Number(min_experience) || 0,
      cleanSalaryType,
      salary_min ? Number(salary_min) : null,
      salary_max ? Number(salary_max) : null,
      currency || 'INR',
      application_deadline ? new Date(application_deadline).toISOString() : null,
      cleanStatus,
      featured ? 1 : 0,
      publishedAt
    );

    logAuditAction(req.user, 'ADMIN_JOB_CREATED', 'job', id, { title: title.trim(), status: cleanStatus, company_id });
    const created = db.prepare(`
      SELECT j.*, c.name as company_name, c.logo_url as company_logo
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      WHERE j.id = ?
    `).get(id);

    res.status(201).json({ success: true, job: formatJobResponse(created) });
  });

  router.get('/admin/jobs/:id', adminAuthMiddleware, (req, res) => {
    const row = db.prepare(`
      SELECT j.*,
             c.name as company_name, c.logo_url as company_logo, c.website as company_website,
             c.industry as company_industry, c.company_size, c.location as company_location,
             cat.name as category_name
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      LEFT JOIN categories cat ON j.category_id = cat.id
      WHERE j.id = ?
    `).get(req.params.id);

    if (!row) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const applications = db.prepare(`
      SELECT ja.*, u.full_name as applicant_name, u.email as applicant_email, u.avatar_url as applicant_avatar
      FROM job_applications ja
      JOIN users u ON ja.applicant_id = u.id
      WHERE ja.job_id = ?
      ORDER BY ja.created_at DESC
    `).all(row.id).map(a => ({
      ...a,
      skills: safeParseJson(a.skills, [])
    }));

    res.json({
      job: formatJobResponse(row),
      applications
    });
  });

  router.put('/admin/jobs/:id', adminAuthMiddleware, (req, res) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const {
      company_id = job.company_id,
      title = job.title,
      slug = job.slug,
      department = job.department,
      category_id = job.category_id,
      description = job.description,
      responsibilities,
      requirements,
      skills,
      benefits,
      employment_type = job.employment_type,
      work_mode = job.work_mode,
      country = job.country,
      city = job.city,
      location_text = job.location_text,
      experience_level = job.experience_level,
      min_experience = job.min_experience,
      salary_type = job.salary_type,
      salary_min = job.salary_min,
      salary_max = job.salary_max,
      currency = job.currency,
      application_deadline = job.application_deadline,
      status = job.status,
      featured = job.featured
    } = req.body;

    const cleanStatus = ['draft', 'published', 'closed', 'archived'].includes(status) ? status : job.status;
    let publishedAt = job.published_at;
    if (cleanStatus === 'published' && job.status !== 'published') {
      publishedAt = new Date().toISOString();
    }

    db.prepare(`
      UPDATE jobs SET
        company_id = ?, title = ?, slug = ?, department = ?, category_id = ?, description = ?,
        responsibilities = ?, requirements = ?, skills = ?, benefits = ?,
        employment_type = ?, work_mode = ?, country = ?, city = ?, location_text = ?,
        experience_level = ?, min_experience = ?, salary_type = ?, salary_min = ?, salary_max = ?, currency = ?,
        application_deadline = ?, status = ?, featured = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      company_id,
      title.trim(),
      slug ? slug.trim() : job.slug,
      department !== undefined ? (department ? department.trim() : null) : job.department,
      category_id || null,
      description.trim(),
      responsibilities !== undefined ? JSON.stringify(Array.isArray(responsibilities) ? responsibilities : []) : job.responsibilities,
      requirements !== undefined ? JSON.stringify(Array.isArray(requirements) ? requirements : []) : job.requirements,
      skills !== undefined ? JSON.stringify(Array.isArray(skills) ? skills : []) : job.skills,
      benefits !== undefined ? JSON.stringify(Array.isArray(benefits) ? benefits : []) : job.benefits,
      employment_type || 'Full-time',
      work_mode || 'Remote',
      country !== undefined ? (country ? country.trim() : null) : job.country,
      city !== undefined ? (city ? city.trim() : null) : job.city,
      location_text !== undefined ? (location_text ? location_text.trim() : null) : job.location_text,
      experience_level || 'Mid Level',
      Number(min_experience) || 0,
      salary_type || 'undisclosed',
      salary_min !== undefined ? (salary_min !== null && !isNaN(Number(salary_min)) ? Number(salary_min) : null) : job.salary_min,
      salary_max !== undefined ? (salary_max !== null && !isNaN(Number(salary_max)) ? Number(salary_max) : null) : job.salary_max,
      currency || 'INR',
      application_deadline ? new Date(application_deadline).toISOString() : null,
      cleanStatus,
      featured ? 1 : 0,
      publishedAt,
      job.id
    );

    logAuditAction(req.user, 'ADMIN_JOB_UPDATED', 'job', job.id, { title: title.trim(), status: cleanStatus });
    const updated = db.prepare(`
      SELECT j.*, c.name as company_name, c.logo_url as company_logo
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      WHERE j.id = ?
    `).get(job.id);

    res.json({ success: true, job: formatJobResponse(updated) });
  });

  router.post('/admin/jobs/:id/publish', adminAuthMiddleware, (req, res) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    db.prepare(`UPDATE jobs SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(job.id);
    logAuditAction(req.user, 'ADMIN_JOB_PUBLISHED', 'job', job.id, { title: job.title });
    res.json({ success: true, message: 'Job position published successfully.' });
  });

  router.post('/admin/jobs/:id/unpublish', adminAuthMiddleware, (req, res) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    db.prepare(`UPDATE jobs SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(job.id);
    logAuditAction(req.user, 'ADMIN_JOB_UNPUBLISHED', 'job', job.id, { title: job.title });
    res.json({ success: true, message: 'Job position reverted to draft.' });
  });

  router.post('/admin/jobs/:id/close', adminAuthMiddleware, (req, res) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    db.prepare(`UPDATE jobs SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(job.id);
    logAuditAction(req.user, 'ADMIN_JOB_CLOSED', 'job', job.id, { title: job.title });
    res.json({ success: true, message: 'Job position marked as closed.' });
  });

  router.post('/admin/jobs/:id/archive', adminAuthMiddleware, (req, res) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    db.prepare(`UPDATE jobs SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(job.id);
    logAuditAction(req.user, 'ADMIN_JOB_ARCHIVED', 'job', job.id, { title: job.title });
    res.json({ success: true, message: 'Job position archived.' });
  });

  router.post('/admin/jobs/:id/toggle-featured', adminAuthMiddleware, (req, res) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const newFeatured = job.featured ? 0 : 1;
    db.prepare(`UPDATE jobs SET featured = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newFeatured, job.id);
    logAuditAction(req.user, newFeatured ? 'ADMIN_JOB_FEATURED' : 'ADMIN_JOB_UNFEATURED', 'job', job.id, { title: job.title });
    res.json({ success: true, featured: newFeatured });
  });

  router.delete('/admin/jobs/:id', adminAuthMiddleware, (req, res) => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    db.prepare('DELETE FROM jobs WHERE id = ?').run(job.id);
    logAuditAction(req.user, 'ADMIN_JOB_DELETED', 'job', job.id, { title: job.title });
    res.json({ success: true, message: 'Job position deleted.' });
  });

  // ==========================================
  // ADMIN JOB APPLICATIONS MANAGEMENT
  // ==========================================

  router.get('/admin/job-applications', adminAuthMiddleware, (req, res) => {
    const { job_id, status, search, page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = [];
    let params = [];

    if (job_id && job_id.trim()) {
      whereClauses.push("ja.job_id = ?");
      params.push(job_id.trim());
    }
    if (status && ['Submitted', 'Under Review', 'Shortlisted', 'Interview', 'Rejected', 'Hired', 'Withdrawn'].includes(status)) {
      whereClauses.push("ja.status = ?");
      params.push(status);
    }
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      whereClauses.push("(LOWER(u.full_name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(j.title) LIKE ? OR LOWER(c.name) LIKE ?)");
      params.push(q, q, q, q);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as count
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      JOIN users u ON ja.applicant_id = u.id
      ${whereSql}
    `;
    const total = db.prepare(countQuery).get(...params).count;

    const dataQuery = `
      SELECT ja.*,
             j.title as job_title, j.employment_type, j.work_mode,
             c.name as company_name, c.logo_url as company_logo,
             u.full_name as applicant_name, u.email as applicant_email, u.avatar_url as applicant_avatar
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      JOIN users u ON ja.applicant_id = u.id
      ${whereSql}
      ORDER BY ja.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataQuery).all(...params, limitNum, offset);

    res.json({
      applications: rows.map(r => ({
        ...r,
        skills: safeParseJson(r.skills, [])
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    });
  });

  router.get('/admin/job-applications/:id', adminAuthMiddleware, (req, res) => {
    const app = db.prepare(`
      SELECT ja.*,
             j.title as job_title, j.slug as job_slug, j.department, j.employment_type, j.work_mode, j.location_text,
             c.name as company_name, c.logo_url as company_logo,
             u.full_name as applicant_name, u.email as applicant_email, u.avatar_url as applicant_avatar, u.country as applicant_country
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      JOIN users u ON ja.applicant_id = u.id
      WHERE ja.id = ?
    `).get(req.params.id);

    if (!app) {
      return res.status(404).json({ error: 'Job application not found.' });
    }

    const history = db.prepare(`
      SELECT h.*, u.full_name as changed_by_name
      FROM job_application_status_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.application_id = ?
      ORDER BY h.created_at ASC
    `).all(app.id);

    res.json({
      application: {
        ...app,
        skills: safeParseJson(app.skills, [])
      },
      history
    });
  });

  router.get('/admin/job-applications/:id/history', adminAuthMiddleware, (req, res) => {
    const history = db.prepare(`
      SELECT h.*, u.full_name as changed_by_name
      FROM job_application_status_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.application_id = ?
      ORDER BY h.created_at ASC
    `).all(req.params.id);
    res.json({ history });
  });

  router.patch('/admin/job-applications/:id/status', adminAuthMiddleware, (req, res) => {
    const app = db.prepare(`
      SELECT ja.*, j.title as job_title, c.name as company_name
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      WHERE ja.id = ?
    `).get(req.params.id);

    if (!app) {
      return res.status(404).json({ error: 'Job application not found.' });
    }

    const { status, admin_notes } = req.body;
    const validStatuses = ['Submitted', 'Under Review', 'Shortlisted', 'Interview', 'Rejected', 'Hired', 'Withdrawn'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const previousStatus = app.status;
    db.prepare(`
      UPDATE job_applications
      SET status = ?, admin_notes = COALESCE(?, admin_notes), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, admin_notes !== undefined ? admin_notes : null, app.id);

    db.prepare(`
      INSERT INTO job_application_status_history (id, application_id, previous_status, new_status, changed_by, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), app.id, previousStatus, status, req.user.id, admin_notes || `Status updated from ${previousStatus} to ${status}`);

    try {
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, 'job_status_update', ?)
      `).run(
        uuidv4(),
        app.applicant_id,
        `Application Update: ${app.job_title}`,
        `Your application for "${app.job_title}" at ${app.company_name} is now: ${status}.`,
        `/dashboard/client`
      );
    } catch (notifErr) {
      console.warn('[Notification Warning]', notifErr.message);
    }

    logAuditAction(req.user, 'ADMIN_JOB_APPLICATION_STATUS_UPDATED', 'job_application', app.id, {
      previous_status: previousStatus,
      new_status: status
    });

    const updated = db.prepare('SELECT * FROM job_applications WHERE id = ?').get(app.id);
    res.json({ success: true, application: updated });
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

  // ==========================================
  // LONG-TERM PROJECT MARKETPLACE ROUTES
  // ==========================================

  const safeJsonParse = (str, fallback = []) => {
    if (!str) return fallback;
    if (typeof str !== 'string') return str;
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  };

  const formatProjectRow = (row, currentUserId = null) => {
    if (!row) return null;
    const isOwner = Boolean(currentUserId && row.client_id === currentUserId);
    return {
      id: row.id,
      client_id: row.client_id,
      is_owner: isOwner,
      title: row.title,
      description: row.description,
      category_id: row.category_id,
      category_name: row.category_name,
      skills: safeJsonParse(row.skills_json, []),
      project_type: row.project_type || 'fixed',
      budget_type: row.budget_type || 'fixed',
      budget_fixed: Number(row.budget_min || 0),
      budget_min: Number(row.budget_min || 0),
      budget_max: Number(row.budget_max || 0),
      currency: row.currency || 'INR',
      deadline: row.deadline || null,
      estimated_duration: row.estimated_duration || null,
      experience_level: row.experience_level || 'intermediate',
      status: row.status || 'OPEN',
      attachments: safeJsonParse(row.attachments_json, []),
      screening_questions: safeJsonParse(row.screening_questions_json, []),
      expected_start_date: row.expected_start_date || null,
      workload_commitment: row.workload_commitment || null,
      deliverables: safeJsonParse(row.deliverables_json, []),
      additional_instructions: row.additional_instructions || null,
      proposals_count: Number(row.proposals_count || 0),
      hired_proposal_id: isOwner ? row.hired_proposal_id : (row.status === 'IN_PROGRESS' || row.status === 'COMPLETED' ? row.hired_proposal_id : null),
      hired_provider_id: row.hired_provider_id || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      client: {
        id: row.client_id,
        name: row.client_name || 'Marketplace Client',
        avatar_url: row.client_avatar || null,
        country: row.client_country || null,
        city: row.client_city || null,
        created_at: row.client_created_at || null,
        projects_count: Number(row.client_projects_count || 1)
      },
      has_applied: Boolean(row.user_proposal_id),
      user_proposal_id: row.user_proposal_id || null
    };
  };

  const formatProposalRow = (row) => {
    if (!row) return null;
    return {
      id: row.id,
      project_id: row.project_id,
      provider_id: row.provider_id,
      bid_amount: Number(row.bid_amount || 0),
      estimated_days: Number(row.estimated_days || 7),
      delivery_time: row.delivery_time || `${row.estimated_days || 7} days`,
      cover_letter: row.cover_letter,
      milestones: safeJsonParse(row.milestones_json, []),
      answers: safeJsonParse(row.answers_json, []),
      attachments: safeJsonParse(row.attachments_json, []),
      status: row.status,
      rejection_reason: row.rejection_reason || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      provider: {
        id: row.provider_id,
        full_name: row.provider_name || 'Specialist',
        avatar_url: row.provider_avatar || null,
        headline: row.provider_headline || 'Expert Consultant',
        rating: row.provider_rating ? Number(row.provider_rating) : null,
        review_count: Number(row.provider_review_count || 0),
        verified: Boolean(row.provider_verified),
        experience_years: Number(row.provider_experience_years || 0),
        skills: safeJsonParse(row.provider_skills_json, [])
      }
    };
  };

  // 1. Create and Publish a Project
  router.post('/projects', authMiddleware, (req, res) => {
    try {
      const {
        title,
        description,
        category_id,
        skills = [],
        project_type = 'fixed',
        budget_type = 'fixed',
        budget_min = 0,
        budget_max = 0,
        budget_fixed,
        currency = 'INR',
        deadline,
        estimated_duration,
        experience_level = 'intermediate',
        attachments = [],
        screening_questions = [],
        expected_start_date,
        workload_commitment,
        deliverables = [],
        additional_instructions,
        status = 'OPEN'
      } = req.body;

      if (!title || !title.trim() || title.trim().length < 5) {
        return res.status(400).json({ error: 'Project title is required and must be at least 5 characters.' });
      }
      if (title.trim().length > 200) {
        return res.status(400).json({ error: 'Project title cannot exceed 200 characters.' });
      }

      if (!description || !description.trim() || description.trim().length < 20) {
        return res.status(400).json({ error: 'Project description is required and must be at least 20 characters.' });
      }

      const cleanSkills = Array.isArray(skills)
        ? skills.filter(s => typeof s === 'string' && s.trim().length > 0).slice(0, 15).map(s => s.trim())
        : [];

      let cleanCategoryName = null;
      if (category_id) {
        const cat = db.prepare('SELECT name FROM categories WHERE id = ?').get(category_id);
        if (cat) cleanCategoryName = cat.name;
      }

      const rawFixed = Number(budget_fixed) || 0;
      const cleanMin = rawFixed > 0 ? rawFixed : Math.max(0, Number(budget_min) || 0);
      const cleanMax = rawFixed > 0 ? rawFixed : Math.max(cleanMin, Number(budget_max) || cleanMin);

      const cleanType = ['fixed', 'hourly'].includes(project_type) ? project_type : 'fixed';
      const cleanBudgetType = ['fixed', 'range'].includes(budget_type) ? budget_type : 'fixed';
      const cleanExp = ['entry', 'intermediate', 'expert'].includes(experience_level) ? experience_level : 'intermediate';
      const cleanStatus = (typeof status === 'string' && status.trim().toUpperCase() === 'DRAFT') ? 'DRAFT' : 'OPEN';
      const cleanStartDate = expected_start_date && typeof expected_start_date === 'string' ? expected_start_date.trim() : null;
      const cleanWorkload = workload_commitment && typeof workload_commitment === 'string' ? workload_commitment.trim() : null;
      const cleanDeliverables = Array.isArray(deliverables)
        ? deliverables.filter(d => typeof d === 'string' && d.trim().length > 0).slice(0, 10).map(d => d.trim())
        : (typeof deliverables === 'string' && deliverables.trim() ? [deliverables.trim()] : []);
      const cleanInstructions = additional_instructions && typeof additional_instructions === 'string' ? additional_instructions.trim() : null;

      const projectId = `proj-${uuidv4().slice(0, 8)}`;

      db.prepare(`
        INSERT INTO projects (
          id, client_id, title, description, category_id, category_name,
          skills_json, project_type, budget_type, budget_min, budget_max, currency,
          deadline, estimated_duration, experience_level, status,
          attachments_json, screening_questions_json, proposals_count,
          expected_start_date, workload_commitment, deliverables_json, additional_instructions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `).run(
        projectId,
        req.user.id,
        title.trim(),
        description.trim(),
        category_id || null,
        cleanCategoryName,
        JSON.stringify(cleanSkills),
        cleanType,
        cleanBudgetType,
        cleanMin,
        cleanMax,
        currency,
        deadline ? new Date(deadline).toISOString() : null,
        estimated_duration ? estimated_duration.trim() : null,
        cleanExp,
        cleanStatus,
        JSON.stringify(Array.isArray(attachments) ? attachments.slice(0, 5) : []),
        JSON.stringify(Array.isArray(screening_questions) ? screening_questions.slice(0, 5) : []),
        cleanStartDate,
        cleanWorkload,
        JSON.stringify(cleanDeliverables),
        cleanInstructions
      );

      // Notification to client
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `notif-${uuidv4().slice(0, 8)}`,
        req.user.id,
        cleanStatus === 'DRAFT' ? 'Project Draft Saved' : 'Project Published',
        cleanStatus === 'DRAFT'
          ? `Your project draft "${title.trim()}" has been saved.`
          : `Your project "${title.trim()}" is now live and accepting proposals.`,
        'success',
        `/projects/${projectId}`
      );

      const created = db.prepare(`
        SELECT p.*,
               u.full_name as client_name, u.avatar_url as client_avatar, u.country as client_country,
               u.city as client_city, u.created_at as client_created_at,
               (SELECT COUNT(*) FROM projects cp WHERE cp.client_id = p.client_id) as client_projects_count
        FROM projects p
        JOIN users u ON p.client_id = u.id
        WHERE p.id = ?
      `).get(projectId);

      res.status(201).json({ success: true, project: formatProjectRow(created, req.user.id) });
    } catch (err) {
      console.error('Error creating project:', err);
      res.status(500).json({ error: 'Failed to create project.' });
    }
  });

  // 2. Discover / List Open Projects (Public & Searchable)
  router.get('/projects', optionalAuthMiddleware, (req, res) => {
    try {
      const {
        search,
        category_id,
        project_type,
        experience_level,
        budget_min,
        budget_max,
        sort = 'newest',
        page = 1,
        limit = 10
      } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
      const offset = (pageNum - 1) * limitNum;

      const whereClauses = ["p.status IN ('OPEN', 'REVIEWING_PROPOSALS')"];
      const params = [];

      if (search && search.trim()) {
        whereClauses.push('(LOWER(p.title) LIKE LOWER(?) OR LOWER(p.description) LIKE LOWER(?))');
        const searchPattern = `%${search.trim()}%`;
        params.push(searchPattern, searchPattern);
      }

      if (category_id && category_id.trim()) {
        whereClauses.push('p.category_id = ?');
        params.push(category_id.trim());
      }

      if (project_type && ['fixed', 'hourly'].includes(project_type)) {
        whereClauses.push('p.project_type = ?');
        params.push(project_type);
      }

      if (experience_level && ['entry', 'intermediate', 'expert'].includes(experience_level)) {
        whereClauses.push('p.experience_level = ?');
        params.push(experience_level);
      }

      if (budget_min && !isNaN(Number(budget_min))) {
        whereClauses.push('p.budget_max >= ?');
        params.push(Number(budget_min));
      }

      if (budget_max && !isNaN(Number(budget_max))) {
        whereClauses.push('p.budget_min <= ?');
        params.push(Number(budget_max));
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      let orderSql = 'ORDER BY p.created_at DESC';
      if (sort === 'budget_high') {
        orderSql = 'ORDER BY COALESCE(p.budget_max, p.budget_min, 0) DESC, p.created_at DESC';
      } else if (sort === 'budget_low') {
        orderSql = 'ORDER BY COALESCE(p.budget_min, p.budget_max, 0) ASC, p.created_at DESC';
      } else if (sort === 'proposals_low') {
        orderSql = 'ORDER BY p.proposals_count ASC, p.created_at DESC';
      }

      const countRow = db.prepare(`SELECT COUNT(*) as count FROM projects p ${whereSql}`).get(...params);
      const total = countRow ? countRow.count : 0;

      const currentUserId = req.user ? req.user.id : null;
      const dataQuery = `
        SELECT p.*,
               u.full_name as client_name, u.avatar_url as client_avatar, u.country as client_country,
               u.city as client_city, u.created_at as client_created_at,
               (SELECT COUNT(*) FROM projects cp WHERE cp.client_id = p.client_id) as client_projects_count
               ${currentUserId ? `, (SELECT id FROM project_proposals pp WHERE pp.project_id = p.id AND pp.provider_id = ?) as user_proposal_id` : ''}
        FROM projects p
        JOIN users u ON p.client_id = u.id
        ${whereSql}
        ${orderSql}
        LIMIT ? OFFSET ?
      `;

      const queryParams = currentUserId ? [currentUserId, ...params, limitNum, offset] : [...params, limitNum, offset];
      const rows = db.prepare(dataQuery).all(...queryParams);

      res.json({
        projects: rows.map(r => formatProjectRow(r, currentUserId)),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum) || 1
        }
      });
    } catch (err) {
      console.error('Error fetching projects:', err);
      res.status(500).json({ error: 'Failed to retrieve projects.' });
    }
  });

  // 3. Get Project Detail
  router.get('/projects/:id', optionalAuthMiddleware, (req, res) => {
    try {
      const currentUserId = req.user ? req.user.id : null;
      const query = `
        SELECT p.*,
               u.full_name as client_name, u.avatar_url as client_avatar, u.country as client_country,
               u.city as client_city, u.created_at as client_created_at,
               (SELECT COUNT(*) FROM projects cp WHERE cp.client_id = p.client_id) as client_projects_count
               ${currentUserId ? `, (SELECT id FROM project_proposals pp WHERE pp.project_id = p.id AND pp.provider_id = ?) as user_proposal_id` : ''}
        FROM projects p
        JOIN users u ON p.client_id = u.id
        WHERE p.id = ?
      `;

      const row = currentUserId
        ? db.prepare(query).get(currentUserId, req.params.id)
        : db.prepare(query).get(req.params.id);

      if (!row) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      let userProposal = null;
      if (currentUserId && row.user_proposal_id) {
        const propRow = db.prepare(`
          SELECT pr.*, u.full_name as provider_name, u.avatar_url as provider_avatar,
                 u.headline as provider_headline, u.rating as provider_rating,
                 u.review_count as provider_review_count, u.verified as provider_verified,
                 u.experience_years as provider_experience_years, u.skills_json as provider_skills_json
          FROM project_proposals pr
          JOIN users u ON pr.provider_id = u.id
          WHERE pr.id = ?
        `).get(row.user_proposal_id);
        userProposal = formatProposalRow(propRow);
      }

      res.json({
        project: formatProjectRow(row, currentUserId),
        user_proposal: userProposal
      });
    } catch (err) {
      console.error('Error fetching project detail:', err);
      res.status(500).json({ error: 'Failed to retrieve project details.' });
    }
  });

  // 4. Update Owned Project (Restricted when Hired / In Progress)
  router.patch('/projects/:id', authMiddleware, (req, res) => {
    try {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      if (project.client_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. You do not own this project.' });
      }

      if (['IN_PROGRESS', 'COMPLETED', 'CLOSED'].includes(project.status)) {
        return res.status(400).json({ error: `Cannot edit project details while status is ${project.status}.` });
      }

      const {
        title,
        description,
        category_id,
        skills,
        budget_min,
        budget_max,
        deadline,
        estimated_duration,
        experience_level,
        expected_start_date,
        workload_commitment,
        deliverables,
        additional_instructions,
        status
      } = req.body;

      const updates = [];
      const params = [];

      if (title && title.trim()) {
        updates.push('title = ?');
        params.push(title.trim());
      }
      if (description && description.trim()) {
        updates.push('description = ?');
        params.push(description.trim());
      }
      if (category_id) {
        updates.push('category_id = ?');
        params.push(category_id);
        const cat = db.prepare('SELECT name FROM categories WHERE id = ?').get(category_id);
        if (cat) {
          updates.push('category_name = ?');
          params.push(cat.name);
        }
      }
      if (Array.isArray(skills)) {
        updates.push('skills_json = ?');
        params.push(JSON.stringify(skills.slice(0, 15)));
      }
      if (budget_min !== undefined) {
        updates.push('budget_min = ?');
        params.push(Math.max(0, Number(budget_min) || 0));
      }
      if (budget_max !== undefined) {
        updates.push('budget_max = ?');
        params.push(Math.max(0, Number(budget_max) || 0));
      }
      if (deadline !== undefined) {
        updates.push('deadline = ?');
        params.push(deadline ? new Date(deadline).toISOString() : null);
      }
      if (estimated_duration !== undefined) {
        updates.push('estimated_duration = ?');
        params.push(estimated_duration ? estimated_duration.trim() : null);
      }
      if (experience_level && ['entry', 'intermediate', 'expert'].includes(experience_level)) {
        updates.push('experience_level = ?');
        params.push(experience_level);
      }
      if (expected_start_date !== undefined) {
        updates.push('expected_start_date = ?');
        params.push(expected_start_date ? String(expected_start_date).trim() : null);
      }
      if (workload_commitment !== undefined) {
        updates.push('workload_commitment = ?');
        params.push(workload_commitment ? String(workload_commitment).trim() : null);
      }
      if (deliverables !== undefined) {
        const cleanDev = Array.isArray(deliverables) ? deliverables.slice(0, 10) : [];
        updates.push('deliverables_json = ?');
        params.push(JSON.stringify(cleanDev));
      }
      if (additional_instructions !== undefined) {
        updates.push('additional_instructions = ?');
        params.push(additional_instructions ? String(additional_instructions).trim() : null);
      }
      if (status && ['OPEN', 'DRAFT', 'CLOSED'].includes(status.toUpperCase())) {
        updates.push('status = ?');
        params.push(status.toUpperCase());
      }

      if (updates.length === 0) {
        return res.json({ success: true, project });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(project.id);

      db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      const updated = db.prepare(`
        SELECT p.*,
               u.full_name as client_name, u.avatar_url as client_avatar, u.country as client_country,
               u.city as client_city, u.created_at as client_created_at,
               (SELECT COUNT(*) FROM projects cp WHERE cp.client_id = p.client_id) as client_projects_count
        FROM projects p
        JOIN users u ON p.client_id = u.id
        WHERE p.id = ?
      `).get(project.id);

      res.json({ success: true, project: formatProjectRow(updated, req.user.id) });
    } catch (err) {
      console.error('Error updating project:', err);
      res.status(500).json({ error: 'Failed to update project.' });
    }
  });

  // 5. Close / Cancel Owned Project
  router.post('/projects/:id/close', authMiddleware, (req, res) => {
    try {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }
      if (project.client_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. You do not own this project.' });
      }
      if (project.status === 'IN_PROGRESS') {
        return res.status(400).json({ error: 'Cannot close an active project directly. Please manage or cancel the active contract first.' });
      }

      db.prepare("UPDATE projects SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(project.id);

      res.json({ success: true, message: 'Project closed successfully.' });
    } catch (err) {
      console.error('Error closing project:', err);
      res.status(500).json({ error: 'Failed to close project.' });
    }
  });

  // 6. List Client Owned Projects
  router.get('/my/projects', authMiddleware, (req, res) => {
    try {
      const { status } = req.query;
      let query = `
        SELECT p.*,
               u.full_name as client_name, u.avatar_url as client_avatar, u.country as client_country,
               u.city as client_city, u.created_at as client_created_at,
               (SELECT COUNT(*) FROM projects cp WHERE cp.client_id = p.client_id) as client_projects_count
        FROM projects p
        JOIN users u ON p.client_id = u.id
        WHERE p.client_id = ?
      `;
      const params = [req.user.id];

      if (status && status !== 'all') {
        query += ' AND p.status = ?';
        params.push(status.toUpperCase());
      }
      query += ' ORDER BY p.created_at DESC';

      const rows = db.prepare(query).all(...params);
      res.json({ projects: rows.map(r => formatProjectRow(r, req.user.id)) });
    } catch (err) {
      console.error('Error listing client projects:', err);
      res.status(500).json({ error: 'Failed to retrieve your projects.' });
    }
  });

  // 7. Submit a Proposal (Expert)
  router.post('/projects/:id/proposals', authMiddleware, (req, res) => {
    try {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      if (project.status !== 'OPEN' && project.status !== 'REVIEWING_PROPOSALS') {
        return res.status(400).json({ error: `Cannot submit proposal. Project is ${project.status}.` });
      }

      if (project.client_id === req.user.id) {
        return res.status(400).json({ error: 'You cannot submit a proposal to your own project.' });
      }

      // Check duplicate proposal
      const existing = db.prepare('SELECT id FROM project_proposals WHERE project_id = ? AND provider_id = ?').get(project.id, req.user.id);
      if (existing) {
        return res.status(400).json({ error: 'You have already submitted a proposal for this project.' });
      }

      const {
        bid_amount,
        estimated_days,
        delivery_time,
        cover_letter,
        milestones = [],
        proposed_milestones = [],
        answers = [],
        screening_answers = []
      } = req.body;

      const cleanAmount = Number(bid_amount);
      if (isNaN(cleanAmount) || cleanAmount <= 0) {
        return res.status(400).json({ error: 'Valid bid amount is required.' });
      }

      if (!cover_letter || !cover_letter.trim() || cover_letter.trim().length < 15) {
        return res.status(400).json({ error: 'Cover letter is required and must be at least 15 characters.' });
      }

      const cleanDays = Math.max(1, parseInt(estimated_days, 10) || 7);
      const cleanDelivery = delivery_time && delivery_time.trim() ? delivery_time.trim() : `${cleanDays} days`;

      const finalMilestones = (Array.isArray(milestones) && milestones.length > 0)
        ? milestones
        : (Array.isArray(proposed_milestones) ? proposed_milestones : []);

      const finalAnswers = (Array.isArray(answers) && answers.length > 0)
        ? answers
        : (Array.isArray(screening_answers) ? screening_answers : []);

      const proposalId = `prop-${uuidv4().slice(0, 8)}`;

      db.prepare(`
        INSERT INTO project_proposals (
          id, project_id, provider_id, bid_amount, estimated_days, delivery_time,
          cover_letter, milestones_json, answers_json, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED')
      `).run(
        proposalId,
        project.id,
        req.user.id,
        cleanAmount,
        cleanDays,
        cleanDelivery,
        cover_letter.trim(),
        JSON.stringify(finalMilestones.slice(0, 10)),
        JSON.stringify(finalAnswers.slice(0, 10))
      );

      // Increment proposal count on project
      db.prepare('UPDATE projects SET proposals_count = proposals_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(project.id);

      // Notification to project owner (client)
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `notif-${uuidv4().slice(0, 8)}`,
        project.client_id,
        'New Proposal Received',
        `${req.user.full_name || 'An expert'} submitted a proposal for "${project.title}".`,
        'info',
        `/projects/${project.id}/proposals`
      );

      // Notification to expert
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `notif-${uuidv4().slice(0, 8)}`,
        req.user.id,
        'Proposal Submitted',
        `Your proposal for "${project.title}" has been successfully submitted.`,
        'success',
        `/projects/${project.id}`
      );

      const created = db.prepare(`
        SELECT pr.*, u.full_name as provider_name, u.avatar_url as provider_avatar,
               u.headline as provider_headline, u.rating as provider_rating,
               u.review_count as provider_review_count, u.verified as provider_verified,
               u.experience_years as provider_experience_years, u.skills_json as provider_skills_json
        FROM project_proposals pr
        JOIN users u ON pr.provider_id = u.id
        WHERE pr.id = ?
      `).get(proposalId);

      res.status(201).json({ success: true, proposal: formatProposalRow(created) });
    } catch (err) {
      console.error('Error submitting proposal:', err);
      res.status(500).json({ error: 'Failed to submit proposal.' });
    }
  });

  // 8. List Proposals for a Project (Owner Client Only)
  router.get('/projects/:id/proposals', authMiddleware, (req, res) => {
    try {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      if (project.client_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. Only the project owner can view proposals.' });
      }

      const rows = db.prepare(`
        SELECT pr.*, u.full_name as provider_name, u.avatar_url as provider_avatar,
               u.headline as provider_headline, u.rating as provider_rating,
               u.review_count as provider_review_count, u.verified as provider_verified,
               u.experience_years as provider_experience_years, u.skills_json as provider_skills_json
        FROM project_proposals pr
        JOIN users u ON pr.provider_id = u.id
        WHERE pr.project_id = ?
        ORDER BY
          CASE pr.status
            WHEN 'HIRED' THEN 1
            WHEN 'SHORTLISTED' THEN 2
            WHEN 'SUBMITTED' THEN 3
            ELSE 4
          END,
          pr.created_at DESC
      `).all(project.id);

      res.json({
        project: formatProjectRow(project, req.user.id),
        proposals: rows.map(formatProposalRow)
      });
    } catch (err) {
      console.error('Error listing proposals for project:', err);
      res.status(500).json({ error: 'Failed to retrieve proposals.' });
    }
  });

  // 9. List Expert's Submitted Proposals
  router.get('/my/proposals', authMiddleware, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT pr.*,
               p.title as project_title, p.status as project_status, p.budget_min, p.budget_max,
               p.currency as project_currency, p.deadline as project_deadline,
               u.full_name as client_name, u.avatar_url as client_avatar
        FROM project_proposals pr
        JOIN projects p ON pr.project_id = p.id
        JOIN users u ON p.client_id = u.id
        WHERE pr.provider_id = ?
        ORDER BY pr.created_at DESC
      `).all(req.user.id);

      const proposals = rows.map(r => ({
        id: r.id,
        project_id: r.project_id,
        project_title: r.project_title,
        project_status: r.project_status,
        project_budget_min: Number(r.budget_min || 0),
        project_budget_max: Number(r.budget_max || 0),
        project_currency: r.project_currency || 'INR',
        project_deadline: r.project_deadline,
        client_name: r.client_name,
        client_avatar: r.client_avatar,
        bid_amount: Number(r.bid_amount || 0),
        estimated_days: Number(r.estimated_days || 7),
        delivery_time: r.delivery_time,
        cover_letter: r.cover_letter,
        status: r.status,
        rejection_reason: r.rejection_reason,
        created_at: r.created_at
      }));

      res.json({ proposals });
    } catch (err) {
      console.error('Error listing user proposals:', err);
      res.status(500).json({ error: 'Failed to retrieve your proposals.' });
    }
  });

  // 10. Shortlist a Proposal (Project Owner Only)
  router.post('/proposals/:id/shortlist', authMiddleware, (req, res) => {
    try {
      const proposal = db.prepare(`
        SELECT pr.*, p.client_id, p.title as project_title
        FROM project_proposals pr
        JOIN projects p ON pr.project_id = p.id
        WHERE pr.id = ?
      `).get(req.params.id);

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found.' });
      }
      if (proposal.client_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. Only the project owner can shortlist proposals.' });
      }
      if (proposal.status === 'HIRED') {
        return res.status(400).json({ error: 'Cannot change status of a hired proposal.' });
      }

      db.prepare("UPDATE project_proposals SET status = 'SHORTLISTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(proposal.id);

      // Update project status to REVIEWING_PROPOSALS if it was OPEN
      db.prepare("UPDATE projects SET status = 'REVIEWING_PROPOSALS', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'").run(proposal.project_id);

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `notif-${uuidv4().slice(0, 8)}`,
        proposal.provider_id,
        'Proposal Shortlisted!',
        `Your proposal for "${proposal.project_title}" has been shortlisted by the client.`,
        'info',
        `/projects/${proposal.project_id}`
      );

      const updatedProposal = db.prepare('SELECT * FROM project_proposals WHERE id = ?').get(proposal.id);
      res.json({ success: true, message: 'Proposal shortlisted.', proposal: formatProposalRow(updatedProposal) });
    } catch (err) {
      console.error('Error shortlisting proposal:', err);
      res.status(500).json({ error: 'Failed to shortlist proposal.' });
    }
  });

  // 11. Reject a Proposal (Project Owner Only)
  router.post('/proposals/:id/reject', authMiddleware, (req, res) => {
    try {
      const proposal = db.prepare(`
        SELECT pr.*, p.client_id
        FROM project_proposals pr
        JOIN projects p ON pr.project_id = p.id
        WHERE pr.id = ?
      `).get(req.params.id);

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found.' });
      }
      if (proposal.client_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. Only the project owner can reject proposals.' });
      }
      if (proposal.status === 'HIRED') {
        return res.status(400).json({ error: 'Cannot reject a hired proposal.' });
      }

      const { reason } = req.body;
      db.prepare(`
        UPDATE project_proposals
        SET status = 'REJECTED', rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(reason ? reason.trim() : null, proposal.id);

      const updatedProposal = db.prepare('SELECT * FROM project_proposals WHERE id = ?').get(proposal.id);
      res.json({ success: true, message: 'Proposal rejected.', proposal: formatProposalRow(updatedProposal) });
    } catch (err) {
      console.error('Error rejecting proposal:', err);
      res.status(500).json({ error: 'Failed to reject proposal.' });
    }
  });

  // 12. Withdraw a Proposal (Provider Author Only)
  router.post('/proposals/:id/withdraw', authMiddleware, (req, res) => {
    try {
      const proposal = db.prepare('SELECT * FROM project_proposals WHERE id = ?').get(req.params.id);
      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found.' });
      }
      if (proposal.provider_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden. You can only withdraw your own proposal.' });
      }
      if (proposal.status === 'HIRED') {
        return res.status(400).json({ error: 'Cannot withdraw a hired proposal.' });
      }

      db.prepare("UPDATE project_proposals SET status = 'WITHDRAWN', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(proposal.id);
      db.prepare('UPDATE projects SET proposals_count = MAX(0, proposals_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(proposal.project_id);

      const updatedProposal = db.prepare('SELECT * FROM project_proposals WHERE id = ?').get(proposal.id);
      res.json({ success: true, message: 'Proposal withdrawn successfully.', proposal: formatProposalRow(updatedProposal) });
    } catch (err) {
      console.error('Error withdrawing proposal:', err);
      res.status(500).json({ error: 'Failed to withdraw proposal.' });
    }
  });

  // 13. ATOMIC HIRE ACTION (Client Accepts Winning Proposal & Starts Contract)
  router.post('/proposals/:id/hire', authMiddleware, (req, res) => {
    try {
      const proposal = db.prepare(`
        SELECT pr.*, p.client_id, p.title as project_title, p.status as project_status,
               p.project_type, p.currency
        FROM project_proposals pr
        JOIN projects p ON pr.project_id = p.id
        WHERE pr.id = ?
      `).get(req.params.id);

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found.' });
      }

      if (proposal.client_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. Only the project owner can hire an expert.' });
      }

      if (proposal.project_status !== 'OPEN' && proposal.project_status !== 'REVIEWING_PROPOSALS') {
        return res.status(400).json({ error: `Cannot hire for this project. Current status is ${proposal.project_status}.` });
      }

      if (proposal.status === 'HIRED') {
        return res.status(400).json({ error: 'This proposal has already been hired.' });
      }

      if (['REJECTED', 'WITHDRAWN'].includes(proposal.status)) {
        return res.status(400).json({ error: `Cannot hire a proposal with status ${proposal.status}.` });
      }

      // Check if a contract already exists for this project (strict one-winner invariant)
      const existingContract = db.prepare('SELECT id FROM project_contracts WHERE project_id = ?').get(proposal.project_id);
      if (existingContract) {
        return res.status(400).json({ error: 'A contract has already been established for this project.' });
      }

      const contractId = `contract-${uuidv4().slice(0, 8)}`;
      const agreedAmount = Number(proposal.bid_amount);
      const currency = proposal.currency || 'INR';

      const clientMilestones = (Array.isArray(req.body.milestones) && req.body.milestones.length > 0)
        ? req.body.milestones
        : safeJsonParse(proposal.milestones_json, []);

      // Execute contract creation, milestone seeding, and status transitions within an atomic transaction
      const executeAtomicHire = typeof db.transaction === 'function'
        ? db.transaction(() => {
            const exContract = db.prepare('SELECT id FROM project_contracts WHERE project_id = ?').get(proposal.project_id);
            if (exContract) {
              throw new Error('A contract has already been established for this project.');
            }

            // 1. Create contract record
            db.prepare(`
              INSERT INTO project_contracts (
                id, project_id, proposal_id, client_id, provider_id,
                title, agreed_amount, currency, project_type, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
            `).run(
              contractId,
              proposal.project_id,
              proposal.id,
              req.user.id,
              proposal.provider_id,
              proposal.project_title,
              agreedAmount,
              currency,
              proposal.project_type || 'fixed'
            );

            // 2. Insert milestones
            if (Array.isArray(clientMilestones) && clientMilestones.length > 0) {
              const insertMilestone = db.prepare(`
                INSERT INTO project_milestones (
                  id, contract_id, project_id, title, description, amount, order_index, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
              `);
              clientMilestones.forEach((m, idx) => {
                insertMilestone.run(
                  `mile-${uuidv4().slice(0, 8)}`,
                  contractId,
                  proposal.project_id,
                  m.title ? m.title.trim() : `Milestone ${idx + 1}`,
                  m.description ? m.description.trim() : null,
                  Number(m.amount || (agreedAmount / clientMilestones.length)),
                  idx
                );
              });
            } else {
              db.prepare(`
                INSERT INTO project_milestones (
                  id, contract_id, project_id, title, description, amount, order_index, status
                ) VALUES (?, ?, ?, ?, ?, ?, 0, 'IN_PROGRESS')
              `).run(
                `mile-${uuidv4().slice(0, 8)}`,
                contractId,
                proposal.project_id,
                'Full Project Deliverable',
                'Agreed scope and final deliverable as specified in project requirements',
                agreedAmount
              );
            }

            // 3. Mark selected proposal as HIRED
            db.prepare("UPDATE project_proposals SET status = 'HIRED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(proposal.id);

            // 4. Mark all other competing proposals as REJECTED with note
            db.prepare(`
              UPDATE project_proposals
              SET status = 'REJECTED', rejection_reason = 'Another candidate was hired for this project', updated_at = CURRENT_TIMESTAMP
              WHERE project_id = ? AND id != ? AND status IN ('SUBMITTED', 'SHORTLISTED')
            `).run(proposal.project_id, proposal.id);

            // 5. Update project state to IN_PROGRESS and link hired provider
            db.prepare(`
              UPDATE projects
              SET status = 'IN_PROGRESS',
                  hired_proposal_id = ?,
                  hired_provider_id = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(proposal.id, proposal.provider_id, proposal.project_id);
          })
        : () => {
            // Non-transactional fallback
            db.prepare(`
              INSERT INTO project_contracts (
                id, project_id, proposal_id, client_id, provider_id,
                title, agreed_amount, currency, project_type, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
            `).run(
              contractId,
              proposal.project_id,
              proposal.id,
              req.user.id,
              proposal.provider_id,
              proposal.project_title,
              agreedAmount,
              currency,
              proposal.project_type || 'fixed'
            );
            if (Array.isArray(clientMilestones) && clientMilestones.length > 0) {
              const insertMilestone = db.prepare(`
                INSERT INTO project_milestones (
                  id, contract_id, project_id, title, description, amount, order_index, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
              `);
              clientMilestones.forEach((m, idx) => {
                insertMilestone.run(
                  `mile-${uuidv4().slice(0, 8)}`,
                  contractId,
                  proposal.project_id,
                  m.title ? m.title.trim() : `Milestone ${idx + 1}`,
                  m.description ? m.description.trim() : null,
                  Number(m.amount || (agreedAmount / clientMilestones.length)),
                  idx
                );
              });
            } else {
              db.prepare(`
                INSERT INTO project_milestones (
                  id, contract_id, project_id, title, description, amount, order_index, status
                ) VALUES (?, ?, ?, ?, ?, ?, 0, 'IN_PROGRESS')
              `).run(
                `mile-${uuidv4().slice(0, 8)}`,
                contractId,
                proposal.project_id,
                'Full Project Deliverable',
                'Agreed scope and final deliverable as specified in project requirements',
                agreedAmount
              );
            }
            db.prepare("UPDATE project_proposals SET status = 'HIRED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(proposal.id);
            db.prepare(`
              UPDATE project_proposals
              SET status = 'REJECTED', rejection_reason = 'Another candidate was hired for this project', updated_at = CURRENT_TIMESTAMP
              WHERE project_id = ? AND id != ? AND status IN ('SUBMITTED', 'SHORTLISTED')
            `).run(proposal.project_id, proposal.id);
            db.prepare(`
              UPDATE projects
              SET status = 'IN_PROGRESS',
                  hired_proposal_id = ?,
                  hired_provider_id = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(proposal.id, proposal.provider_id, proposal.project_id);
          };

      executeAtomicHire();

      // 6. Notify expert
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `notif-${uuidv4().slice(0, 8)}`,
        proposal.provider_id,
        '🎉 Proposal Accepted!',
        `Congratulations! Your proposal for "${proposal.project_title}" has been accepted. Contract is now active.`,
        'success',
        `/contracts/${contractId}`
      );

      // 7. Notify client
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `notif-${uuidv4().slice(0, 8)}`,
        req.user.id,
        'Contract Active',
        `You have hired an expert for "${proposal.project_title}". You can track milestones and work progress in your contract workspace.`,
        'info',
        `/contracts/${contractId}`
      );

      const contract = db.prepare('SELECT * FROM project_contracts WHERE id = ?').get(contractId);
      const milestones = db.prepare('SELECT * FROM project_milestones WHERE contract_id = ? ORDER BY order_index ASC').all(contractId);

      res.status(201).json({
        success: true,
        message: 'Expert hired and contract successfully established.',
        contract: { ...contract, milestones }
      });
    } catch (err) {
      console.error('Error hiring expert:', err);
      res.status(500).json({ error: 'Failed to hire expert and establish contract.' });
    }
  });

  // 14. Get Contract Details & Milestones
  router.get('/contracts/:id', authMiddleware, (req, res) => {
    try {
      const contract = db.prepare(`
        SELECT c.*,
               u_client.full_name as client_name, u_client.avatar_url as client_avatar, u_client.email as client_email,
               u_prov.full_name as provider_name, u_prov.avatar_url as provider_avatar, u_prov.email as provider_email,
               u_prov.headline as provider_headline,
               p.description as project_description, p.category_name, p.skills_json
        FROM project_contracts c
        JOIN users u_client ON c.client_id = u_client.id
        JOIN users u_prov ON c.provider_id = u_prov.id
        JOIN projects p ON c.project_id = p.id
        WHERE c.id = ?
      `).get(req.params.id);

      if (!contract) {
        return res.status(404).json({ error: 'Contract not found.' });
      }

      if (contract.client_id !== req.user.id && contract.provider_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. You do not have access to this contract.' });
      }

      const milestones = db.prepare(`
        SELECT * FROM project_milestones WHERE contract_id = ? ORDER BY order_index ASC
      `).all(contract.id);

      res.json({
        contract: {
          id: contract.id,
          project_id: contract.project_id,
          proposal_id: contract.proposal_id,
          client_id: contract.client_id,
          provider_id: contract.provider_id,
          title: contract.title,
          agreed_amount: Number(contract.agreed_amount),
          currency: contract.currency,
          project_type: contract.project_type,
          status: contract.status,
          work_notes: contract.work_notes,
          completed_at: contract.completed_at,
          client_rating: contract.client_rating !== null && contract.client_rating !== undefined ? Number(contract.client_rating) : null,
          client_review: contract.client_review || null,
          client_reviewed_at: contract.client_reviewed_at || null,
          created_at: contract.created_at,
          client: {
            id: contract.client_id,
            name: contract.client_name,
            avatar_url: contract.client_avatar
          },
          provider: {
            id: contract.provider_id,
            name: contract.provider_name,
            avatar_url: contract.provider_avatar,
            headline: contract.provider_headline
          },
          project: {
            id: contract.project_id,
            description: contract.project_description,
            category_name: contract.category_name,
            skills: safeJsonParse(contract.skills_json, [])
          },
          milestones: milestones.map(m => ({
            id: m.id,
            title: m.title,
            description: m.description,
            amount: Number(m.amount),
            order_index: m.order_index,
            status: m.status,
            submission_notes: m.submission_notes,
            submitted_at: m.submitted_at,
            approved_at: m.approved_at,
            created_at: m.created_at
          }))
        }
      });
    } catch (err) {
      console.error('Error fetching contract details:', err);
      res.status(500).json({ error: 'Failed to retrieve contract.' });
    }
  });

  // 15. List User Contracts (Client or Provider)
  router.get('/my/contracts', authMiddleware, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT c.*,
               u_client.full_name as client_name, u_client.avatar_url as client_avatar,
               u_prov.full_name as provider_name, u_prov.avatar_url as provider_avatar,
               (SELECT COUNT(*) FROM project_milestones pm WHERE pm.contract_id = c.id) as milestones_count,
               (SELECT COUNT(*) FROM project_milestones pm WHERE pm.contract_id = c.id AND pm.status = 'APPROVED') as approved_milestones_count
        FROM project_contracts c
        JOIN users u_client ON c.client_id = u_client.id
        JOIN users u_prov ON c.provider_id = u_prov.id
        WHERE c.client_id = ? OR c.provider_id = ?
        ORDER BY c.created_at DESC
      `).all(req.user.id, req.user.id);

      const contracts = rows.map(r => ({
        id: r.id,
        project_id: r.project_id,
        proposal_id: r.proposal_id,
        client_id: r.client_id,
        provider_id: r.provider_id,
        title: r.title,
        agreed_amount: Number(r.agreed_amount),
        currency: r.currency,
        status: r.status,
        client_rating: r.client_rating !== null && r.client_rating !== undefined ? Number(r.client_rating) : null,
        client_review: r.client_review || null,
        client_reviewed_at: r.client_reviewed_at || null,
        created_at: r.created_at,
        client_name: r.client_name,
        client_avatar: r.client_avatar,
        provider_name: r.provider_name,
        provider_avatar: r.provider_avatar,
        milestones_count: Number(r.milestones_count || 0),
        approved_milestones_count: Number(r.approved_milestones_count || 0)
      }));

      res.json({ contracts });
    } catch (err) {
      console.error('Error listing user contracts:', err);
      res.status(500).json({ error: 'Failed to retrieve your contracts.' });
    }
  });

  // 16. Submit Milestone Work (Expert)
  router.post('/contracts/:id/milestones/:milestoneId/submit', authMiddleware, (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM project_contracts WHERE id = ?').get(req.params.id);
      if (!contract) {
        return res.status(404).json({ error: 'Contract not found.' });
      }

      if (contract.provider_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. Only the hired expert can submit milestone deliverables.' });
      }

      const milestone = db.prepare('SELECT * FROM project_milestones WHERE id = ? AND contract_id = ?').get(req.params.milestoneId, contract.id);
      if (!milestone) {
        return res.status(404).json({ error: 'Milestone not found for this contract.' });
      }

      if (milestone.status === 'APPROVED') {
        return res.status(400).json({ error: 'This milestone is already approved.' });
      }

      const notes = (req.body.notes || req.body.deliverable_notes || (req.body.deliverable_url ? `Deliverable: ${req.body.deliverable_url}` : '')).trim();
      db.prepare(`
        UPDATE project_milestones
        SET status = 'SUBMITTED', submission_notes = ?, submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(notes || null, milestone.id);

      db.prepare("UPDATE project_contracts SET status = 'SUBMITTED_FOR_REVIEW', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(contract.id);

      // Notify client
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `notif-${uuidv4().slice(0, 8)}`,
        contract.client_id,
        'Milestone Submitted for Review',
        `Work deliverable for "${milestone.title}" has been submitted for your review.`,
        'info',
        `/contracts/${contract.id}`
      );

      const updated = db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(milestone.id);
      const updatedContract = db.prepare('SELECT * FROM project_contracts WHERE id = ?').get(contract.id);
      res.json({ success: true, milestone: updated, contract: updatedContract });
    } catch (err) {
      console.error('Error submitting milestone:', err);
      res.status(500).json({ error: 'Failed to submit milestone.' });
    }
  });

  // 17. Approve Milestone Work (Client)
  router.post('/contracts/:id/milestones/:milestoneId/approve', authMiddleware, (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM project_contracts WHERE id = ?').get(req.params.id);
      if (!contract) {
        return res.status(404).json({ error: 'Contract not found.' });
      }

      if (contract.client_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. Only the client can approve milestone deliverables.' });
      }

      const milestone = db.prepare('SELECT * FROM project_milestones WHERE id = ? AND contract_id = ?').get(req.params.milestoneId, contract.id);
      if (!milestone) {
        return res.status(404).json({ error: 'Milestone not found for this contract.' });
      }

      db.prepare(`
        UPDATE project_milestones
        SET status = 'APPROVED', approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(milestone.id);

      // Check if all milestones are now approved
      const pendingCount = db.prepare(`
        SELECT COUNT(*) as count FROM project_milestones
        WHERE contract_id = ? AND status != 'APPROVED'
      `).get(contract.id)?.count || 0;

      let contractCompleted = false;
      if (pendingCount === 0) {
        contractCompleted = true;
        db.prepare("UPDATE project_contracts SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(contract.id);
        db.prepare("UPDATE projects SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(contract.project_id);

        db.prepare(`
          INSERT INTO notifications (id, user_id, title, message, type, link)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `notif-${uuidv4().slice(0, 8)}`,
          contract.provider_id,
          '🎉 Contract Completed!',
          `All milestones for "${contract.title}" have been approved. Project marked as completed.`,
          'success',
          `/contracts/${contract.id}`
        );
      } else {
        db.prepare("UPDATE project_contracts SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(contract.id);
      }

      // Notify expert
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `notif-${uuidv4().slice(0, 8)}`,
        contract.provider_id,
        'Milestone Approved',
        `Your deliverable for "${milestone.title}" has been approved by the client.`,
        'success',
        `/contracts/${contract.id}`
      );

      const updated = db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(milestone.id);
      const updatedContract = db.prepare('SELECT * FROM project_contracts WHERE id = ?').get(contract.id);
      res.json({ success: true, milestone: updated, contract: updatedContract, contract_completed: contractCompleted });
    } catch (err) {
      console.error('Error approving milestone:', err);
      res.status(500).json({ error: 'Failed to approve milestone.' });
    }
  });

  // 18. Request Revision on Milestone Work (Client)
  router.post('/contracts/:id/milestones/:milestoneId/request-revision', authMiddleware, (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM project_contracts WHERE id = ?').get(req.params.id);
      if (!contract) {
        return res.status(404).json({ error: 'Contract not found.' });
      }

      if (contract.client_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. Only the client can request revisions.' });
      }

      const milestone = db.prepare('SELECT * FROM project_milestones WHERE id = ? AND contract_id = ?').get(req.params.milestoneId, contract.id);
      if (!milestone) {
        return res.status(404).json({ error: 'Milestone not found for this contract.' });
      }

      const reason = (req.body.reason || req.body.revision_feedback || req.body.feedback || '').trim();
      if (!reason) {
        return res.status(400).json({ error: 'Reason for revision request is required.' });
      }

      db.prepare(`
        UPDATE project_milestones
        SET status = 'REVISION_REQUESTED', submission_notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(reason, milestone.id);

      db.prepare("UPDATE project_contracts SET status = 'REVISION_REQUESTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(contract.id);

      // Notify expert
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `notif-${uuidv4().slice(0, 8)}`,
        contract.provider_id,
        'Revision Requested',
        `Client requested revisions on milestone "${milestone.title}": ${reason.slice(0, 100)}...`,
        'warning',
        `/contracts/${contract.id}`
      );

      const updated = db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(milestone.id);
      const updatedContract = db.prepare('SELECT * FROM project_contracts WHERE id = ?').get(contract.id);
      res.json({ success: true, milestone: updated, contract: updatedContract });
    } catch (err) {
      console.error('Error requesting milestone revision:', err);
      res.status(500).json({ error: 'Failed to request revision.' });
    }
  });

  // 19. Complete Full Contract (Client)
  router.post('/contracts/:id/complete', authMiddleware, (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM project_contracts WHERE id = ?').get(req.params.id);
      if (!contract) {
        return res.status(404).json({ error: 'Contract not found.' });
      }

      if (contract.client_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. Only the client can complete the contract.' });
      }

      db.prepare("UPDATE project_milestones SET status = 'APPROVED', approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE contract_id = ? AND status != 'APPROVED'").run(contract.id);
      db.prepare("UPDATE project_contracts SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(contract.id);
      db.prepare("UPDATE projects SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(contract.project_id);

      // Notify both parties
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `notif-${uuidv4().slice(0, 8)}`,
        contract.provider_id,
        'Contract Completed',
        `Contract "${contract.title}" has been marked as fully completed by the client.`,
        'success',
        `/contracts/${contract.id}`
      );

      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `notif-${uuidv4().slice(0, 8)}`,
        contract.client_id,
        'Contract Completed',
        `Contract "${contract.title}" has been marked as completed. Thank you for using HireByMinute!`,
        'success',
        `/contracts/${contract.id}`
      );

      res.json({ success: true, message: 'Contract completed successfully.' });
    } catch (err) {
      console.error('Error completing contract:', err);
      res.status(500).json({ error: 'Failed to complete contract.' });
    }
  });

  // 20. Submit Review for Completed Contract (Client Only)
  router.post('/contracts/:id/review', authMiddleware, (req, res) => {
    try {
      const contract = db.prepare('SELECT * FROM project_contracts WHERE id = ?').get(req.params.id);
      if (!contract) {
        return res.status(404).json({ error: 'Contract not found.' });
      }

      if (contract.client_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. Only the client can submit a review for this contract.' });
      }

      if (contract.status !== 'COMPLETED') {
        return res.status(400).json({ error: 'Reviews can only be submitted after the contract has been marked as completed.' });
      }

      if (contract.client_rating) {
        return res.status(400).json({ error: 'You have already submitted a review for this contract.' });
      }

      const { rating, comment } = req.body;
      const numRating = Number(rating);
      if (isNaN(numRating) || numRating < 1 || numRating > 5) {
        return res.status(400).json({ error: 'Rating must be a number between 1 and 5.' });
      }

      const cleanComment = comment ? String(comment).trim() : '';
      if (!cleanComment || cleanComment.length < 5) {
        return res.status(400).json({ error: 'Please provide a review comment (at least 5 characters).' });
      }

      // Record review on contract
      db.prepare(`
        UPDATE project_contracts
        SET client_rating = ?, client_review = ?, client_reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(numRating, cleanComment, contract.id);

      // Recompute provider's overall rating & review_count
      const sessionStats = db.prepare(`
        SELECT COALESCE(SUM(rating), 0) as total_sum, COUNT(*) as count
        FROM reviews
        WHERE provider_id = ?
      `).get(contract.provider_id);

      const contractStats = db.prepare(`
        SELECT COALESCE(SUM(client_rating), 0) as total_sum, COUNT(*) as count
        FROM project_contracts
        WHERE provider_id = ? AND client_rating IS NOT NULL
      `).get(contract.provider_id);

      const totalCount = (sessionStats?.count || 0) + (contractStats?.count || 0);
      const totalSum = (sessionStats?.total_sum || 0) + (contractStats?.total_sum || 0);
      const newAvg = totalCount > 0 ? Number((totalSum / totalCount).toFixed(2)) : 5.0;

      db.prepare(`
        UPDATE users
        SET rating = ?, review_count = ?
        WHERE id = ?
      `).run(newAvg, totalCount, contract.provider_id);

      // Notify expert
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `notif-${uuidv4().slice(0, 8)}`,
        contract.provider_id,
        '⭐ New Client Review Received',
        `Client left a ${numRating}-star review for contract "${contract.title}": "${cleanComment.slice(0, 80)}..."`,
        'success',
        `/contracts/${contract.id}`
      );

      const updated = db.prepare('SELECT * FROM project_contracts WHERE id = ?').get(contract.id);
      res.json({
        success: true,
        message: 'Thank you! Your review has been submitted successfully.',
        contract: updated
      });
    } catch (err) {
      console.error('Error submitting contract review:', err);
      res.status(500).json({ error: 'Failed to submit review.' });
    }
  });

  return router;
};
