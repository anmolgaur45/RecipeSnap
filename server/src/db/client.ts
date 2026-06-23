import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// Postgres connection (Supabase). Set DATABASE_URL in the environment.
// The pool is lazy: it does not connect until the first query runs.
const connectionString = process.env.DATABASE_URL;

// Keep per-instance connections low: several Cloud Run instances share the
// Supabase pooler, and idle connections are reaped so scaled-down instances
// release them. Override with PG_POOL_MAX if needed.
const max = parseInt(process.env.PG_POOL_MAX ?? '4', 10);

export const pool = new Pool(
  connectionString
    ? { connectionString, max, idleTimeoutMillis: 30_000 }
    : { max, idleTimeoutMillis: 30_000 },
);

export const db = drizzle(pool);
