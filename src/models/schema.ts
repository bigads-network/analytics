import { relations } from 'drizzle-orm';
import { serial,varchar,primaryKey, jsonb, pgTable, timestamp, boolean, integer } from 'drizzle-orm/pg-core';



export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id').unique(),
  appId: varchar('app_id'),
  deviceId: varchar('device_id'),
  role: varchar('role').default('user'),
  saAddress: varchar('sa_address'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const games = pgTable('games', {
  id: serial('id').primaryKey(),
  createrId: integer('creater_id').references(()=>users.id),
  gameId: varchar('game_id').unique(),
  gameToken: varchar('game_token').unique(),
  gameSaAddress:varchar('game_sa_address').unique(),
  name: varchar('name'),
  type: varchar('type'),
  description: varchar('description'),
  isApproved: boolean('isApproved').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});


export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  eventId: varchar('event_id').unique(),
  gameId: integer('game_id').references(() => games.id),
  eventType: varchar('event_type'),
  createdAt: timestamp('created_at').defaultNow(),
});


export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  fromGameId:integer('game_id').references(() => games.id),  // for get track of game transaction has done
  GameCreator : integer('from_user').references(() => users.id), // for the track of user which is creator of the game
  toUser: integer('to_user').references(() => users.id), // for the track of user which is playing the game
  eventId: integer('event_id').references(() => events.id), // for the track of event
  transactionHash: varchar('transaction_hash').unique(),
  transactionChain: varchar('transaction_chain'),
  amount: varchar('amount'),
  from: varchar('from'),    //Game saAddress  has to save
  to: varchar('to'),// user Account address has to svw which is playiing the game
  createdAt: timestamp('created_at').defaultNow(),
});

export const userGames = pgTable('user_games', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  gameId: integer('event_id').references(() => games.id),
  createdAt: timestamp('created_at').defaultNow(),
});


export const usersRelations = relations(users, ({ many }) => ({
  usersToEvents: many(userGames),
  games:many(games),
  userTransaction: many(transactions,{relationName:'userTransaction'}),
  CreatorTransaction: many(transactions,{relationName:'creatorTransaction'})
}));


export const gamesRelations = relations(games, ({ one ,many }) => ({
  creator: one(users, {
    fields: [games.createrId],
    references: [users.id],
  }),  
  events: many(events),
  transactions: many(transactions)
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  game: one(games, {
    fields: [events.gameId],
    references: [games.id],
  }),
  // usersToEvents: many(usersToEvents),
  transactions: many(transactions)
}));

export const userGamesRelation = relations(userGames, ({ one }) => ({
  user: one(users, {
    fields: [userGames.userId],
    references: [users.id],
  }),
  game: one(games, {
    fields: [userGames.gameId],
    references: [games.id],
  })
}));


export const transactionsRelations = relations(transactions, ({ one }) => ({
  toUser: one(users, {
    fields: [transactions.toUser],
    references: [users.id],
    relationName:'userTransaction'
  }),
  fromCreator: one(users,{
    fields:[transactions.GameCreator],
    references: [users.id],
    relationName:'creatorTransaction'
  }),
  event: one(events, {
    fields: [transactions.eventId], 
    references: [events.id],
  }),
  game: one(games, {
    fields: [transactions.fromGameId],
    references: [games.id],
  }),
}));
