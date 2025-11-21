import {and, count, countDistinct, desc, eq, gte, inArray, isNull, lte, sql} from "drizzle-orm";
import postgreDb from "../../config/db";
import dotenv from "dotenv";
import { events, games, users, transactions_xdc } from "../../models/schema"; // <-- import your table here
dotenv.config();

export default class TransactionsXDC {

    // Get daily transaction counts (oldest to newest)
    static getDailyTransactionCounts = async (days: number = 90): Promise<any> => {
        try {
            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - days);

            const result = await postgreDb
                .select({
                    day: sql`DATE(${transactions_xdc.createdAt})`.as("day"),
                    total_transactions: sql`COUNT(*)`.as("total_transactions"),
                })
                .from(transactions_xdc) // <-- use the table object, not a string
                .where(gte(transactions_xdc.createdAt, daysAgo))
                .groupBy(sql`DATE(${transactions_xdc.createdAt})`)
                .orderBy(sql`DATE(${transactions_xdc.createdAt}) ASC`);
            return {
                count: result.length,
                data: result,
            };
        } catch (error) {
            throw new Error(error.message || "Failed to fetch daily transaction counts");
        }
    };

    // Get daily active users (unique users per day, oldest to newest)
    static getDailyActiveUsers = async (days: number = 90): Promise<any> => {
        try {
            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - days);

            const result = await postgreDb
                .select({
                    day: sql`DATE(${transactions_xdc.createdAt})`.as("day"),
                    daily_active_users: sql`COUNT(DISTINCT ${transactions_xdc.UserId})`.as("daily_active_users"),
                })
                .from(transactions_xdc) // <-- use the table object, not a string
                .where(gte(transactions_xdc.createdAt, daysAgo))
                .groupBy(sql`DATE(${transactions_xdc.createdAt})`)
                .orderBy(sql`DATE(${transactions_xdc.createdAt}) ASC`);
            return {
                count: result.length,
                data: result,
            };
        } catch (error) {
            throw new Error(error.message || "Failed to fetch daily active users");
        }
    };

    // Get unique users from previous month
    static getMonthlyActiveUsers = async (): Promise<number> => {
        try {
            const now = new Date();
            // const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            // const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

            // // Previous month
            // const prevResult = await postgreDb
            //     .select({
            //         count: sql<number>`COUNT(DISTINCT ${transactions_xdc.UserId})`
            //     })
            //     .from(transactions_xdc)
            //     .where(
            //         and(
            //             gte(transactions_xdc.createdAt, firstDayPrevMonth),
            //             lte(transactions_xdc.createdAt, lastDayPrevMonth)
            //         )
            //     );
            // const prevCount = Number(prevResult[0]?.count ?? 0);

            // if (prevCount > 0) {
            //     return prevCount;
            // }

            // If no data for previous month, get current month
            const firstDayCurrMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const currResult = await postgreDb
                .select({
                    count: sql<number>`COUNT(DISTINCT ${transactions_xdc.UserId})`
                })
                .from(transactions_xdc)
                .where(
                    and(
                        gte(transactions_xdc.createdAt, firstDayCurrMonth),
                        lte(transactions_xdc.createdAt, now)
                    )
                );
            return Number(currResult[0]?.count ?? 0);
        } catch (error) {
            throw new Error(error.message || "Failed to fetch monthly active users");
        }
    };

    static getMonthlyActiveUsersSeries = async (months: number = 4): Promise<any[]> => {
        try {
            const now = new Date();
            const startMonth = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

            return await postgreDb
                .select({
                    month: sql<string>`to_char(date_trunc('month', ${transactions_xdc.createdAt}), 'YYYY-MM')`.as("month"),
                    active_users: sql<number>`COUNT(DISTINCT ${transactions_xdc.UserId})`.as("active_users"),
                })
                .from(transactions_xdc)
                .where(gte(transactions_xdc.createdAt, startMonth))
                .groupBy(sql`date_trunc('month', ${transactions_xdc.createdAt})`)
                .orderBy(sql`date_trunc('month', ${transactions_xdc.createdAt}) DESC`);
        } catch (error) {
            throw new Error(error.message || "Failed to fetch monthly active users series");
        }
    };

    // Get all transactions from previous month
    static getMonthlyTransactions = async (): Promise<number> => {
        try {
            const now = new Date();
            // const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            // const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

            // // Previous month
            // const prevResult = await postgreDb
            //     .select({
            //         count: sql<number>`COUNT(*)`
            //     })
            //     .from(transactions_xdc)
            //     .where(
            //         and(
            //             gte(transactions_xdc.createdAt, firstDayPrevMonth),
            //             lte(transactions_xdc.createdAt, lastDayPrevMonth)
            //         )
            //     );
            // const prevCount = Number(prevResult[0]?.count ?? 0);

            // if (prevCount > 0) {
            //     return prevCount;
            // }

            // If no data for previous month, get current month
            const firstDayCurrMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const currResult = await postgreDb
                .select({
                    count: sql<number>`COUNT(*)`
                })
                .from(transactions_xdc)
                .where(
                    and(
                        gte(transactions_xdc.createdAt, firstDayCurrMonth),
                        lte(transactions_xdc.createdAt, now)
                    )
                );
            return Number(currResult[0]?.count ?? 0);
        } catch (error) {
            throw new Error(error.message || "Failed to fetch monthly transactions count");
        }
    };
}