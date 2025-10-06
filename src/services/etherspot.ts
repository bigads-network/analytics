import { ModularSdk, EtherspotBundler } from "@etherspot/modular-sdk";
import logger from "../config/logger";
import { envConfigs } from "../config/envconfig";

const DEFAULT_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_FACTOR = 5;

const retryableErrors = new Set([
  "request timed out",
  "timeout",
  "too many requests",
  "rate limit",
  "429"
]);

const apiKeys = envConfigs.etherspot_api_Keys || [];
let keyCursor = 0;

if (!apiKeys.length) {
  logger.warn("No Etherspot API keys configured. Smart account provisioning may fail.");
}

export interface EtherspotClientParams {
  privateKey: string;
  chainId: number;
  maxAttempts?: number;
  retryDelayMs?: number;
}

type Operation<T> = (sdk: ModularSdk) => Promise<T>;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const maskKey = (key: string) => {
  if (!key) {
    return "";
  }
  if (key.length <= 8) {
    return `${key.slice(0, 2)}***${key.slice(-2)}`;
  }
  return `${key.slice(0, 4)}***${key.slice(-4)}`;
};

const extractStatusCode = (error: any): number | undefined => {
  return (
    error?.statusCode ||
    error?.status ||
    error?.response?.status ||
    error?.cause?.status ||
    error?.cause?.statusCode ||
    error?.cause?.response?.status ||
    error?.cause?.cause?.statusCode
  );
};

const collectErrorMessages = (error: any, depth = 0, messages: string[] = []) => {
  if (!error || depth > 5) {
    return messages;
  }

  const potential = [error.message, error.shortMessage, error.reason, error.details];
  potential.forEach((msg) => {
    if (typeof msg === "string") {
      messages.push(msg.toLowerCase());
    }
  });

  if (error.metaMessages && Array.isArray(error.metaMessages)) {
    error.metaMessages.forEach((msg: string) => {
      if (typeof msg === "string") {
        messages.push(msg.toLowerCase());
      }
    });
  }

  if (error.cause) {
    collectErrorMessages(error.cause, depth + 1, messages);
  }

  return messages;
};

const isRetryableEtherspotError = (error: any): boolean => {
  const statusCode = extractStatusCode(error);
  if (statusCode === 429) {
    return true;
  }

  const messages = collectErrorMessages(error);

  return messages.some((message) => {
    if (!message) {
      return false;
    }
    return (
      retryableErrors.has(message) ||
      message.includes("fetch failed") ||
      message.includes("network error") ||
      message.includes("timeout") ||
      message.includes("too many requests") ||
      message.includes("rate limit") ||
      message.includes("http request failed")
    );
  });
};

const getKeyForOffset = (offset: number) => {
  if (!apiKeys.length) {
    throw new Error(
      "Missing Etherspot API keys. Set ETHERSPOTAPIKEY or ETHERSPOTAPIKEYS in the environment."
    );
  }
  return apiKeys[(keyCursor + offset) % apiKeys.length];
};

async function executeWithEtherspotClient<T>(
  params: EtherspotClientParams,
  operation: Operation<T>
): Promise<T> {
  const { privateKey, chainId, retryDelayMs = DEFAULT_RETRY_DELAY_MS } = params;
  const maxAttempts = params.maxAttempts ?? Math.max(apiKeys.length, 1) * MAX_RETRY_FACTOR;

  let attempt = 0;
  let offset = 0;
  let lastError: any;

  while (attempt < maxAttempts) {
    const apiKey = getKeyForOffset(offset);

    try {
      const bundler = new EtherspotBundler(chainId, apiKey);
      const modularSdk = new ModularSdk(privateKey, {
        chainId,
        bundlerProvider: bundler,
      });

      const result = await operation(modularSdk);

      keyCursor = (keyCursor + offset + 1) % apiKeys.length;

      return result;
    } catch (error: any) {
      lastError = error;
      const shouldRetry = isRetryableEtherspotError(error);

      logger.warn("Etherspot request failed, evaluating retry", {
        chainId,
        attempt,
        apiKey: maskKey(apiKey),
        retryable: shouldRetry,
        message: error?.message || error?.shortMessage || "Unknown error",
      });

      attempt += 1;
      offset += 1;

      if (!shouldRetry || attempt >= maxAttempts) {
        logger.error("Etherspot request failed after retries", {
          chainId,
          attempts: attempt,
          apiKey: maskKey(apiKey),
          error: error?.message || error?.shortMessage || error,
        });
        throw lastError;
      }

      const backoff = Math.min(retryDelayMs * attempt, retryDelayMs * MAX_RETRY_FACTOR * 2);
      await delay(backoff);
    }
  }

  throw lastError ?? new Error("Etherspot request failed after retries");
}

export async function withEtherspotClient<T>(
  params: EtherspotClientParams,
  operation: Operation<T>
): Promise<T> {
  return executeWithEtherspotClient(params, operation);
}

export async function getEtherspotClient(
  params: EtherspotClientParams
): Promise<ModularSdk> {
  return executeWithEtherspotClient(params, async (sdk) => sdk);
}

export async function getCounterFactualAddress(
  params: EtherspotClientParams
): Promise<string> {
  return executeWithEtherspotClient(params, (sdk) => sdk.getCounterFactualAddress());
}

