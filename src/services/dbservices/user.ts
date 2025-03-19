import {and, count, countDistinct, desc, eq, inArray, isNull, sql} from "drizzle-orm";
import postgreDb from "../../config/db";
import { generateAuthTokens } from "../../config/token";
import { events, games, transactions, userGames, users, creatorRequests } from "../../models/schema";
import { generateGameToken } from "../../config/gameToken";
import dotenv from "dotenv";
dotenv.config();

export default class User {

  static generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();

  static createCreatorRequest = async(id:number, maAddress:string):Promise<any> => {
    try {
      const result = await postgreDb.insert(creatorRequests).values({
        userId:id,
        maAddress,
      }).returning();
      return result[0];
    } catch (error) {
      throw new Error(error);
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

  static saveDetails:any = async(userId:any,appId:any,deviceId:any,saAddress:any,maAddress:any):Promise<any>=>{
    try{
      // console.log("Saving details dbserver details")
        const result =  await postgreDb.insert(users).values({
            userId:userId,
            appId:appId,
            deviceId:deviceId,
            saAddress:saAddress,
            maAddress:maAddress
        }).returning({
          userId:users.userId,
          id:users.id,
          role:users.role,
          saAddress:users.saAddress,
          maAddress:users.maAddress
        })
        // console.log(result , "result")
        return result[0]
    }catch(error:any){
        throw new Error(error.message)
    }
  }

  static saveDetailsOwner:any = async(userId:any,secret_key:any,deviceId:any,saAddress:any ,):Promise<any>=>{
    try{
      // console.log("Saving details dbserver details")
        const result =  await postgreDb.insert(users).values({
            userId:userId,
            appId:secret_key,
            deviceId:deviceId,
            saAddress:saAddress,
            role: 'creator'
        }).returning({
          userId:users.userId,
          id:users.id,
          role:users.role,
          saAddress:users.saAddress
        })
        // console.log(result , "result")
        return result[0]
    }catch(error:any){
        throw new Error(error.message)
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
  




  
  // {
  //   name: 'TekkenChampionship',
  //   type: 'tekken',
  //   description: 'A thrilling online battle championship.',
  //   events: [
  //     { eventType: 'Solo Match' },
  //     { eventType: 'Squad Match' },
  //     { eventType: 'Tournament Finals' }
  //   ]
  // } gameDataaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

   static gameObject= async(gameID:string):Promise<any> => {
    try{
      const data=await postgreDb.query.games.findMany({
        where: eq(games.id,parseInt(gameID)),
        columns:{
          name:true,
          type:true,
          description:true,
        },
        with:{
          events:{
            columns:{
              eventType:true
            }
          }
        }
      })
      return data[0]
    }catch(error:any){
      throw new Error(error)
    }
   }


  static getGameID = async(gameID: string): Promise<any>=>{
    try {
      // const result = await postgreDb.select({ creatorId:games.createrId }).from(games).where(eq(games.gameId, gameID));
      // return result[0]
      // console.log("fgxhcjyugk,cg")
      const data=await postgreDb.query.games.findFirst({
        where: eq(games.id,parseInt(gameID)),
        columns:{
          createrId:true,
          gameSaAddress:true,
          gameId:true,
          isApproved:true,
        },
        with:{
          creator:{
            columns:{
              appId:true,
              deviceId:true,
              saAddress:true
            }
          }
        },
      })
    return data
    } catch (error) {
      throw new Error(error.message);
    }
  }


  static getEventById = async (eventId: string): Promise<any> => {
    try {
      const result = await postgreDb.select({id:events.id}).from(events).where(eq(events.eventId, eventId));
      return result[0];
    } catch (error) {
      throw new Error(error.message);
    }
  }

  static getuserdetailsbyId = async (userId:any,gameId:any): Promise<any> => {
    try {



      // const result = await postgreDb.select({appId:users.appId ,deviceId:users.deviceId,saAddress:users.saAddress}).from(users).where(eq(users.id, userId));
      // return result[0]

      const checkUser = await postgreDb.query.userGames.findFirst({
        where:and(eq(userGames.userId, userId),eq(userGames.gameId, gameId)),
        columns:{
          id:true
        }
      })
      if(!checkUser){
         await postgreDb.insert(userGames).values({
          userId:userId,
          gameId:gameId
        })
      }

      return await postgreDb.select({
        appId:users.appId,
        deviceId: users.deviceId,
        saAddress:users.saAddress
    }).from(users).where(eq(users.id,userId))
    } catch (error) {
      throw new Error(error.message);
    }
  }

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



  static checkEvent = async(eventId:any , gameID:any):Promise<any>=>{
    try {
      return await postgreDb.select({
        gameId:events.gameId
       }).from(events).where(
        and(
          eq(events.eventId, eventId),
          eq(events.gameId, gameID)
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

  static saveTransactionDetails = async (
    gameID: number,
    creatorID: any,
    userId: any,
    eventId: any,
    transactionHash: any,
    amount: any,
    from: any,
    to: any
  ): Promise<any> => {
    try {
      const transactionChain = transactionHash.startsWith('0x') ? 'Polygon Testnet' : 'Diamante Testnet';
  
      const result = await postgreDb.insert(transactions).values({
        transactionHash,
        amount,
        from,
        to,
        eventId,
        GameCreator: creatorID,
        toUser: userId,
        fromGameId: gameID,
        transactionChain,  
      }).returning();
  
      return result[0];
    } catch (error: any) {
      throw new Error(error);
    }
  }
  





  // static getAllData: any = async () => {
  //   try {
  //     // Fetch data from the database
  //     const data = await postgreDb.query.users.findMany({
  //       with: {
  //         usersToEvents: {
  //           with: {
  //             event: {
  //               with: {
  //                 game: true,
  //               },
  //             },
  //           },
  //         },
  //         transactions: true,
  //       },
  //     });
  
  //     // Simplify the data structure
  //     const simplifyData = (rawData: any[]) => {
  //       return rawData.flatMap((item) => {
  //         const transactions = item.transactions || [];
  //         const userEvents = item.usersToEvents || [];
  
  //         return transactions.map((transaction) => {
  //           const event = userEvents?.find((ue) => ue.event?.id === transaction.eventId)?.event || {};
  //           const game = event.game || {};
  
  //           return {
  //             userId: item.userId,
  //             eventId: event.eventId,
  //             gameId: game.gameId,
  //             gameName: game.name,
  //             gameType: game.type,
  //             transactionHash: transaction.transactionHash,
  //             from: transaction.from,
  //             to: transaction.to,
  //             amount: transaction.amount,
  //           };
  //         });
  //       });
  //     };
  
  //     // Generate simplified data
  //     const simplifiedData = simplifyData(data);
  
  //     // console.log("Simplified Data:", simplifiedData);
  //     return simplifiedData;
  //   } catch (error: any) {
  //     console.error("Error fetching or simplifying data:", error.message);
  //     throw new Error(`Error in getAllData: ${error.message}`);
  //   }
  // };





  static getCreatorRequestStatus = async(userId: number): Promise<any> => { 
    try {
      const result = await postgreDb
        .select()
        .from(creatorRequests)
        .where(eq(creatorRequests.userId, userId))
        .orderBy(desc(creatorRequests.createdAt))
        .limit(1);
      
      return result[0];
    } catch (error) {
      throw new Error(`Error checking creator request: ${error.message}`);
    }
  }

  static getCreatorRequest = async(maAddress: any): Promise<any> => {
    try {
      const result = await postgreDb
        .select()
        .from(creatorRequests)
        .where(eq(creatorRequests.maAddress, maAddress))
        .orderBy(desc(creatorRequests.createdAt))
        .limit(1);
      
      return result[0];
    } catch (error) {
      throw new Error(`Error checking creator request: ${error.message}`);
    }
  }

 
}