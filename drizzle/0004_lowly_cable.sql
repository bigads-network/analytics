CREATE INDEX "event_id_idx" ON "events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "events_game_id_idx" ON "events" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "creator_id_idx" ON "games" USING btree ("creater_id");--> statement-breakpoint
CREATE INDEX "games_game_id_idx" ON "games" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "transactions_game_id_idx" ON "transactions" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "transactions_user_id_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_id_idx" ON "users" USING btree ("user_id");