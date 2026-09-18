// =============================================================================
// HireByMinute — Sync Core Product Settings
// Updates platform_settings for header_navigation, homepage_settings, and footer_settings
// in both SQLite (local) and Neon PostgreSQL (production).
// =============================================================================

const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const headerNav = JSON.stringify([
  { id: 'services', label: 'Services', url: '/services', order: 1, is_visible: true, is_external: false },
  { id: 'opportunities', label: 'Opportunities', url: '/opportunities', order: 2, is_visible: true, is_external: false },
  { id: 'jobs', label: 'Jobs', url: '/jobs', order: 3, is_visible: true, is_external: false },
  { id: 'how-it-works', label: 'How It Works', url: '/#how-it-works', order: 4, is_visible: true, is_external: false }
]);

const homepageSettings = JSON.stringify({
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
});

const footerSettings = JSON.stringify({
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
});

async function syncSettings() {
  console.log('--- Syncing Core Product Settings ---');

  // 1. SQLite
  const sqliteDb = new Database(path.join(__dirname, '..', 'hirebyminutes.db'));
  const upsertSqlite = sqliteDb.prepare(`
    INSERT INTO platform_settings (key, value, updated_at) 
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  upsertSqlite.run('header_navigation', headerNav);
  upsertSqlite.run('homepage_settings', homepageSettings);
  upsertSqlite.run('footer_settings', footerSettings);
  sqliteDb.close();
  console.log('  ✓ SQLite platform_settings updated successfully.');

  // 2. Neon PostgreSQL
  const neonUrl = (
    process.env.DATABASE_URL || 
    process.env.POSTGRES_URL || 
    'postgresql://neondb_owner:npg_5huVAgOw7ocD@ep-fancy-frog-ay4krhqt-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require'
  ).trim();
  if (neonUrl) {
    const pool = new Pool({
      connectionString: neonUrl,
      ssl: { rejectUnauthorized: false }
    });
    const client = await pool.connect();
    try {
      await client.query(`
        INSERT INTO platform_settings (key, value, updated_at)
        VALUES ('header_navigation', $1, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      `, [headerNav]);

      await client.query(`
        INSERT INTO platform_settings (key, value, updated_at)
        VALUES ('homepage_settings', $1, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      `, [homepageSettings]);

      await client.query(`
        INSERT INTO platform_settings (key, value, updated_at)
        VALUES ('footer_settings', $1, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      `, [footerSettings]);

      console.log('  ✓ Neon PostgreSQL platform_settings updated successfully.');
    } finally {
      client.release();
      await pool.end();
    }
  }

  console.log('--- Sync Completed Successfully ---\n');
}

syncSettings().catch(err => {
  console.error('Failed to sync settings:', err);
  process.exit(1);
});
