import { serial,varchar,pgTable,primaryKey, jsonb } from 'drizzle-orm/pg-core';


export const user: any = pgTable("users", {
  id: serial("id"),
  userId:varchar("user_id").unique(),
  appId:varchar("app_id"),
  deviceId:varchar("device_id")
}, (table) => ({
  pk: primaryKey({ columns: [table.id] }),
}));
 
export const eventData:any = pgTable("eventData",{
  id:serial("id"),
  userId: varchar("user_id").references(() => user.userId),
  eventId: varchar("eventId"),
  name: varchar("name"),
  type: varchar("type"),
  eventDetails: varchar("event_details"),
})



  