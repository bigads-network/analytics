import {and, count, countDistinct, desc, eq, inArray, isNull, sql} from "drizzle-orm";
import postgreDb from "../../config/db";
import { generateAuthTokens } from "../../config/token";
import { events, games, transactions, userGames, users, creatorRequests } from "../../models/schema";
import { generateGameToken } from "../../config/gameToken";
import dotenv from "dotenv";
import e from "express";
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

        static userExists:any = async(maAddress:any):Promise<any>=>{
          try{
            const result = await postgreDb.select().from(users).where(eq(users.maAddress,maAddress))
              return result[0]
          }catch(error:any){
              throw new Error(error)
          }
          }

          static gameExists = async (userId: number, name: string, type: string): Promise<any> => {
            try {
              // console.log("Game exists in db service", userId, name, type);
          
              // Start a transaction
              const result = await postgreDb.transaction(async (trx) => {
                // Step 1: Check if the game exists
                const gameResult: any = await trx
                  .select({
                    id: games.id,
                    createrId: games.createrId,
                    gameId: games.gameId,
                    name: games.name,
                    type: games.type,
                    gameSaAddress: games.gameSaAddress,
                    description: games.description,
                    isApproved: games.isApproved
                  })
                  .from(games)
                  .where(
                    and(eq(games.createrId, userId), eq(games.name, name), eq(games.type, type))
                  )
          
                if (!gameResult || gameResult.length === 0) {
                  return null
                }
          
                // Step 2: Retrieve related events
                const gameId = gameResult[0].id; // Assuming `id` is the primary key of the `games` table
                const getEvents = await trx
                  .select({
                    gameId: events.gameId,
                    eventId: events.eventId,
                    eventType: events.eventType,
                  })
                  .from(events)
                  .where(eq(events.gameId, gameId));
          
                // Step 3: Generate a game token
                const gameToken = await generateGameToken(gameId);
          
                // Return all results
                return {
                  game: gameResult[0],
                  events: getEvents,
                  gameToken: gameToken,
                };
              });
          
              return result;
            } catch (error: any) {
              throw new Error(error.message || "Error occurred in transaction");
            }
          };

          static gameExistsByGameId = async (gameId: string, id: number): Promise<any> => {
            try {
              const game = await postgreDb.query.games.findFirst({
                where: and(eq(games.gameId, gameId), eq(games.createrId, id)),
                columns: {
                  id: true,
                  gameId: true,
                  createrId: true,
                },
              });
              return game || null;
            } catch (error: any) {
              throw new Error(`Error checking game existence: ${error.message}`);
            }
          };
      
          static deleteGameAndRelatedData = async (gameId: string, userId: number, userRole: string): Promise<any> => {
            try {
              return await postgreDb.transaction(async (trx) => {
                const game = await trx.query.games.findFirst({
                  where: eq(games.gameId, gameId),
                  columns: {
                    id: true,
                    createrId: true,
                  },
                });
        
                if (!game) {
                  throw new Error("Game not found");
                }
        
                if (userRole !== "admin" && userRole !== "creator") {
                  throw new Error("Unauthorized: Only creators or admins can delete games");
                }
        
                if (userRole === "creator" && game.createrId !== userId) {
                  throw new Error("Unauthorized: You can only delete your own games");
                }
        
                await trx.delete(transactions)
                  .where(eq(transactions.fromGameId, game.id));
        
                await trx.delete(events)
                  .where(eq(events.gameId, game.id));
        
                await trx.delete(userGames)
                  .where(eq(userGames.gameId, game.id));
        
                const deletedGame = await trx.delete(games)
                  .where(eq(games.gameId, gameId))
                  .returning();
        
                return {
                  deletedGame: deletedGame[0],
                };
              });
            } catch (error: any) {
              throw new Error(`Error deleting game and related data: ${error.message}`);
            }
          };

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

        static registerGame =async (userId: any ,gameId:any ,gameData: { name: string, type: string,description: string, events: { eventType: string }[]  }, saAddress:any) => {
          // console.log(userId,gameId,gameData ,saAddress)
          const { name, type, description, events: eventList } = gameData;
          try {
            const [newGame] = await postgreDb.insert(games).values({
              createrId:userId,
              gameId,
              name,
              type,
              gameSaAddress:saAddress,
              description,
              isApproved:true
            }).returning();
        
            if (!newGame) throw new Error('Game registration failed.');
        
            const Gametoken= await generateGameToken(newGame.id)
      
            // console.log(newGame.id ,"Game registratioz")
      
            const newEvents = eventList.map(event => ({
              gameId: newGame.id,
              eventId: `event_${this.generateId()}`, // Generate unique eventId
              eventType: event.eventType,
            }));
        
            await postgreDb.insert(events).values(newEvents);
      
             const updatedgame=await postgreDb.update(games).set({
              gameToken: Gametoken
            }).where(eq(games.id ,newGame.id)).returning({
              id: games.id,
              createrId: games.createrId,
              gameId: games.gameId,
              name: games.name,
              type: games.type,
              gameSaAddress: games.gameSaAddress,
              description: games.description,
              isApproved: games.isApproved
            })
        
            return { game: updatedgame[0], events: newEvents ,Gametoken:Gametoken };
          } catch (error) {
            throw new Error(`Error registering game: ${error.message}`);
          }
        };
      
}