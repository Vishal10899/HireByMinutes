const { Pool } = require('pg');

const url = 'postgresql://neondb_owner:npg_5huVAgOw7ocD@ep-fancy-frog-ay4krhqt-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function inspect() {
  try {
    const usersRes = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN role = 'provider' THEN 1 END) as total_providers,
        COUNT(CASE WHEN role = 'client' THEN 1 END) as total_clients,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as total_admins,
        COUNT(CASE WHEN role = 'provider' AND verified = 1 THEN 1 END) as verified_providers,
        COUNT(CASE WHEN role = 'provider' AND (is_suspended = 0 OR is_suspended IS NULL) THEN 1 END) as active_providers,
        COUNT(CASE WHEN role = 'provider' AND is_suspended = 1 THEN 1 END) as suspended_providers
      FROM users;
    `);
    console.log('User stats:', usersRes.rows[0]);

    const servicesRes = await pool.query(`
      SELECT 
        COUNT(*) as total_services,
        COUNT(CASE WHEN listing_status = 'active' THEN 1 END) as active_services,
        COUNT(CASE WHEN listing_status = 'published' THEN 1 END) as published_services,
        COUNT(CASE WHEN listing_status = 'draft' THEN 1 END) as draft_services,
        COUNT(CASE WHEN listing_status = 'inactive' THEN 1 END) as inactive_services,
        COUNT(CASE WHEN listing_status NOT IN ('active', 'published', 'draft', 'inactive') THEN 1 END) as other_status_services
      FROM services;
    `);
    console.log('Service stats:', servicesRes.rows[0]);

    const serviceDistinctStatus = await pool.query(`
      SELECT listing_status, COUNT(*) as cnt FROM services GROUP BY listing_status;
    `);
    console.log('Service distinct listing_status:', serviceDistinctStatus.rows);

    const providerList = await pool.query(`
      SELECT id, role, verified, is_suspended, email_verified, created_at FROM users WHERE role = 'provider';
    `);
    console.log('Providers (sanitized, count=' + providerList.rows.length + '):', providerList.rows);

    const allUsers = await pool.query(`
      SELECT id, role, verified, is_suspended, email_verified, created_at FROM users;
    `);
    console.log('All Users summary (count=' + allUsers.rows.length + '):', allUsers.rows);

    const servicesList = await pool.query(`
      SELECT id, provider_id, category_id, title, price_per_minute, listing_status, listing_fee_paid, available_now FROM services;
    `);
    console.log('Services list (count=' + servicesList.rows.length + '):', servicesList.rows);

    const catRes = await pool.query(`
      SELECT id, name, is_active, service_count FROM categories;
    `);
    console.log('Categories (count=' + catRes.rows.length + '):', catRes.rows);

    const availRes = await pool.query(`
      SELECT COUNT(*) as total_avail FROM provider_availability;
    `);
    console.log('Provider availability count:', availRes.rows[0]);

    // Check relationship integrity
    const orphanedProviderServices = await pool.query(`
      SELECT s.id, s.title, s.provider_id 
      FROM services s 
      LEFT JOIN users u ON s.provider_id = u.id 
      WHERE u.id IS NULL;
    `);
    console.log('Orphaned services (invalid provider_id):', orphanedProviderServices.rows.length);

    const orphanedCategoryServices = await pool.query(`
      SELECT s.id, s.title, s.category_id 
      FROM services s 
      LEFT JOIN categories c ON s.category_id = c.id 
      WHERE c.id IS NULL;
    `);
    console.log('Orphaned services (invalid category_id):', orphanedCategoryServices.rows.length);

  } catch (err) {
    console.error('Inspection error:', err);
  } finally {
    await pool.end();
  }
}

inspect();
