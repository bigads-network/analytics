import * as dotenv from "dotenv";
import { baseSepolia, polygon, polygonAmoy } from "viem/chains";
dotenv.config();
import { z } from "zod";

const envVarsSchema = z.object({
  PORT: z.string().default("80").transform((str) => parseInt(str, 10)),  
  JWT_SECRET: z.string(),
  EXPIREATION_MINUTE:z.string(),
  DB_URL: z.string(),
  DB_READ: z.string(),
  CHAINID : z.string(),
  // PROVIDER_URL: z.string(),
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
  CONTRACT_ADDRESS_XDC:z.string(),
  ETHERSPOTAPIKEY:z.string(),
  ETHERSPOTAPIKEYS:z.string().optional(),
  PROVIDER_URL_AVAX:z.string(),
  PROVIDER_URL_AVAX2:z.string(),
  PROVIDER_URL_AVAX3:z.string(),
  PROVIDER_URL_AVAX4:z.string(),
  PROVIDER_URL_AVAX1:z.string(),
  PROVIDER_URL_AVAX5:z.string(),
  PROVIDER_URL_AVAX6:z.string(),
  PROVIDER_URL_AVAX7:z.string(),
  PROVIDER_URL_AVAX8:z.string(),
  PROVIDER_URL_AVAX9:z.string(),
  PROVIDER_URL_AVAX10:z.string(),
  PROVIDER_URL_AVAX11:z.string(),
  PROVIDER_URL_AVAX12:z.string(),
  PROVIDER_URL_AVAX13:z.string(),
  PROVIDER_URL_AVAX14:z.string(),
  PROVIDER_URL_AVAX15:z.string(),
  ADMIN_PRIVATEKEY_AVAX:z.string(),
  ADMIN_PRIVATEKEY_AVAX1:z.string(),
  ADMIN_PRIVATEKEY_AVAX2:z.string(),
ADMIN_PRIVATEKEY_AVAX3:z.string(),
ADMIN_PRIVATEKEY_AVAX4:z.string(),
ADMIN_PRIVATEKEY_AVAX5:z.string(),
ADMIN_PRIVATEKEY_AVAX6:z.string(),
ADMIN_PRIVATEKEY_AVAX7:z.string(),
  CONTRACT_ADDRESS_AVAX:z.string(),
});

const envVars = envVarsSchema.parse(process.env);
export const envConfigs = {
  port: envVars.PORT || 8080,
  jwtsecret:envVars.JWT_SECRET,
  accessExpirationMinutes:envVars.EXPIREATION_MINUTE,
  db_url:envVars.DB_URL,
  db_read:envVars.DB_READ,
  chainId : envVars.CHAINID,
  // providerUrl: envVars.PROVIDER_URL,
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
  provider_url_AVAX :envVars.PROVIDER_URL_AVAX,
  adminPrivatKey_avax:envVars.ADMIN_PRIVATEKEY_AVAX,
  adminPrivatKey_avax1:envVars.ADMIN_PRIVATEKEY_AVAX1,
  adminPrivatKey_avax2:envVars.ADMIN_PRIVATEKEY_AVAX2,
  adminPrivatKey_avax3:envVars.ADMIN_PRIVATEKEY_AVAX3,
  adminPrivatKey_avax4:envVars.ADMIN_PRIVATEKEY_AVAX4,
  adminPrivatKey_avax5:envVars.ADMIN_PRIVATEKEY_AVAX5,
  adminPrivatKey_avax6:envVars.ADMIN_PRIVATEKEY_AVAX6,
  adminPrivatKey_avax7:envVars.ADMIN_PRIVATEKEY_AVAX7,
  provider_url_AVAX1 :envVars.PROVIDER_URL_AVAX1,
  provider_url_AVAX2:envVars.PROVIDER_URL_AVAX2,
  provider_url_AVAX3 :envVars.PROVIDER_URL_AVAX3,
  provider_url_AVAX4 :envVars.PROVIDER_URL_AVAX4,
  provider_url_AVAX5 :envVars.PROVIDER_URL_AVAX5,
  provider_url_AVAX6 :envVars.PROVIDER_URL_AVAX6,
  provider_url_AVAX7 :envVars.PROVIDER_URL_AVAX7,
  provider_url_AVAX8 :envVars.PROVIDER_URL_AVAX8,
  provider_url_AVAX9 :envVars.PROVIDER_URL_AVAX9,
  provider_url_AVAX10 :envVars.PROVIDER_URL_AVAX10,
  provider_url_AVAX11 :envVars.PROVIDER_URL_AVAX11,
  provider_url_AVAX12:envVars.PROVIDER_URL_AVAX12,
  provider_url_AVAX13:envVars.PROVIDER_URL_AVAX13,
  provider_url_AVAX14:envVars.PROVIDER_URL_AVAX14,
  provider_url_AVAX15:envVars.PROVIDER_URL_AVAX15,
  contract_address_avax :envVars.CONTRACT_ADDRESS_AVAX,
  etherspot_api_Key:envVars.ETHERSPOTAPIKEY,
  etherspot_api_Keys:(envVars.ETHERSPOTAPIKEYS
    ? envVars.ETHERSPOTAPIKEYS.split(",")
        .map((key) => key.trim())
        .filter((key) => key.length > 0)
    : [envVars.ETHERSPOTAPIKEY]),

};

export const chainIdToChainName: any = {
  137: polygon,
  80002:polygonAmoy,
};


export const chainIdToBundlerUrl:any ={
  137:envConfigs.chain137,
  80002:envConfigs.chain80002,
}






