import {and, count, countDistinct, desc, eq, inArray, isNull, sql} from "drizzle-orm";
import postgreDb from "../../config/db";
import dotenv from "dotenv";
import { events, games, users } from "../../models/schema";
dotenv.config();

export default class Creator {

    static creatorExits = async(deviceDta: any): Promise<any> => {
        try {
            const result = await postgreDb.select()
            .from(users)
            .where(eq(users.devicedata, deviceDta));
            return result[0]

        } catch (error) {
           throw new Error
        }
    }

    static saveCreator = async(userId: any, devicedata: any, saAddress: any, wallet_address: any): Promise<any> => {
        try {
            console.log(userId, devicedata, saAddress, wallet_address ,"created save")
            const result =  await postgreDb.insert(users).values({
                userId: userId,
                devicedata: devicedata,
                role:"craetor",
                walletAddress:wallet_address,
                saAddress:saAddress,
            }).returning({
                userId:users.userId,
                id:users.id,
                role:users.role,
                saAddress:users.saAddress,
                walletAddress:users.walletAddress
            })
            return result[0];
            } catch (error) {
           throw new Error
        }
    }

    static gameExists = async(craetorId: any , name:any ,type:any): Promise<any> => {
        try {
            const result = await postgreDb.select()
            .from(games)
            .where(and(eq(games.creatorId ,craetorId),eq(games.Gamename,name),eq(games.Gametype , type)));
            return result[0]
        } catch (error) {
           throw new Error
        }
    }

    //registerGame

    static registerGame = async(creatorId: any,gameId:any , gameName: any,gameType:any,description:any , saAddress: any, wallet_address: any): Promise<any> => {
        try {
            const result =  await postgreDb.insert(games).values({
                creatorId: creatorId,
                gameId: gameId,
                Gamename:gameName,
                Gametype:gameType,
                description:description,
                walletAddress:wallet_address,
                gameSaAddress:saAddress,
            }).returning({
                id:games.id,
                creatorId:games.creatorId,
                gameId: games.gameId,
                Gamename: games.Gamename,
                Gametype: games.Gametype,
                description: games.description,
                saAddress:games.gameSaAddress,
                walletAddress:games.walletAddress
            })
            return result[0];
            } catch (error) {
           throw new Error
        }
    }

    //registerEvent

    static eventexists = async(gameid:any ,eventType:any): Promise<any>=>{
        try {
            const result = await postgreDb.select()
           .from(events)
           .where(and(eq(events.gameId, gameid),eq(events.eventType, eventType)))
            return result[0]
        } catch (error) {
           throw new Error
        }
    }

    static registerEvent = async(gameId: any, eventId: any, eventType: any ,eventDescription:any): Promise<any> => {
        try {
            const result =  await postgreDb.insert(events).values({
                gameId: gameId,
                eventId: eventId,
                eventType: eventType,
                eventdescription:eventDescription
            }).returning({
                id: events.id,
                gameId: events.gameId,
                eventId: events.eventId,
                eventType: events.eventType,
                eventdescription: events.eventdescription              
            })
            return result[0];
            } catch (error) {
           throw new Error
        }
    }
}