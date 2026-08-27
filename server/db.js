const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Resolve database path from environment variable (Render persistent disk) or local default
const configuredDbPath = process.env.DATABASE_PATH || process.env.DATABASE_URL;
const dbPath = configuredDbPath
  ? path.resolve(configuredDbPath)
  : path.join(__dirname, 'hirebyminutes.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys and WAL mode for reliability
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('client', 'provider', 'admin')),
      avatar_url TEXT,
      bio TEXT,
      headline TEXT,
      location TEXT,
      languages_json TEXT DEFAULT '["English"]',
      skills_json TEXT DEFAULT '[]',
      experience_years INTEGER DEFAULT 5,
      rating REAL DEFAULT 5.0,
      review_count INTEGER DEFAULT 0,
      sessions_completed INTEGER DEFAULT 0,
      verified INTEGER DEFAULT 0,
      is_suspended INTEGER DEFAULT 0,
      response_time TEXT DEFAULT 'Within 15 mins',
      member_since TEXT DEFAULT 'August 2026',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      service_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category_id TEXT NOT NULL,
      description TEXT NOT NULL,
      price_per_minute REAL NOT NULL,
      listing_status TEXT NOT NULL DEFAULT 'active' CHECK(listing_status IN ('draft', 'pending_payment', 'active', 'paused', 'expired', 'removed')),
      listing_fee_paid INTEGER DEFAULT 1,
      listing_fee_payment_id TEXT,
      skills_json TEXT NOT NULL DEFAULT '[]',
      languages_json TEXT NOT NULL DEFAULT '["English"]',
      experience_years INTEGER DEFAULT 5,
      available_now INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS provider_availability (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS consultation_requests (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price_per_minute REAL NOT NULL,
      total_price REAL NOT NULL,
      connect_type TEXT NOT NULL DEFAULT 'now' CHECK(connect_type IN ('now', 'scheduled')),
      scheduled_start DATETIME NOT NULL,
      problem_description TEXT NOT NULL,
      attachments_json TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'PENDING_EXPERT' CHECK(status IN ('PENDING_EXPERT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'PAID', 'CANCELLED', 'COMPLETED')),
      response_deadline DATETIME NOT NULL,
      accepted_at DATETIME,
      declined_at DATETIME,
      expired_at DATETIME,
      paid_at DATETIME,
      payment_id TEXT,
      session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      total_price REAL NOT NULL,
      scheduled_start DATETIME NOT NULL,
      scheduled_end DATETIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'COMPLETED')),
      payment_id TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      booking_id TEXT UNIQUE NOT NULL,
      client_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      scheduled_start DATETIME NOT NULL,
      scheduled_end DATETIME NOT NULL,
      actual_start DATETIME,
      actual_end DATETIME,
      duration_minutes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      content TEXT,
      file_url TEXT,
      file_name TEXT,
      file_size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('listing_fee', 'session_payment', 'payout', 'refund')),
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'succeeded' CHECK(status IN ('succeeded', 'pending', 'refunded')),
      reference_id TEXT,
      metadata_json TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      booking_id TEXT UNIQUE NOT NULL,
      session_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category_id TEXT NOT NULL,
      description TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      budget REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_review', 'awarded', 'closed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      message TEXT NOT NULL,
      relevant_experience TEXT NOT NULL,
      proposed_rate REAL,
      availability TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE,
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      read INTEGER DEFAULT 0,
      link TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      admin_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      reporter_name TEXT NOT NULL,
      reported_type TEXT NOT NULL CHECK(reported_type IN ('user', 'service', 'opportunity')),
      reported_id TEXT NOT NULL,
      reported_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
      action_taken TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts INTEGER DEFAULT 0,
      resend_count INTEGER DEFAULT 0,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_evt_email ON email_verification_tokens(email);
    CREATE INDEX IF NOT EXISTS idx_evt_user ON email_verification_tokens(user_id);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash);

    CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      recipient TEXT NOT NULL,
      template TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('QUEUED', 'SENT', 'FAILED')),
      provider_message_id TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient);
  `);

  // Column migrations for existing tables
  const userColumnsToAdd = [
    'ALTER TABLE users ADD COLUMN is_suspended INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN username TEXT',
    'ALTER TABLE users ADD COLUMN location TEXT',
    'ALTER TABLE users ADD COLUMN country TEXT DEFAULT \'United States\'',
    'ALTER TABLE users ADD COLUMN state_region TEXT',
    'ALTER TABLE users ADD COLUMN city TEXT',
    'ALTER TABLE users ADD COLUMN area TEXT',
    'ALTER TABLE users ADD COLUMN languages_json TEXT DEFAULT \'["English"]\'',
    'ALTER TABLE users ADD COLUMN skills_json TEXT DEFAULT \'[]\'',
    'ALTER TABLE users ADD COLUMN experience_years INTEGER DEFAULT 5',
    'ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN profile_visits INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN created_by_admin INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN created_by_admin_id TEXT',
    'ALTER TABLE users ADD COLUMN verification_rejection_reason TEXT',
    'ALTER TABLE users ADD COLUMN last_active DATETIME',
    'ALTER TABLE services ADD COLUMN subcategory TEXT',
    'ALTER TABLE services ADD COLUMN country TEXT DEFAULT \'United States\'',
    'ALTER TABLE services ADD COLUMN city TEXT',
    'ALTER TABLE services ADD COLUMN views_count INTEGER DEFAULT 0',
    'ALTER TABLE opportunities ADD COLUMN subcategory TEXT',
    'ALTER TABLE opportunities ADD COLUMN location TEXT DEFAULT \'Worldwide\'',
    'ALTER TABLE opportunities ADD COLUMN languages_json TEXT DEFAULT \'["English"]\'',
    'ALTER TABLE opportunities ADD COLUMN deadline DATETIME',
    'ALTER TABLE opportunities ADD COLUMN short_description TEXT',
    'ALTER TABLE reports ADD COLUMN admin_notes TEXT',
    'ALTER TABLE reports ADD COLUMN action_taken TEXT'
  ];

  for (const query of userColumnsToAdd) {
    try {
      db.exec(query);
    } catch (e) {
      // Column already exists
    }
  }

  // Populate usernames and worldwide location for seed accounts if null or default
  try {
    const usersWithoutUsername = db.prepare("SELECT id, full_name, email FROM users WHERE username IS NULL OR username = ''").all();
    const updateUsername = db.prepare("UPDATE users SET username = ? WHERE id = ?");
    for (const u of usersWithoutUsername) {
      const baseName = (u.full_name || u.email.split('@')[0])
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '');
      updateUsername.run(baseName || `user_${u.id.slice(-4)}`, u.id);
    }

    // Set rich worldwide location data on core seed accounts
    const seedGeoUpdates = [
      { id: 'usr-arjun', country: 'India', state: 'Haryana', city: 'Gurugram', area: 'Sector 44', langs: '["English", "Hindi"]' },
      { id: 'usr-elena', country: 'Germany', state: 'Berlin', city: 'Berlin', area: 'Mitte', langs: '["English", "German", "Russian"]' },
      { id: 'usr-marcus', country: 'United States', state: 'California', city: 'San Francisco', area: 'SOMA', langs: '["English", "Spanish"]' },
      { id: 'usr-priya', country: 'United Kingdom', state: 'Greater London', city: 'London', area: 'Shoreditch', langs: '["English", "Hindi", "Gujarati"]' },
      { id: 'usr-david', country: 'United States', state: 'New York', city: 'New York', area: 'Manhattan', langs: '["English"]' },
      { id: 'usr-sarah', country: 'United States', state: 'California', city: 'San Francisco', area: 'Mission District', langs: '["English", "Mandarin Chinese"]' }
    ];

    const updateUserGeo = db.prepare(`
      UPDATE users 
      SET country = ?, state_region = ?, city = ?, area = ?, languages_json = ?, email_verified = 1
      WHERE id = ?
    `);

    for (const geo of seedGeoUpdates) {
      updateUserGeo.run(geo.country, geo.state, geo.city, geo.area, geo.langs, geo.id);
    }

    // Also verify admin
    db.prepare(`UPDATE users SET email_verified = 1 WHERE id = 'usr-admin-vishal'`).run();

    // Update corresponding service subcategories and geo
    const seedServiceUpdates = [
      { id: 'srv-arjun-python', subcategory: 'Backend & APIs', country: 'India', city: 'Gurugram', langs: '["English", "Hindi"]' },
      { id: 'srv-elena-figma', subcategory: 'Design Systems & Figma Teardowns', country: 'Germany', city: 'Berlin', langs: '["English", "German", "Russian"]' },
      { id: 'srv-marcus-growth', subcategory: 'B2B Growth & Demand Gen', country: 'United States', city: 'San Francisco', langs: '["English", "Spanish"]' },
      { id: 'srv-priya-llm', subcategory: 'LLM & Prompt Engineering', country: 'United Kingdom', city: 'London', langs: '["English", "Hindi", "Gujarati"]' },
      { id: 'srv-david-cpa', subcategory: 'Startup Tax Advisory', country: 'United States', city: 'New York', langs: '["English"]' }
    ];

    const updateServiceGeo = db.prepare(`
      UPDATE services 
      SET subcategory = ?, country = ?, city = ?, languages_json = ?
      WHERE id = ?
    `);

    for (const srv of seedServiceUpdates) {
      updateServiceGeo.run(srv.subcategory, srv.country, srv.city, srv.langs, srv.id);
    }

  } catch (e) {
    // Ignore migration error
  }

  ensureDefaultCategories();
  ensureSettingsAndAdmin();

  // Seed demo marketplace data ONLY in development/test environments when explicitly requested
  if (process.env.NODE_ENV !== 'production' && (process.env.SEED_DEMO_DATA === 'true' || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development')) {
    seedInitialData();
  }

  // One-time startup migration: Ensure all existing users in the database have strong bcrypt hashes
  try {
    const allUsers = db.prepare('SELECT id, password_hash FROM users').all();
    const updatePass = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    for (const u of allUsers) {
      if (u.password_hash && !u.password_hash.startsWith('$2')) {
        const hashed = bcrypt.hashSync(u.password_hash, 10);
        updatePass.run(hashed, u.id);
      }
    }
  } catch (migErr) {
    console.error('Password hash migration notice:', migErr.message);
  }
}

function ensureDefaultCategories() {
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  if (catCount > 0) return;

  const insertCat = db.prepare(`
    INSERT INTO categories (id, slug, name, icon, description, sort_order, active, service_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const categories = [
    ['cat-tech', 'technology', 'Technology', 'Code2', 'Software engineering, architecture, and system design', 1, 1, 0],
    ['cat-ai', 'ai-data', 'AI & Data', 'Cpu', 'LLM fine-tuning, prompt engineering, data pipelines & ML models', 2, 1, 0],
    ['cat-design', 'design', 'Design', 'Palette', 'UI/UX design, visual identity, Figma review & product design', 3, 1, 0],
    ['cat-marketing', 'marketing', 'Marketing', 'Megaphone', 'B2B growth, paid acquisition, SEO strategy & brand positioning', 4, 1, 0],
    ['cat-business', 'business', 'Business', 'Briefcase', 'Startup fundraising, business strategy & pitch deck reviews', 5, 1, 0],
    ['cat-finance', 'finance', 'Finance & Tax', 'DollarSign', 'Tax advisory, financial modeling & fractional CFO consults', 6, 1, 0],
    ['cat-legal', 'legal', 'Legal', 'Scale', 'Contract review, trademarking, IP protection & compliance', 7, 1, 0],
    ['cat-career', 'career', 'Career & Resume', 'GraduationCap', 'Resume teardowns, mock interviews & engineering leadership coaching', 8, 1, 0],
    ['cat-writing', 'writing', 'Writing & Copy', 'Feather', 'Technical documentation, copy editing & editorial strategy', 9, 1, 0],
    ['cat-video', 'video-audio', 'Video & Audio', 'Video', 'Post-production, sound engineering & video editing consults', 10, 1, 0],
    ['cat-productivity', 'productivity', 'Productivity', 'Zap', 'Notion workspace architecture, workflow automation & ops', 11, 1, 0],
    ['cat-other', 'other', 'Other Consultations', 'HelpCircle', 'Specialized 1-on-1 consultations for niche fields', 12, 1, 0],
  ];

  for (const cat of categories) {
    insertCat.run(...cat);
  }
}

function ensureSettingsAndAdmin() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'vishalkumar75912@gmail.com').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'HBM-Adm!n#2026$Secur3';

  // Ensure default platform settings
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO platform_settings (key, value, description)
    VALUES (?, ?, ?)
  `);

  insertSetting.run('platform_name', 'HireByMinutes', 'The official platform brand name');
  insertSetting.run('listing_fee_usd', '2.00', 'One-time fee in USD to publish a service listing');
  insertSetting.run('platform_fee_percent', '15', 'Standard percentage fee taken from completed session payments');
  insertSetting.run('default_response_time', 'Within 15 mins', 'Target response time for verified providers');
  insertSetting.run('payout_schedule', 'Instant on completion', 'Frequency of expert earnings settlement');

  // Check or upsert admin account
  const existingAdmin = db.prepare('SELECT * FROM users WHERE LOWER(email) = ? OR role = \'admin\' ORDER BY (LOWER(email) = ?) DESC LIMIT 1').get(adminEmail, adminEmail);
  const hashedPassword = bcrypt.hashSync(adminPassword, 10);

  if (!existingAdmin) {
    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, full_name, role, avatar_url, bio, headline, rating, review_count, sessions_completed, verified, email_verified, member_since)
      VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, ?, 5.0, 0, 0, 1, 1, 'August 2026')
    `).run(
      'usr-admin-vishal',
      adminEmail,
      'admin_vishal',
      hashedPassword,
      'Vishal Kumar (Admin)',
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=80',
      'Platform Administrator and Operations Lead for HireByMinutes.',
      'Platform Administrator'
    );
  } else {
    // Check if stored password_hash is a valid bcrypt hash
    let shouldSync = false;
    if (!existingAdmin.password_hash || !existingAdmin.password_hash.startsWith('$2')) {
      // Legacy plaintext password detected - MUST sync to bcrypt hash
      shouldSync = true;
    } else if (process.env.SYNC_ADMIN_PASSWORD === 'true' || process.env.NODE_ENV !== 'production') {
      // In development or when explicitly configured, sync if password does not match
      if (!bcrypt.compareSync(adminPassword, existingAdmin.password_hash)) {
        shouldSync = true;
      }
    }

    if (shouldSync) {
      db.prepare(`UPDATE users SET email = ?, role = 'admin', password_hash = ?, verified = 1, email_verified = 1, is_suspended = 0 WHERE id = ?`).run(adminEmail, hashedPassword, existingAdmin.id);
    } else {
      // Ensure role and email verification are active
      db.prepare(`UPDATE users SET email = ?, role = 'admin', verified = 1, email_verified = 1, is_suspended = 0 WHERE id = ?`).run(adminEmail, existingAdmin.id);
    }
  }
}

function seedInitialData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 1) { // Admin was just created, check if other users exist
    return;
  }

  // Insert Development / Test Fixture Users with Bcrypt Hashed Passwords
  const defaultDemoPasswordHash = bcrypt.hashSync('demo123', 10);
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, full_name, role, avatar_url, bio, headline, rating, review_count, sessions_completed, verified, email_verified, response_time, member_since)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const users = [
    [
      'usr-arjun',
      'arjun@hirebyminutes.com',
      defaultDemoPasswordHash,
      'Arjun Sharma',
      'provider',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      'Staff Backend Engineer with 8+ years building high-throughput distributed systems in Python, FastAPI, and PostgreSQL. I help engineers fix bugs, unblock deployments, and architect scalable APIs in real-time.',
      'Python & FastAPI Expert',
      4.9,
      84,
      84,
      1,
      'Within 10 mins',
      'January 2026'
    ],
    [
      'usr-elena',
      'elena@hirebyminutes.com',
      defaultDemoPasswordHash,
      'Elena Rostova',
      'provider',
      'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop&q=80',
      'Senior Product Designer formerly at Linear & Stripe. Let me review your Figma files, design tokens, typography, and micro-interactions in a high-efficiency 30-minute teardown.',
      'Principal Product & UI/UX Designer',
      5.0,
      120,
      120,
      1,
      'Within 15 mins',
      'November 2025'
    ],
    [
      'usr-marcus',
      'marcus@hirebyminutes.com',
      defaultDemoPasswordHash,
      'Marcus Vance',
      'provider',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
      'Growth lead behind 3 YC startups. I will audit your landing page conversion funnel, paid ads structure, or outbound pipeline in 20 minutes and give you actionable fixes.',
      'B2B Growth & Funnel Strategist',
      4.8,
      62,
      62,
      1,
      'Within 30 mins',
      'February 2026'
    ],
    [
      'usr-priya',
      'priya@hirebyminutes.com',
      defaultDemoPasswordHash,
      'Priya Patel',
      'provider',
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80',
      'AI/LLM Engineer specializing in RAG architectures, prompt evaluations, and cost optimization for production OpenAI/Anthropic apps. Get your AI stack unstuck quickly.',
      'LLM & RAG Systems Architect',
      4.95,
      47,
      47,
      1,
      'Within 15 mins',
      'March 2026'
    ],
    [
      'usr-david',
      'david@hirebyminutes.com',
      defaultDemoPasswordHash,
      'David Miller',
      'provider',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
      'CPA and startup financial advisor. Practical tax mitigation, Delaware C-Corp vs LLC structuring, and capitalization table advisory for early founders.',
      'Startup CPA & Tax Advisor',
      4.9,
      38,
      38,
      0, // Unverified for verification queue demo
      'Within 20 mins',
      'January 2026'
    ],
    [
      'usr-sarah',
      'sarah@hirebyminutes.com',
      defaultDemoPasswordHash,
      'Sarah Chen',
      'client',
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80',
      'Founder building an intelligent scheduling tool. Regularly hiring domain experts for quick technical reviews and strategic decisions.',
      'Founder & Technical Product Manager',
      5.0,
      0,
      14,
      1,
      'Within 5 mins',
      'April 2026'
    ]
  ];

  for (const u of users) {
    insertUser.run(...u);
  }

  // Insert Services
  const insertService = db.prepare(`
    INSERT OR IGNORE INTO services (id, provider_id, title, category_id, description, price_per_minute, listing_status, listing_fee_paid, skills_json, languages_json, experience_years, available_now)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const services = [
    [
      'srv-arjun-python',
      'usr-arjun',
      'Python & FastAPI Code Review and Live Debugging',
      'cat-tech',
      'Bring your failing queries, broken endpoints, or async race conditions. We will inspect your repository, trace performance bottlenecks, and get your backend running smoothly in minutes.',
      1.20,
      'active',
      1,
      JSON.stringify(['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'AsyncIO', 'SQLAlchemy']),
      JSON.stringify(['English', 'Hindi']),
      8,
      1
    ],
    [
      'srv-elena-ui',
      'usr-elena',
      'Figma UI/UX Teardown & Design System Review',
      'cat-design',
      'Hop on a live screen share session. I will critique your visual hierarchy, spacing systems, typography tokens, and conversion friction points with immediate Figma adjustments.',
      1.50,
      'active',
      1,
      JSON.stringify(['Figma', 'UI Design', 'Design Systems', 'UX Research', 'Mobile UX', 'Micro-interactions']),
      JSON.stringify(['English', 'Russian']),
      7,
      1
    ],
    [
      'srv-marcus-growth',
      'usr-marcus',
      'Landing Page & B2B Funnel Conversion Audit',
      'cat-marketing',
      'Let’s pull up your homepage and ads manager. I will pinpoint exactly where users drop off, refine your headline copy, and give you a high-converting experiment roadmap.',
      1.35,
      'active',
      1,
      JSON.stringify(['Growth Marketing', 'B2B SaaS', 'Conversion Rate Optimization', 'Google Ads', 'Copywriting']),
      JSON.stringify(['English']),
      6,
      1
    ],
    [
      'srv-priya-ai',
      'usr-priya',
      'RAG & LLM Production Architecture Consultation',
      'cat-ai',
      'Fix retrieval hallucinations, optimize token spend, and design enterprise-grade chunking and vector search pipelines with LangChain, LlamaIndex, or raw embeddings.',
      2.00,
      'active',
      1,
      JSON.stringify(['OpenAI', 'RAG', 'Vector Databases', 'LangChain', 'Python', 'Embeddings']),
      JSON.stringify(['English', 'Gujarati']),
      6,
      1
    ],
    [
      'srv-david-tax',
      'usr-david',
      'Startup Tax Strategy & Delaware C-Corp Consult',
      'cat-finance',
      'Get answers to complex 83(b) elections, QSBS qualification, state sales tax nexus, and international contractor compliance without paying thousand-dollar retainers.',
      1.75,
      'active',
      1,
      JSON.stringify(['Tax Advisory', 'QSBS', 'C-Corp', 'Financial Modeling', 'Cap Tables']),
      JSON.stringify(['English']),
      9,
      0
    ]
  ];

  for (const s of services) {
    insertService.run(...s);
  }

  // Insert Provider Availability
  const insertAvail = db.prepare(`
    INSERT OR IGNORE INTO provider_availability (id, provider_id, day_of_week, start_time, end_time, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (let day = 1; day <= 5; day++) {
    insertAvail.run(`av-arjun-${day}`, 'usr-arjun', day, '09:00', '19:00', 1);
    insertAvail.run(`av-elena-${day}`, 'usr-elena', day, '10:00', '18:00', 1);
    insertAvail.run(`av-marcus-${day}`, 'usr-marcus', day, '08:30', '17:30', 1);
    insertAvail.run(`av-priya-${day}`, 'usr-priya', day, '09:00', '18:00', 1);
    insertAvail.run(`av-david-${day}`, 'usr-david', day, '10:00', '16:00', 1);
  }

  // Insert Opportunities
  const insertOpp = db.prepare(`
    INSERT OR IGNORE INTO opportunities (id, creator_id, title, category_id, description, duration_minutes, budget, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const opportunities = [
    [
      'opp-1',
      'usr-sarah',
      'Looking for a React & TypeScript Expert to Audit State Architecture',
      'cat-tech',
      'We need an experienced front-end specialist to spend 45 minutes walking through our state management and bundle size before our upcoming public launch.',
      45,
      75.0,
      'open'
    ],
    [
      'opp-2',
      'usr-admin-vishal',
      'Fractional Head of Design for 60-Minute Brand Identity Review',
      'cat-design',
      'Looking for a senior designer to review modern color palettes, typography pairs, and layout systems for an upcoming financial technology portal.',
      60,
      100.0,
      'open'
    ],
    [
      'opp-3',
      'usr-sarah',
      'Prompt Engineer needed to tune Claude 3.7 system prompts for code generation',
      'cat-ai',
      'We are getting inconsistent JSON schemas in our automated agent workflow. Need an AI expert for a 30-minute deep dive on prompt tuning.',
      30,
      60.0,
      'open'
    ]
  ];

  for (const opp of opportunities) {
    insertOpp.run(...opp);
  }

  // Seed sample initial report for moderation demo
  db.prepare(`
    INSERT OR IGNORE INTO reports (id, reporter_id, reporter_name, reported_type, reported_id, reported_name, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    'rep-1',
    'usr-sarah',
    'Sarah Chen',
    'service',
    'srv-marcus-growth',
    'Landing Page & B2B Funnel Conversion Audit',
    'Clarification request on service description availability.'
  );

  // Seed sample initial audit log
  db.prepare(`
    INSERT OR IGNORE INTO audit_logs (id, admin_id, admin_name, action, target_type, target_id, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'log-init-1',
    'usr-admin-vishal',
    'Vishal Kumar (Admin)',
    'PLATFORM_BOOTSTRAP',
    'system',
    'platform_settings',
    JSON.stringify({ note: 'HireByMinutes platform initialized with default settings' })
  );
}

initSchema();

module.exports = db;
