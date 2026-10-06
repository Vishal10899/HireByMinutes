const { Pool } = require('pg');

const url = 'postgresql://neondb_owner:npg_5huVAgOw7ocD@ep-fancy-frog-ay4krhqt-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function testSimulatedActive() {
  const query = `
    SELECT s.id, s.title, s.price_per_minute, s.available_now,
           u.full_name as provider_name, u.avatar_url as provider_avatar,
           u.rating as provider_rating, u.review_count as provider_review_count,
           c.name as category_name, c.slug as category_slug
    FROM services s
    JOIN users u ON s.provider_id = u.id
    JOIN categories c ON s.category_id = c.id
    WHERE (u.is_suspended = 0 OR u.is_suspended IS NULL)
      AND u.email_verified = 1
    ORDER BY s.available_now DESC, u.rating DESC;
  `;
  const res = await pool.query(query);
  console.log('Results if status matches:');
  console.log(res.rows);
  await pool.end();
}
testSimulatedActive();
