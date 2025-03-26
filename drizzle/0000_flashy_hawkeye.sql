CREATE TABLE "events" (
	"id" serial NOT NULL,
	"event_id" varchar,
	"game_id" integer,
	"event_type" varchar,
	"event_description" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "events_id_unique" UNIQUE("id"),
	CONSTRAINT "events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial NOT NULL,
	"creater_id" integer,
	"game_id" varchar,
	"wallet_address" varchar NOT NULL,
	"game_sa_address" varchar,
	"game_name" varchar,
	"game_type" varchar,
	"description" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "games_id_unique" UNIQUE("id"),
	CONSTRAINT "games_game_id_unique" UNIQUE("game_id"),
	CONSTRAINT "games_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "games_game_sa_address_unique" UNIQUE("game_sa_address"),
	CONSTRAINT "games_game_name_unique" UNIQUE("game_name")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial NOT NULL,
	"game_id" integer,
	"user_id" integer,
	"event_id" integer,
	"transaction_hash" varchar,
	"transaction_chain" varchar NOT NULL,
	"amount" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "transactions_id_unique" UNIQUE("id"),
	CONSTRAINT "transactions_transaction_hash_unique" UNIQUE("transaction_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial NOT NULL,
	"user_id" varchar,
	"device_data" jsonb,
	"role" varchar DEFAULT 'user',
	"wallet_address" varchar NOT NULL,
	"sa_address" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_id_unique" UNIQUE("id"),
	CONSTRAINT "users_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "users_sa_address_unique" UNIQUE("sa_address")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_creater_id_users_id_fk" FOREIGN KEY ("creater_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;