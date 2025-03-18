import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import postgreDb from "../../config/db";
import { generateAuthTokens } from "../../config/token";
import {
  events,
  games,
  transactions,
  userGames,
  users,
  creatorRequests,
} from "../../models/schema";
import { generateGameToken } from "../../config/gameToken";
import dotenv from "dotenv";
dotenv.config();

export default class Admin {
  static approveCreatorRequest = async (maAddress: string): Promise<any> => {
    try {
      return await postgreDb.transaction(async (trx) => {
        // Get the creator request details
        const request = await trx.query.creatorRequests.findFirst({
          where: eq(creatorRequests.maAddress, maAddress),
          columns: {
            userId: true,
            status: true,
          },
        });

        if (!request || request.status === "approved") {
          throw new Error("Invalid request or already approved");
        }

        // Update the creator request status
        const updatedRequest = await trx
          .update(creatorRequests)
          .set({
            status: "approved",
            role: "creator",
            updatedAt: new Date(),
          })
          .where(eq(creatorRequests.maAddress, maAddress))
          .returning();
        // Update the user role
        const updatedUser = await trx
          .update(users)
          .set({
            role: "creator",
          })
          .where(eq(users.maAddress, maAddress))
          .returning();

        return {
          request: updatedRequest[0],
          user: updatedUser[0],
        };
      });
    } catch (error: any) {
      throw new Error(`Error approving creator request: ${error.message}`);
    }
  };

  static rejectCreatorRequest = async (maAddress: string): Promise<any> => {
    try {
      const result = await postgreDb
        .update(creatorRequests)
        .set({ status: "rejected" })
        .where(eq(creatorRequests.maAddress, maAddress))
        .returning();
      return result[0];
    } catch (error) {
      throw new Error(`Error rejecting creator request: ${error.message}`);
    }
  };

  static adminUserExists = async (userId: number): Promise<any> => {
    try {
      const result = await postgreDb
        .select()
        .from(users)
        .where(eq(users.id, userId));
      return result[0];
    } catch (error: any) {
      throw new Error(error);
    }
  };

  static getPendingRequests = async (): Promise<any> => {
    try {
      const result = await postgreDb
        .select()
        .from(creatorRequests)
        .where(eq(creatorRequests.status, "pending"))
        .orderBy(desc(creatorRequests.createdAt))
        .limit(10);

      return result;
    } catch (error) {
      throw new Error(`Error fetching pending requests: ${error.message}`);
    }
  };

  static getTransactionDetails = async () => {
    try {
      return await postgreDb.query.transactions.findMany({
        columns: {
          transactionHash: true,
          transactionChain: true,
        },
        extras: {
          createdAt:
            sql`created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'`.as(
              "createdAtIST"
            ),
        },
        with: {
          event: {
            columns: {
              eventType: true,
              eventId: true,
            },
          },
          toUser: {
            columns: {
              userId: true,
            },
          },
          game: {
            columns: {
              name: true,
              type: true,
              gameId: true,
            },
          },
        },
      });
    } catch (error) {
      throw new Error(error);
    }
  };

  static counts = async () => {
    try {
      return await postgreDb.transaction(async (tx) => {
        const uniqueUsers = await tx
          .select({
            count: sql`count(distinct ${users.id})`,
          })
          .from(users);

        const uniqueGames = await tx
          .select({
            count: sql`count(distinct ${games.id})`,
          })
          .from(games);

        const uniqueEvents = await tx
          .select({
            count: sql`count(distinct ${events.id})`,
          })
          .from(events);

        const uniqueTransactions = await tx
          .select({
            count: sql`count(distinct ${transactions.id})`,
            polygonCount: sql`count(distinct case when ${transactions.transactionChain} = 'POLYGON Testnet' then ${transactions.id} end)`,
            DiamanteCount: sql`count(distinct case when ${transactions.transactionChain} = 'DIAMANTE Testnet' then ${transactions.id} end)`,
          })
          .from(transactions);

        return {
          users: Number(uniqueUsers[0].count),
          games: Number(uniqueGames[0].count),
          events: Number(uniqueEvents[0].count),
          transactions: Number(uniqueTransactions[0].count),
          polygon: Number(uniqueTransactions[0].polygonCount),
          diamante: Number(uniqueTransactions[0].DiamanteCount),
        };
      });
    } catch (error) {
      throw new Error(error);
    }
  };

  static games = async (): Promise<any> => {
    try {
      const gamess = await postgreDb.query.games.findMany({
        columns: {
          gameId: true,
          name: true,
          type: true,
          description: true,
          createrId: true,
          gameSaAddress: true,
          createdAt: true,
        },
        with: {
          events: true,
        },
      });
      return gamess;
    } catch (error: any) {
      throw new Error(error);
    }
  };

  static getEvents = async (gameId: any): Promise<any> => {
    try {
      const result = await postgreDb.query.events.findMany({
        where: eq(events.gameId, gameId),
        columns: {
          eventId: true,
        },
      });
      return result;
    } catch (error) {
      throw new Error(`error in getting events ${error.message}`);
    }
  };
}
