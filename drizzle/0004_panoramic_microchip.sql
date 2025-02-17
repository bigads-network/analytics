ALTER TABLE "user_games" RENAME COLUMN "event_id" TO "game_id";--> statement-breakpoint
ALTER TABLE "user_games" DROP CONSTRAINT "user_games_event_id_games_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_games" ADD CONSTRAINT "user_games_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
