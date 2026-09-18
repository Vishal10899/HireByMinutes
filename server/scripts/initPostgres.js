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
  is_hidden INTEGER DEFAULT 0,
  moderation_note TEXT,
  moderated_by VARCHAR(64),
  moderated_at TIMESTAMP WITH TIME ZONE,
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

-- Production Indexes for Performance and Integrity
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
      ['platform_name', 'HireByMinute', 'The public platform name'],
      ['platform_fee_percent', '15', 'Platform take rate percentage on consultations'],
      ['listing_fee_usd', '2.00', 'Flat fee charged to experts to activate a service listing'],
      ['min_session_duration', '5', 'Minimum consultation duration in minutes'],
      ['max_session_duration', '180', 'Maximum consultation duration in minutes'],
      ['payout_schedule', 'weekly', 'Expert earnings settlement schedule'],
      ['auto_approve_experts', 'false', 'Whether expert applications are automatically approved'],
      ['maintenance_mode', 'false', 'Lock platform for scheduled maintenance'],
      ['logo_url', '', 'Custom brand logo image URL'],
      ['header_navigation', JSON.stringify([
        { id: 'services', label: 'Services', url: '/services', order: 1, is_visible: true, is_external: false },
        { id: 'opportunities', label: 'Opportunities', url: '/opportunities', order: 2, is_visible: true, is_external: false },
        { id: 'jobs', label: 'Jobs', url: '/jobs', order: 3, is_visible: true, is_external: false },
        { id: 'how-it-works', label: 'How It Works', url: '/#how-it-works', order: 4, is_visible: true, is_external: false }
      ]), 'Configurable header navigation items and ordering'],
      ['header_cta_label', 'Sign In / Join', 'Header call-to-action button label'],
      ['header_cta_url', '/auth', 'Header call-to-action destination URL'],
      ['footer_settings', JSON.stringify({
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
      }), 'Configurable footer links, sections, and legal notices'],
      ['contact_settings', JSON.stringify({
        support_email: 'support@hirebyminute.com',
        business_email: 'business@hirebyminute.com',
        phone: '+1 (800) 555-0199',
        support_hours: 'Monday – Friday: 9:00 AM – 6:00 PM EST (24/7 Escalation Desk)',
        address: 'San Francisco, CA, United States',
        whatsapp_url: '',
        contact_form_enabled: true
      }), 'Configurable customer support and platform contact channels'],
      ['homepage_settings', JSON.stringify({
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
      }), 'Configurable homepage content, hero copy, intent cards, and section visibility'],
      ['seo_settings', JSON.stringify({
        site_title: 'HireByMinute — Instant 1-on-1 Consultations by the Minute',
        meta_description: 'Connect with verified experts instantly for 1-on-1 audio/video consultations. Pay only for the exact minutes you use with zero upfront retainers.',
        canonical_url: 'https://hirebyminute.com',
        og_title: 'HireByMinute — Instant 1-on-1 Consultations by the Minute',
        og_description: 'Pay strictly for the minutes you consult. Real-time audio/video consultations with verified experts.',
        og_image: 'https://hirebyminute.com/og-image.png',
        twitter_card: 'summary_large_image',
        twitter_site: '@hirebyminute'
      }), 'Platform global SEO meta tags, social sharing cards, and crawl policies']
    ];

    for (const [key, value, description] of defaultSettings) {
      await client.query(`
        INSERT INTO platform_settings (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO NOTHING
      `, [key, value, description]);
    }

    // Seed default CMS pages
    const defaultPages = [
      ['page-about', 'about', 'About HireByMinute', 'About Us — HireByMinute On-Demand Consultation Platform', 'HireByMinute connects professionals, founders, developers, and creators with verified domain experts.', '# About HireByMinute\n\n## The Precision Marketplace for Expertise\n\nHireByMinute connects professionals, founders, developers, and creators with verified domain experts for exactly the minutes required to solve high-stakes challenges.', 'published', 'system'],
      ['page-how-it-works', 'how-it-works', 'How HireByMinute Works', 'How It Works — Step-by-Step Consultation Flow', 'Learn how to discover verified experts, book instant or scheduled consultations, and get precise answers.', '# How HireByMinute Works\n\n## Fast, Transparent, Precision Consultations\n\n1. Browse & Filter Experts\n2. Select Time & Book\n3. Collaborate in Precision Rooms\n4. Pay Only for Actual Minutes', 'published', 'system'],
      ['page-terms', 'terms', 'Terms of Service', 'Terms of Service — HireByMinute', 'Official Terms of Service governing access to and use of HireByMinute.', '# Terms of Service\n\n**Last Updated:** August 28, 2026\n\n### 1. Acceptance of Terms\nBy registering an account, purchasing minute credits, or offering services, you agree to these Terms.', 'published', 'system'],
      ['page-privacy', 'privacy', 'Privacy Policy', 'Privacy Policy — HireByMinute', 'How HireByMinute collects, uses, protects, and handles personal data.', '# Privacy Policy\n\n**Last Updated:** August 28, 2026\n\n### 1. Information We Collect\nWe collect identity information, payment receipts, and session metadata.', 'published', 'system'],
      ['page-refund-policy', 'refund-policy', 'Refund & Cancellation Policy', 'Refund & Cancellation Policy — HireByMinute', 'Clear rules and dispute procedures for consultation refunds.', '# Refund & Cancellation Policy\n\n### 1. Pre-Session Cancellations\nCancel up to 2 hours before session for 100% refund.', 'published', 'system'],
      ['page-expert-policy', 'expert-policy', 'Expert Policy', 'Expert Quality Standards — HireByMinute', 'Quality standards and verification guidelines for verified experts.', '# Expert Quality Standards\n\nPractitioners must deliver professional, actionable insight and maintain client confidentiality.', 'published', 'system'],
      ['page-acceptable-use', 'acceptable-use', 'Acceptable Use Policy', 'Acceptable Use Policy — HireByMinute', 'Acceptable use rules prohibiting harmful, illegal, or abusive activities.', '# Acceptable Use Policy\n\nUsers may not attempt to reverse engineer, disrupt, or exploit platform infrastructure.', 'published', 'system'],
      ['page-contact', 'contact', 'Contact & Support Desk', 'Contact Us — HireByMinute Help Desk', 'Reach out to HireByMinute platform administration or support.', '# Contact & Support Desk\n\nSupport Email: support@hirebyminute.com\nHours: Mon-Fri 9AM-6PM EST', 'published', 'system'],
      ['page-faq', 'faq', 'Frequently Asked Questions', 'FAQ — HireByMinute Common Questions Answered', 'Frequently asked questions about consultations and per-minute billing.', '# Frequently Asked Questions\n\n### How does per-minute billing work?\nYou pay strictly for elapsed session duration.', 'published', 'system']
    ];

    for (const page of defaultPages) {
      await client.query(`
        INSERT INTO cms_pages (id, slug, title, meta_title, meta_description, content, status, updated_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING
      `, page);
    }

    // Seed default FAQs
    const defaultFaqs = [
      ['faq-1', 'How does per-minute billing work?', 'You pay strictly for the elapsed minutes of your consultation. A temporary authorization is held before the session starts, and upon completion, you are charged only for the exact duration spent. Any unused authorized amount is immediately released.', 'Billing & Pricing', 1, 1],
      ['faq-2', 'How do I join as a verified expert?', 'Click "Become a Provider", fill out your profile with your professional background and domain expertise, and submit your identity/credential verification. Our operations team verifies expert qualifications within 24 hours.', 'Experts & Providers', 2, 1],
      ['faq-3', 'What happens if there is a technical disconnection during a call?', 'Our server-authoritative timer automatically pauses if either party loses WebRTC connectivity. If the connection cannot be restored promptly, you can request an immediate refund or session reschedule with zero penalties.', 'Sessions & Audio/Video', 3, 1],
      ['faq-4', 'What payment methods are supported on HireByMinute?', 'We support all major debit/credit cards (Visa, MasterCard, Amex), UPI, net banking, and international multi-currency processing via PCI-DSS certified Razorpay gateway.', 'Billing & Pricing', 4, 1],
      ['faq-5', 'Can I extend my consultation while it is in progress?', 'Yes! Both client and expert can agree to add 5, 15, or 30 minutes directly inside the live consultation room before the countdown clock expires.', 'Sessions & Audio/Video', 5, 1],
      ['faq-6', 'Are consultation calls and shared files private and secure?', 'Yes. Live audio/video communications are peer-to-peer encrypted via WebRTC. Chat transcripts and uploaded files are protected by strict access control policies and never shared with unauthorized parties.', 'Security & Trust', 6, 1]
    ];

    for (const faq of defaultFaqs) {
      await client.query(`
        INSERT INTO faqs (id, question, answer, category, sort_order, is_published)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
      `, faq);
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
