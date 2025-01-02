import {and, count, countDistinct, desc, eq, inArray, sql} from "drizzle-orm";
import postgreDb from "../../config/db";
import { eventData, user, userEvents } from "../../models/schema";
import { generateAuthTokens } from "../../config/token";

export class User {

  static saveDetails:any = async(userId:any,appId:any,deviceId:any,saAddress:any):Promise<any>=>{
    try{
        const result =  await postgreDb.insert(user).values({
            userId:userId,
            appId:appId,
            deviceId:deviceId,
            saAddress:saAddress
        }).returning({userId:user.userId})
        return result
    }catch(error:any){
        throw new Error(error)
    }
  }

  static eventDetails = async (
    userId: any,
    eventId: any,
    data: any
  ): Promise<any> => {
    try {
      await postgreDb.transaction(async (tx) => {
        const result = await tx
          .insert(eventData)
          .values({
            userId: userId,
            eventId: eventId,
            name: data.name,
            type: data.type,
            eventDetails: data.eventDetails,
          })
          .execute();

        await tx
          .insert(userEvents)
          .values({
            userId: userId,
            eventId: eventId,
          })
          .onConflictDoNothing()
          .execute();

        return result;
      });
    } catch (error) {
      throw new Error(error);
    }
  };


  static async getDta (): Promise<any> {
    const alldata = await postgreDb.select().from(eventData).execute();

    // Fetch counts for userId, transactionhash, and name
    const dataCount = await postgreDb
        .select({
            user: countDistinct(eventData.userId).as('userCount'),
            transactionhash: count(eventData.transactionhash).as('transactionHashCount'),
            gamesPlayed: countDistinct(eventData.name).as('gamesPlayedCount'),
        })
        .from(eventData)
        .execute();

    // Return combined result
    return {
        alldata,
        dataCount: dataCount[0], // `dataCount` is an array with a single object
    };
  }
}