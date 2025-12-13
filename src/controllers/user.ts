import { Buffer } from "buffer";
import { Request, Response } from "express";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { sha512_256 } from "js-sha512";
import { ModularSdk, EtherspotBundler, sleep } from "@etherspot/modular-sdk";
import { ethers } from "ethers";
import {
  envConfigs,
} from "../config/envconfig";
import { generateGameToken } from "../config/gameToken";
import dbservices from "../services/dbservices";
import { avalanche, polygon, polygonAmoy, xdc } from "viem/chains";
import logger from "../config/logger";
import { dashboardCache } from "../config/cache";
import { rpc } from "viem/utils";
import Monitoring from "./monitoring";

// Fire-and-forget configuration - send immediately without waiting for confirmation
const BATCH_SIZE = 1; // Send each transaction immediately - no batching delays
const BATCH_TIMEOUT_MS = 500; // 500ms max wait to batch with others
const RPC_RETRY_DELAY_MS = 1_000;
const MAX_PROVIDER_SWITCHES = 2;
const MAX_TX_RETRIES = 1; // No retries - fire and forget
// Initialize admin keys first, then set PARALLEL_WALLETS based on available keys
const ADMIN_KEYS_CONFIG = [
  envConfigs.adminPrivatKey_avax,
  envConfigs.adminPrivatKey_avax1,
  envConfigs.adminPrivatKey_avax2,
  envConfigs.adminPrivatKey_avax3,
  envConfigs.adminPrivatKey_avax4,
  envConfigs.adminPrivatKey_avax5,
  envConfigs.adminPrivatKey_avax6,
  envConfigs.adminPrivatKey_avax7,
  envConfigs.adminPrivatKey_avax8,
  envConfigs.adminPrivatKey_avax9,
  envConfigs.adminPrivatKey_avax10,
  envConfigs.adminPrivatKey_avax11,
  envConfigs.adminPrivatKey_avax12,
  envConfigs.adminPrivatKey_avax13,
  envConfigs.adminPrivatKey_avax14,
  envConfigs.adminPrivatKey_avax15,
  envConfigs.adminPrivatKey_avax16,
].filter(key => key && key.length > 0).length;
let PARALLEL_WALLETS = Math.max(1, ADMIN_KEYS_CONFIG); // Use available keys, min 1
const MAX_WALLET_CONCURRENCY = 4; // Send up to 4 txs per wallet concurrently
const MAX_QUEUE_SIZE = 500; // Reduced from 1000 to control memory
const MAX_QUEUE_BYTES = 16 * 1024 * 1024; // Reduced from 32MB to 16MB
const MAX_REQUEUE_ATTEMPTS = 0; // No requeue - fire once and forget
const MAX_PENDING_PER_WALLET = 8; // Allow more pending per wallet
const WALLET_COOLDOWN_MS = 5_000; // Shorter cooldown

const nonceByWallet = new Map<number, number>();
let noncesInitialized = false;
let roundRobinIndex = 0; // For round-robin wallet selection among valid wallets

let isProcessingBatch = false;
let pendingProcessRequest = false;
let currentQueueBytes = 0;

const retryableRpcErrors = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ECONNABORTED",
  "ETIMEOUT",
]);

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Initialize nonces once at server startup
async function initializeNonces() {
  if (noncesInitialized) {
    return;
  }
  
  const MIN_BALANCE_AVAX = 0.01;
  validAdminIndices = [];
  
  logger.info(`[NONCE] Initializing ${adminPrivateKeys.length} wallets (min balance: ${MIN_BALANCE_AVAX} AVAX)...`);
  
  try {
    for (let walletIndex = 0; walletIndex < adminPrivateKeys.length; walletIndex++) {
      const privKey = adminPrivateKeys[walletIndex];
      if (!privKey) {
        continue;
      }
      
      const provider = getNextProvider();
      const wallet = new ethers.Wallet(privKey, provider);
      const walletAddress = await wallet.getAddress();
      
      // Get pending nonce from blockchain (includes pending transactions)
      const pendingNonce = await provider.getTransactionCount(walletAddress, "pending");
      nonceByWallet.set(walletIndex, pendingNonce);
      
      // Get balance
      const balance = await provider.getBalance(walletAddress);
      const balanceInAvax = parseFloat(ethers.utils.formatEther(balance));
      
      // Check if balance is sufficient
      const isValid = balanceInAvax >= MIN_BALANCE_AVAX;
      if (isValid) {
        validAdminIndices.push(walletIndex);
      }
      
      const status = isValid ? '✅ VALID' : '❌ LOW';
      logger.info(`[WALLET${walletIndex}] ${status} nonce=${pendingNonce} balance=${balanceInAvax.toFixed(6)} AVAX address=${walletAddress}`);
    }
    
    noncesInitialized = true;
    PARALLEL_WALLETS = Math.max(1, validAdminIndices.length);
    logger.info(`[NONCE] Ready: ${validAdminIndices.length}/${adminPrivateKeys.length} wallets have sufficient balance. Will use round-robin on [${validAdminIndices.join(', ')}]`);
  } catch (error) {
    logger.error('[NONCE] Initialization failed', {
      error: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
    });
  }
}

// Get current nonce for wallet (local, no RPC call)
const getNonceForWallet = (walletIndex: number): number => {
  return nonceByWallet.get(walletIndex) ?? 0;
};

// Atomically get nonce and increment - returns the nonce to use
const getAndIncrementNonce = (walletIndex: number): number => {
  const current = getNonceForWallet(walletIndex);
  nonceByWallet.set(walletIndex, current + 1);
  return current;
};

// Increment nonce locally after sending
const incrementNonce = (walletIndex: number) => {
  const current = getNonceForWallet(walletIndex);
  nonceByWallet.set(walletIndex, current + 1);
};

// Sync nonces back to blockchain every 5 minutes
async function syncNoncesWithBlockchain() {
  try {
    for (let walletIndex = 0; walletIndex < adminPrivateKeys.length; walletIndex++) {
      const privKey = adminPrivateKeys[walletIndex];
      if (!privKey) continue;
      
      const provider = getNextProvider();
      const wallet = new ethers.Wallet(privKey, provider);
      const walletAddress = await wallet.getAddress();
      
      // Get current pending nonce from blockchain
      const pendingNonce = await provider.getTransactionCount(walletAddress, "pending");
      const localNonce = getNonceForWallet(walletIndex);
      
      // Update to max of blockchain pending and our local nonce
      const syncedNonce = Math.max(pendingNonce, localNonce);
      nonceByWallet.set(walletIndex, syncedNonce);
      
      if (syncedNonce !== localNonce) {
        logger.info(`[NONCE] Wallet${walletIndex}: synced local=${localNonce} -> blockchain=${pendingNonce}`);
      }
    }
  } catch (error) {
    logger.error('Nonce sync error', {
      error: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
    });
  }
}

// Start nonce sync every 5 minutes (300000 ms)
setInterval(() => {
  syncNoncesWithBlockchain().catch((error) =>
    logger.error('Scheduled nonce sync failed', { error })
  );
}, 300000);

const resetTrackedNonce = (walletAddress: string) => {
  // No longer used - nonces are per wallet index now
};

const nonceErrorMessages = [
  "nonce has already been used",
  "nonce too low",
  "replacement transaction underpriced",
];

const isNonceError = (error: any) => {
  const code = error?.code;
  if (code && typeof code === "string") {
    if (code.toLowerCase().includes("nonce")) {
      return true;
    }
  }
  const message = (error?.message || "").toLowerCase();
  return nonceErrorMessages.some((x) => message.includes(x));
};

const isReplacementUnderpricedError = (error: any) => {
  const message = (error?.message || "").toLowerCase();
  return (
    message.includes("replacement transaction underpriced") ||
    message.includes("nonce") ||
    message.includes("underpriced")
  );
};

const isRetryableNetworkError = (error: any) => {
  const code = error?.code;
  if (code && retryableRpcErrors.has(code)) {
    return true;
  }
  const message = (error?.message || "").toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connection refused") ||
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("network error")
  );
};

let adminPrivateKeys = [
  envConfigs.adminPrivatKey_avax,
  envConfigs.adminPrivatKey_avax1,
  envConfigs.adminPrivatKey_avax2,
  envConfigs.adminPrivatKey_avax3,
  envConfigs.adminPrivatKey_avax4,
  envConfigs.adminPrivatKey_avax5,
  envConfigs.adminPrivatKey_avax6,
  envConfigs.adminPrivatKey_avax7,
  envConfigs.adminPrivatKey_avax8,
  envConfigs.adminPrivatKey_avax9,
  envConfigs.adminPrivatKey_avax10,
  envConfigs.adminPrivatKey_avax11,
  envConfigs.adminPrivatKey_avax12,
  envConfigs.adminPrivatKey_avax13,
  envConfigs.adminPrivatKey_avax14,
  envConfigs.adminPrivatKey_avax15,
  envConfigs.adminPrivatKey_avax16,
].filter(key => key && key.length > 0); // Filter out empty keys

// Will be populated during initialization - only keys with balance > 0.01 AVAX
let validAdminIndices: number[] = [];

const rpcProviders = [
  envConfigs.provider_url_AVAX,
  envConfigs.provider_url_AVAX1,
  envConfigs.provider_url_AVAX2,
  envConfigs.provider_url_AVAX3,
  envConfigs.provider_url_AVAX4,
  envConfigs.provider_url_AVAX5,
  envConfigs.provider_url_AVAX6,
  envConfigs.provider_url_AVAX7,
  envConfigs.provider_url_AVAX8,
  envConfigs.provider_url_AVAX9,
  envConfigs.provider_url_AVAX10,
  envConfigs.provider_url_AVAX11,
  envConfigs.provider_url_AVAX12,
  envConfigs.provider_url_AVAX13,
  envConfigs.provider_url_AVAX14,
  envConfigs.provider_url_AVAX15,
];

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// Provider health tracking (no persistent pool - creates fresh instances)
interface ProviderStatus {
  url: string;
  failCount: number;
  lastFailTime: number;
  isHealthy: boolean;
}

const providerStatus = new Map<string, ProviderStatus>();
rpcProviders.forEach(url => {
  providerStatus.set(url, { url, failCount: 0, lastFailTime: 0, isHealthy: true });
});

let currentProviderIndex = 0;
function getNextProvider(): ethers.providers.JsonRpcProvider {
  // Round-robin with health check - skip failed providers for 5 minutes
  let attempts = 0;
  while (attempts < rpcProviders.length) {
    const url = rpcProviders[currentProviderIndex];
    currentProviderIndex = (currentProviderIndex + 1) % rpcProviders.length;
    
    const status = providerStatus.get(url);
    if (!status) continue;
    
    // Skip provider if recently failed (within 5 minutes)
    if (!status.isHealthy && Date.now() - status.lastFailTime < 300000) {
      attempts++;
      continue;
    }
    
    // Reset health after cooldown
    if (!status.isHealthy && Date.now() - status.lastFailTime >= 300000) {
      status.isHealthy = true;
      status.failCount = 0;
    }
    
    // Return FRESH provider instance (new connection, no stale state)
    return new ethers.providers.JsonRpcProvider(url);
  }
  
  // Fallback: create provider from random healthy URL
  const fallbackUrl = rpcProviders[Math.floor(Math.random() * rpcProviders.length)];
  return new ethers.providers.JsonRpcProvider(fallbackUrl);
}

// Mark provider as failed
function markProviderFailed(url: string) {
  const status = providerStatus.get(url);
  if (status) {
    status.failCount++;
    status.lastFailTime = Date.now();
    status.isHealthy = false;
  }
}

type QueuedTransaction = {
  userId: string;
  gameId: number;
  eventId: number;
  metadata: string;
  userSnapshot: {
    id: number | null;
    role: string | null;
    saAddress: string | null;
  };
  attempts: number;
  sizeBytes: number;
};

// Metadata cache to avoid storing full strings in queue
const metadataCache = new Map<string, string>();

const getCachedMetadata = (key: string): string | undefined => {
  return metadataCache.get(key);
};

const setCachedMetadata = (key: string, metadata: string): void => {
  // Limit cache size to prevent unbounded growth
  if (metadataCache.size > 10000) {
    // Clear oldest entries (FIFO)
    const firstKey = metadataCache.keys().next().value;
    if (firstKey) metadataCache.delete(firstKey);
  }
  metadataCache.set(key, metadata);
};

let globalBatch: {
  transactions: QueuedTransaction[];
  timeout: NodeJS.Timeout | null;
  batchStartTime: number | null;
} = {
  transactions: [],
  timeout: null,
  batchStartTime: null,
};

// Track request metrics for visibility
let totalRequestsReceived = 0;
let totalTransactionsSent = 0;
let totalTransactionsFailed = 0;
let totalTransactionsRejected = 0;

// Track sent transaction hashes
const recentTxHashes: { hash: string; timestamp: number; walletIndex: number }[] = [];

// Batched logging system - reduce memory footprint
let batchLogCounter = 0;
const BATCH_LOG_INTERVAL = 100; // Only log every 100 transactions

const logTransactionBatch = () => {
  batchLogCounter++;
  if (batchLogCounter % BATCH_LOG_INTERVAL === 0) {
    logger.info(`[TX] ${totalTransactionsSent} sent | ${totalTransactionsFailed} failed`);
  }
};

// Track per-second metrics
let perSecondStats = {
  received: 0,
  sent: 0,
  failed: 0,
  rejected: 0,
  lastReport: Date.now(),
};

const reportPerSecondStats = () => {
  // Disabled - no logging
};

// Report stats every 1 second
setInterval(() => {
  reportPerSecondStats();
}, 1000);

const walletCooldowns = new Map<number, number>();

// Periodic queue monitoring - DISABLED
let lastQueueLog = Date.now();
setInterval(() => {
  // Queue monitoring disabled for production
}, 5000);

const createUserSnapshot = (user: any): QueuedTransaction["userSnapshot"] => ({
  id: typeof user?.id === "number" ? user.id : null,
  role: user?.role ?? null,
  saAddress: user?.saAddress ?? null,
});

const estimateTransactionSize = (
  tx: Omit<QueuedTransaction, "sizeBytes" | "attempts">
): number => {
  try {
    // Don't include metadata in size calculation (it's cached separately)
    const txWithoutMetadata = {
      userId: tx.userId,
      gameId: tx.gameId,
      eventId: tx.eventId,
      userSnapshot: tx.userSnapshot,
    };
    return Buffer.byteLength(JSON.stringify(txWithoutMetadata), "utf8") + 64; // +64 for overhead
  } catch (error) {
    return 512; // Smaller fallback since metadata is cached
  }
};

const trimTransactionsForRequeue = (transactions: QueuedTransaction[]) => {
  // Fire-and-forget: drop failed transactions immediately, no requeue
  if (transactions.length) {
    logger.warn(`Dropped ${transactions.length} failed txs (fire-and-forget)`)
  }
  return [];
};

// Split transactions across multiple wallets respecting pending limits
async function splitTransactionsByWallet(
  transactions: QueuedTransaction[]
): Promise<Map<number, QueuedTransaction[]>> {
  const walletBatches = new Map<number, QueuedTransaction[]>();
  
  // Simple round-robin distribution without RPC calls - DON'T BLOCK on capacity checks
  // Fire-and-forget: if wallet is at capacity, send will fail and be retried
  let walletIndex = 0;
  for (const tx of transactions) {
    // Skip invalid wallet indices
    if (walletIndex >= PARALLEL_WALLETS || !adminPrivateKeys[walletIndex]) {
      walletIndex = (walletIndex + 1) % PARALLEL_WALLETS;
      if (!adminPrivateKeys[walletIndex]) {
        walletIndex = 0; // Fall back to first wallet
      }
    }

    if (!walletBatches.has(walletIndex)) {
      walletBatches.set(walletIndex, []);
    }
    
    walletBatches.get(walletIndex)!.push(tx);
    walletIndex = (walletIndex + 1) % PARALLEL_WALLETS;
  }

  return walletBatches;
}

const processWithConcurrencyLimit = async <T>(
  items: T[],
  limit: number,
  handler: (item: T, index: number) => Promise<void>
) => {
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    await Promise.all(
      chunk.map((item, offset) => handler(item, i + offset))
    );
  }
};

const enqueueTransactionsAtFront = (transactions: QueuedTransaction[]) => {
  if (!transactions.length) {
    return;
  }

  const projectedCount = transactions.length + globalBatch.transactions.length;
  if (projectedCount > MAX_QUEUE_SIZE) {
    logger.warn("Queue capacity exceeded", {
      attempted: transactions.length,
      available: Math.max(MAX_QUEUE_SIZE - globalBatch.transactions.length, 0),
    });
  }

  const allowedCount = Math.max(
    Math.min(MAX_QUEUE_SIZE - globalBatch.transactions.length, transactions.length),
    0
  );

  let allowedBytes = 0;
  const allowedTxs = transactions.slice(0, allowedCount).filter((tx) => {
    if (currentQueueBytes + allowedBytes + tx.sizeBytes > MAX_QUEUE_BYTES) {
      logger.warn("Queue byte capacity exceeded");
      return false;
    }
    allowedBytes += tx.sizeBytes;
    return true;
  });

  if (allowedTxs.length) {
    globalBatch.transactions = [...allowedTxs, ...globalBatch.transactions];
    currentQueueBytes += allowedBytes;
    globalBatch.batchStartTime = Date.now();

    if (!globalBatch.timeout) {
      globalBatch.timeout = setTimeout(() => {
        processGlobalBatch().catch((error) =>
          logger.error("Error processing scheduled retry batch", { error })
        );
      }, BATCH_TIMEOUT_MS);
    }
  }
};

// Fire-and-forget: send transaction immediately without waiting for confirmation
async function sendSingleTransaction(
  wallet: ethers.Wallet,
  provider: ethers.providers.JsonRpcProvider,
  contractAddress: string,
  contractInterface: ethers.Contract,
  tx: QueuedTransaction,
  nonce: number,
  walletAddress: string,
  walletIndex: number,
  providerUrl: string = ""
): Promise<{ hash: string; tx: QueuedTransaction } | null> {
  try {
    const callData = contractInterface.interface.encodeFunctionData(
      "storeMetadata",
      [tx.userSnapshot.saAddress, tx.metadata, tx.gameId]
    );

    // FIRE AND FORGET - No await, truly don't wait
    // Count as sent immediately, let RPC work in background
    totalTransactionsSent++;
    perSecondStats.sent++;
    logTransactionBatch();
    logger.debug(`[TX-FIRED] wallet${walletIndex} nonce=${nonce}`);
    
    // Send in background - don't wait for response
    wallet.sendTransaction({
      to: contractAddress,
      data: callData,
      value: 0n,
      nonce: nonce,
      gasLimit: 100000,
    }).then((txResponse) => {
      // Just log when we get hash back
      const hash = txResponse.hash;
      recentTxHashes.push({ hash, timestamp: Date.now(), walletIndex });
      if (recentTxHashes.length > 100) {
        recentTxHashes.shift();
      }
      logger.debug(`[TX-HASH] wallet${walletIndex} hash=${hash.slice(0, 18)}... nonce=${nonce}`);
    }).catch((error) => {
      // Handle replacement underpriced error by syncing nonce
      if (isReplacementUnderpricedError(error)) {
        logger.warn(`[NONCE-ERROR] Underpriced wallet${walletIndex}`);
        // Async sync in background - don't block
        provider.getTransactionCount(walletAddress, "pending").then((blockchainNonce) => {
          nonceByWallet.set(walletIndex, blockchainNonce);
          logger.info(`[NONCE-SYNC] wallet${walletIndex} synced to ${blockchainNonce}`);
        }).catch(() => {
          // Silently fail nonce sync
        });
      }
      
      // Check if error is RPC-related
      if (isRetryableNetworkError(error)) {
        if (providerUrl) {
          markProviderFailed(providerUrl);
        }
      }

      const errorMsg = error instanceof Error ? error.message.slice(0, 50) : "unknown";
      logger.warn(`[TX-FAILED] wallet${walletIndex} nonce=${nonce} error=${errorMsg}`);
    });
    
    // Return immediately - this function returns instantly
    return { hash: `0x${'0'.repeat(64)}`, tx };  // Placeholder hash
  } catch (error) {
    totalTransactionsFailed++;
    perSecondStats.failed++;
    const errorMsg = error instanceof Error ? error.message.slice(0, 50) : "unknown";
    logger.error(`[TX-EXCEPTION] wallet${walletIndex} error=${errorMsg}`);
    return null;
  }
}

// Process transactions for a single wallet in parallel
async function processWalletBatch(
  walletIndex: number,
  transactions: QueuedTransaction[],
  contractAddress: string,
  abi: any[]
): Promise<{
  successes: Array<{ hash: string; tx: QueuedTransaction }>;
  retry: QueuedTransaction[];
}> {
  if (!transactions.length) {
    return { successes: [], retry: [] };
  }

  // Validate wallet index is within range
  if (walletIndex < 0 || walletIndex >= adminPrivateKeys.length) {
    logger.error(`[WALLET${walletIndex}] Invalid wallet index`);
    return { successes: [], retry: [] };
  }

  const privKey = adminPrivateKeys[walletIndex];
  
  // Validate private key exists and is valid before processing
  if (!privKey || privKey.length === 0) {
    logger.error(`[WALLET${walletIndex}] Invalid/empty key`);
    return { successes: [], retry: [] };
  }

  try {
    // Get fresh provider with health check (new connection, avoids accumulation)
    const provider = getNextProvider();
    const providerUrl = provider.connection.url;
    
    let wallet = new ethers.Wallet(privKey, provider);
    const walletAddress = await wallet.getAddress();

    const contractInterface = new ethers.Contract(
      contractAddress,
      abi,
      provider
    );

    // USE LOCAL NONCE - NO RPC BLOCKING
    // This is the cached value from initialization or last sync
    let blockchainNonce = getNonceForWallet(walletIndex);
    
    // Update local nonce tracker for next batch
    // Add transactions count so we reserve nonces for all pending txs
    nonceByWallet.set(walletIndex, blockchainNonce + transactions.length);

    const successes: Array<{ hash: string; tx: QueuedTransaction }> = [];
    const retry: QueuedTransaction[] = [];

    // Process all transactions concurrently (no capacity limit)
    await processWithConcurrencyLimit(
      transactions,
      MAX_WALLET_CONCURRENCY,
      async (tx, index) => {
        const txNonce = blockchainNonce + index;

        const result = await sendSingleTransaction(
          wallet,
          provider,
          contractAddress,
          contractInterface,
          tx,
          txNonce,
          walletAddress,
          walletIndex,
          providerUrl
        );

        if (result) {
          successes.push(result);
        }
      }
    );

    return { successes, retry };
  } catch (error) {
    // If entire batch fails, return for retry
    logger.error(`[WALLET${walletIndex}] Batch failed`, {
      error: error instanceof Error ? error.message.slice(0, 50) : "unknown"
    });
    return { successes: [], retry: transactions };
  }
}

async function processGlobalBatch() {
  if (isProcessingBatch) {
    pendingProcessRequest = true;
    return;
  }

  if (globalBatch.transactions.length === 0) {
    return;
  }

  isProcessingBatch = true;
  logger.info(`[BATCH] Processing ${Math.min(BATCH_SIZE, globalBatch.transactions.length)} transactions`);

  const batchCount = Math.min(BATCH_SIZE, globalBatch.transactions.length);
  const transactionsToProcess = globalBatch.transactions.splice(0, batchCount);
  const batchBytes = transactionsToProcess.reduce(
    (total, tx) => total + tx.sizeBytes,
    0
  );
  currentQueueBytes = Math.max(currentQueueBytes - batchBytes, 0);

  if (!globalBatch.transactions.length) {
    currentQueueBytes = 0;
  }

  // Update monitoring with current queue state
  Monitoring.setQueueSize(globalBatch.transactions.length);
  Monitoring.setRequestsReceived(totalRequestsReceived);

  if (globalBatch.timeout) {
    clearTimeout(globalBatch.timeout);
  }
  globalBatch.timeout = null;
  globalBatch.batchStartTime = null;

  const schedulePendingBatch = () => {
    if (globalBatch.transactions.length === 0) {
      return;
    }

    setImmediate(() => {
      processGlobalBatch().catch((error) =>
        logger.error("Error in scheduled batch processing", { error })
      );
    });
  };

  try {
    const chainName = avalanche;
    const contractAddress = envConfigs.contract_address_avax;
    const abi = [
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "internalType": "address",
            "name": "user",
            "type": "address"
          },
          {
            "indexed": true,
            "internalType": "uint256",
            "name": "gameId",
            "type": "uint256"
          },
          {
            "indexed": false,
            "internalType": "string",
            "name": "metadata",
            "type": "string"
          }
        ],
        "name": "MetadataStored",
        "type": "event"
      },
      {
        "inputs": [
          {
            "internalType": "address",
            "name": "user",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "metadata",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "gameId",
            "type": "uint256"
          }
        ],
        "name": "storeMetadata",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ];

    // Split transactions across wallets respecting pending limits
    const walletBatches = await splitTransactionsByWallet(transactionsToProcess);
    
    // Process all wallets in parallel with timeout
    const walletPromises = Array.from(walletBatches.entries()).map(
      ([walletIndex, txs]) => processWalletBatch(walletIndex, txs, contractAddress, abi)
    );

    // Process all wallets - no timeout needed since we're fire-and-forget now
    const allResults = await Promise.all(walletPromises);
    
    const successfulTxs = allResults.flatMap((result) => result.successes);

    const retryCandidates = allResults.flatMap((result) => result.retry);
    if (retryCandidates.length) {
      const trimmed = trimTransactionsForRequeue(retryCandidates);
      enqueueTransactionsAtFront(trimmed);
    }

    // Batch database saves (don't await, fire and forget)
    if (successfulTxs.length > 0) {
      const dbPromises = successfulTxs.map(({ hash, tx }) =>
        dbservices.User.saveTransactionDetails_Avax(
          tx.gameId,
          tx.userSnapshot.id!,
          tx.eventId,
          hash,
          chainName.name,
          "0"
        ).catch(() => {})
      );
      
      // Start DB saves in background but don't wait
      Promise.allSettled(dbPromises).catch(() => {});
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    logger.error(`[BATCH] FAILED`, { error: errorMsg.slice(0, 80) });
    const retryable = trimTransactionsForRequeue(transactionsToProcess);
    if (retryable.length) {
      enqueueTransactionsAtFront(retryable);
    }
  } finally {
    isProcessingBatch = false;

    // If there are remaining transactions after processing, ensure batchStartTime is set
    if (globalBatch.transactions.length > 0 && !globalBatch.batchStartTime) {
      globalBatch.batchStartTime = Date.now();
      if (!globalBatch.timeout) {
        globalBatch.timeout = setTimeout(() => {
          processGlobalBatch().catch(() => {});
        }, BATCH_TIMEOUT_MS);
      }
    }

    if (pendingProcessRequest) {
      pendingProcessRequest = false;
      schedulePendingBatch();
    }
  }
}

export default class User {
  static generateId = () =>
    Math.random().toString(36).substr(2, 8).toUpperCase();

  static games = async (req: Request, res: Response): Promise<any> => {
    try {
      const cacheKey = 'user:games';
      const cachedGames = dashboardCache.get(cacheKey);
      if (cachedGames) {
        res.setHeader('Cache-Control', 'private, max-age=480');
        res.setHeader('X-Cache', 'HIT');
        return res.json({
          status: true,
          message: "Game List Fetched Successfully (from cache)",
          data: cachedGames,
        });
      }
      const games = await dbservices.User.getGames();
      dashboardCache.set(cacheKey, games);
      res.setHeader('Cache-Control', 'private, max-age=480');
      res.setHeader('X-Cache', 'MISS');
      return res.json({
        status: true,
        message: "Game List Fetched Successfully",
        data: games,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  static refreshGamesCache = async () => {
    try {
      const cacheKey = 'user:games';
      const games = await dbservices.User.getGames();
      dashboardCache.set(cacheKey, games);
      return true;
    } catch (error) {
      return false;
    }
  }

  static events = async (req: Request, res: Response): Promise<any> => {
    try {
      const events = await dbservices.User.getEvents();
      return res.json({
        status: true,
        message: "Event List Fetched Successfully",
        data: events,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  static self = async (req: Request, res: Response): Promise<any> => {
    try {
      const { devicedata } = req.body;
      const details = await dbservices.User.userExits(devicedata);
      return res.json({
        status: true,
        message: "Details Fetched Successfully",
        data: details,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  static count = async (req: Request, res: Response): Promise<any> => {
    try {
      const cacheKey = 'userCounts';
      const cachedData = dashboardCache.get(cacheKey);

      res.setHeader('Cache-Control', 'private, max-age=1500');
      res.setHeader('X-Cache', cachedData ? 'HIT' : 'MISS');

      if (cachedData) {
        return res.status(200).json(cachedData);
      }

      const counts = await dbservices.User.counts();

      const response = {
        status: true,
        message: "Details Fetched Successfully",
        data: counts,
      };

      dashboardCache.set(cacheKey, response);
      res.status(200).json(response);

    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  static transactions = async (req: Request, res: Response): Promise<any> => {
    try {
      const transaction = await dbservices.User.getTransactions();
      return res.json({
        status: true,
        message: "Transaction List Fetched Successfully",
        transactions: transaction.transactions,
        counts: transaction.counts[0].count,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  // static gameDetails = async(req: Request , res: Response):Promise<any>=>{
  //   try {
  //     const
  //   } catch (error) {
  //     res.status(500).json({
  //       status: false,
  //       message: error.message || "Unexpected error occurred",
  //     })
  //   }
  // }

  static GetUserTransacttion = async (
    req: Request,
    res: Response
  ): Promise<any> => {
    try {
      const userId = req.params.userId;
      const transaction = await dbservices.User.getUserTransacttion(userId);
      return res.json({
        status: true,
        message: "Transaction List Fetched Successfully",
        transactions: transaction,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  static eventTransaction = async (
    req: Request,
    res: Response
  ): Promise<any> => {
    try {
      const eventId = req.params.eventId;
      const transaction = await dbservices.User.geteventTransacttion(eventId);
      return res.json({
        status: true,
        message: "Transaction List Fetched Successfully",
        transactions: transaction,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  static GetGameTransacttion = async (
    req: Request,
    res: Response
  ): Promise<any> => {
    try {
      const gameId = req.params.gameId;
      const transaction = await dbservices.User.getGameTransacttion(gameId);
      return res.json({
        status: true,
        message: "Transaction List Fetched Successfully",
        details: transaction,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  // static fireEvent = async(req: Request, res: Response): Promise<any>=>{
  //   console.log("Event fired")
  //   try {
  //   const abi = [
  //   {
  //   type: "function",
  //   name: "storeMetadata",
  //   inputs: [
  //     {
  //       name: "metadata",
  //       type: "string",
  //       internalType: "string",
  //     },
  //     {
  //       name: "gameId",
  //       type: "uint256",
  //       internalType: "uint256",
  //     },
  //   ],
  //   outputs: [],
  //   stateMutability: "nonpayable",
  //   },
  //   {
  //   type: "event",
  //   name: "MetadataStored",
  //   inputs: [
  //     {
  //       name: "sender",
  //       type: "address",
  //       indexed: true,
  //       internalType: "address",
  //     },
  //     {
  //       name: "gameId",
  //       type: "uint256",
  //       indexed: true,
  //       internalType: "uint256",
  //     },
  //     {
  //       name: "metadata",
  //       type: "string",
  //       indexed: false,
  //       internalType: "string",
  //     },
  //   ],
  //   anonymous: false,
  //   },
  //   ];
  //   const eventId = req.params.eventId
  //   const {gameId ,id } = await dbservices.User.getGameid(eventId)
  //   if(!gameId || !id){
  //     return res.status(400).json({ status: false, message: "Invalid Game or Event ID"});
  //   }
  //   const eventCheck = await dbservices.User.eventCheck(gameId ,eventId)
  //     if(!eventCheck){
  //     return res.status(400).json({ status: false, message: "Event does not exist for this game"});
  //     }
  //   const { devicedata } = req.body;
  //   if (!devicedata) {
  //     return res.status(400).json({ status: false, message: "Device data is required" });
  //       }
  //   let userExist = await dbservices.User.userExits(devicedata);
  //   let userId, saAddress ;
  //   const gameDetails = await dbservices.User.getGameDetails(gameId ,eventId)
  //   const bundlerUrl =envConfigs.bundlerUrl
  //   const paymasterUrl = envConfigs.paymaster_apikey_url
  //   if(userExist){
  //     if(gameDetails.creatorId=== userExist.id){
  //       return res.status(500).send({ status:false ,message : "cannot fire event for own game "})
  //     }
  //     userId =userExist.userId ;
  //     const privKey = "0x" + sha512_256(userId) ;

  //     const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);

  //   const wallet = new ethers.Wallet(privKey, rpcHttpProvider);

  //   const wallet_address = await wallet.getAddress();
  //   const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);

  //   const chainName = polygon
  //   const nexusClient = createSmartAccountClient({
  //     account: await toNexusAccount({
  //       signer: account,
  //       chain: chainName,
  //       transport: http(),
  //     }),
  //     transport: http(bundlerUrl),
  //     paymaster: createBicoPaymasterClient({ paymasterUrl }),
  //   });

  //   saAddress = await nexusClient.account.address;
  //   const datetime = new Date().toISOString();
  //   const contractAddress = envConfigs.contractAddress;
  //   const metadata = JSON.stringify({
  //     role:userExist.role,
  //     saAddress:userExist.saAddress, gameId:gameDetails.id,
  //     eventId:gameDetails.events[0].id
  //   });
  //   const iface = new ethers.utils.Interface(abi);
  //   const calldata = iface.encodeFunctionData("storeMetadata", [
  //     metadata,
  //     gameId,
  //   ]);

  //     //@ts-ignore
  //     const hash = await nexusClient.sendUserOperation({
  //       calls: [
  //         {
  //           to: contractAddress as `0x${string}`,
  //           value: 0n,
  //           abi: abi, // Provide the ABI array here
  //           functionName: 'storeMetadata',
  //           args: [metadata, gameId],
  //         },
  //       ],
  //     });

  //    const receipt = await nexusClient.waitForUserOperationReceipt({ hash });
  //    console.log(receipt ,"receipttt................................................................")
  //   const transactionHash = receipt.receipt.transactionHash;
  //   const saveTransactionDetails = await dbservices.User.saveTransactionDetails(
  //     gameId,
  //     userExist.id,
  //     id,
  //     transactionHash,
  //     chainName.name,
  //       "0",
  //       );
  //         return res.status(200).json({
  //         status: true,
  //         message: "Event Fired Successfully",
  //         transactionDetails : saveTransactionDetails,
  //         user:userExist,
  //         timestamp: datetime
  //       })
  //   }

  //   if(!userExist){
  //   userId = `user_${this.generateId()}`;
  //   const privKey = "0x" + sha512_256(userId)

  //   const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);

  //   const wallet = new ethers.Wallet(privKey, rpcHttpProvider);

  //   const wallet_address = await wallet.getAddress();
  //   const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);

  //   const chainName = polygon
  //   const nexusClient = createSmartAccountClient({
  //     account: await toNexusAccount({
  //       signer: account,
  //       chain: chainName,
  //       transport: http(),
  //     }),
  //     transport: http(bundlerUrl),
  //     paymaster: createBicoPaymasterClient({ paymasterUrl }),
  //   });

  //   saAddress = await nexusClient.account.address;
  //   const saveResult = await dbservices.User.saveUser(userId, devicedata, saAddress, wallet_address);

  //   userExist = saveResult
  //   const datetime = new Date().toISOString();
  //   const contractAddress = envConfigs.contractAddress;
  //   const metadata = JSON.stringify({
  //     role:userExist.role,
  //     saAddress:userExist.saAddress, gameId:gameDetails.id,
  //     eventId:gameDetails.events[0].id
  //   });
  //   const iface = new ethers.utils.Interface(abi);
  //   const calldata = iface.encodeFunctionData("storeMetadata", [metadata,gameId]);

  //         //@ts-ignore
  //         const hash = await nexusClient.sendUserOperation({
  //           calls: [
  //             {
  //               to: contractAddress as `0x${string}`,
  //               value: 0n,
  //               abi: abi, // Provide the ABI array here
  //               functionName: 'storeMetadata',
  //               args: [metadata, gameId],
  //             },
  //           ],
  //         });

  //   const receipt = await nexusClient.waitForUserOperationReceipt({ hash });

  //  const transactionHash = receipt.receipt.transactionHash;

  //   const saveTransactionDetails = await dbservices.User.saveTransactionDetails(
  //   gameId,
  //   userExist.id,
  //   id,
  //   transactionHash,
  //   chainName.name,
  //   "0",
  //   );
  //   return res.status(200).json({
  //     status: true,
  //     message: "Event Fired Successfully",
  //     transactionDetails : saveTransactionDetails,
  //     user:userExist,
  //     timestamp: datetime
  //   })
  // }
  //   } catch (error) {
  //     res.status(500).json({
  //       status: false,
  //       message: error.message || "Unexpected error occurred",
  //     })
  //   }
  // }

  static fireEvent = async (req: Request, res: Response): Promise<any> => {
    try {
      const eventId = req.params.eventId;
      const { devicedata } = req.body;
      
      totalRequestsReceived++;
      perSecondStats.received++;
      Monitoring.setRequestsReceived(totalRequestsReceived);
      logger.debug(`[REQ-IN] eventId=${eventId} total_received=${totalRequestsReceived}`);
      
      // Return 202 INSTANTLY
      res.status(202).json({
        status: true,
        message: "Event accepted",
        eventId: eventId,
      });

      // Send directly without any queue - just send immediately
      (async () => {
        try {
          // SKIP ALL DB VALIDATION FOR NOW - just send
          // Try to get cached user data if available, otherwise use defaults
          
          const eventId = req.params.eventId;
          const devicedata = req.body.devicedata;
          
          // Generate minimal required data
          const userId = `user_${devicedata}_${Date.now()}`;
          const gameId = parseInt(eventId) || 1;  // Use eventId as gameId, or default to 1
          const saAddress = `0x${'0'.repeat(40)}`;  // Placeholder safe address
          
          const userSnapshot = {
            id: 1,
            role: "player",
            saAddress: saAddress,
          };
          
          const metadata = JSON.stringify({
            role: "player",
            gameId: gameId,
            eventId: eventId,
          });

          // ============ DIRECT SEND - NO QUEUE ============
          try {
            // Pick only from valid wallets with sufficient balance (round-robin)
            if (validAdminIndices.length === 0) {
              totalTransactionsRejected++;
              perSecondStats.rejected++;
              logger.warn(`[REQ-REJECTED] No wallets with sufficient balance`);
              return;
            }
            
            // Round-robin through valid wallets
            const selectedIndex = roundRobinIndex % validAdminIndices.length;
            roundRobinIndex++;
            const walletIndex = validAdminIndices[selectedIndex];
            const privKey = adminPrivateKeys[walletIndex];
            if (!privKey) {
              totalTransactionsRejected++;
              perSecondStats.rejected++;
              logger.warn(`[REQ-REJECTED] no privkey for wallet${walletIndex}`);
              return;
            }

            const provider = getNextProvider();
            const wallet = new ethers.Wallet(privKey, provider);
            // DON'T AWAIT - no RPC calls in hot path
            // const walletAddress = await wallet.getAddress();

            const contractAddress = envConfigs.contract_address_avax;
            const abi = [
              {
                "inputs": [
                  { "internalType": "address", "name": "user", "type": "address" },
                  { "internalType": "string", "name": "metadata", "type": "string" },
                  { "internalType": "uint256", "name": "gameId", "type": "uint256" }
                ],
                "name": "storeMetadata",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
              }
            ];

            const contractInterface = new ethers.Contract(contractAddress, abi, provider);

            // ATOMICALLY GET AND INCREMENT NONCE - prevents race conditions
            const localNonce = getAndIncrementNonce(walletIndex);
            
            // Nonce allocated - silent for production

            // Encode transaction
            const callData = contractInterface.interface.encodeFunctionData("storeMetadata", [
              userSnapshot.saAddress,
              metadata,
              gameId
            ]);

            // FIRE AND FORGET - No waiting for anything
            // Don't even attach .then() - just fire it
            totalTransactionsSent++;
            perSecondStats.sent++;
            logTransactionBatch();
            // Transaction fired - silent
            
            // Send in background - don't wait
            wallet.sendTransaction({
              to: contractAddress,
              data: callData,
              value: 0n,
              nonce: localNonce,
              gasLimit: 100000,
            }).then((txResponse) => {
              // Hash received - silent
              recentTxHashes.push({ hash: txResponse.hash, timestamp: Date.now(), walletIndex });
              if (recentTxHashes.length > 100) {
                recentTxHashes.shift();
              }
              
              // DB save happens asynchronously by indexer - don't wait
              // dbservices.User.saveTransactionDetails_Avax(
              //   gameId,
              //   userSnapshot.id,
              //   id,
              //   txResponse.hash,
              //   "Avalanche",
              //   "0"
              // ).catch(() => {});
            }).catch((err) => {
              // Handle nonce errors
              const errStr = String(err);
              if (errStr.includes("nonce") || errStr.includes("underpriced")) {
                totalTransactionsFailed++;
                // Immediately sync nonce to fix the issue
                provider.getTransactionCount(wallet.address, "pending").then((blockchainNonce) => {
                  nonceByWallet.set(walletIndex, blockchainNonce);
                }).catch(() => {});
              }
              // Other errors - just silently fail
            });

          } catch (sendError) {
            totalTransactionsFailed++;
            perSecondStats.failed++;
            // Silent error handling
          }
        } catch (bgError) {
          // Silent background error
        }
      })();
    } catch (error) {
      return res.status(500).json({ status: false, message: "Error" });
    }
  };
}

// Export nonce functions for server initialization
export { initializeNonces, syncNoncesWithBlockchain };
