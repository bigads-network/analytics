import { relations } from 'drizzle-orm';
import { serial,varchar, jsonb, pgTable, timestamp, boolean, integer, primaryKey, index } from 'drizzle-orm/pg-core';



export const users:any = pgTable('users', {
  id: serial('id').unique(),
  userId: varchar('user_id').unique(),
  devicedata: jsonb('device_data'),
  role: varchar('role').default('user'),
  walletAddress: varchar('wallet_address').unique().notNull(),
  saAddress: varchar('sa_address').unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
},
(table) => [{
    pk: primaryKey({ columns: [table.id] }),
}])

export const games:any = pgTable('games', {
  id: serial('id').unique(),
  creatorId: integer('creater_id').references(()=>users.id),
  gameId: varchar('game_id').unique(),
  walletAddress: varchar('wallet_address').unique().notNull(),
  gameSaAddress:varchar('game_sa_address').unique(),
  Gamename: varchar('game_name').unique(),
  Gametype: varchar('game_type'),
  description: varchar('description'),
  createdAt: timestamp('created_at').defaultNow(),
},
(table) => [{
    pk: primaryKey({ columns: [table.id] }),
}])

export const events = pgTable('events', {
  id: serial('id').unique(),
  eventId: varchar('event_id').unique(),
  gameId: integer('game_id').references(() => games.id),
  eventType: varchar('event_type'),
  eventdescription: varchar('event_description'),
  createdAt: timestamp('created_at').defaultNow(),
},
(table) => [{
    pk: primaryKey({ columns: [table.id] }),
}])


export const transactions :any = pgTable('transactions', {
  id: serial('id').unique(),
  gameId:integer('game_id').references(() => games.id),  // for get track of game transaction has done
  UserId: integer('user_id').references(() => users.id), // for the track of user which is playing the game
  eventId: integer('event_id').references(() => events.id), // for the track of event
  transactionHash: varchar('transaction_hash'),
  transactionChain: varchar('transaction_chain').notNull(),
  amount: varchar('amount'),
  createdAt: timestamp('created_at').defaultNow(),
},
(table) => [{
    pk: primaryKey({ columns: [table.id] }),
}])


export const transactions_xdc :any = pgTable('transactionsXDC', {
  id: serial('id').unique(),
  gameId:integer('game_id').references(() => games.id),  // for get track of game transaction has done
  UserId: integer('user_id').references(() => users.id), // for the track of user which is playing the game
  eventId: integer('event_id').references(() => events.id), // for the track of event
  transactionHash: varchar('transaction_hash'),
  transactionChain: varchar('transaction_chain').notNull(),
  amount: varchar('amount'),
  createdAt: timestamp('created_at').defaultNow(),
},
(table) => [{
    pk: primaryKey({ columns: [table.id] }),
},
index("game_id").on(table.gameId),
index("user_id").on(table.UserId),
])


export const usersRelations = relations(users, ({ many }) => ({
  games: many(games),
  userTransaction: many(transactions, { relationName: 'userTransaction' }),
  userTransactionXDC: many(transactions_xdc, { relationName: 'userTransactionXDC' }),
}));


export const gamesRelations = relations(games, ({ one ,many }) => ({
  creator: one(users, {
    fields: [games.creatorId],
    references: [users.id],
  }),  
  events: many(events),
  transactions: many(transactions),
  transactions_XDC:many(transactions_xdc)
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  game: one(games, {
    fields: [events.gameId],
    references: [games.id],
  }),
  transactions: many(transactions),
  transactions_XDC:many(transactions_xdc)
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.UserId],
    references: [users.id],
    relationName:'userTransaction'
  }),
  event: one(events, {
    fields: [transactions.eventId], 
    references: [events.id],
  }),
  game: one(games, {
    fields: [transactions.gameId],
    references: [games.id],
  }),
}));

export const transactionsXDCRelations = relations(transactions_xdc, ({ one }) => ({
  user: one(users, {
    fields: [transactions_xdc.UserId],
    references: [users.id],
    relationName:'userTransactionXDC'
  }),
  event: one(events, {
    fields: [transactions_xdc.eventId], 
    references: [events.id],
  }),
  game: one(games, {
    fields: [transactions_xdc.gameId],
    references: [games.id],
  }),
}));


