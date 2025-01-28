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

      static registerOwner = z.object({
        body:z.object({
          secret_key: z.string(),
          deviceId: z.string(),
        }).strict(),
        params:z.object({
        }).strict(),
        query:z.object({}).strict(),
      })

      static eventValidator = z.object({
        eventType: z.string(), // Ensures eventType is a string
      });
      
      static registerGame = z.object({
        body:z.object({
          name: z.string(), // Ensures name is a string
          type: z.string(), // Ensures type matches specific values
          description: z.string(), // Ensures description is a string
          events: z.array(this.eventValidator), // Ensures events is an array of valid event objects
        }).strict(), // Disallows additional fields
        params: z.object({
        }).strict(),
        query: z.object({}).strict()
      })

      static sendEvent = z.object({
        body:z.object({
          eventId: z.string(),
          gameId:z.string(),
        }).strict(),
        params:z.object({

        }).strict(),
        query:z.object({

        }).strict(),
      })
  
      static transactions = z.object({
        body:z.object({
        }).strict(),
        params:z.object({

        }).strict(),
        query:z.object({
        
        }).strict(),
      })

}
