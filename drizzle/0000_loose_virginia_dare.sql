CREATE TABLE IF NOT EXISTS "eventData" (
	"id" serial NOT NULL,
	"user_id" varchar,
	"eventId" varchar,
	"name" varchar,
	"type" varchar,
	"event_details" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usersss" (
	"id" serial NOT NULL,
	"user_id" varchar,
	"app_id" varchar,
	"device_id" varchar,
	CONSTRAINT "usersss_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "usersss_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eventData" ADD CONSTRAINT "eventData_user_id_usersss_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usersss"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
