CREATE TABLE "transactionsAvax" (
	"id" serial NOT NULL,
	"game_id" integer,
	"user_id" integer,
	"event_id" integer,
	"transaction_hash" varchar,
	"transaction_chain" varchar NOT NULL,
	"amount" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "transactionsAvax_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "transactionsAvax" ADD CONSTRAINT "transactionsAvax_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactionsAvax" ADD CONSTRAINT "transactionsAvax_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactionsAvax" ADD CONSTRAINT "transactionsAvax_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;