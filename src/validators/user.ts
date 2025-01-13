import { z } from "zod";

export default class user {

    static registerUser = z.object({
        body:z.object({
            appId: z.string(),
            deviceId: z.string(),
        }).strict(),
        params:z.object({
        }).strict(),
        query:z.object({}).strict(),
      })


      static registerGame = z.object({
        body:z.object({
            gameName: z.string(),
            gameType: z.string(),
        }).strict(),
        params:z.object({
        }).strict(),
        query:z.object({}).strict(),
      })

      static sendEvent = z.object({
        body:z.object({
        }).strict(),
        params:z.object({
            eventId: z.string(),
        }).strict(),
        query:z.object({}).strict(),
      })
  
}
