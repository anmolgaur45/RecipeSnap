CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"emoji" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cook_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"meal_plan_entry_id" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"servings_cooked" integer DEFAULT 2 NOT NULL,
	"rating" integer,
	"notes" text,
	"photo_uri" text
);
--> statement-breakpoint
CREATE TABLE "grocery_list_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"recipe_id" uuid,
	"recipe_ids" text,
	"item" text NOT NULL,
	"quantity" text,
	"unit" text,
	"numeric_quantity" double precision,
	"aisle" text,
	"is_checked" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grocery_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"recipe_ids" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"item" text NOT NULL,
	"quantity" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"original_quantity" text,
	"unit" text,
	"numeric_quantity" double precision,
	"grocery_aisle" text
);
--> statement-breakpoint
CREATE TABLE "meal_plan_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"meal_plan_id" integer NOT NULL,
	"recipe_id" uuid NOT NULL,
	"date" text NOT NULL,
	"meal_slot" text NOT NULL,
	"servings" integer DEFAULT 2 NOT NULL,
	"is_cooked" boolean DEFAULT false NOT NULL,
	"cooked_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_cache" (
	"food_name" text PRIMARY KEY NOT NULL,
	"calories_100g" double precision NOT NULL,
	"protein_100g" double precision NOT NULL,
	"carbs_100g" double precision NOT NULL,
	"fat_100g" double precision NOT NULL,
	"fiber_100g" double precision NOT NULL,
	"sugar_100g" double precision NOT NULL,
	"sodium_100g" double precision NOT NULL,
	"source" text DEFAULT 'usda' NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"calories_target" integer DEFAULT 2000 NOT NULL,
	"protein_target" double precision DEFAULT 50 NOT NULL,
	"carbs_target" double precision DEFAULT 250 NOT NULL,
	"fat_target" double precision DEFAULT 65 NOT NULL,
	"fiber_target" double precision DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pantry" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"item" text NOT NULL,
	"display_name" text,
	"quantity" text,
	"unit" text,
	"category" text,
	"expires_at" text,
	"is_staple" boolean DEFAULT false NOT NULL,
	"notes" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_adaptations" (
	"id" serial PRIMARY KEY NOT NULL,
	"original_recipe_id" uuid NOT NULL,
	"adapted_recipe_id" uuid NOT NULL,
	"adaptation_type" text NOT NULL,
	"prompt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_collections" (
	"recipe_id" uuid NOT NULL,
	"collection_id" integer NOT NULL,
	CONSTRAINT "recipe_collections_recipe_id_collection_id_pk" PRIMARY KEY("recipe_id","collection_id")
);
--> statement-breakpoint
CREATE TABLE "recipe_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"servings" text,
	"prep_time" text,
	"cook_time" text,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"cuisine" text,
	"tags" text DEFAULT '[]' NOT NULL,
	"notes" text,
	"source_url" text,
	"platform" text DEFAULT 'unknown' NOT NULL,
	"confidence" text DEFAULT 'medium' NOT NULL,
	"original_servings" integer,
	"calories_per_serving" integer,
	"protein_grams" double precision,
	"carbs_grams" double precision,
	"fat_grams" double precision,
	"fiber_grams" double precision,
	"sugar_grams" double precision,
	"sodium_mg" double precision,
	"thumbnail_url" text,
	"adapted_from" uuid,
	"adaptation_type" text,
	"nutrition_confidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"instruction" text NOT NULL,
	"duration" text,
	"tip" text
);
--> statement-breakpoint
ALTER TABLE "cook_sessions" ADD CONSTRAINT "cook_sessions_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cook_sessions" ADD CONSTRAINT "cook_sessions_meal_plan_entry_id_meal_plan_entries_id_fk" FOREIGN KEY ("meal_plan_entry_id") REFERENCES "public"."meal_plan_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_list_items" ADD CONSTRAINT "grocery_list_items_list_id_grocery_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."grocery_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grocery_list_items" ADD CONSTRAINT "grocery_list_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_meal_plan_id_meal_plans_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_adaptations" ADD CONSTRAINT "recipe_adaptations_original_recipe_id_recipes_id_fk" FOREIGN KEY ("original_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_adaptations" ADD CONSTRAINT "recipe_adaptations_adapted_recipe_id_recipes_id_fk" FOREIGN KEY ("adapted_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_collections" ADD CONSTRAINT "recipe_collections_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_collections" ADD CONSTRAINT "recipe_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_collections_user" ON "collections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_cook_sessions_recipe" ON "cook_sessions" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_cook_sessions_user" ON "cook_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_grocery_items_list" ON "grocery_list_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "idx_grocery_lists_user" ON "grocery_lists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ingredients_recipe" ON "ingredients" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_mpe_date" ON "meal_plan_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_mpe_plan" ON "meal_plan_entries" USING btree ("meal_plan_id");--> statement-breakpoint
CREATE INDEX "idx_meal_plans_user" ON "meal_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_nutrition_goals_user" ON "nutrition_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pantry_user_item" ON "pantry" USING btree ("user_id","item");--> statement-breakpoint
CREATE INDEX "idx_recipe_adapt_original" ON "recipe_adaptations" USING btree ("original_recipe_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_coll_recipe" ON "recipe_collections" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_tags_recipe" ON "recipe_tags" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_recipes_user_created" ON "recipes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_steps_recipe" ON "steps" USING btree ("recipe_id","step_number");