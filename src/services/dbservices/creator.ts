import {and, count, countDistinct, desc, eq, inArray, isNull, sql} from "drizzle-orm";
import postgreDb from "../../config/db";
import { generateAuthTokens } from "../../config/token";
import { events, games, transactions, userGames, users, creatorRequests } from "../../models/schema";
import { generateGameToken } from "../../config/gameToken";
import dotenv from "dotenv";
dotenv.config();

export default class Creator {

    static generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();

    static checkGameExists = async(userId:any , gameID:any):Promise<any>=>{
        try {
          return await postgreDb.select({
            gameId:games.gameId
           }).from(games).where(
            and(
              eq(games.createrId, userId),
              eq(games.id, gameID)
            )
          )
        } catch (error:any) {
          throw new Error(error.message);
          
        }
      }


      static checkevent = async(gameId :any, eventtype:any):Promise<any> =>{
        try{
            return await postgreDb.select({
            eventId:events.eventId
           }).from(events).where(
            and(
              eq(events.gameId, gameId),
              eq(events.eventType, eventtype)
            )
          )
          
        }catch(error:any){
          throw new Error(error)
        }
      }

      static createEvent = async(gameId:any ,eventType:any):Promise<any> =>{
        try {
           return postgreDb.insert(events).values({
            gameId: gameId,
            eventId: `event_${this.generateId()}`, // Generate unique eventId
            eventType: eventType,
           }).returning({
              eventId: events.eventId
           })
        } catch (error) {
           throw new Error(error)
        }
      }

      static updateGameToken = async(gameId:any): Promise<any> => {
        try {
          const gameToken = generateGameToken(gameId);
          const updatedGame = await postgreDb.update(games).set({ gameToken:gameToken }).where(eq(games.id, gameId)).returning({
            gameToken:games.gameToken
        });
          return updatedGame[0];
        } catch (error) {
          throw new Error(error.message);
        }
      }
}