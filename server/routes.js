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

  // Production Health Monitoring Endpoints (Extremely lightweight, Render Free safe, no auth, no external API)
  const handleHealth = (req, res) => {
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
  router.get('/health', handleHealth);
  router.head('/health', handleHealth);
  router.get('/healthz', handleHealth);

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
        { id: 'opportunities', label: 'Opportunities', url: '/opportunities', order: 2, is_visible: true, is_external: false },
        { id: 'how-it-works', label: 'How It Works', url: '/#how-it-works', order: 3, is_visible: true, is_external: false }
      ];

      const result = {
        platform_name: 'HireByMinute',
        logo_url: '',
        header_navigation: defaultNav,
        header_cta_label: 'Sign In / Join',
        header_cta_url: '/auth'
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
        company_description: 'The precision marketplace for on-demand consultations. Hire verified experts for exactly the minutes you need, or monetize specialized knowledge with zero retainers.',
        contact_email: 'support@hirebyminute.com',
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

    // Strictly require email verification for non-admin accounts before session issuance
    if (user.role !== 'admin' && !user.email_verified) {
      return res.status(403).json({
        error: 'Please verify your email address to complete sign-in.',
        requires_verification: true,
        email: user.email
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

    res.status(201).json({
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
      WHERE s.listing_status = 'active' AND u.is_suspended = 0 AND u.email_verified = 1
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
    const { category, subcategory, search, minPrice, maxPrice, rating, verified, availableNow, language, country, city, skill, experience, minCompletedSessions, sort } = req.query;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 24));
    const offset = (page - 1) * limit;

    let whereClause = ` WHERE s.listing_status = 'active' AND u.is_suspended = 0 AND u.email_verified = 1`;
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
      WHERE s.id = ? AND u.is_suspended = 0 AND u.email_verified = 1
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

    const totalMinutesRow = db.prepare(`
      SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes 
      FROM sessions 
      WHERE provider_id = ? AND status = 'COMPLETED'
    `).get(service.provider_id);
    const total_session_minutes = totalMinutesRow ? totalMinutesRow.total_minutes : 0;

    const activeSessionRow = db.prepare(`
      SELECT COUNT(*) as count 
      FROM sessions 
      WHERE provider_id = ? AND status = 'ACTIVE'
    `).get(service.provider_id);
    const isBusy = (activeSessionRow?.count || 0) > 0;

    let availability_status = 'OFFLINE';
    if (service.available_now === 1) {
      availability_status = isBusy ? 'BUSY' : 'AVAILABLE NOW';
    }

    const formattedService = {
      ...service,
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
    const availability = db.prepare(`
      SELECT * FROM provider_availability WHERE provider_id = ? AND is_active = 1 ORDER BY day_of_week ASC
    `).all(service.provider_id);

    // Reviews
    const reviews = db.prepare(`
      SELECT r.*, c.full_name as client_name, c.avatar_url as client_avatar
      FROM reviews r
      JOIN users c ON r.client_id = c.id
      WHERE r.service_id = ? AND COALESCE(r.is_hidden, 0) = 0
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

  // Pay Listing Fee to Activate Service (Secured: strictly allows only valid $0 free promotional activations)
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

    // If fee > 0, direct activation without verified payment gateway processing is strictly prohibited
    if (feeAmount > 0) {
      return res.status(400).json({
        error: `Payment of $${feeAmount.toFixed(2)} is required to activate this listing. Please complete payment via Razorpay.`,
        requires_checkout: true,
        fee: feeAmount
      });
    }

    // Free activation exclusively allowed when server-authoritative effective fee is $0
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

    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      req.user.id,
      'Service is Live (Free Promotion)',
      `"${service.title}" is now active and ready for bookings.`,
      'success',
      `/services/${service.id}`
    );

    res.json({
      success: true,
      free_activated: true,
      message: 'Free launch promotion applied! Service is live.',
      paymentId,
      fee: 0
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

    const keySecret = process.env.RAZORPAY_KEY_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev_razorpay_secret_key_12345' : null);
    if (process.env.NODE_ENV === 'production') {
      if (!keySecret) {
        return res.status(500).json({ error: 'Server configuration error: RAZORPAY_KEY_SECRET is required in production.' });
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
    } else {
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

    // Replay Protection & Idempotency check for payment ID
    if (razorpay_payment_id) {
      const existingPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(razorpay_payment_id);
      if (existingPayment) {
        if (existingPayment.reference_id === service.id) {
          return res.json({
            success: true,
            message: 'Payment was already verified. Service is active.',
            service: db.prepare('SELECT * FROM services WHERE id = ?').get(service.id),
            paymentId: razorpay_payment_id
          });
        }
        return res.status(409).json({ error: 'Payment ID has already been recorded for another transaction.' });
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
      description: `HireByMinute $${listingFeeUsd.toFixed(2)} Service Listing Activation Fee`
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
      message: 'Razorpay payment verified. Your service is now live on HireByMinute!',
      service: updatedService,
      paymentId,
      fee: listingFeeUsd
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
    const keySecret = process.env.RAZORPAY_KEY_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev_razorpay_secret_key_12345' : null);
    if (process.env.NODE_ENV === 'production') {
      if (!keySecret) {
        return res.status(500).json({ error: 'Server configuration error: RAZORPAY_KEY_SECRET is required in production.' });
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
    } else {
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

    // Replay Protection & Idempotency check for payment ID
    if (razorpay_payment_id) {
      const existingPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(razorpay_payment_id);
      if (existingPayment) {
        if (existingPayment.reference_id === request.id) {
          const existingSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(request.session_id);
          return res.json({
            success: true,
            session_id: request.session_id,
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

  // ==========================================
  // RAZORPAY PRODUCTION WEBHOOK HANDLER
  // ==========================================
  router.post('/payments/razorpay-webhook', (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || (process.env.NODE_ENV !== 'production' ? 'whsec_test_secret_for_razorpay_98765' : null);
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
        const amountUsd = paymentEntity?.amount ? Number((paymentEntity.amount / 100).toFixed(2)) : 0;

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
              `).run(pId, request.client_id, request.total_price, request.id, JSON.stringify({
                gateway: 'razorpay_webhook',
                order_id: orderId,
                payment_id: pId,
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
            if (!existingPay) {
              db.prepare(`
                INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
                VALUES (?, ?, 'listing_fee', ?, 'succeeded', ?, ?)
              `).run(pId, service.provider_id, amountUsd || 2.00, service.id, JSON.stringify({
                gateway: 'razorpay_webhook',
                order_id: orderId,
                payment_id: pId,
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
              const addMins = notes.additional_minutes ? parseInt(notes.additional_minutes, 10) : (
                amountUsd > 0 ? Math.round(amountUsd / (db.prepare('SELECT price_per_minute FROM services WHERE id = ?').get(session.service_id)?.price_per_minute || 1)) : 15
              );
              const extensionAmount = amountUsd || Number((addMins * 1.00).toFixed(2));

              db.prepare(`
                INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
                VALUES (?, ?, 'session_payment', ?, 'succeeded', ?, ?)
              `).run(pId, session.client_id, extensionAmount, session.id, JSON.stringify({
                extension: true,
                additional_minutes: addMins,
                session_id: session.id,
                order_id: orderId,
                payment_id: pId,
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
              db.prepare(`
                INSERT INTO payments (id, user_id, type, amount, status, reference_id, metadata_json)
                VALUES (?, ?, 'application_fee', ?, 'succeeded', ?, ?)
              `).run(pId, providerId || opp.creator_id, amountUsd || 2.00, opp.id, JSON.stringify({
                opportunity_id: opp.id,
                opportunity_title: opp.title,
                order_id: orderId,
                payment_id: pId,
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
  });

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

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE sessions 
      SET status = 'COMPLETED', actual_end = ? 
      WHERE id = ?
    `).run(now, session.id);

    db.prepare(`UPDATE bookings SET status = 'COMPLETED' WHERE id = ?`).run(session.booking_id);
    db.prepare(`UPDATE users SET sessions_completed = sessions_completed + 1 WHERE id IN (?, ?)`).run(session.provider_id, session.client_id);

    io.to(`session_${session.id}`).emit('session_expired', {
      sessionId: session.id,
      message: 'Session has been concluded by participant.'
    });
    io.to(`session_${session.id}`).emit('session_completed', {
      sessionId: session.id,
      bookingId: session.booking_id
    });

    const updatedSession = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(session.id);
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
    const amountInPaise = Math.round(extensionAmount * 100);

    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_live_placeholder';
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    try {
      if (process.env.NODE_ENV === 'production' && keySecret && !keyId.includes('placeholder')) {
        const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: amountInPaise,
            currency: 'USD',
            receipt: `ext_${session.id.slice(0, 8)}_${Date.now()}`,
            notes: {
              session_id: session.id,
              additional_minutes: additionalMinutes,
              client_id: req.user.id
            }
          })
        });
        if (!rzpRes.ok) {
          const rzpErr = await rzpRes.json();
          throw new Error(rzpErr.error?.description || 'Razorpay extension order creation failed');
        }
        const rzpOrder = await rzpRes.json();
        return res.json({
          order_id: rzpOrder.id,
          amount: extensionAmount,
          amount_paise: amountInPaise,
          currency: rzpOrder.currency || 'USD',
          key_id: keyId,
          additional_minutes: additionalMinutes,
          rate_per_minute: ratePerMinute
        });
      } else {
        const simulatedOrderId = `order_ext_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
        return res.json({
          order_id: simulatedOrderId,
          amount: extensionAmount,
          amount_paise: amountInPaise,
          currency: 'USD',
          key_id: keyId,
          additional_minutes: additionalMinutes,
          rate_per_minute: ratePerMinute
        });
      }
    } catch (err) {
      console.error('[Session Extension Order Error]', err.message);
      return res.status(500).json({ error: `Payment gateway error: ${err.message}` });
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

    const keySecret = process.env.RAZORPAY_KEY_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev_razorpay_secret_key_12345' : null);
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
      SELECT s.*, srv.title as service_title, srv.price_per_minute, p.full_name as provider_name, p.avatar_url as provider_avatar,
             p.headline as provider_headline, p.rating as provider_rating,
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

    // Client overview stats
    const totalExpertsHired = db.prepare(`
      SELECT COUNT(DISTINCT provider_id) as count FROM sessions WHERE client_id = ? AND status = 'COMPLETED'
    `).get(userId)?.count || 0;

    const totalMinutes = db.prepare(`
      SELECT COALESCE(SUM(duration_minutes), 0) as mins FROM sessions WHERE client_id = ? AND status = 'COMPLETED'
    `).get(userId)?.mins || 0;

    const completedCount = pastSessions.length;
    const ratingsGiven = db.prepare(`
      SELECT COUNT(*) as count FROM reviews WHERE client_id = ?
    `).get(userId)?.count || 0;

    // Previously hired experts for quick 1-click "Hire Again"
    const previouslyHired = db.prepare(`
      SELECT DISTINCT p.id as provider_id, p.full_name, p.avatar_url, p.headline, p.rating,
             srv.id as service_id, srv.title as service_title, srv.price_per_minute,
             COUNT(s.id) as sessions_with_expert
      FROM sessions s
      JOIN users p ON s.provider_id = p.id
      JOIN services srv ON s.service_id = srv.id
      WHERE s.client_id = ? AND s.status = 'COMPLETED'
      GROUP BY p.id, srv.id
      ORDER BY MAX(s.actual_end) DESC
    `).all(userId);

    res.json({
      activeSession,
      consultationRequests,
      upcomingBookings,
      pastSessions,
      payments,
      stats: {
        totalExpertsHired,
        totalSessionMinutes: totalMinutes,
        completedSessions: completedCount,
        ratingsGiven,
        clientRating: req.user.rating || 5.0
      },
      previouslyHiredExperts: previouslyHired
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
    const platformFee15 = Number((grossEarnings * 0.15).toFixed(2));
    const netEarnings = Number((grossEarnings * 0.85).toFixed(2));
    const todayGross = Number(todayEarningsCalc.today_earnings || 0);
    const todayNet = Number((todayGross * 0.85).toFixed(2));

    // Completed sessions breakdown showing transparent 15% platform fee
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
      const fee = Number((gross * 0.15).toFixed(2));
      const net = Number((gross * 0.85).toFixed(2));
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
        total: netEarnings,
        gross: grossEarnings,
        platformFee: platformFee15,
        todayNet,
        todayGross,
        completedSessions: earningsCalc.completed_count || 0,
        totalSessionMinutes: totalMinutesCalc.mins || 0
      },
      completedSessionsBreakdown,
      reviews
    });
  });

  router.post('/provider/toggle-availability', authMiddleware, (req, res) => {
    try {
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

  // Create Razorpay Order for $2.00 Opportunity Application Entry Fee
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

    const isFree = (opp.pricing_type || 'free') === 'free' || Number(opp.entry_fee_usd || 0) <= 0;
    if (isFree) {
      return res.json({
        is_free: true,
        amount: 0.00,
        amount_paise: 0,
        currency: 'USD',
        key_id: process.env.RAZORPAY_KEY_ID || 'rzp_live_placeholder',
        opportunity_id: opp.id
      });
    }

    const appFee = Number(opp.entry_fee_usd);
    const amountInPaise = Math.round(appFee * 100);
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_live_placeholder';
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    try {
      if (process.env.NODE_ENV === 'production' && keySecret && !keyId.includes('placeholder')) {
        const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: amountInPaise,
            currency: 'USD',
            receipt: `app_${opp.id.slice(0, 8)}_${Date.now()}`,
            notes: {
              opportunity_id: opp.id,
              provider_id: req.user.id
            }
          })
        });
        if (!rzpRes.ok) {
          const rzpErr = await rzpRes.json();
          throw new Error(rzpErr.error?.description || 'Razorpay application order creation failed');
        }
        const rzpOrder = await rzpRes.json();
        return res.json({
          is_free: false,
          order_id: rzpOrder.id,
          amount: appFee,
          amount_paise: amountInPaise,
          currency: rzpOrder.currency || 'USD',
          key_id: keyId,
          opportunity_id: opp.id
        });
      } else {
        const simulatedOrderId = `order_app_${uuidv4().replace(/-/g, '').slice(0, 14)}`;
        return res.json({
          is_free: false,
          order_id: simulatedOrderId,
          amount: appFee,
          amount_paise: amountInPaise,
          currency: 'USD',
          key_id: keyId,
          opportunity_id: opp.id
        });
      }
    } catch (err) {
      console.error('[Opportunity Application Order Error]', err.message);
      return res.status(500).json({ error: `Payment gateway error: ${err.message}` });
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
    const keySecret = process.env.RAZORPAY_KEY_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev_razorpay_secret_key_12345' : null);
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

    const appFee = Number(opp.entry_fee_usd) || 2.00;
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
        payment_id: razorpay_payment_id
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
      price_per_minute: Number(s.price_per_minute) || 0,
      bookings_count: Number(s.bookings_count) || 0,
      views_count: Number(s.views_count) || 0,
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
    const { name, slug, icon = 'Tag', description = '', sort_order = 99, subcategories = [], image_url = '' } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug are required.' });

    const cleanSlug = String(slug).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(cleanSlug);
    if (existing) {
      return res.status(409).json({ error: `Category with slug "${cleanSlug}" already exists.` });
    }

    const id = `cat-${uuidv4().slice(0, 8)}`;
    const subcatsJson = JSON.stringify(Array.isArray(subcategories) ? subcategories : []);

    db.prepare(`
      INSERT INTO categories (id, slug, name, icon, description, sort_order, active, subcategories_json, image_url)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, cleanSlug, String(name).trim(), String(icon || 'Tag').trim(), String(description || '').trim(), Number(sort_order) || 0, subcatsJson, String(image_url || '').trim());

    logAuditAction(req.user, 'CATEGORY_CREATED', 'category', id, { name, slug: cleanSlug });
    const created = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    res.status(201).json({ success: true, id, category: created });
  });

  router.put('/admin/categories/:id', adminAuthMiddleware, (req, res) => {
    const { name, slug, icon, description, sort_order, subcategories, image_url, active } = req.body;
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
          image_url = COALESCE(?, image_url)
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

  router.put('/admin/categories/reorder', adminAuthMiddleware, (req, res) => {
    const { order } = req.body;
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
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (process.env.NODE_ENV === 'production' && keySecret && keyId && !keyId.includes('placeholder')) {
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

    const platformTakePercent = 15;
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
        duration_minutes: Number(o.duration_minutes) || 0,
        applications_count: Number(o.applications_count) || 0,
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
      subcategory, location, pricing_type, entry_fee_usd, is_featured, 
      skills, requirements, attachment_url, visibility, deadline, start_date, end_date 
    } = req.body;
    
    const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });

    const cleanPricingType = pricing_type !== undefined ? (pricing_type === 'paid' ? 'paid' : 'free') : opp.pricing_type;
    const cleanFee = entry_fee_usd !== undefined ? Number(entry_fee_usd) : opp.entry_fee_usd;
    const skillsJson = skills !== undefined ? JSON.stringify(Array.isArray(skills) ? skills : []) : opp.skills_json;

    db.prepare(`
      UPDATE opportunities SET
        status = COALESCE(?, status),
        title = COALESCE(?, title),
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
    res.json({ settings: settingsMap });
  });

  router.put('/admin/settings', adminAuthMiddleware, (req, res) => {
    const { 
      platform_name, 
      listing_fee_usd, 
      platform_fee_percent, 
      default_response_time, 
      payout_schedule,
      logo_url,
      header_navigation,
      header_cta_label,
      header_cta_url
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
    if (listing_fee_usd !== undefined) updateStmt.run('listing_fee_usd', String(listing_fee_usd), 'One-time fee in USD to publish a service listing');
    
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

    logAuditAction(req.user, 'PLATFORM_SETTINGS_UPDATED', 'system', 'platform_settings', req.body);
    res.json({ success: true, message: 'Settings updated successfully.' });
  });

  router.put('/admin/footer', adminAuthMiddleware, (req, res) => {
    const { company_description, contact_email, contact_phone, address, copyright_text, designer_credit, social_links, sections } = req.body;

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
      company_description: company_description !== undefined ? String(company_description).trim() : 'The precision marketplace for on-demand consultations.',
      contact_email: contact_email !== undefined ? String(contact_email).trim() : 'support@hirebyminute.com',
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
    const { support_email, business_email, phone, support_hours, address, whatsapp_url, contact_form_enabled } = req.body;

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
      } = req.body;

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
      const { site_title, meta_description, canonical_url, og_title, og_description, og_image, twitter_card, twitter_site } = req.body;

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
        priority: Number(b.priority) || 0,
        is_active: Number(b.is_active) === 1
      }));
      res.json({ banners, count: banners.length });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve banners' });
    }
  });

  router.post('/admin/banners', adminAuthMiddleware, (req, res) => {
    const { title, message, link_url = '', link_text = '', placement = 'global', priority = 0, bg_color = 'moonstone', text_color = 'white', start_date = null, end_date = null, is_active = 1 } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Banner title and message are required.' });
    }

    const id = `banner-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO banners_announcements (
        id, title, message, link_url, link_text, placement, priority, bg_color, text_color, start_date, end_date, is_active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(title).trim(),
      String(message).trim(),
      String(link_url || '').trim(),
      String(link_text || '').trim(),
      String(placement || 'global').trim(),
      Number(priority) || 0,
      String(bg_color || 'moonstone').trim(),
      String(text_color || 'white').trim(),
      start_date ? new Date(start_date).toISOString() : null,
      end_date ? new Date(end_date).toISOString() : null,
      is_active ? 1 : 0,
      req.user.id
    );

    logAuditAction(req.user, 'BANNER_CREATED', 'banner', id, { title, placement });
    const created = db.prepare('SELECT * FROM banners_announcements WHERE id = ?').get(id);
    res.status(201).json({ success: true, banner: created });
  });

  router.put('/admin/banners/:id', adminAuthMiddleware, (req, res) => {
    const banner = db.prepare('SELECT * FROM banners_announcements WHERE id = ?').get(req.params.id);
    if (!banner) return res.status(404).json({ error: 'Banner not found' });

    const { title, message, link_url, link_text, placement, priority, bg_color, text_color, start_date, end_date, is_active } = req.body;

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
      link_url !== undefined ? String(link_url).trim() : null,
      link_text !== undefined ? String(link_text).trim() : null,
      placement || null,
      priority !== undefined ? Number(priority) : null,
      bg_color || null,
      text_color || null,
      start_date ? new Date(start_date).toISOString() : null,
      end_date ? new Date(end_date).toISOString() : null,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      banner.id
    );

    logAuditAction(req.user, 'BANNER_UPDATED', 'banner', banner.id, req.body);
    const updated = db.prepare('SELECT * FROM banners_announcements WHERE id = ?').get(banner.id);
    res.json({ success: true, banner: updated });
  });

  router.patch('/admin/banners/:id/toggle', adminAuthMiddleware, (req, res) => {
    const banner = db.prepare('SELECT * FROM banners_announcements WHERE id = ?').get(req.params.id);
    if (!banner) return res.status(404).json({ error: 'Banner not found' });

    const newActive = banner.is_active ? 0 : 1;
    db.prepare('UPDATE banners_announcements SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newActive, banner.id);
    logAuditAction(req.user, newActive ? 'BANNER_ACTIVATED' : 'BANNER_DEACTIVATED', 'banner', banner.id, { title: banner.title });
    res.json({ success: true, is_active: newActive === 1 });
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
      const pages = db.prepare(`SELECT id, slug, title, meta_title, meta_description, status, updated_by, created_at, updated_at FROM cms_pages ORDER BY slug ASC`).all();
      res.json({ pages, count: pages.length });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve CMS pages' });
    }
  });

  router.get('/admin/cms/pages/:id', adminAuthMiddleware, (req, res) => {
    try {
      const page = db.prepare(`SELECT * FROM cms_pages WHERE id = ? OR slug = ?`).get(req.params.id, req.params.id);
      if (!page) return res.status(404).json({ error: 'Page not found' });
      res.json({ page });
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
  // REVIEWS MODERATION APIS
  // ==========================================
  router.get('/admin/reviews', adminAuthMiddleware, (req, res) => {
    try {
      const reviews = db.prepare(`
        SELECT r.*, 
               c.full_name as client_name, c.email as client_email, c.avatar_url as client_avatar,
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
        is_hidden: Number(r.is_hidden) === 1
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

    res.json({ success: true, is_hidden: hiddenVal === 1, moderation_note: note });
  });

  // Service Moderation: Toggle Featured
  router.patch('/admin/services/:id/feature', adminAuthMiddleware, (req, res) => {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const newFeatured = service.is_featured ? 0 : 1;
    try {
      db.prepare('UPDATE services SET is_featured = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newFeatured, service.id);
    } catch (e) {
      // Column might need safe fallback
    }

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
