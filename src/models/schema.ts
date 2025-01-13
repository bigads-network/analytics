import { relations} from 'drizzle-orm';
import { serial,varchar,pgTable,primaryKey, jsonb } from 'drizzle-orm/pg-core';


export const user:any = pgTable("users", {
  id: serial("id"),
  userId:varchar("user_id").unique(),
  appId:varchar("app_id"),
  deviceId:varchar("device_id"),
  saAddress: varchar("sa_address")
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
    transactionhash: varchar("transaction_hash"),
    amount: varchar("amount"),
    from : varchar("from"),
    to: varchar("to"),
  }, (table) => ({
    pk: primaryKey({ columns: [table.id] }),  
  }))

  export const userEvents = pgTable("user_events",{
      id: serial("id"),
      userId: varchar("user_id").references(() => user.userId),
      eventId: varchar("event_id").references(() => eventData.eventId),
    },
    (table) => ({
      pk: primaryKey({ columns: [table.id] }),
    })
  );


  export const userRelations = relations(user, ({ many }) => ({
      events: many(eventData,{
      relationName: "userEvents",
    }),
  }));
  
  // Relations for EventData Table
  export const eventDataRelations = relations(eventData, ({ one }) => ({
    user: one(user, {
      fields: [eventData.userId],
      references: [user.userId],
      relationName: "userEvents",
    }),
  }));



  