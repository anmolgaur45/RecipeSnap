-- ============================================================================
-- Phase 2 hardening: user_id -> auth.users FKs + Row Level Security.
--
-- The backend connects as the table owner and bypasses RLS, so these policies
-- do not change API behaviour. They lock down the public PostgREST data API
-- (the anon/publishable keys ship inside the app) so it cannot read or write
-- another user's rows directly, bypassing the Express API.
-- ============================================================================

-- ── Foreign keys to auth.users (cascade-delete a user's data) ───────────────
DO $$ BEGIN ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "pantry" ADD CONSTRAINT "pantry_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "grocery_lists" ADD CONSTRAINT "grocery_lists_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "nutrition_goals" ADD CONSTRAINT "nutrition_goals_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "cook_sessions" ADD CONSTRAINT "cook_sessions_user_id_auth_users_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Enable RLS on every app table ───────────────────────────────────────────
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingredients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pantry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grocery_lists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grocery_list_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipe_collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipe_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipe_adaptations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meal_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meal_plan_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nutrition_goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cook_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nutrition_cache" ENABLE ROW LEVEL SECURITY;

-- ── Per-user policies: top-level tables ─────────────────────────────────────
DROP POLICY IF EXISTS "recipes_own" ON "recipes";
CREATE POLICY "recipes_own" ON "recipes" FOR ALL TO authenticated USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

DROP POLICY IF EXISTS "pantry_own" ON "pantry";
CREATE POLICY "pantry_own" ON "pantry" FOR ALL TO authenticated USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

DROP POLICY IF EXISTS "grocery_lists_own" ON "grocery_lists";
CREATE POLICY "grocery_lists_own" ON "grocery_lists" FOR ALL TO authenticated USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

DROP POLICY IF EXISTS "collections_own" ON "collections";
CREATE POLICY "collections_own" ON "collections" FOR ALL TO authenticated USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

DROP POLICY IF EXISTS "meal_plans_own" ON "meal_plans";
CREATE POLICY "meal_plans_own" ON "meal_plans" FOR ALL TO authenticated USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

DROP POLICY IF EXISTS "nutrition_goals_own" ON "nutrition_goals";
CREATE POLICY "nutrition_goals_own" ON "nutrition_goals" FOR ALL TO authenticated USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

DROP POLICY IF EXISTS "cook_sessions_own" ON "cook_sessions";
CREATE POLICY "cook_sessions_own" ON "cook_sessions" FOR ALL TO authenticated USING (auth.uid() = "user_id") WITH CHECK (auth.uid() = "user_id");

-- ── Parent-scoped policies: child tables ────────────────────────────────────
DROP POLICY IF EXISTS "ingredients_own" ON "ingredients";
CREATE POLICY "ingredients_own" ON "ingredients" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "recipes" r WHERE r."id" = "ingredients"."recipe_id" AND r."user_id" = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM "recipes" r WHERE r."id" = "ingredients"."recipe_id" AND r."user_id" = auth.uid()));

DROP POLICY IF EXISTS "steps_own" ON "steps";
CREATE POLICY "steps_own" ON "steps" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "recipes" r WHERE r."id" = "steps"."recipe_id" AND r."user_id" = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM "recipes" r WHERE r."id" = "steps"."recipe_id" AND r."user_id" = auth.uid()));

DROP POLICY IF EXISTS "recipe_tags_own" ON "recipe_tags";
CREATE POLICY "recipe_tags_own" ON "recipe_tags" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "recipes" r WHERE r."id" = "recipe_tags"."recipe_id" AND r."user_id" = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM "recipes" r WHERE r."id" = "recipe_tags"."recipe_id" AND r."user_id" = auth.uid()));

DROP POLICY IF EXISTS "recipe_collections_own" ON "recipe_collections";
CREATE POLICY "recipe_collections_own" ON "recipe_collections" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "recipes" r WHERE r."id" = "recipe_collections"."recipe_id" AND r."user_id" = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM "recipes" r WHERE r."id" = "recipe_collections"."recipe_id" AND r."user_id" = auth.uid()));

DROP POLICY IF EXISTS "recipe_adaptations_own" ON "recipe_adaptations";
CREATE POLICY "recipe_adaptations_own" ON "recipe_adaptations" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "recipes" r WHERE r."id" = "recipe_adaptations"."original_recipe_id" AND r."user_id" = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM "recipes" r WHERE r."id" = "recipe_adaptations"."original_recipe_id" AND r."user_id" = auth.uid()));

DROP POLICY IF EXISTS "grocery_list_items_own" ON "grocery_list_items";
CREATE POLICY "grocery_list_items_own" ON "grocery_list_items" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "grocery_lists" g WHERE g."id" = "grocery_list_items"."list_id" AND g."user_id" = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM "grocery_lists" g WHERE g."id" = "grocery_list_items"."list_id" AND g."user_id" = auth.uid()));

DROP POLICY IF EXISTS "meal_plan_entries_own" ON "meal_plan_entries";
CREATE POLICY "meal_plan_entries_own" ON "meal_plan_entries" FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM "meal_plans" m WHERE m."id" = "meal_plan_entries"."meal_plan_id" AND m."user_id" = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM "meal_plans" m WHERE m."id" = "meal_plan_entries"."meal_plan_id" AND m."user_id" = auth.uid()));

-- nutrition_cache: shared lookup, no authenticated policy => denied via the data
-- API; the backend (table owner) bypasses RLS and keeps full access.
