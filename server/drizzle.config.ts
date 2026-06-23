import 'dotenv/config';
import type { Config } from 'drizzle-kit';

// Postgres schema (src/db/schema.pg.ts).
// DATABASE_URL is the Supabase Postgres connection string.
export default {
  schema: './src/db/schema.pg.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
} satisfies Config;
