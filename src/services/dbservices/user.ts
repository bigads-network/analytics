import {and, desc, eq, inArray, sql} from "drizzle-orm";
import postgreDb from "../../config/db";
import { eventData, user } from "../../models/schema";
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

  static eventDetails = async(userId:any,eventId:any,data:any):Promise<any>=>{
    try{
      //  console.log(userId,eventId,data, data.name, data.type)
        const result =  await postgreDb.insert(eventData).values({
            userId:userId,
            eventId:eventId,
            name:data.name,
            type:data.type,
            eventDetails:data.eventDetails
        })
        // console.log("varun Kate",result)
        return result;
    }catch(error){
        throw new Error(error)
    }
  }
}