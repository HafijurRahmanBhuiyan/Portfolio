import fs from 'node:fs';
import path from 'node:path';

/**
 * Apply versioned, additive SQL migrations exactly once.
 *
 * A PostgreSQL advisory lock serialises concurrent API instances. Every
 * migration and its schema_migrations row commit in one transaction, so a
 * failed migration leaves neither partial DDL nor a false "applied" record.
 */
export async function runMigrations(pool, root) {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );

  const directory = path.join(root, 'migrations');
  const files = fs
    .readdirSync(directory)
    .filter((file) => /^\d+_[A-Za-z0-9_-]+\.sql$/.test(file))
    .sort();

  const client = await pool.connect();
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext('portfolio_schema_migrations'))",
    );
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const applied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version=$1',
        [version],
      );
      if (applied.rowCount) continue;
      const sql = fs.readFileSync(path.join(directory, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations(version) VALUES($1)',
          [version],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('portfolio_schema_migrations'))",
      );
    } catch {}
    client.release();
  }
}
