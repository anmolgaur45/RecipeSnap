-- Custom SQL migration file, put your code below! --

-- ============================================================================
-- extraction_jobs: auth.users FK + Row Level Security (same model as 0001).
-- The backend connects as the table owner and bypasses RLS, so this does not
-- change API behaviour. It locks the public PostgREST data API so a user cannot
-- read or enqueue another user's extraction jobs directly with the anon key.
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE "extraction_jobs"
    ADD CONSTRAINT "extraction_jobs_user_id_auth_users_fk"
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

ALTER TABLE "extraction_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "extraction_jobs_own" ON "extraction_jobs";
--> statement-breakpoint

CREATE POLICY "extraction_jobs_own" ON "extraction_jobs"
  FOR ALL TO authenticated
  USING (auth.uid() = "user_id")
  WITH CHECK (auth.uid() = "user_id");
