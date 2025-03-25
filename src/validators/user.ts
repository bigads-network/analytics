import { z } from "zod";

export default class user {

    static fireEvent = z.object({
      body: z.object({
        devicedata: z.object({
          deviceId: z.string(),
          OS: z.string(),
        }).strict(),
      }).strict(),
      params: z.object({
        eventId: z.string(),
      }).strict(),
      query: z.object({}).strict(),
    });
}