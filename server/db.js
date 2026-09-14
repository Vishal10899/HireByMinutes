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
      service_count INTEGER DEFAULT 0
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
      status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_review', 'awarded', 'closed')),
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

module.exports = db;
