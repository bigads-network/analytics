import {and, desc, eq, inArray, sql} from "drizzle-orm";
import postgreDb from "../../config/db";
import { eventData, user, userEvents } from "../../models/schema";
import { generateAuthTokens } from "../../config/token";

export class User {

  static saveDetails:any = async(userId:any,appId:any,deviceId:any):Promise<any>=>{
    try{
        const result =  await postgreDb.insert(user).values({
            userId:userId,
            appId:appId,
            deviceId:deviceId
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
}