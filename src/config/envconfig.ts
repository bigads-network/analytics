import * as dotenv from "dotenv";
dotenv.config();
import { z } from "zod";

const envVarsSchema = z.object({
  PORT: z.string().default("80").transform((str) => parseInt(str, 10)),  
  // HOST: z.string(),
  // DBUSER: z.string(),
  // PASSWORD: z.string(),
  // DATABASE: z.string(),
  // DBPORT: z.string().default("5432").transform((str) => parseInt(str, 10)),
  // SSL: z.enum(["true", "false"]).transform((str) => str === "true"),
  JWT_SECRET: z.string(),
  EXPIREATION_MINUTE:z.string(),
  DB_URL: z.string(),
});

const envVars = envVarsSchema.parse(process.env);
export const envConfigs = {
  port: envVars.PORT || 8080,
  // db: {
  //   host: envVars.HOST,
  //   user: envVars.DBUSER,
  //   password: envVars.PASSWORD,
  //   database:envVars.DATABASE,
  //   port: envVars.DBPORT,
  //   ssl: envVars.SSL,
  // },
  jwtsecret:envVars.JWT_SECRET,
  accessExpirationMinutes:envVars.EXPIREATION_MINUTE,
  db_url:envVars.DB_URL,
  
};