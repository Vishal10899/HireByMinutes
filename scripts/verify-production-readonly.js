const { Pool } = require('pg');

const url = 'postgresql://neondb_owner:npg_5huVAgOw7ocD@ep-fancy-frog-ay4krhqt-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function verifyReadOnly() {
  try {
    console.log('=== 1. USERS TABLE (READ-ONLY) ===');
    const providers = await pool.query(`
      SELECT id, full_name, role, verified, email_verified, is_suspended
      FROM users
      WHERE role = 'provider'
      ORDER BY created_at ASC
    `);
    console.log(`Provider count: ${providers.rowCount}`);
    providers.rows.forEach(p => {
      console.log(`  - ID: ${p.id} | Name: ${p.full_name} | Role: ${p.role} | Verified Badge (verified): ${p.verified} | Email Verified (email_verified): ${p.email_verified} | Suspended (is_suspended): ${p.is_suspended}`);
    });

    console.log('\n=== 2. SERVICES TABLE (READ-ONLY) ===');
    const services = await pool.query(`
      SELECT id, title, provider_id, listing_status, listing_fee_paid, category_id, price_per_minute
      FROM services
      WHERE LOWER(listing_status) IN ('active', 'published')
      ORDER BY created_at ASC
    `);
    console.log(`Active/published services count: ${services.rowCount}`);
    services.rows.forEach(s => {
      console.log(`  - Service ID: ${s.id} | Title: "${s.title}" | Provider ID: ${s.provider_id} | Status: ${s.listing_status} | Fee Paid: ${s.listing_fee_paid} | Category ID: ${s.category_id} | Rate: ₹${s.price_per_minute}/min`);
    });

    console.log('\n=== 3. EXACT DISCOVERY SQL QUERY (READ-ONLY) ===');
    const discoveryQuery = `
      SELECT 
        s.id,
        s.title,
        s.listing_status,
        s.price_per_minute,
        s.category_id,
        u.id as provider_id,
        u.full_name as provider_name,
        u.verified as provider_verified,
        u.email_verified as provider_email_verified,
        u.is_suspended as provider_is_suspended,
        c.name as category_name
      FROM services s
      JOIN users u ON s.provider_id = u.id
      JOIN categories c ON s.category_id = c.id
      WHERE LOWER(s.listing_status) IN ('active', 'published')
        AND (u.is_suspended = 0 OR u.is_suspended IS NULL)
        AND u.email_verified = 1
      ORDER BY s.is_featured DESC, s.created_at DESC
      LIMIT 24 OFFSET 0
    `;
    const discoveryResult = await pool.query(discoveryQuery);
    console.log(`SQL discovery matching rows: ${discoveryResult.rowCount}`);
    discoveryResult.rows.forEach(row => {
      console.log(`  - Match: ${row.id} ("${row.title}") by ${row.provider_name} (Verified Badge: ${row.provider_verified}, Category: ${row.category_name})`);
    });

    await pool.end();
  } catch (err) {
    console.error('Error during read-only verification:', err);
    process.exit(1);
  }
}

verifyReadOnly();
