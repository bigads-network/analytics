import {and, count, countDistinct, desc, eq, inArray, isNull, sql} from "drizzle-orm";
import postgreDb from "../../config/db";
import { generateAuthTokens } from "../../config/token";
import { events, games, transactions, userGames, users, } from "../../models/schema";

export default class User {

  static generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();

  static userExists:any = async(deviceId:any, appId:any):Promise<any>=>{
    try{
      // console.log("registerUser in db service " , deviceId, appId) 
      
       // console.log(result)
      const result = await postgreDb.select().from(users).where(and(eq(users.deviceId,deviceId),eq(users.appId,appId)))
        return result[0]
    }catch(error:any){
        throw new Error(error)
    }
  }

  static saveDetails:any = async(userId:any,appId:any,deviceId:any,saAddress:any ,):Promise<any>=>{
    try{
      // console.log("Saving details dbserver details")
        const result =  await postgreDb.insert(users).values({
            userId:userId,
            appId:appId,
            deviceId:deviceId,
            saAddress:saAddress,
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
          .select()
          .from(games)
          .where(
            and(eq(games.createrId, userId), eq(games.name, name), eq(games.type, type))
          );
  
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
        const gameToken = await generateAuthTokens({ userId: gameId });
  
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
      }).returning();

  
      if (!newGame) throw new Error('Game registration failed.');
  
      const Gametoken= await generateAuthTokens({userId:newGame.id})

      // console.log(newGame.id ,"Game registratioz")

      const newEvents = eventList.map(event => ({
        gameId: newGame.id,
        eventId: `event_${this.generateId()}`, // Generate unique eventId
        eventType: event.eventType,
      }));
  
      await postgreDb.insert(events).values(newEvents);

       const uodatedgame=await postgreDb.update(games).set({
        gameToken: Gametoken
      }).where(eq(games.id ,newGame.id)).returning()
  
      return { game: uodatedgame[0], events: newEvents ,Gametoken:Gametoken };
    } catch (error) {
      throw new Error(`Error registering game: ${error.message}`);
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
          gameId:true
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



      return await postgreDb.select().from(users).where(eq(users.id,userId))
    } catch (error) {
      throw new Error(error.message);
    }
  }


  static saveTransactionDetails = async(gameID:number ,creatorID:any ,userId:any , eventId:any , transactionHash:any,amount:any ,from:any, to:any ):Promise<any> => {
    try {
      const result = await postgreDb.insert(transactions).values({
        transactionHash,
        amount,
        from,
        to,
        eventId,
        GameCreator:creatorID,
        toUser:userId,
        fromGameId:gameID

      }).returning();
      return result[0];
    } catch (error:any ){
      throw new Error(error);
    }
  }

  static getTransactionDetails=async()=>{
    try {
      return await postgreDb.query.transactions.findMany({
        columns:{
          transactionHash:true
        },
        with:{
          event:{
            columns:{
              eventType:true,
              eventId:true
            }
          },
          toUser:{
            columns:{
              userId:true
            }
          },
          game:{
            columns:{
              name:true,
              type:true,
              gameId:true
            }
          }
        }
      })
      
    } catch (error) {
      throw new Error(error);
    }
  }

 static counts  = async()=>{
  try {
    return await postgreDb.transaction(async (tx) => {
      const uniqueUsers = await tx.select({
        count: sql`count(distinct ${users.id})`
      }).from(users);
  
      const uniqueGames = await tx.select({
        count: sql`count(distinct ${games.id})`
      }).from(games);
  
      const uniqueEvents = await tx.select({
        count: sql`count(distinct ${events.id})`
      }).from(events);
  
      const uniqueTransactions = await tx.select({
        count: sql`count(distinct ${transactions.id})`
      }).from(transactions);
  
      return {
        users: Number(uniqueUsers[0].count),
        games: Number(uniqueGames[0].count),
        events: Number(uniqueEvents[0].count),
        transactions: Number(uniqueTransactions[0].count)
      };
    });
  } catch (error) {
     throw new Error(error);    
  }
 }


  static games =async (): Promise<any> => {
    try {
      const gamess= await postgreDb.query.games.findMany({
        columns:{
          gameId:true,
          name:true,
          type:true,
          description:true,
          createrId:true,
          gameSaAddress:true,
          createdAt:true,
        },
        with:{
          events:true
        }
      })
      return gamess
    } catch (error:any) {
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

}