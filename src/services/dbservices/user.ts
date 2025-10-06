import {
  and,
  between,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import postgreDb, { postgreDbRead } from "../../config/db";
import dotenv from "dotenv";
import {
  events,
  games,
  transaction_avax,
  transactions,
  transactions_xdc,
  users,
} from "../../models/schema";
dotenv.config();

export default class User {
  // static getGames = async():Promise<any>=>{
  //     try {
  //         return await postgreDb.select({
  //             id:games.id,
  //             gameId:games.gameId,
  //             Gamename:games.Gamename,
  //             Gametype: games.Gametype,
  //             description: games.description,
  //             createdAt: games.createdAt,
  //             transactionCount: sql<number>`count(distinct ${transactions_xdc.id})`.as('transaction_count'),
  //             usersPlayed: sql<number>`count(distinct ${transactions_xdc.UserId})`.as('users_played')
  //         })
  //         .from(games)
  //         .leftJoin(transactions_xdc, eq(transactions_xdc.gameId, games.id))
  //         .groupBy(games.id, games.gameId, games.Gamename, games.Gametype, games.description, games.createdAt)
  //         .orderBy(games.id);
  //     } catch (error) {
  //         throw new Error(error.message)
  //     }
  // }

  static getGames = async (): Promise<any> => {
    try {
      const txAgg = postgreDbRead
        .select({
          gameId: transaction_avax.gameId,
          transaction_count:
            sql<number>`count(distinct ${transaction_avax.id})`.as(
              "transaction_count"
            ),
            users_played: sql<number>`count(distinct ${transactions_xdc.UserId})`.as('users_played'),
            current_month_transactions: sql<number>`
            count(distinct case 
              when date_trunc('month', ${transactions_xdc.createdAt}) = date_trunc('month', now()) 
              then ${transactions_xdc.id} 
            end)
          `.as('current_month_transactions')
        })
        .from(transaction_avax)
        .groupBy(transaction_avax.gameId)
        .as("txAgg");

      return await postgreDbRead
        .select({
          id: games.id,
          gameId: games.gameId,
          Gamename: games.Gamename,
          Gametype: games.Gametype,
          description: games.description,
          createdAt: games.createdAt,
          transactionCount: sql<number>`coalesce(${txAgg.transaction_count}, 0)`,
          usersPlayed: sql<number>`coalesce(${txAgg.users_played}, 0)`,
          currentMonthTransactionCount: sql<number>`coalesce(${txAgg.current_month_transactions}, 0)`
        })
        .from(games)
        .leftJoin(txAgg, eq(games.id, txAgg.gameId))
        .orderBy(games.id);
    } catch (error) {
      throw new Error(error.message);
    }
  };

  // static counts = async():Promise<any>=>{
  //     try {
  //         return await postgreDb.transaction(async (tx) => {
  //             const uniqueUsers = await postgreDb
  //             .select({
  //               count: sql`count(distinct ${users.id})`,
  //             })
  //             .from(users)
  //             .where(sql`${users.devicedata}->>'OS' LIKE '%XDC'`);

  //             const uniqueGames = await tx
  //               .select({
  //                 count: sql`count(distinct ${games.id})`,
  //               })
  //               .from(games);

  //             const uniqueEvents = await tx
  //               .select({
  //                 count: sql`count(distinct ${events.id})`,
  //               })
  //               .from(events);

  //               const uniqueTransactions = await tx
  //               .select({
  //                 count: sql`count(distinct ${transactions.id})`,
  //               })
  //               .from(transactions_xdc);

  //               return {
  //                 users: Number(uniqueUsers[0].count),
  //                 games: Number(uniqueGames[0].count),
  //                 events: Number(uniqueEvents[0].count),
  //                 transactions: Number(uniqueTransactions[0].count),
  //               }
  //             })

  //     } catch (error) {
  //         throw new Error(error.message)
  //     }
  // }

  static counts = async (): Promise<any> => {
    try {
      // console.log("Counting users, games, events, and transactions...");
      const [uniqueUsers,gamesEventsTx] = await Promise.all([
        postgreDbRead
          .select({
            count: sql`count(distinct ${users.id})`,
          })
          .from(users)
          //   .where(sql`LOWER(${users.devicedata}->>'OS') LIKE '%xdc'`),
          .where(eq(users.chain, "Avalanche")),

        postgreDb.transaction(async (tx) => {
          const [game, event, transactions] = await Promise.all([
            tx.select({ count: sql`count(*)` }).from(games),
            tx.select({ count: sql`count(*)` }).from(events),
            tx.select({ count: sql`count(*)` }).from(transaction_avax),
          ]);
          return { game, event, transactions };
        }),
      ]);

      // console.log(uniqueUsers, gamesEventsTx, "counts");
        return {
          users: Number(uniqueUsers[0].count),
          games: Number(gamesEventsTx.game[0].count),
          events: Number(gamesEventsTx.event[0].count),
          transactions: Number(gamesEventsTx.transactions[0].count),
        };
    } catch (error) {
      throw new Error(error.message);
    }
  };

  static getEvents = async (): Promise<any> => {
    try {
      return await postgreDbRead.query.events.findMany({
        columns: {
          eventId: true,
          eventType: true,
          eventdescription: true,
        },
        with: {
          game: {
            columns: {
              gameId: true,
              Gamename: true,
              Gametype: true,
              description: true,
            },
          },
        },
      });
    } catch (error) {
      throw new Error(error.message);
    }
  };

  static getGameid = async (eventId: string): Promise<any> => {
    try {
      const data = await postgreDbRead
        .select()
        .from(events)
        .where(eq(events.eventId, eventId));
      if (!data.length) throw new Error("No event found");
      return data[0];
    } catch (error) {
      throw new Error(error.message);
    }
  };

  static getTransactions = async (): Promise<any> => {
    try {
      const transaction = await postgreDbRead.query.transactions.findMany({
        columns: {
          transactionHash: true,
          transactionChain: true,
        },
        with: {
          user: {
            columns: {
              userId: true,
              walletAddress: true,
              saAddress: true,
            },
          },
          game: {
            columns: {
              gameId: true,
              Gamename: true,
              Gametype: true,
              description: true,
            },
          },
          event: {
            columns: {
              eventId: true,
              eventType: true,
              eventdescription: true,
            },
          },
        },
      });

      const counts = await postgreDbRead
        .select({
          count: count(transactions.id),
        })
        .from(transactions);

      return { transactions: transaction, counts: counts };
    } catch (error) {
      throw new Error(error.message);
    }
  };

  static getUserTransacttion = async (userId: any): Promise<any> => {
    try {
      const transaction = await postgreDbRead.query.users.findMany({
        where: eq(userId, users.userId),
        columns: {
          id: true,
        },
        with: {
          userTransaction: {
            columns: {
              transactionHash: true,
              transactionChain: true,
              amount: true,
              createdAt: true,
            },
          },
        },
      });
      return transaction;
    } catch (error) {
      throw new Error(error.message);
    }
  };

  static geteventTransacttion = async (eventId: any): Promise<any> => {
    try {
      const transaction = await postgreDbRead.query.events.findMany({
        where: eq(eventId, events.eventId),
        columns: {
          id: true,
        },
        with: {
          transactions: {
            columns: {
              transactionHash: true,
              transactionChain: true,
              amount: true,
              createdAt: true,
            },
          },
        },
      });
      return transaction;
    } catch (error) {
      throw new Error(error.message);
    }
  };

  static getGameTransacttion = async (gameId: any): Promise<any> => {
    try {
      const transaction = await postgreDbRead.query.games.findMany({
        where: eq(gameId, games.gameId),
        columns: {
          id: true,
        },
        with: {
          transactions: {
            columns: {
              transactionHash: true,
              transactionChain: true,
              amount: true,
              createdAt: true,
            },
          },
        },
      });
      return transaction;
    } catch (error) {
      throw new Error(error.message);
    }
  };

  // static getGameDetails = async(gameId: any):Promise<any>=>{
  //     try {
  //         const data = await postgreDb.select({
  //             Gamename:games.Gamename,
  //             Gametype:games.Gametype,
  //             description:games.description,
  //             creatorId:games.creatorId
  //         }).from(games).where(eq(games.id, gameId))
  //         return data[0]
  //     } catch (error) {
  //         throw new Error(error.message)
  //     }
  // }

  static getGameDetails = async (gameId: any, eventId: any): Promise<any> => {
    try {
      const data = await postgreDbRead.query.games.findFirst({
        where: eq(games.id, gameId),
        columns: {
          id: true,
          Gamename: true,
          gameId: true,
          Gametype: true,
          description: true,
          creatorId: true,
        },
        with: {
          events: {
            where: eq(events.eventId, eventId),
            columns: {
              id: true,
              eventId: true,
              eventType: true,
              eventdescription: true,
            },
          },
        },
      });
      return data;
    } catch (error) {
      throw new Error(error);
    }
  };

  static userExits = async (deviceDta: any): Promise<any> => {
    try {
      const result = await postgreDbRead
        .select({
          id: users.id,
          userId: users.userId,
          role: users.role,
          saAddress: users.saAddress,
          walletAddress: users.walletAddress,
        })
        .from(users)
        .where(eq(users.devicedata, deviceDta));
      return result[0];
    } catch (error) {
      throw new Error();
    }
  };

  static saveUser = async (
    userId: any,
    devicedata: any,
    saAddress: any,
    wallet_address: any
  ): Promise<any> => {
    try {
      // console.log(
      //   userId,
      //   devicedata,
      //   saAddress,
      //   wallet_address,
      //   "in dbservicesss"
      // );
      const result = await postgreDb
        .insert(users)
        .values({
          userId: userId,
          devicedata: devicedata,
          chain: "Avalanche",
          walletAddress: wallet_address,
          saAddress: saAddress,
        })
        .returning({
          id: users.id,
          userId: users.userId,
          role: users.role,
          saAddress: users.saAddress,
          walletAddress: users.walletAddress,
        });
      // console.log(result[0] ,"resuktttt")
      return result[0];
    } catch (error) {
      throw new Error();
    }
  };

  static updateUserSaAddress = async (userId: string, saAddress: string): Promise<any> => {
    try {
      const result = await postgreDb
        .update(users)
        .set({ saAddress })
        .where(eq(users.userId, userId))
        .returning({
          id: users.id,
          userId: users.userId,
          saAddress: users.saAddress,
        });
      return result[0];
    } catch (error) {
      throw new Error("Failed to update user saAddress");
    }
  };

  static eventCheck = async (gameId: any, eventId: any): Promise<any> => {
    try {
      const result = await postgreDb
        .select()
        .from(events)
        .where(and(eq(events.gameId, gameId), eq(events.eventId, eventId)));
      return result[0];
    } catch (error) {
      throw new Error();
    }
  };

  static saveTransactionDetails = async (
    gameId: any,
    userId: any,
    eventId: any,
    transactionHash: any,
    transaction_chain: any,
    amount
  ): Promise<any> => {
    try {
      // console.log(userId ,gameId ,eventId ,transactionHash,transaction_chain ,amount)
      const result = await postgreDb
        .insert(transactions)
        .values({
          gameId: gameId,
          UserId: userId,
          eventId: eventId,
          transactionHash: transactionHash,
          transactionChain: transaction_chain,
          amount: amount,
        })
        .returning({
          id: transactions.id,
          gameId: transactions.gameId,
          userId: transactions.UserId,
          eventId: transactions.eventId,
          transactionHash: transactions.transactionHash,
          transaction_chain: transactions.transactionChain,
          amount: transactions.amount,
          time: transactions.createdAt,
        });
      return result[0];
    } catch (error) {
      throw new Error();
    }
  };

  static saveTransactionDetails_XDC = async (
    gameId: any,
    userId: any,
    eventId: any,
    transactionHash: any,
    transaction_chain: any,
    amount
  ): Promise<any> => {
    try {
      // console.log(userId ,gameId ,eventId ,transactionHash,transaction_chain ,amount)
      const result = await postgreDb
        .insert(transactions_xdc)
        .values({
          gameId: gameId,
          UserId: userId,
          eventId: eventId,
          transactionHash: transactionHash,
          transactionChain: transaction_chain,
          amount: amount,
        })
        .returning({
          id: transactions.id,
          gameId: transactions.gameId,
          userId: transactions.UserId,
          eventId: transactions.eventId,
          transactionHash: transactions.transactionHash,
          transaction_chain: transactions.transactionChain,
          amount: transactions.amount,
          time: transactions.createdAt,
        });
      return result[0];
    } catch (error) {
      throw new Error();
    }
  };

  static saveTransactionDetails_Avax = async (
    gameId: any,
    userId: any,
    eventId: any,
    transactionHash: any,
    transaction_chain: any,
    amount
  ): Promise<any> => {
    try {
      // console.log(userId ,gameId ,eventId ,transactionHash,transaction_chain ,amount)
      const result: any = await postgreDb
        .insert(transaction_avax)
        .values({
          gameId: gameId,
          UserId: userId,
          eventId: eventId,
          transactionHash: transactionHash,
          transactionChain: transaction_chain,
          amount: amount,
        })
        .returning({
          id: transactions.id,
          gameId: transactions.gameId,
          userId: transactions.UserId,
          eventId: transactions.eventId,
          transactionHash: transactions.transactionHash,
          transaction_chain: transactions.transactionChain,
          amount: transactions.amount,
          time: transactions.createdAt,
        });
      return result[0];
    } catch (error) {
      throw new Error();
    }
  };

  static perDayTransactions = async (
    startTime: any,
    endTime: any
  ): Promise<any> => {
    try {
      const result = await postgreDbRead
        .select({
          TransactionHashCount:
            sql<number>`count(DISTINCT ${transactions.transactionHash})`.mapWith(
              Number
            ),
          count: sql<number>`count(*)::int`,
        })
        .from(transactions)
        .where(
          between(
            transactions.createdAt,
            new Date(startTime), // April 9 2AM IST in UTC (2AM - 5:30)
            new Date(endTime) // April 10 10AM IST in UTC (10AM - 5:30)
          )
        );
      // console.log("..........");

      return result;
    } catch (error) {
      throw new Error();
    }
  };
}
