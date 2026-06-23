import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// Postgres connection (Supabase). Set DATABASE_URL in the environment.
// The pool is lazy: it does not connect until the first query runs.
const connectionString = process.env.DATABASE_URL;

export const pool = new Pool(connectionString ? { connectionString } : undefined);

export const db = drizzle(pool);
