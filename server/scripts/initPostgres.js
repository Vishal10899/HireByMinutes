// HireByMinutes — PostgreSQL Schema Initialization Script
// Initializes all tables, indexes, default categories, and platform settings for PostgreSQL

const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const postgresSchemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) UNIQUE,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
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
  listing_status VARCHAR(32) NOT NULL DEFAULT 'active',
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
  connect_type VARCHAR(32) NOT NULL DEFAULT 'now',
  scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
  problem_description TEXT NOT NULL,
  attachments_json TEXT DEFAULT '[]',
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_EXPERT',
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
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
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
  status VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
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
  type VARCHAR(64) NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'succeeded',
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
  status VARCHAR(32) NOT NULL DEFAULT 'open',
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
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  payment_id VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(64) NOT NULL,
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
  reported_type VARCHAR(64) NOT NULL,
  reported_id VARCHAR(64) NOT NULL,
  reported_name VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
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

async function initPostgres(customPool = null) {
  console.log('[PostgreSQL] Initializing tables...');
  let pool = customPool;
  let shouldClosePool = false;

  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.error('[Error] DATABASE_URL environment variable is required to initialize PostgreSQL.');
      process.exit(1);
    }
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
    });
    shouldClosePool = true;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(postgresSchemaSql);

    // Insert Default Categories
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
      await client.query(`
        INSERT INTO categories (id, slug, name, icon, description, sort_order, active, service_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING
      `, cat);
    }

    // Insert Default Platform Settings
    const defaultSettings = [
      ['platform_name', 'HireByMinutes', 'The public platform name'],
      ['platform_fee_percent', '15', 'Platform take rate percentage on consultations'],
      ['listing_fee_usd', '2.00', 'Flat fee charged to experts to activate a service listing'],
      ['min_session_duration', '5', 'Minimum consultation duration in minutes'],
      ['max_session_duration', '180', 'Maximum consultation duration in minutes'],
      ['payout_schedule', 'weekly', 'Expert earnings settlement schedule'],
      ['auto_approve_experts', 'false', 'Whether expert applications are automatically approved'],
      ['maintenance_mode', 'false', 'Lock platform for scheduled maintenance']
    ];

    for (const [key, value, description] of defaultSettings) {
      await client.query(`
        INSERT INTO platform_settings (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO NOTHING
      `, [key, value, description]);
    }

    // Insert Default 24-Hour Free Registration Campaign (CRITICAL: ON CONFLICT DO NOTHING to preserve persistent end_time)
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await client.query(`
      INSERT INTO registration_campaigns (
        id, name, description, fee_usd, start_time, end_time, is_active, status, created_by, created_by_name
      ) VALUES ($1, $2, $3, $4, $5, $6, 1, 'active', 'system', 'Platform Launch')
      ON CONFLICT (id) DO NOTHING
    `, [
      'camp-launch-free-24h',
      'Launch Promotion — Free Expert Registration',
      'Launch Offer: 100% free expert registration and service listing for 24 hours ($0.00 fee).',
      0.00,
      now.toISOString(),
      end.toISOString()
    ]);

    // Ensure Master Admin Account
    const adminEmail = (process.env.ADMIN_EMAIL || 'vishalkumar75912@gmail.com').trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'HBM-Adm!n#2026$Secur3';

    if (adminPassword) {
      const hashedPassword = bcrypt.hashSync(adminPassword, 10);
      const existingAdmin = await client.query('SELECT * FROM users WHERE role = $1 OR LOWER(email) = $2', ['admin', adminEmail]);
      
      if (existingAdmin.rows.length === 0) {
        await client.query(`
          INSERT INTO users (id, email, username, password_hash, full_name, role, bio, headline, verified, email_verified, is_suspended, member_since)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 1, 0, 'August 2026')
        `, ['usr-admin-vishal', adminEmail, 'admin_vishal', hashedPassword, 'Vishal Kumar (Admin)', 'admin', 'Platform Administrator & System Architect', 'System Administrator']);
        console.log(`[PostgreSQL] Master Admin created: ${adminEmail}`);
      } else {
        await client.query(`
          UPDATE users SET email = $1, password_hash = $2, role = 'admin', verified = 1, email_verified = 1, is_suspended = 0 WHERE id = $3
        `, [adminEmail, hashedPassword, existingAdmin.rows[0].id]);
        console.log(`[PostgreSQL] Master Admin credentials updated for: ${adminEmail}`);
      }
    }

    await client.query('COMMIT');
    console.log('✅ [PostgreSQL] Schema, categories, and settings initialized successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ [PostgreSQL] Initialization failed:', err.message);
    throw err;
  } finally {
    client.release();
    if (shouldClosePool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  initPostgres().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { initPostgres };
