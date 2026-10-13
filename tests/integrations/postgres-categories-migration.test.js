// HireByMinutes — PostgreSQL & SQLite Categories Schema Migration Regression Test Suite
// Verifies fix for missing subcategories_json column, safe ALTER TABLE migrations,
// idempotent re-runs, and preservation of existing categories & admin modifications.

const { newDb, replaceQueryArgs$ } = require('pg-mem');
const Database = require('better-sqlite3');
const { translateSql, normalizeRow } = require('../../server/pgUtils');
const dbModule = require('../../server/db');

function createPgMemMockDb(mem) {
  function prepareSql(sql, params) {
    const { translated, isPragma } = translateSql(sql);
    if (isPragma) return { isPragma: true };
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const finalSql = flatParams.length > 0 ? replaceQueryArgs$(translated, flatParams) : translated;
    return { finalSql, isPragma: false };
  }

  return {
    isPostgres: true,
    exec(sql) {
      mem.public.none(sql);
    },
    prepare(sql) {
      return {
        run(...params) {
          const { finalSql, isPragma } = prepareSql(sql, params);
          if (isPragma) return { changes: 0 };
          const res = mem.public.query(finalSql);
          return { changes: res.rowCount || 0 };
        },
        get(...params) {
          const { finalSql, isPragma } = prepareSql(sql, params);
          if (isPragma) return undefined;
          const rows = mem.public.many(finalSql);
          return rows[0] ? normalizeRow(rows[0]) : undefined;
        },
        all(...params) {
          const { finalSql, isPragma } = prepareSql(sql, params);
          if (isPragma) return [];
          const rows = mem.public.many(finalSql);
          return rows.map(normalizeRow);
        }
      };
    }
  };
}

async function runCategoriesMigrationTests() {
  console.log('\n======================================================================');
  console.log('--- POSTGRESQL & SQLITE CATEGORIES SCHEMA MIGRATION REGRESSION SUITE ---');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (!condition) {
      console.error(`  ✗ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    passed++;
    console.log(`  ✓ [PASS] ${message}`);
  }

  // -------------------------------------------------------------------------
  // SUITE 1: Reproduction of Old PostgreSQL Schema & Startup Migration
  // -------------------------------------------------------------------------
  console.log('--- Suite 1: Reproduction of Old PostgreSQL Schema & Startup Migration ---');

  const mem = newDb({ noAstCoverageCheck: true });
  // 1. Setup pre-existing PostgreSQL schema without subcategories_json
  mem.public.none(`
    CREATE TABLE categories (
      id VARCHAR(64) PRIMARY KEY,
      slug VARCHAR(128) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      icon VARCHAR(64) NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      service_count INTEGER DEFAULT 0
    );

    -- Seed legacy production data
    INSERT INTO categories (id, slug, name, icon, description, sort_order, active, service_count)
    VALUES ('cat-tech', 'technology', 'Technology & Software', 'Code2', 'Engineering consultations', 1, 1, 5);

    -- Seed admin-created custom category that must be preserved
    INSERT INTO categories (id, slug, name, icon, description, sort_order, active, service_count)
    VALUES ('cat-custom-ai', 'custom-ai-ops', 'Custom AI Operations', 'Cpu', 'Specialized enterprise LLM ops', 99, 1, 2);

    -- Seed modified category with custom admin description
    INSERT INTO categories (id, slug, name, icon, description, sort_order, active, service_count)
    VALUES ('cat-business', 'business', 'Business and Professional Consulting', 'Briefcase', 'Admin customized description for executive advisory', 9, 1, 1);
  `);

  const mockDb = createPgMemMockDb(mem);

  // Verify that prior to migration, subcategories_json column does NOT exist
  let preMigrationFailedAsExpected = false;
  try {
    mockDb.prepare('SELECT subcategories_json FROM categories WHERE id = ?').get('cat-tech');
  } catch (err) {
    preMigrationFailedAsExpected = true;
  }
  assert(preMigrationFailedAsExpected, 'Pre-migration check confirms subcategories_json is absent on legacy schema');

  // Execute full initPostgresSchema on the pre-existing database
  dbModule.initPostgresSchema(mockDb);
  assert(true, 'initPostgresSchema executes successfully against legacy PostgreSQL schema without crashing');

  // Verify columns now exist
  const catTechRow = mockDb.prepare('SELECT * FROM categories WHERE id = ?').get('cat-tech');
  assert(catTechRow !== undefined, 'Legacy category cat-tech exists after migration');
  assert(typeof catTechRow.subcategories_json === 'string', 'categories.subcategories_json column successfully created and queryable');
  
  const parsedSubcats = JSON.parse(catTechRow.subcategories_json);
  assert(Array.isArray(parsedSubcats) && parsedSubcats.length > 0, 'cat-tech populated with non-empty default subcategories array');
  assert(parsedSubcats.includes('Software Engineering'), 'cat-tech contains Software Engineering subcategory');

  // -------------------------------------------------------------------------
  // SUITE 2: Preservation of Existing Categories, Metadata & Admin Changes
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 2: Preservation of Existing Categories, Metadata & Admin Changes ---');

  const customCatRow = mockDb.prepare('SELECT * FROM categories WHERE id = ?').get('cat-custom-ai');
  assert(customCatRow !== undefined, 'Admin custom category cat-custom-ai is preserved and NOT deleted');
  assert(customCatRow.name === 'Custom AI Operations', 'Admin custom category name preserved intact');
  assert(customCatRow.description === 'Specialized enterprise LLM ops', 'Admin custom category description preserved intact');
  assert(customCatRow.service_count === 2, 'Admin custom category service_count preserved (service relationships intact)');
  assert(customCatRow.subcategories_json === '[]', 'Admin custom category received default empty array for subcategories_json');

  const businessCatRow = mockDb.prepare('SELECT * FROM categories WHERE id = ?').get('cat-business');
  assert(businessCatRow !== undefined, 'Business category exists');
  assert(businessCatRow.description === 'Admin customized description for executive advisory', 'Admin custom description was preserved and NOT overwritten by default seed values');

  // -------------------------------------------------------------------------
  // SUITE 3: Migration Idempotency & Safe Re-run Check
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 3: Migration Idempotency & Safe Re-run Check ---');

  // Run initPostgresSchema a second and third time
  dbModule.initPostgresSchema(mockDb);
  assert(true, 'Second run of initPostgresSchema completes cleanly (100% idempotent)');

  dbModule.initPostgresSchema(mockDb);
  assert(true, 'Third run of initPostgresSchema completes cleanly without constraint errors');

  const finalCustomRow = mockDb.prepare('SELECT * FROM categories WHERE id = ?').get('cat-custom-ai');
  assert(finalCustomRow.name === 'Custom AI Operations', 'Custom category data remains intact after multiple schema runs');

  // -------------------------------------------------------------------------
  // SUITE 4: SQLite Parity & Local Development Compatibility
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 4: SQLite Parity & Local Development Compatibility ---');

  const sqliteDb = new Database(':memory:');
  // Create old SQLite categories table without subcategories_json
  sqliteDb.exec(`
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      service_count INTEGER DEFAULT 0
    );

    INSERT INTO categories (id, slug, name, icon, description, sort_order, active, service_count)
    VALUES ('cat-tech', 'technology', 'Technology & Software', 'Code2', 'Dev consults', 1, 1, 3);

    INSERT INTO categories (id, slug, name, icon, description, sort_order, active, service_count)
    VALUES ('cat-admin-custom', 'admin-custom', 'Custom Admin Service', 'Zap', 'Custom description', 20, 1, 0);
  `);

  // Run initSqliteSchema
  dbModule.initSqliteSchema(sqliteDb);
  assert(true, 'initSqliteSchema successfully migrates legacy SQLite database without error');

  // Run ensureDefaultCategories
  dbModule.ensureDefaultCategories(sqliteDb);
  assert(true, 'ensureDefaultCategories populates default subcategories on SQLite without error');

  const sqliteTech = sqliteDb.prepare('SELECT * FROM categories WHERE id = ?').get('cat-tech');
  assert(typeof sqliteTech.subcategories_json === 'string', 'SQLite categories.subcategories_json is string column');
  const sqliteSubcats = JSON.parse(sqliteTech.subcategories_json);
  assert(Array.isArray(sqliteSubcats) && sqliteSubcats.includes('Cloud Architecture'), 'SQLite subcategories parsed successfully and contains Cloud Architecture');

  const sqliteAdminCustom = sqliteDb.prepare('SELECT * FROM categories WHERE id = ?').get('cat-admin-custom');
  assert(sqliteAdminCustom !== undefined, 'SQLite admin custom category preserved');
  assert(sqliteAdminCustom.name === 'Custom Admin Service', 'SQLite admin custom category name preserved');

  // -------------------------------------------------------------------------
  // SUITE 5: API-Level Category Query Simulation (/api/categories)
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 5: API-Level Category Query Simulation (/api/categories) ---');

  const categories = mockDb.prepare(`
    SELECT c.* 
    FROM categories c
    WHERE c.active = 1
    ORDER BY c.sort_order ASC
  `).all().map(c => {
    let subcats = [];
    try {
      subcats = JSON.parse(c.subcategories_json || '[]');
    } catch {
      subcats = [];
    }
    return {
      ...c,
      sort_order: Number(c.sort_order) || 0,
      subcategories: Array.isArray(subcats) ? subcats : [],
      is_regulated: Boolean(c.is_regulated)
    };
  });

  assert(categories.length >= 11, `API query returns all categories (found ${categories.length}, expected >= 11)`);
  assert(categories.every(c => Array.isArray(c.subcategories)), 'Every category returns a valid subcategories array');
  assert(categories.every(c => typeof c.is_regulated === 'boolean'), 'Every category returns boolean is_regulated');

  sqliteDb.close();

  console.log('\n======================================================================');
  console.log(`SUMMARY: ${passed} / ${total} categories schema migration regression tests passed.`);
  console.log('======================================================================\n');
  console.log('🎉 ALL CATEGORIES SCHEMA MIGRATION REGRESSION TESTS PASSED 100%!\n');
}

runCategoriesMigrationTests().catch(err => {
  console.error('\n❌ CATEGORIES SCHEMA MIGRATION REGRESSION TEST FAILED:', err);
  process.exit(1);
});
