const { Pool } = require('pg');

const url = 'postgresql://neondb_owner:npg_5huVAgOw7ocD@ep-fancy-frog-ay4krhqt-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function inspectDetails() {
  try {
    const users = await pool.query(`
      SELECT id, role, full_name, headline, bio, country, city, 
             rating, review_count, sessions_completed, verified, is_suspended, email_verified, created_at
      FROM users 
      WHERE role = 'provider';
    `);
    console.log('Provider users in Neon:');
    console.log(JSON.stringify(users.rows, null, 2));

    const services = await pool.query(`
      SELECT id, provider_id, category_id, title, description, price_per_minute, 
             listing_status, listing_fee_paid, listing_fee_payment_id, skills_json, languages_json, 
             experience_years, available_now, created_at, updated_at
      FROM services;
    `);
    console.log('Services in Neon:');
    console.log(JSON.stringify(services.rows, null, 2));

    const categories = await pool.query(`
      SELECT id, name, slug, active, service_count FROM categories;
    `);
    console.log('Categories in Neon:');
    console.log(JSON.stringify(categories.rows, null, 2));

    // Test the exact query that GET /services runs against these rows
    const testQuery = await pool.query(`
      SELECT s.id, s.title, s.listing_status, u.is_suspended, u.email_verified, c.id as cat_id
      FROM services s
      JOIN users u ON s.provider_id = u.id
      JOIN categories c ON s.category_id = c.id
      WHERE s.listing_status = 'active' AND u.is_suspended = 0 AND u.email_verified = 1;
    `);
    console.log('Matches with listing_status = active:', testQuery.rows.length);

    const testQueryAnyStatus = await pool.query(`
      SELECT s.id, s.title, s.listing_status, u.is_suspended, u.email_verified, c.id as cat_id
      FROM services s
      JOIN users u ON s.provider_id = u.id
      JOIN categories c ON s.category_id = c.id;
    `);
    console.log('Matches without WHERE clause:', testQueryAnyStatus.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

inspectDetails();
