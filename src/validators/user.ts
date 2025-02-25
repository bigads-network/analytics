import { z } from "zod";

export default class user {

    static registerUser = z.object({
        body:z.object({
          appId: z.string(),
          deviceId: z.string(),
          maAddress: z.string(),
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

      static getPendingRequests = z.object({
        headers: z.object({
          authorization: z.string().regex(/^Bearer\s+[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+$/, {
            message: "Invalid Authorization token format. Must be a Bearer JWT token."
          }),
        }).strict(),
        body: z.object({}).strict(), // No body expected
        params: z.object({}).strict(), // No params expected
        query: z.object({}).strict(), // No query expected
      });
  
      static transactions = z.object({
        body:z.object({
        }).strict(),
        params:z.object({

        }).strict(),
        query:z.object({
        
        }).strict(),
      })

    static requestCreator = z.object({
        body:z.object({
            maAddress: z.string(),
            userRole: z.string(),
            id: z.number(),
        }).strict(),
        params:z.object({
        }).strict(),
        query:z.object({}).strict(),
      })

    static approveCreatorRequest = z.object({
      params: z.object({
        maAddress: z.string()
      }).strict(),
      body: z.object({
        responseType: z.string()
      }).strict(),
      query: z.object({}).strict()
    });
}
