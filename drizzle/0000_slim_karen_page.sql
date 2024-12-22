CREATE TABLE IF NOT EXISTS "eventData" (
	"id" serial NOT NULL,
	"user_id" varchar,
	"eventId" varchar,
	"name" varchar,
	"type" varchar,
	"event_details" varchar,
	CONSTRAINT "eventData_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "eventData_eventId_unique" UNIQUE("eventId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial NOT NULL,
	"user_id" varchar,
	"app_id" varchar,
	"device_id" varchar,
	"sa_address" varchar,
	CONSTRAINT "users_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "users_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_events" (
	"id" serial NOT NULL,
	"user_id" varchar,
	"event_id" varchar,
	CONSTRAINT "user_events_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eventData" ADD CONSTRAINT "eventData_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_events" ADD CONSTRAINT "user_events_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_events" ADD CONSTRAINT "user_events_event_id_eventData_eventId_fk" FOREIGN KEY ("event_id") REFERENCES "public"."eventData"("eventId") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
