import * as dotenv from "dotenv";
import { polygon, polygonAmoy } from "viem/chains";
dotenv.config();
import { z } from "zod";

const envVarsSchema = z.object({
  PORT: z.string().default("80").transform((str) => parseInt(str, 10)),  
  JWT_SECRET: z.string(),
  EXPIREATION_MINUTE:z.string(),
  DB_URL: z.string(),
});

const envVars = envVarsSchema.parse(process.env);
export const envConfigs = {
  port: envVars.PORT || 8080,
  jwtsecret:envVars.JWT_SECRET,
  accessExpirationMinutes:envVars.EXPIREATION_MINUTE,
  db_url:envVars.DB_URL,
};

export const chainIdToChainName: any = {
  137: polygon,
  80002:polygonAmoy
};

// console.log(process.env)
// export const providerUrl="https://polygon-amoy.g.alchemy.com/v2/Xd8ZnMNV7j_YL-2K-Fr-VqUnXDG1k1_Z"; // polygon
export const providerUrl=process.env.PROVIDER_URL; // polygon

export const chainIdToBundlerUrl:any ={
  137:process.env.CHAINID137,
  80002:process.env.CHAINID80002
}

// export const chainIdToBundlerUrl:any ={
//   137:'https://bundler.biconomy.io/api/v3/137/nJPK7B3ru.dd7f7861-190d-41bd-af80-6877f74b8f44',
//   80002:'https://bundler.biconomy.io/api/v3/80002/nJPK7B3ru.dd7f7861-190d-41bd-af80-6877f74b8f44'
// }





