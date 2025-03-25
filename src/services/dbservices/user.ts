import {and, count, countDistinct, desc, eq, inArray, isNull, sql} from "drizzle-orm";
import postgreDb from "../../config/db";
import dotenv from "dotenv";
import { events, games, transactions, users } from "../../models/schema";
dotenv.config();

export default class User {

    static getGames = async():Promise<any>=>{
        try {
            return await postgreDb.select().from(games)
        } catch (error) {
            throw new Error(error.message)
        }
    }

    static getEvents = async():Promise<any>=>{
        try {
            return await postgreDb.query.events.findMany({
                columns:{
                    eventId:true,
                    eventType:true,
                },
                with:{
                    game:{
                        columns:{
                            gameId:true,
                            Gamename:true,
                            Gametype:true,
                            description:true,
                        }
                    }
                }
            })
        } catch (error) {
            throw new Error(error.message)
        }
    }

    static getGameid = async(eventId:string):Promise<any>=>{
        try {
            const data = await postgreDb.select({gameId:events.gameId,
                id:events.id
            }).from(events).where(eq(events.eventId,eventId))
            return data[0]
        } catch (error) {
            throw new Error(error.message)
        }
    }

    static getGameDetails = async(gameId: any):Promise<any>=>{
        try {
            const data = await postgreDb.select().from(games).where(eq(games.id, gameId))
            return data[0]
        } catch (error) {
            throw new Error(error.message)
        }
    }

    static userExits = async(deviceDta: any): Promise<any> => {
        try {
            const result = await postgreDb.select({
                id:users.id,
                userId:users.userId,
                role:users.role,
                saAddress:users.saAddress,
                walletAddress:users.walletAddress
            })
            .from(users)
            .where(eq(users.devicedata, deviceDta));
            return result[0]

        } catch (error) {
           throw new Error
        }
    }

    static saveUser = async(userId: any, devicedata: any, saAddress: any, wallet_address: any): Promise<any> => {
        try {
            console.log(userId, devicedata, saAddress, wallet_address ,"created save")
            const result =  await postgreDb.insert(users).values({
                userId: userId,
                devicedata: devicedata,
                walletAddress:wallet_address,
                saAddress:saAddress,
            }).returning({
                id:users.id,
                userId:users.userId,
                role:users.role,
                saAddress:users.saAddress,
                walletAddress:users.walletAddress
            })
            return result[0];
            } catch (error) {
           throw new Error
        }
    }

    static eventCheck = async(gameId: any, eventId: any): Promise<any> => {
        try {
            const result = await postgreDb.select()
           .from(events)
           .where(and(eq(events.gameId, gameId), eq(events.eventId, eventId)));
            return result[0]
        } catch (error) {
           throw new Error
        }
    }

    static saveTransactionDetails= async(
        gameId: any,
        userId: any,
        eventId: any,
        transactionHash: any,
        transaction_chain:any,
        amount,
    ):Promise<any>=>{
        try {
            console.log(userId ,gameId ,eventId ,transactionHash,transaction_chain ,amount)
            const result =  await postgreDb.insert(transactions).values({
                gameId: gameId,
                UserId: userId,
                eventId: eventId,
                transactionHash: transactionHash,
                transactionChain: transaction_chain,
                amount: amount,
            }).returning({
                id: transactions.id,
                gameId: transactions.gameId,
                userId: transactions.UserId,
                eventId: transactions.eventId,
                transactionHash: transactions.transactionHash,
                transaction_chain: transactions.transactionChain,
                amount: transactions.amount,
            })
            console.log(result[0] ,"ressssssulttttt")
            return result[0];
        } catch (error) {
           throw new Error
        }
    }
}