ALTER TABLE "extraction_jobs" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "gemini_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "gemini_output_tokens" integer;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "claude_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "claude_output_tokens" integer;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "whisper_seconds" integer;--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "estimated_cost_usd" double precision;