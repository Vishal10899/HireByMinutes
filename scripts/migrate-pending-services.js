const { Pool } = require('pg');

const url = 'postgresql://neondb_owner:npg_5huVAgOw7ocD@ep-fancy-frog-ay4krhqt-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check affected services
    const checkRes = await client.query(`
      SELECT id, provider_id, title, listing_status, listing_fee_paid 
      FROM services 
      WHERE listing_status = 'pending_payment';
    `);
    console.log('Services to migrate:', checkRes.rows);

    // 2. Perform safe migration for services blocked solely by obsolete listing fee
    const updateRes = await client.query(`
      UPDATE services 
      SET listing_status = 'active', listing_fee_paid = 1, updated_at = CURRENT_TIMESTAMP
      WHERE listing_status = 'pending_payment'
      RETURNING id, title, listing_status, listing_fee_paid;
    `);
    console.log('Migrated services:', updateRes.rows);

    // 3. Recalculate category service counts
    await client.query(`
      UPDATE categories 
      SET service_count = (
        SELECT COUNT(*) FROM services 
        WHERE services.category_id = categories.id AND LOWER(services.listing_status) IN ('active', 'published')
      );
    `);

    // 4. Verify discovery query matches
    const discoveryRes = await client.query(`
      SELECT s.id, s.title, s.price_per_minute, s.available_now, s.listing_status,
             u.full_name as provider_name, u.rating as provider_rating,
             c.name as category_name, c.slug as category_slug, c.service_count
      FROM services s
      JOIN users u ON s.provider_id = u.id
      JOIN categories c ON s.category_id = c.id
      WHERE LOWER(s.listing_status) IN ('active', 'published')
        AND (u.is_suspended = 0 OR u.is_suspended IS NULL)
        AND u.email_verified = 1;
    `);
    console.log('Discovery query results (count = ' + discoveryRes.rows.length + '):');
    console.table(discoveryRes.rows);

    await client.query('COMMIT');
    console.log('Migration committed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
