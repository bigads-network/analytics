"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventDataRelations = exports.userRelations = exports.userEvents = exports.eventData = exports.user = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
exports.user = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.serial)("id"),
    userId: (0, pg_core_1.varchar)("user_id").unique(),
    appId: (0, pg_core_1.varchar)("app_id"),
    deviceId: (0, pg_core_1.varchar)("device_id")
}, (table) => ({
    pk: (0, pg_core_1.primaryKey)({ columns: [table.id] }),
}));
exports.eventData = (0, pg_core_1.pgTable)("eventData", {
    id: (0, pg_core_1.serial)("id"),
    userId: (0, pg_core_1.varchar)("user_id").references(() => exports.user.userId),
    eventId: (0, pg_core_1.varchar)("eventId").unique(),
    name: (0, pg_core_1.varchar)("name"),
    type: (0, pg_core_1.varchar)("type"),
    eventDetails: (0, pg_core_1.varchar)("event_details"),
}, (table) => ({
    pk: (0, pg_core_1.primaryKey)({ columns: [table.id] }),
}));
exports.userEvents = (0, pg_core_1.pgTable)("user_events", {
    id: (0, pg_core_1.serial)("id"),
    userId: (0, pg_core_1.varchar)("user_id").references(() => exports.user.userId),
    eventId: (0, pg_core_1.varchar)("event_id").references(() => exports.eventData.eventId),
}, (table) => ({
    pk: (0, pg_core_1.primaryKey)({ columns: [table.id] }),
}));
exports.userRelations = (0, drizzle_orm_1.relations)(exports.user, ({ many }) => ({
    events: many(exports.eventData, {
        relationName: "userEvents",
    }),
}));
// Relations for EventData Table
exports.eventDataRelations = (0, drizzle_orm_1.relations)(exports.eventData, ({ one }) => ({
    user: one(exports.user, {
        fields: [exports.eventData.userId],
        references: [exports.user.userId],
        relationName: "userEvents",
    }),
}));
//# sourceMappingURL=schema.js.map