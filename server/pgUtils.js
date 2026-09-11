// HireByMinutes — PostgreSQL Dialect Translation & Row Normalization Utilities

// Row object normalizer (converts Date objects to ISO strings, numbers where appropriate)
function normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const normalized = {};
  for (const key of Object.keys(row)) {
    const val = row[key];
    if (val instanceof Date) {
      normalized[key] = val.toISOString();
    } else if (key === 'count' && typeof val === 'string' && /^\d+$/.test(val)) {
      normalized[key] = parseInt(val, 10);
    } else {
      normalized[key] = val;
    }
  }
  return normalized;
}

// SQL Dialect Translator (translates SQLite-specific syntax to standard PostgreSQL)
function translateSql(sql) {
  let trimmed = sql.trim();

  // 1. Handle PRAGMA statements (SQLite specific, no-op in PG)
  if (/^PRAGMA\s+/i.test(trimmed)) {
    return { translated: 'SELECT 1 as alive', isPragma: true };
  }

  // 2. Translate sqlite_master queries to information_schema
  if (/sqlite_master/i.test(trimmed)) {
    trimmed = trimmed.replace(
      /FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=/gi,
      "FROM information_schema.tables WHERE table_schema = 'public' AND table_name ="
    );
    trimmed = trimmed.replace(/SELECT\s+name\s+FROM\s+information_schema/gi, "SELECT table_name as name FROM information_schema");
  }

  // 3. Translate INSERT OR IGNORE
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(trimmed)) {
    trimmed = trimmed.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
    if (!/ON\s+CONFLICT/i.test(trimmed)) {
      trimmed += ' ON CONFLICT DO NOTHING';
    }
  }

  // 4. Translate INSERT OR REPLACE INTO platform_settings
  if (/INSERT\s+OR\s+REPLACE\s+INTO\s+platform_settings/i.test(trimmed)) {
    trimmed = trimmed.replace(
      /INSERT\s+OR\s+REPLACE\s+INTO\s+platform_settings\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi,
      'INSERT INTO platform_settings ($1) VALUES ($2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP'
    );
  }

  // 5. Convert parameter placeholders '?' -> '$1, $2, $3...'
  let paramIndex = 1;
  let translated = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === "'" && (i === 0 || trimmed[i - 1] !== '\\')) {
      if (!inDoubleQuote) inSingleQuote = !inSingleQuote;
      translated += char;
    } else if (char === '"' && (i === 0 || trimmed[i - 1] !== '\\')) {
      if (!inSingleQuote) inDoubleQuote = !inDoubleQuote;
      translated += char;
    } else if (char === '?' && !inSingleQuote && !inDoubleQuote) {
      translated += `$${paramIndex++}`;
    } else {
      translated += char;
    }
  }

  return { translated, isPragma: false };
}

module.exports = { normalizeRow, translateSql };
