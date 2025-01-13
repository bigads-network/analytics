ALTER TABLE "eventData" DROP CONSTRAINT "eventData_eventId_unique";--> statement-breakpoint
ALTER TABLE "eventData" ADD COLUMN "transaction_hash" varchar;--> statement-breakpoint
ALTER TABLE "eventData" ADD COLUMN "amount" varchar;--> statement-breakpoint
ALTER TABLE "eventData" ADD COLUMN "from" varchar;--> statement-breakpoint
ALTER TABLE "eventData" ADD COLUMN "to" varchar;