import { z } from "zod";

export default class creator {

    static registerCreator = z.object({
      body: z.object({
        devicedata: z.object({
          deviceId: z.string(),
          OS: z.string(),
        }).strict(),
      }).strict(),
      params: z.object({}).strict(),
      query: z.object({}).strict(),
    });


    static gameSchema = z.object({
        body: z.object({
          gameName: z.string(),
          gameType: z.string(),
          description: z.string(),
        }).strict(),
        params: z.object({}).strict(),
        query: z.object({}).strict(),
      });

       static eventSchema = z.object({
        body: z.object({
          eventType: z.string(),
        }).strict(),
        params: z.object({}).strict(),
        query: z.object({}).strict(),
      });
}