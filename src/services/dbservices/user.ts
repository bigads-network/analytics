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
                    eventdescription:true
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
            const data = await postgreDb.select().from(events).where(eq(events.eventId,eventId))
            return data[0]
        } catch (error) {
            throw new Error(error.message)
        }
    }

    static getTransactions = async():Promise<any>=>{
        try {
            const transaction = await postgreDb.query.transactions.findMany({
                columns: {
                transactionHash: true,
                transactionChain: true,
                },
                with:{
                    user:{
                        columns:{
                            userId:true,
                            walletAddress:true,
                            saAddress:true,
                        }
                    },
                    game:{
                        columns:{
                            gameId:true,
                            Gamename:true,
                            Gametype:true,
                            description:true,
                        }
                    },
                    event:{
                        columns:{
                            eventId:true,
                            eventType:true,
                            eventdescription:true,
                        }
                    }
                }
        })

        const counts =await postgreDb
        .select({
        count: count(transactions.id),
        })
        .from(transactions);

        return { transactions: transaction , counts: counts}
        } catch (error) {
            throw new Error(error.message)
        }
    }


    static getUserTransacttion = async(userId:any): Promise<any> => {
        try {
            const transaction = await postgreDb.query.users.findMany({
              where : eq(userId, users.userId),
              columns: {
                id:true,
              },
              with:{
                userTransaction:{
                    columns:{
                        transactionHash:true,
                        transactionChain:true,
                        amount:true,
                        createdAt:true,
                    }
                }
              }
            })
            return transaction
        } catch (error) {
            throw new Error(error.message)

        }
    }

    //getGameTransacttion
    
    static getGameTransacttion = async(gameId:any): Promise<any> => {
        try {
            const transaction = await postgreDb.query.games.findMany({
              where : eq(gameId, games.gameId),
              columns: {
                id:true,
              },
              with:{
                transactions:{
                    columns:{
                        transactionHash:true,
                        transactionChain:true,
                        amount:true,
                        createdAt:true,
                    }
                }
              }
            })
            return transaction
        } catch (error) {
            throw new Error(error.message)

        }
    }

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

     static getGameDetails = async(gameId: any , eventId: any): Promise<any>=>{
        try {
            const data = await postgreDb.query.games.findFirst({
                where: eq(games.id, gameId),
                columns:{
                    id:true,
                    Gamename:true,
                    gameId: true,
                    Gametype:true,
                    description:true,
                    creatorId:true,
                },
                with:{
                    events:{
                        where:eq(events.eventId, eventId),
                        columns:{
                            id:true,
                            eventId:true,
                            eventType:true,
                            eventdescription:true
                        }
                    }
                    
                }
            })
            return data
        } catch (error) {
            throw new Error(error)
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
            // console.log(userId ,gameId ,eventId ,transactionHash,transaction_chain ,amount)
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
            // console.log(result[0] ,"ressssssulttttt")
            return result[0];
        } catch (error) {
           throw new Error
        }
    }
}