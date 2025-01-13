import {and, count, countDistinct, desc, eq, inArray, isNull, sql} from "drizzle-orm";
import postgreDb from "../../config/db";
import { eventData, user, userEvents } from "../../models/schema";
import { generateAuthTokens } from "../../config/token";

export class User {


  static userExists:any = async(deviceId:any, appId:any):Promise<any>=>{
    try{
      console.log("registerUser in db service " , deviceId, appId) 
        const result = await postgreDb.select().from(user).where(and(eq(user.deviceId,deviceId),eq(user.appId,appId)))
        return result
    }catch(error:any){
        throw new Error(error)
    }
  }

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
        throw new Error(error.message)
    }
  }


  static registerGame = async(userId:string ,evenId:string  ,gameName:string ,gameType:string, eventDetails:string):Promise<any> => {
    try {
       return await postgreDb.transaction(async (tx) => {
       const eventDatas:any = await tx.insert(eventData).values({
         userId: userId,
         eventId: evenId,
         name: gameName,
         type: gameType,
         eventDetails: eventDetails,
       }).returning({
           eventId: eventData.eventId,
           name: eventData.name,
           type: eventData.type,
           eventDetails: eventData.eventDetails,
       });

      console.log(eventDatas ,"eventData ")
      await tx.insert(userEvents).values({
           userId: userId,
           eventId: eventDatas[0].eventId,
       }).onConflictDoNothing()
      return eventDatas
      })
    } catch (error:any) {
      throw new Error(error.message);
      
    }
  }

  static getuserdetails= async(userId: string, eventId: string) => {
    try {
        const details:any = await postgreDb.query.eventData.findMany({
            where: (eventData, { and, eq }) => and(
                eq(eventData.eventId, eventId)
            ),
            columns: {
              transactionhash:true,
            },
            with: {
                user: {
                    columns: {
                        appId: true,
                        deviceId: true,
                        saAddress: true
                    }
                }
            }
        });
        console.log(details ,"details")
        // if(details[0].transactionhash){
        //   throw new Error("already transaction done for this event")
        // }
        return details[0];
    } catch (error: any) {
        throw new Error(error.message);
    }
  }

  static updateEventData = async (
    userId: string,
    eventId: string,
    transactionHash: string,
    to: string,
    from: string,
    amount: string
) => {
    try {
        const result = await postgreDb.update(eventData)
            .set({
              transactionhash:transactionHash,
                to:to,
                from:from,
                amount:amount,
            })
            .where(
                and(
                    eq(eventData.eventId, eventId),
                )
            )
            .returning({
                transactionHash: eventData.transactionhash,
                to: eventData.to,
                from: eventData.from,
                amount: eventData.amount
            });
        return result;
    } catch (error: any) {
        throw new Error(error.message);
    }
}


  // static eventDetails = async (
  //   userId: any,
  //   eventId: any,
  //   data: any
  // ): Promise<any> => {
  //   try {
  //     await postgreDb.transaction(async (tx) => {
  //       const result = await tx
  //         .insert(eventData)
  //         .values({
  //           userId: userId,
  //           eventId: eventId,
  //           name: data.name,
  //           type: data.type,
  //           eventDetails: data.eventDetails,
  //         })
  //         .execute();

  //       await tx
  //         .insert(userEvents)
  //         .values({
  //           userId: userId,
  //           eventId: eventId,
  //         })
  //         .onConflictDoNothing()
  //         .execute();

  //       return result;
  //     });
  //   } catch (error) {
  //     throw new Error(error);
  //   }
  // };


  static async getDta (): Promise<any> {
    const alldata = await postgreDb.select().from(eventData)
    .orderBy(desc(eventData.id))
    .execute();

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