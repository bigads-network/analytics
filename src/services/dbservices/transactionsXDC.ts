import {
  and,
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
  users,
  transactions_xdc,
  transaction_avax,
} from "../../models/schema"; // <-- import your table here
dotenv.config();

export default class TransactionsXDC {
  // Get daily transaction counts (oldest to newest)
  static getDailyTransactionCounts = async (
    days: number = 90
  ): Promise<any> => {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      const result = await postgreDbRead
        .select({
          day: sql`DATE(${transaction_avax.createdAt})`.as("day"),
          total_transactions: sql`COUNT(*)`.as("total_transactions"),
        })
        .from(transaction_avax) // <-- use the table object, not a string
        .where(
          and(
            gte(transaction_avax.createdAt, daysAgo),
          )
        )
        .groupBy(sql`DATE(${transaction_avax.createdAt})`)
        .orderBy(sql`DATE(${transaction_avax.createdAt}) ASC`);
      return {
        count: result.length,
        data: result,
      };
    } catch (error) {
      console.log(error.message, "getdaily transactions");
      throw new Error(
        error.message || "Failed to fetch daily transaction counts"
      );
    }
  };

  // Get daily active users (unique users per day, oldest to newest)
  static getDailyActiveUsers = async (days: number = 90): Promise<any> => {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      const result = await postgreDbRead
        .select({
          day: sql`DATE(${transaction_avax.createdAt})`.as("day"),
          daily_active_users:
            sql`COUNT(DISTINCT ${transaction_avax.UserId})`.as(
              "daily_active_users"
            ),
        })
        .from(transaction_avax) // <-- use the table object, not a string
        .where(
          and(
            gte(transaction_avax.createdAt, daysAgo),
          )
        )
        .groupBy(sql`DATE(${transaction_avax.createdAt})`)
        .orderBy(sql`DATE(${transaction_avax.createdAt}) ASC`);
      return {
        count: result.length,
        data: result,
      };
    } catch (error) {
      console.log(error.message, "getDailyActiveUsers transactions");
      throw new Error(error.message || "Failed to fetch daily active users");
    }
  };

  // Get unique users from previous month
  static getMonthlyActiveUsers = async (): Promise<number> => {
    try {
      const now = new Date();
      const firstDayPrevMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1
      );
      const lastDayPrevMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
        999
      );

      // Previous month
      const prevResult = await postgreDbRead
        .select({
          count: sql<number>`COUNT(DISTINCT ${transaction_avax.UserId})`,
        })
        .from(transaction_avax)
        .where(
          and(
            gte(transaction_avax.createdAt, firstDayPrevMonth),
            lte(transaction_avax.createdAt, lastDayPrevMonth),
          )
        );
      const prevCount = Number(prevResult[0]?.count ?? 0);

      if (prevCount > 0) {
        return prevCount;
      }

      // If no data for previous month, get current month
      const firstDayCurrMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const currResult = await postgreDbRead
        .select({
          count: sql<number>`COUNT(DISTINCT ${transaction_avax.UserId})`,
        })
        .from(transaction_avax)
        .where(
          and(
            gte(transaction_avax.createdAt, firstDayCurrMonth),
            lte(transaction_avax.createdAt, now)
          )
        );
      return Number(currResult[0]?.count ?? 0);
    } catch (error) {
      console.log(error.message, "getMonthlyActiveUsers transactions");

      throw new Error(error.message || "Failed to fetch monthly active users");
    }
  };

  // Get all transactions from previous month
  static getMonthlyTransactions = async (): Promise<number> => {
    try {
      const now = new Date();
      const firstDayPrevMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1
      );
      const lastDayPrevMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
        999
      );

      // Previous month
      const prevResult = await postgreDbRead
        .select({
          count: sql<number>`COUNT(*)`,
        })
        .from(transaction_avax)
        .where(
          and(
            gte(transaction_avax.createdAt, firstDayPrevMonth),
            lte(transaction_avax.createdAt, lastDayPrevMonth),
          )
        );
      const prevCount = Number(prevResult[0]?.count ?? 0);

      if (prevCount > 0) {
        return prevCount;
      }

      // If no data for previous month, get current month
      const firstDayCurrMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const currResult = await postgreDbRead
        .select({
          count: sql<number>`COUNT(*)`,
        })
        .from(transaction_avax)
        .where(
          and(
            gte(transaction_avax.createdAt, firstDayCurrMonth),
            lte(transaction_avax.createdAt, now)
          )
        );
      return Number(currResult[0]?.count ?? 0);
    } catch (error) {
      console.log(error.message, "getMonthlyTransactions transactions");

      throw new Error(
        error.message || "Failed to fetch monthly transactions count"
      );
    }
  };
}
