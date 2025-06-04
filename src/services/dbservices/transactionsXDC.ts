import {and, count, countDistinct, desc, eq, inArray, isNull, sql} from "drizzle-orm";
import postgreDb from "../../config/db";
import dotenv from "dotenv";
import { events, games, users, transactions_xdc } from "../../models/schema"; // <-- import your table here
dotenv.config();

export default class TransactionsXDC {

    // Get daily transaction counts (oldest to newest)
    static getDailyTransactionCounts = async (): Promise<any> => {
        try {
            const result = await postgreDb
                .select({
                    day: sql`DATE(${transactions_xdc.createdAt})`.as("day"),
                    total_transactions: sql`COUNT(*)`.as("total_transactions"),
                })
                .from(transactions_xdc) // <-- use the table object, not a string
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
    static getDailyActiveUsers = async (): Promise<any> => {
        try {
            const result = await postgreDb
                .select({
                    day: sql`DATE(${transactions_xdc.createdAt})`.as("day"),
                    daily_active_users: sql`COUNT(DISTINCT ${transactions_xdc.UserId})`.as("daily_active_users"),
                })
                .from(transactions_xdc) // <-- use the table object, not a string
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
}