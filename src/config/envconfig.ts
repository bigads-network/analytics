import * as dotenv from "dotenv";
import { baseSepolia, polygon, polygonAmoy } from "viem/chains";
dotenv.config();
import { z } from "zod";

const envVarsSchema = z.object({
  PORT: z.string().default("80").transform((str) => parseInt(str, 10)),  
  JWT_SECRET: z.string(),
  EXPIREATION_MINUTE:z.string(),
  DB_URL: z.string(),
  CHAINID : z.string(),
  PROVIDER_URL: z.string(),
  PAYMASTERAPI_KEY:z.string(),
  CHAINID80002:z.string(),
  CONTRACR_ADDRESS: z.string(),
  CHAINID137:z.string(),
  CHAINID84532:z.string(),
  TELEGRAM_TOKEN:z.string(),
  BUNDLER_URL:z.string(),
  PAYMASTERAPI_KEY_URL:z.string(),
  ADMINID:z.string(),
  DUNE_API_KEY:z.string(),
  // Queue configuration
  BATCH_SIZE: z.string().default("45").transform((str) => parseInt(str, 10)),
  BATCH_TIMEOUT_MS: z.string().default("10000").transform((str) => parseInt(str, 10)),
  PARALLEL_UO_LIMIT: z.string().default("3").transform((str) => parseInt(str, 10)),
  NONCE_REFRESH_INTERVAL_MS: z.string().default("30000").transform((str) => parseInt(str, 10)),
  MAX_RETRIES: z.string().default("3").transform((str) => parseInt(str, 10)),
  RETRY_DELAY_MS: z.string().default("1000").transform((str) => parseInt(str, 10)),
  BACKOFF_MULTIPLIER: z.string().default("2").transform((str) => parseInt(str, 10)),
});

const envVars = envVarsSchema.parse(process.env);
export const envConfigs = {
  port: envVars.PORT || 8080,
  jwtsecret:envVars.JWT_SECRET,
  accessExpirationMinutes:envVars.EXPIREATION_MINUTE,
  db_url:envVars.DB_URL,
  chainId : envVars.CHAINID,
  providerUrl: envVars.PROVIDER_URL,
  paymaster_apikey : envVars.PAYMASTERAPI_KEY,
  contractAddress : envVars.CONTRACR_ADDRESS,
  chain80002:envVars.CHAINID80002,
  chain137:envVars.CHAINID137,
  chain84532 :envVars.CHAINID84532,
  telegram_token:envVars.TELEGRAM_TOKEN,
  bundlerUrl:envVars.BUNDLER_URL,
  paymaster_apikey_url : envVars.PAYMASTERAPI_KEY_URL,
  adminId:envVars.ADMINID,
  duneApikey:envVars.DUNE_API_KEY,
  // Queue configuration
  batchSize: envVars.BATCH_SIZE,
  batchTimeoutMs: envVars.BATCH_TIMEOUT_MS,
  parallelUoLimit: envVars.PARALLEL_UO_LIMIT,
  nonceRefreshIntervalMs: envVars.NONCE_REFRESH_INTERVAL_MS,
  maxRetries: envVars.MAX_RETRIES,
  retryDelayMs: envVars.RETRY_DELAY_MS,
  backoffMultiplier: envVars.BACKOFF_MULTIPLIER,
};

export const chainIdToChainName: any = {
  137: polygon,
  80002:polygonAmoy,
};


export const chainIdToBundlerUrl:any ={
  137:envConfigs.chain137,
  80002:envConfigs.chain80002,
}






