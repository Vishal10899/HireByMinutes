// HireByMinutes — Dual-Engine Database Module (PostgreSQL for Render Production / SQLite for Local Dev)
// Provides unified synchronous prepared statement interface: prepare(sql).get / all / run

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Load environment variables with override enabled across potential locations
const envLocations = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '.env.local'),
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '.env.local')
];

for (const loc of envLocations) {
  if (fs.existsSync(loc)) {
    require('dotenv').config({ path: loc });
  }
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Extract and sanitize database URL across standard PostgreSQL variable names
const rawDbUrl = (
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URI ||
  process.env.NEON_DATABASE_URL ||
  process.env.POSTGRESQL_URL ||
  ''
).trim().replace(/^["']|["']$/g, '');

const isPostgres = Boolean(
  rawDbUrl &&
  (rawDbUrl.startsWith('postgres://') || rawDbUrl.startsWith('postgresql://'))
);

console.log(`DATABASE_URL detected: ${isPostgres}`);
console.log(`Database adapter selected: ${isPostgres ? 'PostgreSQL' : 'SQLite'}`);
console.log(`NODE_ENV: ${nodeEnv}`);

let db;

if (isPostgres) {
  console.log('[Database] PostgreSQL/Neon connection selected');
  const { createPostgresDb } = require('./pgDriver');
  db = createPostgresDb(rawDbUrl);
  initPostgresSchema(db);
} else {
  // Local SQLite mode
  const Database = require('better-sqlite3');
  const customDbPath = process.env.DATABASE_PATH;
  let dbPath;
  if (customDbPath) {
    dbPath = path.resolve(customDbPath);
  } else {
    dbPath = path.join(__dirname, 'hirebyminutes.db');
  }

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (isProduction) {
    throw new Error('FATAL: DATABASE_URL is required in production (NODE_ENV=production). Ephemeral SQLite fallback is strictly prohibited on Render Free to prevent data loss.');
  } else {
    console.log(`[Database] Initializing embedded SQLite database at: ${dbPath}`);
  }

  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // Expose async non-blocking wrapper methods
  db.allAsync = (sql, ...params) => Promise.resolve().then(() => {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    return db.prepare(sql).all(...flatParams);
  });
  db.getAsync = (sql, ...params) => Promise.resolve().then(() => {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    return db.prepare(sql).get(...flatParams);
  });
  db.runAsync = (sql, ...params) => Promise.resolve().then(() => {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    return db.prepare(sql).run(...flatParams);
  });
  db.queryAsync = db.allAsync;

  initSqliteSchema(db);
}

function initPostgresSchema(db) {
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(255) UNIQUE,
      password_hash TEXT NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL CHECK(role IN ('client', 'provider', 'admin')),
      avatar_url TEXT,
      bio TEXT,
      headline TEXT,
      location TEXT,
      country VARCHAR(128) DEFAULT 'United States',
      state_region VARCHAR(128),
      city VARCHAR(128),
      area VARCHAR(128),
      languages_json TEXT DEFAULT '["English"]',
      skills_json TEXT DEFAULT '[]',
      experience_years INTEGER DEFAULT 5,
      rating NUMERIC(3,2) DEFAULT 5.0,
      review_count INTEGER DEFAULT 0,
      sessions_completed INTEGER DEFAULT 0,
      verified INTEGER DEFAULT 0,
      is_suspended INTEGER DEFAULT 0,
      email_verified INTEGER DEFAULT 1,
      profile_visits INTEGER DEFAULT 0,
      created_by_admin INTEGER DEFAULT 0,
      created_by_admin_id VARCHAR(64),
      verification_rejection_reason TEXT,
      last_active TIMESTAMP WITH TIME ZONE,
      response_time VARCHAR(64) DEFAULT 'Within 15 mins',
      member_since VARCHAR(64) DEFAULT 'August 2026',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id VARCHAR(64) PRIMARY KEY,
      slug VARCHAR(128) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      icon VARCHAR(64) NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      service_count INTEGER DEFAULT 0,
      subcategories_json TEXT DEFAULT '[]',
      image_url TEXT
    );

    CREATE TABLE IF NOT EXISTS services (
      id VARCHAR(64) PRIMARY KEY,
      provider_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      category_id VARCHAR(64) NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      description TEXT NOT NULL,
      price_per_minute NUMERIC(10,2) NOT NULL,
      listing_status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK(listing_status IN ('draft', 'pending_payment', 'active', 'paused', 'expired', 'removed')),
      listing_fee_paid INTEGER DEFAULT 1,
      listing_fee_payment_id VARCHAR(64),
      skills_json TEXT NOT NULL DEFAULT '[]',
      languages_json TEXT NOT NULL DEFAULT '["English"]',
      experience_years INTEGER DEFAULT 5,
      available_now INTEGER DEFAULT 1,
      subcategory VARCHAR(128),
      country VARCHAR(128) DEFAULT 'United States',
      city VARCHAR(128),
      views_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS provider_availability (
      id VARCHAR(64) PRIMARY KEY,
      provider_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      start_time VARCHAR(16) NOT NULL,
      end_time VARCHAR(16) NOT NULL,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS consultation_requests (
      id VARCHAR(64) PRIMARY KEY,
      client_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_id VARCHAR(64) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      duration_minutes INTEGER NOT NULL,
      price_per_minute NUMERIC(10,2) NOT NULL,
      total_price NUMERIC(10,2) NOT NULL,
      connect_type VARCHAR(32) NOT NULL DEFAULT 'now' CHECK(connect_type IN ('now', 'scheduled')),
      scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
      problem_description TEXT NOT NULL,
      attachments_json TEXT DEFAULT '[]',
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING_EXPERT' CHECK(status IN ('PENDING_EXPERT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'PAID', 'CANCELLED', 'COMPLETED')),
      response_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
      accepted_at TIMESTAMP WITH TIME ZONE,
      declined_at TIMESTAMP WITH TIME ZONE,
      expired_at TIMESTAMP WITH TIME ZONE,
      paid_at TIMESTAMP WITH TIME ZONE,
      payment_id VARCHAR(64),
      session_id VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id VARCHAR(64) PRIMARY KEY,
      client_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_id VARCHAR(64) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      duration_minutes INTEGER NOT NULL,
      total_price NUMERIC(10,2) NOT NULL,
      scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
      scheduled_end TIMESTAMP WITH TIME ZONE NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'COMPLETED')),
      payment_id VARCHAR(64),
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(64) PRIMARY KEY,
      booking_id VARCHAR(64) NOT NULL,
      client_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_id VARCHAR(64) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
      scheduled_end TIMESTAMP WITH TIME ZONE NOT NULL,
      actual_start TIMESTAMP WITH TIME ZONE,
      actual_end TIMESTAMP WITH TIME ZONE,
      duration_minutes INTEGER NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(64) PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      sender_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_name VARCHAR(255) NOT NULL,
      sender_role VARCHAR(32) NOT NULL,
      content TEXT,
      file_url TEXT,
      file_name VARCHAR(255),
      file_size INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id VARCHAR(64) PRIMARY KEY,
      booking_id VARCHAR(64) UNIQUE NOT NULL,
      session_id VARCHAR(64) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      client_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_id VARCHAR(64) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      rating NUMERIC(3,2) NOT NULL,
      comment TEXT NOT NULL,
      is_hidden INTEGER DEFAULT 0,
      moderation_note TEXT,
      moderated_by VARCHAR(64),
      moderated_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(64) NOT NULL CHECK(type IN ('listing_fee', 'session_payment', 'payout', 'refund', 'application_fee')),
      amount NUMERIC(10,2) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'succeeded' CHECK(status IN ('succeeded', 'pending', 'refunded')),
      reference_id VARCHAR(64),
      metadata_json TEXT DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id VARCHAR(64) PRIMARY KEY,
      creator_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      category_id VARCHAR(64) NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      subcategory VARCHAR(128),
      description TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      budget NUMERIC(10,2) NOT NULL,
      location VARCHAR(128) DEFAULT 'Worldwide',
      languages_json TEXT DEFAULT '["English"]',
      deadline TIMESTAMP WITH TIME ZONE,
      short_description TEXT,
      pricing_type VARCHAR(32) NOT NULL DEFAULT 'free' CHECK(pricing_type IN ('free', 'paid')),
      entry_fee_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
      is_featured INTEGER DEFAULT 0,
      skills_json TEXT DEFAULT '[]',
      requirements TEXT,
      attachment_url TEXT,
      visibility VARCHAR(32) DEFAULT 'public' CHECK(visibility IN ('public', 'unlisted')),
      start_date TIMESTAMP WITH TIME ZONE,
      end_date TIMESTAMP WITH TIME ZONE,
      status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_review', 'awarded', 'closed', 'draft', 'archived')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS applications (
      id VARCHAR(64) PRIMARY KEY,
      opportunity_id VARCHAR(64) NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      provider_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      relevant_experience TEXT NOT NULL,
      proposed_rate NUMERIC(10,2),
      availability VARCHAR(128) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
      payment_id VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(64) NOT NULL DEFAULT 'info',
      link TEXT,
      read INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR(64) PRIMARY KEY,
      admin_id VARCHAR(64) NOT NULL,
      admin_name VARCHAR(255) NOT NULL,
      action VARCHAR(128) NOT NULL,
      target_type VARCHAR(64) NOT NULL,
      target_id VARCHAR(64) NOT NULL,
      details_json TEXT DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reports (
      id VARCHAR(64) PRIMARY KEY,
      reporter_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reporter_name VARCHAR(255) NOT NULL,
      reported_type VARCHAR(64) NOT NULL CHECK(reported_type IN ('user', 'service', 'opportunity')),
      reported_id VARCHAR(64) NOT NULL,
      reported_name VARCHAR(255) NOT NULL,
      reason TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
      admin_notes TEXT,
      action_taken TEXT,
      resolution TEXT,
      resolved_by VARCHAR(64),
      resolved_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key VARCHAR(128) PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      code_hash VARCHAR(128) NOT NULL,
      attempts INTEGER DEFAULT 0,
      resend_count INTEGER DEFAULT 0,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      used_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      used_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64),
      recipient VARCHAR(255) NOT NULL,
      template VARCHAR(128) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'SENT',
      provider_message_id VARCHAR(128),
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_visits (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      visitor_ip VARCHAR(64),
      visited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS registration_campaigns (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      fee_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
      start_time TIMESTAMP WITH TIME ZONE NOT NULL,
      end_time TIMESTAMP WITH TIME ZONE NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_by VARCHAR(64) NOT NULL,
      created_by_name VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      event_id VARCHAR(128) PRIMARY KEY,
      event_type VARCHAR(64),
      processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS banners_announcements (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      link_url TEXT,
      link_text VARCHAR(128),
      placement VARCHAR(32) NOT NULL DEFAULT 'global' CHECK(placement IN ('global', 'hero', 'announcement', 'services', 'opportunities')),
      priority INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      bg_color VARCHAR(32) DEFAULT 'moonstone',
      text_color VARCHAR(32) DEFAULT 'white',
      start_date TIMESTAMP WITH TIME ZONE,
      end_date TIMESTAMP WITH TIME ZONE,
      created_by VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cms_pages (
      id VARCHAR(64) PRIMARY KEY,
      slug VARCHAR(128) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      meta_title VARCHAR(255),
      meta_description TEXT,
      content TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'published' CHECK(status IN ('draft', 'published')),
      updated_by VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS faqs (
      id VARCHAR(64) PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category VARCHAR(64) DEFAULT 'General',
      sort_order INTEGER DEFAULT 0,
      is_published INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS companies (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      logo_url TEXT,
      website TEXT,
      industry VARCHAR(128),
      company_size VARCHAR(64),
      location VARCHAR(255),
      description TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id VARCHAR(64) PRIMARY KEY,
      company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(255),
      department VARCHAR(128),
      category_id VARCHAR(64) REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      responsibilities TEXT DEFAULT '[]',
      requirements TEXT DEFAULT '[]',
      skills TEXT DEFAULT '[]',
      benefits TEXT DEFAULT '[]',
      employment_type VARCHAR(64) DEFAULT 'Full-time',
      work_mode VARCHAR(32) NOT NULL DEFAULT 'Remote' CHECK(work_mode IN ('Remote', 'Hybrid', 'On-site')),
      country VARCHAR(128),
      city VARCHAR(128),
      location_text VARCHAR(255),
      experience_level VARCHAR(64) DEFAULT 'Mid Level',
      min_experience INTEGER DEFAULT 0,
      salary_type VARCHAR(32) DEFAULT 'undisclosed' CHECK(salary_type IN ('range', 'starting_from', 'up_to', 'undisclosed')),
      salary_min NUMERIC(12,2),
      salary_max NUMERIC(12,2),
      currency VARCHAR(16) DEFAULT 'USD',
      application_deadline TIMESTAMP WITH TIME ZONE,
      status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'closed', 'archived')),
      featured INTEGER DEFAULT 0,
      published_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_applications (
      id VARCHAR(64) PRIMARY KEY,
      job_id VARCHAR(64) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      applicant_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resume_url TEXT,
      cover_note TEXT,
      relevant_experience TEXT,
      skills TEXT DEFAULT '[]',
      status VARCHAR(32) NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted', 'Under Review', 'Shortlisted', 'Interview', 'Rejected', 'Hired', 'Withdrawn')),
      admin_notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_job_applicant UNIQUE (job_id, applicant_id)
    );

    CREATE TABLE IF NOT EXISTS job_application_status_history (
      id VARCHAR(64) PRIMARY KEY,
      application_id VARCHAR(64) NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
      previous_status VARCHAR(32),
      new_status VARCHAR(32) NOT NULL,
      changed_by VARCHAR(64) NOT NULL,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_banners_active_placement ON banners_announcements(is_active, placement);
    CREATE INDEX IF NOT EXISTS idx_cms_slug ON cms_pages(slug);
    CREATE INDEX IF NOT EXISTS idx_cms_status ON cms_pages(status);
    CREATE INDEX IF NOT EXISTS idx_faqs_pub_order ON faqs(is_published, sort_order);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_category_id ON jobs(category_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_published_at ON jobs(published_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_deadline ON jobs(application_deadline);
    CREATE INDEX IF NOT EXISTS idx_jobs_featured ON jobs(featured);
    CREATE INDEX IF NOT EXISTS idx_job_app_job ON job_applications(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_app_applicant ON job_applications(applicant_id);
    CREATE INDEX IF NOT EXISTS idx_job_app_status ON job_applications(status);

    -- Production Indexes for Performance and Integrity
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_client ON sessions(client_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_booking ON sessions(booking_id);
    CREATE INDEX IF NOT EXISTS idx_cr_status_deadline ON consultation_requests(status, response_deadline);
    CREATE INDEX IF NOT EXISTS idx_cr_client ON consultation_requests(client_id);
    CREATE INDEX IF NOT EXISTS idx_cr_provider ON consultation_requests(provider_id);
    CREATE INDEX IF NOT EXISTS idx_services_listing ON services(listing_status);
    CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_id);
    CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id);
    CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(reference_id);
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings(client_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_provider ON bookings(provider_id);
  `;

  db.exec(schemaSql);
  cleanupFakeAndDemoData(db);
  ensureDefaultCategories(db);
  ensureSettingsAndAdmin(db);
  ensureDefaultCampaigns(db);
  ensureDefaultCmsPages(db);
}

function initSqliteSchema(db) {
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
      country TEXT DEFAULT 'United States',
      state_region TEXT,
      city TEXT,
      area TEXT,
      languages_json TEXT DEFAULT '["English"]',
      skills_json TEXT DEFAULT '[]',
      experience_years INTEGER DEFAULT 5,
      rating REAL DEFAULT 5.0,
      review_count INTEGER DEFAULT 0,
      sessions_completed INTEGER DEFAULT 0,
      verified INTEGER DEFAULT 0,
      is_suspended INTEGER DEFAULT 0,
      email_verified INTEGER DEFAULT 0,
      profile_visits INTEGER DEFAULT 0,
      created_by_admin INTEGER DEFAULT 0,
      created_by_admin_id TEXT,
      verification_rejection_reason TEXT,
      last_active DATETIME,
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
      service_count INTEGER DEFAULT 0,
      subcategories_json TEXT DEFAULT '[]',
      image_url TEXT
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
      subcategory TEXT,
      country TEXT DEFAULT 'United States',
      city TEXT,
      views_count INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      booking_id TEXT UNIQUE NOT NULL,
      session_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      is_hidden INTEGER DEFAULT 0,
      moderation_note TEXT,
      moderated_by TEXT,
      moderated_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('listing_fee', 'session_payment', 'payout', 'refund', 'application_fee')),
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'succeeded' CHECK(status IN ('succeeded', 'pending', 'refunded')),
      reference_id TEXT,
      metadata_json TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category_id TEXT NOT NULL,
      subcategory TEXT,
      description TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      budget REAL NOT NULL,
      location TEXT DEFAULT 'Worldwide',
      languages_json TEXT DEFAULT '["English"]',
      deadline DATETIME,
      short_description TEXT,
      pricing_type TEXT NOT NULL DEFAULT 'free' CHECK(pricing_type IN ('free', 'paid')),
      entry_fee_usd REAL NOT NULL DEFAULT 0.00,
      is_featured INTEGER DEFAULT 0,
      skills_json TEXT DEFAULT '[]',
      requirements TEXT,
      attachment_url TEXT,
      visibility TEXT DEFAULT 'public' CHECK(visibility IN ('public', 'unlisted')),
      start_date DATETIME,
      end_date DATETIME,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_review', 'awarded', 'closed', 'draft', 'archived')),
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
      payment_id TEXT,
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
      admin_notes TEXT,
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

    CREATE TABLE IF NOT EXISTS profile_visits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      visitor_ip TEXT,
      visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS registration_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      fee_usd REAL NOT NULL DEFAULT 0.00,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('scheduled', 'active', 'expired', 'cancelled')),
      created_by TEXT NOT NULL,
      created_by_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_camp_status ON registration_campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_camp_active ON registration_campaigns(is_active);

    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS banners_announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link_url TEXT,
      link_text TEXT,
      placement TEXT NOT NULL DEFAULT 'global' CHECK(placement IN ('global', 'hero', 'announcement', 'services', 'opportunities')),
      priority INTEGER DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      bg_color TEXT DEFAULT 'moonstone',
      text_color TEXT DEFAULT 'white',
      start_date DATETIME,
      end_date DATETIME,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_banners_active_placement ON banners_announcements(is_active, placement);

    CREATE TABLE IF NOT EXISTS cms_pages (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      meta_title TEXT,
      meta_description TEXT,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft', 'published')),
      updated_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS faqs (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      sort_order INTEGER DEFAULT 0,
      is_published INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      logo_url TEXT,
      website TEXT,
      industry TEXT,
      company_size TEXT,
      location TEXT,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      slug TEXT,
      department TEXT,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      responsibilities TEXT DEFAULT '[]',
      requirements TEXT DEFAULT '[]',
      skills TEXT DEFAULT '[]',
      benefits TEXT DEFAULT '[]',
      employment_type TEXT DEFAULT 'Full-time',
      work_mode TEXT NOT NULL DEFAULT 'Remote' CHECK(work_mode IN ('Remote', 'Hybrid', 'On-site')),
      country TEXT,
      city TEXT,
      location_text TEXT,
      experience_level TEXT DEFAULT 'Mid Level',
      min_experience INTEGER DEFAULT 0,
      salary_type TEXT DEFAULT 'undisclosed' CHECK(salary_type IN ('range', 'starting_from', 'up_to', 'undisclosed')),
      salary_min REAL,
      salary_max REAL,
      currency TEXT DEFAULT 'USD',
      application_deadline DATETIME,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'closed', 'archived')),
      featured INTEGER DEFAULT 0,
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_applications (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      applicant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resume_url TEXT,
      cover_note TEXT,
      relevant_experience TEXT,
      skills TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted', 'Under Review', 'Shortlisted', 'Interview', 'Rejected', 'Hired', 'Withdrawn')),
      admin_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(job_id, applicant_id)
    );

    CREATE TABLE IF NOT EXISTS job_application_status_history (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_cms_slug ON cms_pages(slug);
    CREATE INDEX IF NOT EXISTS idx_cms_status ON cms_pages(status);
    CREATE INDEX IF NOT EXISTS idx_faqs_pub_order ON faqs(is_published, sort_order);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_category_id ON jobs(category_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_published_at ON jobs(published_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_deadline ON jobs(application_deadline);
    CREATE INDEX IF NOT EXISTS idx_jobs_featured ON jobs(featured);
    CREATE INDEX IF NOT EXISTS idx_job_app_job ON job_applications(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_app_applicant ON job_applications(applicant_id);
    CREATE INDEX IF NOT EXISTS idx_job_app_status ON job_applications(status);

    -- Production Indexes for Performance and Integrity
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_client ON sessions(client_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_booking ON sessions(booking_id);
    CREATE INDEX IF NOT EXISTS idx_cr_status_deadline ON consultation_requests(status, response_deadline);
    CREATE INDEX IF NOT EXISTS idx_cr_client ON consultation_requests(client_id);
    CREATE INDEX IF NOT EXISTS idx_cr_provider ON consultation_requests(provider_id);
    CREATE INDEX IF NOT EXISTS idx_services_listing ON services(listing_status);
    CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_id);
    CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id);
    CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(reference_id);
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings(client_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_provider ON bookings(provider_id);
  `);

  try {
    db.exec('ALTER TABLE applications ADD COLUMN payment_id TEXT');
  } catch (e) {
    // Column already exists
  }

  const safeAddColumn = (table, colDef) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
    } catch (e) {
      // Column already exists
    }
  };

  safeAddColumn('categories', "subcategories_json TEXT DEFAULT '[]'");
  safeAddColumn('categories', 'image_url TEXT');
  safeAddColumn('opportunities', "pricing_type TEXT DEFAULT 'free'");
  safeAddColumn('opportunities', 'entry_fee_usd REAL DEFAULT 0.00');
  safeAddColumn('opportunities', 'is_featured INTEGER DEFAULT 0');
  safeAddColumn('opportunities', "skills_json TEXT DEFAULT '[]'");
  safeAddColumn('opportunities', 'requirements TEXT');
  safeAddColumn('opportunities', 'attachment_url TEXT');
  safeAddColumn('opportunities', "visibility TEXT DEFAULT 'public'");
  safeAddColumn('opportunities', 'start_date DATETIME');
  safeAddColumn('opportunities', 'end_date DATETIME');
  safeAddColumn('applications', 'fee_paid REAL DEFAULT 0.00');
  safeAddColumn('reviews', 'is_hidden INTEGER DEFAULT 0');
  safeAddColumn('reviews', 'moderation_note TEXT');
  safeAddColumn('reviews', 'moderated_by TEXT');
  safeAddColumn('reviews', 'moderated_at DATETIME');

  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='payments'").get();
    if (tableInfo && tableInfo.sql && !tableInfo.sql.includes('application_fee')) {
      db.exec(`
        PRAGMA foreign_keys=off;
        BEGIN TRANSACTION;
        CREATE TABLE payments_migrated (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('listing_fee', 'session_payment', 'payout', 'refund', 'application_fee')),
          amount REAL NOT NULL,
          status TEXT NOT NULL DEFAULT 'succeeded' CHECK(status IN ('succeeded', 'pending', 'refunded')),
          reference_id TEXT,
          metadata_json TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        INSERT INTO payments_migrated SELECT * FROM payments;
        DROP TABLE payments;
        ALTER TABLE payments_migrated RENAME TO payments;
        COMMIT;
        PRAGMA foreign_keys=on;
      `);
    }
  } catch (e) {
    // Already migrated or error
  }

  cleanupFakeAndDemoData(db);
  ensureDefaultCategories(db);
  ensureSettingsAndAdmin(db);
  ensureDefaultCampaigns(db);
  ensureDefaultCmsPages(db);
}

function cleanupFakeAndDemoData(dbInstance) {
  try {
    const fakeUserIds = ['usr-arjun', 'usr-elena', 'usr-marcus', 'usr-priya', 'usr-david', 'usr-sarah', 'usr-admin'];
    const placeholders = fakeUserIds.map(() => '?').join(',');

    dbInstance.prepare(`DELETE FROM services WHERE provider_id IN (${placeholders})`).run(...fakeUserIds);
    dbInstance.prepare(`DELETE FROM provider_availability WHERE provider_id IN (${placeholders})`).run(...fakeUserIds);
    dbInstance.prepare(`DELETE FROM opportunities WHERE creator_id IN (${placeholders}) OR id IN ('opp-1', 'opp-2', 'opp-3') OR id LIKE 'opp-wh-%' OR title LIKE '%Test Opp%'`).run(...fakeUserIds);
    dbInstance.prepare(`DELETE FROM reports WHERE reporter_id IN (${placeholders}) OR id = 'rep-1'`).run(...fakeUserIds);
    dbInstance.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...fakeUserIds);
    dbInstance.prepare(`DELETE FROM audit_logs WHERE id = 'log-init-1'`).run();

    // Remove synthetic test accounts created during automated test runs
    dbInstance.prepare(`
      DELETE FROM users WHERE (
        email LIKE '%@test.local' OR
        email LIKE '%@t.local' OR
        email LIKE '%@testadmin.local' OR
        email LIKE '%@hardened.test' OR
        email LIKE '%@testaudit.local' OR
        email LIKE '%@testprofile.local' OR
        email LIKE '%@example.com' OR
        email LIKE 'admin.expert_%@hirebyminutes.com' OR
        email LIKE 'client.photo.%@hirebyminutes.com' OR
        email LIKE 'client.nophoto.%@hirebyminutes.com'
      ) AND email NOT IN ('vishalkumar75912@gmail.com', 'vishal@gmail.com', 'vishalchaudhary74096@gmail.com')
    `).run();

    // Recalculate category service counts to accurately reflect real active services
    dbInstance.prepare(`
      UPDATE categories 
      SET service_count = (
        SELECT COUNT(*) FROM services 
        WHERE services.category_id = categories.id AND services.listing_status = 'active'
      )
    `).run();

    dbInstance.prepare(`DELETE FROM categories WHERE slug LIKE 'cloud-infra-%'`).run();
  } catch (e) {
    // Ignore cleanup error if tables are newly created
  }
}

function ensureDefaultCategories(dbInstance) {
  const catCountResult = dbInstance.prepare('SELECT COUNT(*) as count FROM categories').get();
  const catCount = catCountResult ? (typeof catCountResult.count === 'number' ? catCountResult.count : parseInt(catCountResult.count, 10)) : 0;
  if (catCount > 0) return;

  const insertCat = dbInstance.prepare(`
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

function ensureSettingsAndAdmin(dbInstance) {
  const adminEmail = (process.env.ADMIN_EMAIL || 'vishalkumar75912@gmail.com').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'HBM-Adm!n#2026$Secur3';

  // Ensure default platform settings
  const insertSetting = dbInstance.prepare(`
    INSERT INTO platform_settings (key, value, description)
    VALUES (?, ?, ?)
    ON CONFLICT (key) DO NOTHING
  `);

  insertSetting.run('platform_name', 'HireByMinute', 'The official platform brand name');
  insertSetting.run('listing_fee_usd', '2.00', 'One-time fee in USD to publish a service listing');
  insertSetting.run('platform_fee_percent', '15', 'Standard percentage fee taken from completed session payments');
  insertSetting.run('default_response_time', 'Within 15 mins', 'Target response time for verified providers');
  insertSetting.run('payout_schedule', 'Instant on completion', 'Frequency of expert earnings settlement');
  insertSetting.run('logo_url', '', 'Custom brand logo image URL');
  insertSetting.run('header_navigation', JSON.stringify([
    { id: 'services', label: 'Services', url: '/services', order: 1, is_visible: true, is_external: false },
    { id: 'opportunities', label: 'Opportunities', url: '/opportunities', order: 2, is_visible: true, is_external: false },
    { id: 'jobs', label: 'Jobs', url: '/jobs', order: 3, is_visible: true, is_external: false },
    { id: 'how-it-works', label: 'How It Works', url: '/#how-it-works', order: 4, is_visible: true, is_external: false }
  ]), 'Configurable header navigation items and ordering');
  insertSetting.run('header_cta_label', 'Sign In / Join', 'Header call-to-action button label');
  insertSetting.run('header_cta_url', '/auth', 'Header call-to-action destination URL');
  insertSetting.run('footer_settings', JSON.stringify({
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
        { id: 'opportunities', label: 'Opportunities', url: '/opportunities', order: 4, is_visible: true, is_new: true },
        { id: 'jobs', label: 'Jobs', url: '/jobs', order: 5, is_visible: true }
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
  }), 'Configurable footer links, sections, and legal notices');

  insertSetting.run('contact_settings', JSON.stringify({
    support_email: 'support@hirebyminute.com',
    business_email: 'business@hirebyminute.com',
    phone: '+1 (800) 555-0199',
    support_hours: 'Monday – Friday: 9:00 AM – 6:00 PM EST (24/7 Escalation Desk)',
    address: 'San Francisco, CA, United States',
    whatsapp_url: '',
    contact_form_enabled: true
  }), 'Configurable customer support and platform contact channels');

  insertSetting.run('homepage_settings', JSON.stringify({
    hero_headline: 'Hire Top Experts by the Minute — Live & On Demand',
    hero_subheadline: 'Find the right expert. Hire them by the minute. Pay only for the time you need.',
    hero_badge_text: '⚡ Instant 1-on-1 Consultations • Pay Per Exact Minute',
    primary_cta_label: 'Find an Expert',
    primary_cta_url: '/services',
    secondary_cta_label: 'List Your Service',
    secondary_cta_url: '/provider/onboard',
    search_placeholder: 'Search experts, skills, or services...',
    popular_tags: ['Python developer', 'Figma teardown', 'RAG architect', 'B2B growth audit', 'Tax advisor', 'AI Prompt Engineer', 'Fractional CTO'],
    intent_expert_title: 'Find an Expert',
    intent_expert_desc: 'Pay only for the exact minutes you spend with a vetted professional. No retainers or minimum commitments.',
    intent_expert_button: 'Find an Expert',
    intent_expert_url: '/services',
    intent_freelance_title: 'List Your Service',
    intent_freelance_desc: 'Set your own per-minute rate, choose your hours, and get booked by clients who value your time.',
    intent_freelance_button: 'Become a Service Provider',
    intent_freelance_url: '/provider/onboard',
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
      fulltime_jobs: true,
      cta: true
    }
  }), 'Configurable homepage visual sections, intent cards, and headlines');

  insertSetting.run('seo_settings', JSON.stringify({
    site_title: 'HireByMinute — Instant 1-on-1 Consultations by the Minute',
    meta_description: 'Connect with verified experts instantly for 1-on-1 audio/video consultations. Pay only for the exact minutes you use with zero upfront retainers.',
    canonical_url: 'https://hirebyminute.com',
    og_title: 'HireByMinute — Instant 1-on-1 Consultations by the Minute',
    og_description: 'Pay strictly for the minutes you consult. Real-time audio/video consultations with verified experts.',
    og_image: 'https://hirebyminute.com/og-image.png',
    twitter_card: 'summary_large_image',
    twitter_site: '@hirebyminute'
  }), 'Platform global SEO meta tags, social sharing cards, and crawl policies');

  // Seed authentic initial FAQs if table empty
  try {
    const faqCount = dbInstance.prepare('SELECT COUNT(*) as count FROM faqs').get();
    const countNum = Number(faqCount?.count || 0);
    if (countNum === 0) {
      const defaultFaqs = [
        {
          id: 'faq-1',
          question: 'How does per-minute billing work?',
          answer: 'You pay strictly for the elapsed minutes of your consultation. A temporary authorization is held before the session starts, and upon completion, you are charged only for the exact duration spent. Any unused authorized amount is immediately released.',
          category: 'Billing & Pricing',
          sort_order: 1,
          is_published: 1
        },
        {
          id: 'faq-2',
          question: 'How do I join as a verified expert?',
          answer: 'Click "Become a Provider", fill out your profile with your professional background and domain expertise, and submit your identity/credential verification. Our operations team verifies expert qualifications within 24 hours.',
          category: 'Experts & Providers',
          sort_order: 2,
          is_published: 1
        },
        {
          id: 'faq-3',
          question: 'What happens if there is a technical disconnection during a call?',
          answer: 'Our server-authoritative timer automatically pauses if either party loses WebRTC connectivity. If the connection cannot be restored promptly, you can request an immediate refund or session reschedule with zero penalties.',
          category: 'Sessions & Audio/Video',
          sort_order: 3,
          is_published: 1
        },
        {
          id: 'faq-4',
          question: 'What payment methods are supported on HireByMinute?',
          answer: 'We support all major debit/credit cards (Visa, MasterCard, Amex), UPI, net banking, and international multi-currency processing via PCI-DSS certified Razorpay gateway.',
          category: 'Billing & Pricing',
          sort_order: 4,
          is_published: 1
        },
        {
          id: 'faq-5',
          question: 'Can I extend my consultation while it is in progress?',
          answer: 'Yes! Both client and expert can agree to add 5, 15, or 30 minutes directly inside the live consultation room before the countdown clock expires.',
          category: 'Sessions & Audio/Video',
          sort_order: 5,
          is_published: 1
        },
        {
          id: 'faq-6',
          question: 'Are consultation calls and shared files private and secure?',
          answer: 'Yes. Live audio/video communications are peer-to-peer encrypted via WebRTC. Chat transcripts and uploaded files are protected by strict access control policies and never shared with unauthorized parties.',
          category: 'Security & Trust',
          sort_order: 6,
          is_published: 1
        }
      ];

      const insertFaq = dbInstance.prepare(`
        INSERT INTO faqs (id, question, answer, category, sort_order, is_published)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO NOTHING
      `);
      for (const f of defaultFaqs) {
        insertFaq.run(f.id, f.question, f.answer, f.category, f.sort_order, f.is_published);
      }
    }
  } catch (faqErr) {
    console.warn('[Database] FAQ seed check notice:', faqErr?.message || faqErr);
  }

  // Check or upsert admin account
  const existingAdmin = dbInstance.prepare('SELECT * FROM users WHERE LOWER(email) = ? OR role = \'admin\' ORDER BY (LOWER(email) = ?) DESC LIMIT 1').get(adminEmail, adminEmail);

  if (!existingAdmin) {
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);
    dbInstance.prepare(`
      INSERT INTO users (id, email, username, password_hash, full_name, role, avatar_url, bio, headline, rating, review_count, sessions_completed, verified, email_verified, member_since)
      VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, ?, 5.0, 0, 0, 1, 1, 'August 2026')
    `).run(
      'usr-admin-vishal',
      adminEmail,
      'admin_vishal',
      hashedPassword,
      'Vishal Kumar (Admin)',
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=80',
      'Platform Administrator and Operations Lead for HireByMinute.',
      'Platform Administrator'
    );
  } else {
    // Check if stored password_hash is a valid bcrypt hash
    let shouldSync = false;
    if (!existingAdmin.password_hash || !existingAdmin.password_hash.startsWith('$2')) {
      shouldSync = true;
    } else if (process.env.SYNC_ADMIN_PASSWORD === 'true' || process.env.NODE_ENV !== 'production') {
      if (!bcrypt.compareSync(adminPassword, existingAdmin.password_hash)) {
        shouldSync = true;
      }
    }

    if (shouldSync) {
      const hashedPassword = bcrypt.hashSync(adminPassword, 10);
      dbInstance.prepare(`UPDATE users SET email = ?, role = 'admin', password_hash = ?, verified = 1, email_verified = 1, is_suspended = 0 WHERE id = ?`).run(adminEmail, hashedPassword, existingAdmin.id);
    } else {
      dbInstance.prepare(`UPDATE users SET email = ?, role = 'admin', verified = 1, email_verified = 1, is_suspended = 0 WHERE id = ?`).run(adminEmail, existingAdmin.id);
    }
  }
}

function ensureDefaultCampaigns(dbInstance) {
  const campCountResult = dbInstance.prepare('SELECT COUNT(*) as count FROM registration_campaigns').get();
  const campCount = campCountResult ? (typeof campCountResult.count === 'number' ? campCountResult.count : parseInt(campCountResult.count, 10)) : 0;
  
  // CRITICAL: Persistent campaign preservation. Do NOT reset on restart if ANY campaign exists in persistent database state.
  if (campCount > 0) return;

  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  dbInstance.prepare(`
    INSERT INTO registration_campaigns (
      id, name, description, fee_usd, start_time, end_time, is_active, status, created_by, created_by_name
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 'active', 'system', 'Platform Launch')
  `).run(
    'camp-launch-free-24h',
    'Launch Promotion — Free Expert Registration',
    'Launch Offer: 100% free expert registration and service listing for 24 hours ($0.00 fee).',
    0.00,
    now.toISOString(),
    end.toISOString()
  );
}

function ensureDefaultCmsPages(dbInstance) {
  try {
    const pageCountResult = dbInstance.prepare('SELECT COUNT(*) as count FROM cms_pages').get();
    const count = pageCountResult ? (typeof pageCountResult.count === 'number' ? pageCountResult.count : parseInt(pageCountResult.count, 10)) : 0;
    if (count > 0) return;

    const insertPage = dbInstance.prepare(`
      INSERT INTO cms_pages (id, slug, title, meta_title, meta_description, content, status, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, 'published', 'system')
    `);

    const defaultPages = [
      {
        id: 'page-about',
        slug: 'about',
        title: 'About HireByMinute',
        meta_title: 'About Us — HireByMinute On-Demand Consultation Platform',
        meta_description: 'HireByMinute connects professionals, founders, developers, and creators with verified domain experts for exactly the minutes required to solve high-stakes challenges.',
        content: `# About HireByMinute\n\n## The Precision Marketplace for Expertise\n\nHireByMinute connects professionals, founders, developers, and creators with verified domain experts for exactly the minutes required to solve high-stakes challenges.\n\n### The Problem with Traditional Consulting\nWhen engineering teams encounter complex architecture roadblocks, designers review critical launch designs, or founders assess legal trade-offs, they rarely need an expensive multi-week statement of work or a mandatory minimum retainer. What they need is 15 to 30 minutes of focused, direct clarity from someone who has navigated that exact challenge before.\n\nTraditional marketplaces force practitioners into lengthy proposal bidding cycles, arbitrary hourly minimums, and protracted onboarding. HireByMinute eliminates that friction by introducing **minute-accurate consultation rooms** backed by automated escrow protection and transparent per-minute pricing.\n\n### Core Pillars\n- **Minute-Based Precision**: Book consultations in increments tailored to your actual query. Pay strictly for the time spent.\n- **Verified Practitioners**: Rigorous multi-stage vetting ensures authentic domain mastery across engineering, AI, design, legal, and business.\n- **Protected Payments**: Funds are securely held and disbursed upon session completion.\n- **Real-Time Video Collaboration**: Low-latency WebRTC video, crystal-clear audio, code snippets, and in-room time tracking.`
      },
      {
        id: 'page-how-it-works',
        slug: 'how-it-works',
        title: 'How HireByMinute Works',
        meta_title: 'How It Works — Step-by-Step Consultation Flow',
        meta_description: 'Learn how to discover verified experts, book instant or scheduled consultations, and get precise answers by the minute.',
        content: `# How HireByMinute Works\n\n## Fast, Transparent, Precision Consultations\n\n### For Clients\n1. **Browse & Filter Experts**: Explore verified practitioners across engineering, design, AI, finance, marketing, and legal domains.\n2. **Select Time & Book**: Choose an instant consultation or schedule for a specific time window.\n3. **Collaborate in Precision Rooms**: Connect via encrypted WebRTC video, screen share, and synchronized session timers.\n4. **Pay Only for Actual Minutes**: Session fees are calculated strictly based on duration. No surprise retainers.\n\n### For Experts\n1. **Create Profile & Set Rate**: Define your specialty skills, experience, and per-minute consulting fee.\n2. **Verify Credentials**: Complete the verification review to earn the verified expert badge.\n3. **Accept Consultations**: Receive instant requests or scheduled sessions matching your availability calendar.\n4. **Receive Fast Payouts**: Guaranteed settlement upon successful session completion.`
      },
      {
        id: 'page-terms',
        slug: 'terms',
        title: 'Terms of Service',
        meta_title: 'Terms of Service — HireByMinute',
        meta_description: 'Official Terms of Service governing access to and use of HireByMinute consultation services, accounts, and payments.',
        content: `# Terms of Service\n\n**Last Updated:** August 28, 2026\n\n### 1. Acceptance of Terms & Eligibility\nThese Terms of Service ("Terms") govern your access to and use of the HireByMinute platform, including all related websites, applications, signaling services, and communication features (collectively, the "Platform").\n\nBy registering an account, purchasing minute credits, or offering services, you represent and warrant that you are at least 18 years of age and possess the legal capacity to enter into binding contracts.\n\n### 2. Account Registration & Security\nTo access core features of the Platform, you must create an account. You agree to provide accurate, current, and complete information, including a valid email address and legal name.\n- You are solely responsible for maintaining the confidentiality of your authentication credentials.\n- Usernames assigned upon registration are permanent identifiers and cannot be altered or transferred.\n- HireByMinute reserves the right to suspend or terminate accounts that contain false, misleading, or fraudulent information.\n\n### 3. Consultation Mechanics & Per-Minute Metering\n- Consultations occur in synchronized WebRTC rooms with automated minute tracking.\n- Both parties must abide by professional conduct standards during sessions.\n- Billing is calculated per minute at the published rate agreed upon at booking.\n\n### 4. Platform Fees & Settlement\n- HireByMinute retains a standard platform fee (15%) on completed consultation transactions to cover infrastructure, payment processing, video signaling, and dispute mediation.\n- Expert payouts are processed following session sign-off.`
      },
      {
        id: 'page-privacy',
        slug: 'privacy',
        title: 'Privacy Policy',
        meta_title: 'Privacy Policy — HireByMinute',
        meta_description: 'How HireByMinute collects, uses, protects, and handles personal data and consultation information.',
        content: `# Privacy Policy\n\n**Last Updated:** August 28, 2026\n\n### 1. Information We Collect\nWe collect information you provide directly when registering, completing profile details, requesting consultations, or messaging on the Platform:\n- **Identity Information**: Full name, username, email address, avatar photo, and professional biography.\n- **Payment Information**: Transaction IDs, payment gateway authorization references (payment card details are processed directly by PCI-DSS compliant gateways like Razorpay/Stripe and are never stored on our servers).\n- **Session Metadata**: Consultation timestamps, duration, and connection diagnostics.\n\n### 2. How We Use Information\nWe use collected information to:\n- Facilitate expert discovery, booking, and real-time WebRTC connections.\n- Process financial transactions and calculate per-minute billing.\n- Prevent fraud, abusive conduct, and unauthorized account access.\n- Comply with applicable legal, accounting, and tax reporting requirements.\n\n### 3. Data Protection & Security\nWe implement industry-standard encryption protocols (TLS 1.3 in transit, AES-256 for sensitive credentials at rest). Password hashes use bcrypt with high-cost salt factors.`
      },
      {
        id: 'page-refund-policy',
        slug: 'refund-policy',
        title: 'Refund & Cancellation Policy',
        meta_title: 'Refund & Cancellation Policy — HireByMinute',
        meta_description: 'Clear rules and dispute procedures for consultation refunds, no-shows, and technical session interruptions.',
        content: `# Refund & Cancellation Policy\n\n**Last Updated:** August 28, 2026\n\n### 1. Pre-Session Cancellations\n- **Client Cancellation**: You may cancel a scheduled consultation up to 2 hours before the session start time for a 100% full refund.\n- **Expert Cancellation**: If an expert cancels or fails to join a scheduled consultation, the client receives a 100% immediate full refund.\n\n### 2. Session Technical Disruptions\nIf a verified technical failure on the platform (e.g. server outage or signaling failure) prevents communication during the first 5 minutes of a session, a full refund or session reschedule is guaranteed upon submission of a support ticket.\n\n### 3. Dispute Resolution Process\nIf you believe a session did not meet professional standards or was interrupted prematurely, submit a dispute ticket through the Support Center within 24 hours of session completion.`
      },
      {
        id: 'page-expert-policy',
        slug: 'expert-policy',
        title: 'Expert Quality Standards & Policy',
        meta_title: 'Expert Quality Standards & Guidelines — HireByMinute',
        meta_description: 'Quality standards, conduct requirements, and verification guidelines for verified experts on HireByMinute.',
        content: `# Expert Quality Standards & Guidelines\n\n**Last Updated:** August 28, 2026\n\n### 1. Practitioner Conduct & Professionalism\nVerified experts represent the core credibility of the HireByMinute marketplace. All experts agree to:\n- Arrive punctually for scheduled sessions.\n- Deliver direct, actionable, and courteous professional insight.\n- Keep client discussions, proprietary code, and strategic data strictly confidential.\n\n### 2. Prohibited Conduct\n- Solicit off-platform payments or circumvent the platform escrow system.\n- Misrepresent professional background, credentials, or affiliations.\n- Record sessions without explicit mutual written consent.`
      },
      {
        id: 'page-acceptable-use',
        slug: 'acceptable-use',
        title: 'Acceptable Use Policy',
        meta_title: 'Acceptable Use Policy — HireByMinute',
        meta_description: 'Acceptable use rules prohibiting harmful, illegal, or abusive activities across the HireByMinute network.',
        content: `# Acceptable Use Policy\n\n**Last Updated:** August 28, 2026\n\n### 1. Platform Integrity\nUsers may not attempt to reverse engineer, disrupt, overload, or exploit vulnerabilities in the platform infrastructure, API endpoints, or WebRTC signaling.\n\n### 2. Prohibited Content & Behavior\n- Harassment, hate speech, or defamatory statements.\n- Uploading malicious software, viruses, or unauthorized tracking scripts.\n- Providing fraudulent, deceptive, or unlicensed regulated advice (e.g. unauthorized legal practice or unqualified medical advice).`
      },
      {
        id: 'page-contact',
        slug: 'contact',
        title: 'Contact & Support Desk',
        meta_title: 'Contact Us — HireByMinute Help & Escalation Desk',
        meta_description: 'Reach out to HireByMinute platform administration, support, or partnership teams.',
        content: `# Contact & Support Desk\n\nNeed assistance with a consultation, billing question, or expert verification? Our support team is ready to help.\n\n- **Support Email**: support@hirebyminute.com\n- **Business Inquiries**: business@hirebyminute.com\n- **Support Hours**: Monday – Friday: 9:00 AM – 6:00 PM EST (24/7 Escalation Desk)\n- **Office Location**: San Francisco, CA, United States`
      },
      {
        id: 'page-faq',
        slug: 'faq',
        title: 'Frequently Asked Questions',
        meta_title: 'FAQ — HireByMinute Common Questions Answered',
        meta_description: 'Frequently asked questions about consultations, per-minute billing, expert verification, and security.',
        content: `# Frequently Asked Questions\n\n### How does per-minute billing work?\nWhen you book a session, an authorization hold is placed for the expected duration. When the session finishes, the room timer calculates the exact minutes elapsed, and only that amount is charged.\n\n### What if the expert does not show up?\nIf an expert fails to appear for a scheduled session within 10 minutes of start time, the session is cancelled and 100% of your payment hold is immediately released.\n\n### How do experts get paid?\nExpert earnings are accumulated in their platform balance after successful session completion and settled according to the platform payout schedule.`
      }
    ];

    for (const p of defaultPages) {
      insertPage.run(p.id, p.slug, p.title, p.meta_title, p.meta_description, p.content);
    }
  } catch (e) {
    // Already seeded or table error
  }
}

module.exports = db;
