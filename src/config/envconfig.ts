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
  ADMIN_PRIVATEKEY_XDC:z.string(),
  PROVIDER_URL_XDC:z.string(),
  CONTRACT_ADDRESS_XDC:z.string(),
  ETHERSPOTAPIKEY:z.string()
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
  adminPrivatKey_Xdc:envVars.ADMIN_PRIVATEKEY_XDC,
  provider_url_xdc :envVars.PROVIDER_URL_XDC,
  contract_address_xdc : envVars.CONTRACT_ADDRESS_XDC,
  etherspot_api_Key:envVars.ETHERSPOTAPIKEY
};

export const chainIdToChainName: any = {
  137: polygon,
  80002:polygonAmoy,
};


export const chainIdToBundlerUrl:any ={
  137:envConfigs.chain137,
  80002:envConfigs.chain80002,
}






