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
  CHAINID80002:z.string(),
  CONTRACR_ADDRESS: z.string(),
  TELEGRAM_TOKEN:z.string(),
  ADMINID:z.string(),
  DUNE_API_KEY:z.string(),
  ADMIN_PRIVATEKEY_XDC:z.string(),
  PROVIDER_URL_XDC:z.string(),
  CONTRACT_ADDRESS_XDC:z.string(),
  ETHERSPOTAPIKEY:z.string(),
  ADMIN_PRIVATEKEY_XDC1:z.string(),
  ADMIN_PRIVATEKEY_XDC2:z.string(),
  ADMIN_PRIVATEKEY_XDC3:z.string(),
  ADMIN_PRIVATEKEY_XDC4:z.string(),
  ADMIN_PRIVATEKEY_XDC5:z.string(),
  ADMIN_PRIVATEKEY_XDC6:z.string(),
  ADMIN_PRIVATEKEY_XDC7:z.string(),
  ADMIN_PRIVATEKEY_XDC8:z.string(),
  ADMIN_PRIVATEKEY_XDC9:z.string(),
  XDC_PROVIDERS: z.string().default("") ,
  MAX_CONCURRENT_RPC_CALLS: z.string().default("5").transform((str) => parseInt(str, 10)),
  RPC_RETRY_ATTEMPTS: z.string().default("3").transform((str) => parseInt(str, 10)),
  RPC_TIMEOUT_MS: z.string().default("30000").transform((str) => parseInt(str, 10)),
  BATCH_SIZE: z.string().default("10").transform((str) => parseInt(str, 10)),
  BATCH_TIMEOUT_MS: z.string().default("5000").transform((str) => parseInt(str, 10)),
  MAX_QUEUE_SIZE_PER_USER: z.string().default("100").transform((str) => parseInt(str, 10)),
  GLOBAL_MAX_QUEUE_SIZE: z.string().default("1000").transform((str) => parseInt(str, 10))
});

const envVars = envVarsSchema.parse(process.env);
export const envConfigs = {
  port: envVars.PORT || 8080,
  jwtsecret:envVars.JWT_SECRET,
  accessExpirationMinutes:envVars.EXPIREATION_MINUTE,
  db_url:envVars.DB_URL,
  chainId : envVars.CHAINID,
  providerUrl: envVars.PROVIDER_URL,
  contractAddress : envVars.CONTRACR_ADDRESS,
  chain80002:envVars.CHAINID80002,
  telegram_token:envVars.TELEGRAM_TOKEN,
  adminId:envVars.ADMINID,
  duneApikey:envVars.DUNE_API_KEY,
  adminPrivatKey_Xdc:envVars.ADMIN_PRIVATEKEY_XDC,
  adminPrivatKey_Xdc1:envVars.ADMIN_PRIVATEKEY_XDC1,
  adminPrivatKey_Xdc2:envVars.ADMIN_PRIVATEKEY_XDC2,
  adminPrivatKey_Xdc3:envVars.ADMIN_PRIVATEKEY_XDC3,
  adminPrivatKey_Xdc4:envVars.ADMIN_PRIVATEKEY_XDC4,
  adminPrivatKey_Xdc5:envVars.ADMIN_PRIVATEKEY_XDC5,
  adminPrivatKey_Xdc6:envVars.ADMIN_PRIVATEKEY_XDC6,
  adminPrivatKey_Xdc7:envVars.ADMIN_PRIVATEKEY_XDC7,
  adminPrivatKey_Xdc8:envVars.ADMIN_PRIVATEKEY_XDC8,
  adminPrivatKey_Xdc9:envVars.ADMIN_PRIVATEKEY_XDC9,
  provider_url_xdc :envVars.PROVIDER_URL_XDC,
  contract_address_xdc : envVars.CONTRACT_ADDRESS_XDC,
  etherspot_api_Key:envVars.ETHERSPOTAPIKEY,
  // RPC Configuration
  xdcProviders: envVars.XDC_PROVIDERS.split(",").filter(url => url.trim()).map(url => url.trim()),
  maxConcurrentRpcCalls: envVars.MAX_CONCURRENT_RPC_CALLS,
  rpcRetryAttempts: envVars.RPC_RETRY_ATTEMPTS,
  rpcTimeoutMs: envVars.RPC_TIMEOUT_MS,
  batchSize: envVars.BATCH_SIZE,
  batchTimeoutMs: envVars.BATCH_TIMEOUT_MS,
  maxQueueSizePerUser: envVars.MAX_QUEUE_SIZE_PER_USER,
  globalMaxQueueSize: envVars.GLOBAL_MAX_QUEUE_SIZE
};

export const chainIdToChainName: any = {
  137: polygon,
  80002:polygonAmoy,
};






