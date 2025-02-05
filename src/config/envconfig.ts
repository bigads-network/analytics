import * as dotenv from "dotenv";
dotenv.config();
import { z } from "zod";

const envVarsSchema = z.object({
  PORT: z.string().default("80").transform((str) => parseInt(str, 10)),  
  JWT_SECRET: z.string(),
  EXPIREATION_MINUTE:z.string(),
  DB_URL: z.string(),
  GAME_JWT_SECRET:z.string(),
  GAME_TIMEOUT_EXPIRATION:z.string(),
  OWNER_SECRET_KEY:z.string(),
});

const envVars = envVarsSchema.parse(process.env);
export const envConfigs = {
  port: envVars.PORT || 8080,
  jwtsecret:envVars.JWT_SECRET,
  accessExpirationMinutes:envVars.EXPIREATION_MINUTE,
  db_url:envVars.DB_URL,
  game_jwt_secret:envVars.GAME_JWT_SECRET,
  game_timeout_expiration:envVars.GAME_TIMEOUT_EXPIRATION,
  owner_secret_key:envVars.OWNER_SECRET_KEY
};








