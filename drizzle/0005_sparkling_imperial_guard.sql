CREATE TABLE IF NOT EXISTS "creator_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"ma_address" varchar,
	"role" varchar DEFAULT 'user',
	"status" varchar DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ma_address" varchar;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creator_requests" ADD CONSTRAINT "creator_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_ma_address_unique" UNIQUE("ma_address");