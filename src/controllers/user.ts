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
].filter(key => key && key.length > 0).length;
const PARALLEL_WALLETS = Math.max(1, ADMIN_KEYS_CONFIG); // Use available keys, min 1
const MAX_WALLET_CONCURRENCY = 4; // Send up to 4 txs per wallet concurrently
const MAX_QUEUE_SIZE = 500; // Reduced from 1000 to control memory
const MAX_QUEUE_BYTES = 16 * 1024 * 1024; // Reduced from 32MB to 16MB
const MAX_REQUEUE_ATTEMPTS = 0; // No requeue - fire once and forget
const MAX_PENDING_PER_WALLET = 8; // Allow more pending per wallet
const WALLET_COOLDOWN_MS = 5_000; // Shorter cooldown

const nonceByWallet = new Map<number, number>();
let noncesInitialized = false;

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
    logger.info('[NONCE] Already initialized, skipping');
    return;
  }
  
  logger.info(`[NONCE] Initializing nonces for ${adminPrivateKeys.length} wallets...`);
  
  try {
    for (let walletIndex = 0; walletIndex < adminPrivateKeys.length; walletIndex++) {
      const privKey = adminPrivateKeys[walletIndex];
      if (!privKey) {
        logger.debug(`[NONCE] Wallet ${walletIndex}: no key, skipping`);
        continue;
      }
      
      const provider = getNextProvider();
      const wallet = new ethers.Wallet(privKey, provider);
      const walletAddress = await wallet.getAddress();
      
      // Get pending nonce from blockchain (includes pending transactions)
      const pendingNonce = await provider.getTransactionCount(walletAddress, "pending");
      nonceByWallet.set(walletIndex, pendingNonce);
      
      logger.info(`[NONCE] Wallet ${walletIndex} (${walletAddress.slice(0, 8)}...): nonce=${pendingNonce}`);
    }
    
    noncesInitialized = true;
    logger.info(`[NONCE] Initialization complete: ${nonceByWallet.size} wallets initialized`);
  } catch (error) {
    logger.error('[NONCE] Error initializing nonces', {
      error: error instanceof Error ? error.message.slice(0, 100) : 'unknown',
      stack: error instanceof Error ? error.stack?.split('\n')[1] : undefined,
    });
    // Continue anyway, nonces will be fetched on first use
  }
}

// Get current nonce for wallet (local, no RPC call)
const getNonceForWallet = (walletIndex: number): number => {
  return nonceByWallet.get(walletIndex) ?? 0;
};

// Increment nonce locally after sending
const incrementNonce = (walletIndex: number) => {
  const current = getNonceForWallet(walletIndex);
  nonceByWallet.set(walletIndex, current + 1);
};

// Sync nonces back to blockchain every 5 minutes
async function syncNoncesWithBlockchain() {
  logger.info('Syncing nonces with blockchain...');
  
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
        logger.info(`Nonce sync wallet ${walletIndex}: local=${localNonce} blockchain=${pendingNonce} synced=${syncedNonce}`);
      }
    }
    
    logger.info('Nonce sync complete');
  } catch (error) {
    logger.error('Error syncing nonces', {
      error: error instanceof Error ? error.message.slice(0, 100) : 'unknown',
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

const adminPrivateKeys = [
  envConfigs.adminPrivatKey_avax,
  envConfigs.adminPrivatKey_avax1,
  envConfigs.adminPrivatKey_avax2,
  envConfigs.adminPrivatKey_avax3,
  envConfigs.adminPrivatKey_avax4,
  envConfigs.adminPrivatKey_avax5,
  envConfigs.adminPrivatKey_avax6,
  envConfigs.adminPrivatKey_avax7,
].filter(key => key && key.length > 0); // Filter out empty keys

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

// Create persistent provider pool
const providerPool = rpcProviders.map(
  (url) => new ethers.providers.JsonRpcProvider(url)
);

let currentProviderIndex = 0;
function getNextProvider() {
  const provider = providerPool[currentProviderIndex];
  currentProviderIndex = (currentProviderIndex + 1) % providerPool.length;
  return provider;
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

const walletCooldowns = new Map<number, number>();

// Periodic queue monitoring - log queue state every 5 seconds during active processing
setInterval(() => {
  if (globalBatch.transactions.length > 0 || isProcessingBatch) {
    logger.info('Queue snapshot', {
      queueDepth: globalBatch.transactions.length,
      isProcessing: isProcessingBatch,
      totalRequests: totalRequestsReceived,
      totalSent: totalTransactionsSent,
      totalFailed: totalTransactionsFailed,
      uptime: Math.floor(process.uptime()),
    });
  }
}, 10000);

const createUserSnapshot = (user: any): QueuedTransaction["userSnapshot"] => ({
  id: typeof user?.id === "number" ? user.id : null,
  role: user?.role ?? null,
  saAddress: user?.saAddress ?? null,
});

const estimateTransactionSize = (
  tx: Omit<QueuedTransaction, "sizeBytes" | "attempts">
): number => {
  try {
    return Buffer.byteLength(JSON.stringify(tx), "utf8");
  } catch (error) {
    logger.warn("Failed to estimate transaction size", { error });
    return 1024; // fall back to 1KB
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
    logger.error("Queue length capacity hit while enqueueing", {
      attempted: transactions.length,
      allowed: Math.max(MAX_QUEUE_SIZE - globalBatch.transactions.length, 0),
    });
  }

  const allowedCount = Math.max(
    Math.min(MAX_QUEUE_SIZE - globalBatch.transactions.length, transactions.length),
    0
  );

  let allowedBytes = 0;
  const allowedTxs = transactions.slice(0, allowedCount).filter((tx) => {
    if (currentQueueBytes + allowedBytes + tx.sizeBytes > MAX_QUEUE_BYTES) {
      logger.error("Queue byte capacity hit while enqueueing retries", {
        attemptedBytes: tx.sizeBytes,
        currentQueueBytes,
      });
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
  walletAddress: string
): Promise<{ hash: string; tx: QueuedTransaction } | null> {
  try {
    logger.debug(`[TX] Encoding ${tx.gameId}/${tx.userId} nonce=${nonce}`);
    const callData = contractInterface.interface.encodeFunctionData(
      "storeMetadata",
      [tx.userSnapshot.saAddress, tx.metadata, tx.gameId]
    );

    // Send transaction immediately without waiting for confirmation
    logger.debug(`[TX] Sending nonce=${nonce}...`);
    const txResponse = await wallet.sendTransaction({
      to: contractAddress,
      data: callData,
      value: 0n,
      nonce: nonce,
      gasLimit: 100000,
    });

    // Increment sent counter and log immediately with hash
    totalTransactionsSent++;
    logger.info(`[TX] ✓ hash=${txResponse.hash.slice(0, 12)} nonce=${nonce} wallet=${walletAddress.slice(0, 8)}... total_sent=${totalTransactionsSent}`);
    return { hash: txResponse.hash, tx };
  } catch (error) {
    // Log error but don't retry - fire and forget
    totalTransactionsFailed++;
    logger.warn(`[TX] ✗ nonce=${nonce}`, { 
      error: error instanceof Error ? error.message.slice(0, 100) : "unknown",
      total_failed: totalTransactionsFailed
    });
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
  logger.debug(`[WALLET${walletIndex}] Processing ${transactions.length} txs`);

  if (!transactions.length) {
    logger.debug(`[WALLET${walletIndex}] Empty transaction list`);
    return { successes: [], retry: [] };
  }

  // Validate wallet index is within range
  if (walletIndex < 0 || walletIndex >= adminPrivateKeys.length) {
    logger.error(`[WALLET${walletIndex}] Invalid wallet index (available: ${adminPrivateKeys.length})`);
    return { successes: [], retry: [] };
  }

  const privKey = adminPrivateKeys[walletIndex];
  
  // Validate private key exists and is valid before processing
  if (!privKey || privKey.length === 0) {
    logger.error(`[WALLET${walletIndex}] Invalid/empty private key`);
    return { successes: [], retry: [] };
  }

  const provider = getNextProvider();
  let wallet = new ethers.Wallet(privKey, provider);
  const walletAddress = await wallet.getAddress();
  logger.debug(`[WALLET${walletIndex}] Wallet address: ${walletAddress.slice(0, 12)}...`);

  const contractInterface = new ethers.Contract(
    contractAddress,
    abi,
    provider
  );

  // Get current nonce for this wallet (local, no RPC call) - initialized at startup
  let nonce = getNonceForWallet(walletIndex);
  logger.info(`[WALLET${walletIndex}] Starting nonce: ${nonce}`);

  const successes: Array<{ hash: string; tx: QueuedTransaction }> = [];
  const retry: QueuedTransaction[] = [];

  // Process all transactions concurrently (no capacity limit)
  await processWithConcurrencyLimit(
    transactions,
    MAX_WALLET_CONCURRENCY,
    async (tx, index) => {
      const txNonce = nonce + index;
      incrementNonce(walletIndex);  // Increment locally, no RPC call

      const result = await sendSingleTransaction(
        wallet,
        provider,
        contractAddress,
        contractInterface,
        tx,
        txNonce,
        walletAddress
      );

      if (result) {
        successes.push(result);
      } else {
        // Drop failed transactions in fire-and-forget mode
        logger.debug(`[WALLET${walletIndex}] TX dropped: nonce=${txNonce}`);
      }
    }
  );

  logger.info(`[WALLET${walletIndex}] Complete: ${successes.length}/${transactions.length} successful`);
  return { successes, retry };
}

async function processGlobalBatch() {
  logger.debug(`[BATCH] Entry: isProcessing=${isProcessingBatch} queueSize=${globalBatch.transactions.length}`);

  if (isProcessingBatch) {
    logger.debug(`[BATCH] Already processing, setting pendingRequest=true`);
    pendingProcessRequest = true;
    return;
  }

  if (globalBatch.transactions.length === 0) {
    logger.debug(`[BATCH] Queue empty, returning`);
    return;
  }

  isProcessingBatch = true;
  logger.info(`[BATCH] START: Processing ${Math.min(BATCH_SIZE, globalBatch.transactions.length)} transactions`);

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

  logger.debug(`[BATCH] Extracted ${transactionsToProcess.length} txs, remaining queue=${globalBatch.transactions.length}`);

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
    logger.debug(`[BATCH] Starting wallet batch processing for ${transactionsToProcess.length} txs`);
    logger.debug(`[BATCH] Starting wallet batch processing for ${transactionsToProcess.length} txs`);
    
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

    logger.debug(`[BATCH] Calling splitTransactionsByWallet...`);
    // Split transactions across wallets respecting pending limits
    const walletBatches = await splitTransactionsByWallet(transactionsToProcess);
    logger.info(`[BATCH] Split into ${walletBatches.size} wallet batches: ${Array.from(walletBatches.entries()).map(([w, txs]) => `wallet${w}(${txs.length})`).join(', ')}`);
    
    // Process all wallets in parallel
    logger.debug(`[BATCH] Starting Promise.all for ${walletBatches.size} wallets...`);
    const walletPromises = Array.from(walletBatches.entries()).map(
      ([walletIndex, txs]) => {
        logger.debug(`[BATCH] Creating promise for wallet ${walletIndex} with ${txs.length} txs`);
        return processWalletBatch(walletIndex, txs, contractAddress, abi);
      }
    );

    logger.debug(`[BATCH] Awaiting Promise.all with ${walletPromises.length} promises...`);
    const allResults = await Promise.all(walletPromises);
    logger.info(`[BATCH] Promise.all resolved, got ${allResults.length} results`);
    
    const successfulTxs = allResults.flatMap((result) => result.successes);
    logger.info(`[BATCH] Total successful TXs: ${successfulTxs.length}`);

    const retryCandidates = allResults.flatMap((result) => result.retry);
    if (retryCandidates.length) {
      const trimmed = trimTransactionsForRequeue(retryCandidates);
      enqueueTransactionsAtFront(trimmed);
    }

    // Batch database saves - Don't await individual saves
    logger.debug(`[BATCH] Starting ${successfulTxs.length} database saves...`);
    const dbPromises = successfulTxs.map(({ hash, tx }) =>
      dbservices.User.saveTransactionDetails_Avax(
        tx.gameId,
        tx.userSnapshot.id!,
        tx.eventId,
        hash,
        chainName.name,
        "0"
      ).catch((error) => {
        logger.error("Database save failed", {
          gameId: tx.gameId,
          userId: tx.userSnapshot.id,
          hash,
          error,
        });
      })
    );

    // Fire and forget database saves, or await them all at once
    logger.debug(`[BATCH] Awaiting ${dbPromises.length} database saves...`);
    await Promise.allSettled(dbPromises);
    logger.info(`[BATCH] Database saves completed`);

    logger.info(
      `Successfully processed ${successfulTxs.length}/${transactionsToProcess.length} transactions across ${walletBatches.size} wallets`,
      {
        queueDepth: globalBatch.transactions.length,
        totalRequests: totalRequestsReceived,
        totalSent: totalTransactionsSent,
        totalFailed: totalTransactionsFailed,
      }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    logger.error(`[BATCH] FAILED at try block`, { 
      error: errorMsg.slice(0, 200),
      stack: errorStack.split('\n').slice(1, 3).join(' | ')
    });

    const retryable = trimTransactionsForRequeue(transactionsToProcess);

    if (!retryable.length) {
      globalBatch.batchStartTime = null;
      globalBatch.timeout = null;
      return;
    }

    const projectedSize = retryable.length + globalBatch.transactions.length;
    if (projectedSize > MAX_QUEUE_SIZE || currentQueueBytes > MAX_QUEUE_BYTES) {
      logger.error("Queue at capacity while requeueing failed transactions", {
        attempted: retryable.length,
        queueSize: globalBatch.transactions.length,
        queueBytes: currentQueueBytes,
      });
    }
    enqueueTransactionsAtFront(retryable);

    globalBatch.batchStartTime = Date.now();

    if (globalBatch.timeout) {
      clearTimeout(globalBatch.timeout);
    }

    globalBatch.timeout = setTimeout(() => {
      processGlobalBatch().catch((error) =>
        logger.error("Error processing re-queued batch", { error })
      );
    }, BATCH_TIMEOUT_MS);
  } finally {
    logger.debug(`[BATCH] Finally block: isProcessing=true->false`);
    isProcessingBatch = false;

    // If there are remaining transactions after processing, ensure batchStartTime is set
    // This handles the case where transactions accumulated during processing
    if (globalBatch.transactions.length > 0 && !globalBatch.batchStartTime) {
      logger.debug(`[BATCH] Scheduling next batch: ${globalBatch.transactions.length} remaining`);
      globalBatch.batchStartTime = Date.now();
      if (!globalBatch.timeout) {
        globalBatch.timeout = setTimeout(() => {
          processGlobalBatch();
        }, BATCH_TIMEOUT_MS);
      }
    }

    if (pendingProcessRequest) {
      logger.debug(`[BATCH] Pending request detected, scheduling next`);
      pendingProcessRequest = false;
      schedulePendingBatch();
    }

    logger.debug(`[BATCH] EXIT: isProcessing=false queueSize=${globalBatch.transactions.length}`);
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
      Monitoring.setRequestsReceived(totalRequestsReceived);
      
      // Return 202 INSTANTLY
      res.status(202).json({
        status: true,
        message: "Event accepted",
        eventId: eventId,
      });

      // Send directly without any queue - just send immediately
      (async () => {
        try {
          if (!devicedata) return;

          const gameIdResult = await dbservices.User.getGameid(eventId);
          const { gameId, id } = gameIdResult;
          
          if (!gameId || !id) return;

          let userExist = await dbservices.User.userExits(devicedata);
          const gameDetails = await dbservices.User.getGameDetails(gameId, eventId);

          if (!gameDetails || (userExist && gameDetails.creatorId === userExist.id)) return;

          const userId = userExist ? userExist.userId : `user_${this.generateId()}`;

          if (!userExist) {
            try {
              const privKey = "0x" + sha512_256(userId);
              const rpcUrl = getRandomElement(rpcProviders);
              const rpcHttpProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
              const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
              const wallet_address = await wallet.getAddress();

              const modularSdk = new ModularSdk(privKey, {
                chainId: 43114,
                bundlerProvider: new EtherspotBundler(43114, "etherspot_3ZmG9JseTT1MD3v9QgPezHKB"),
              });

              const saAddress = await modularSdk.getCounterFactualAddress();
              const saveResult = await dbservices.User.saveUser(userId, devicedata, saAddress, wallet_address);
              if (!saveResult) return;
              userExist = saveResult;
            } catch (error) {
              logger.error(`Error creating user`, { userId, error: String(error).slice(0, 50) });
              return;
            }
          }

          const userSnapshot = createUserSnapshot(userExist);
          if (!userSnapshot.id || !userSnapshot.saAddress) return;

          const eventDetails = gameDetails?.events?.[0];
          if (!eventDetails) return;

          const metadata = JSON.stringify({
            role: userSnapshot.role,
            gameId: gameDetails.id,
            eventId: eventDetails.id,
          });

          // ============ DIRECT SEND - NO QUEUE ============
          try {
            logger.info(`[SEND] START: eventId=${eventId} gameId=${gameId}`);
            
            // Pick random wallet
            const walletIndex = Math.floor(Math.random() * adminPrivateKeys.length);
            const privKey = adminPrivateKeys[walletIndex];
            if (!privKey) {
              logger.error(`[SEND] No key at index ${walletIndex}`);
              return;
            }

            const provider = getNextProvider();
            const wallet = new ethers.Wallet(privKey, provider);
            const walletAddress = await wallet.getAddress();

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

            // Get nonce from blockchain
            const nonce = await provider.getTransactionCount(walletAddress, "pending");
            logger.info(`[SEND] Got nonce=${nonce}`);

            // Encode and send
            const callData = contractInterface.interface.encodeFunctionData("storeMetadata", [
              userSnapshot.saAddress,
              metadata,
              gameId
            ]);

            logger.info(`[SEND] Sending tx...`);
            const txResponse = await wallet.sendTransaction({
              to: contractAddress,
              data: callData,
              value: 0n,
              nonce: nonce,
              gasLimit: 100000,
            });

            totalTransactionsSent++;
            logger.info(`[SEND] ✓ SUCCESS: hash=${txResponse.hash.slice(0, 16)} total=${totalTransactionsSent}`);

            // Save to DB async
            dbservices.User.saveTransactionDetails_Avax(
              gameId,
              userSnapshot.id,
              id,
              txResponse.hash,
              "Avalanche",
              "0"
            ).catch(e => logger.error(`DB save failed`, { error: String(e).slice(0, 50) }));

          } catch (sendError) {
            totalTransactionsFailed++;
            logger.error(`[SEND] ✗ FAILED`, {
              error: sendError instanceof Error ? sendError.message.slice(0, 100) : String(sendError).slice(0, 100),
              total_failed: totalTransactionsFailed,
            });
          }
        } catch (bgError) {
          logger.error(`[BG] Error`, { error: String(bgError).slice(0, 100) });
        }
      })();
    } catch (error) {
      logger.error("fireEvent error", { error: String(error).slice(0, 100) });
      return res.status(500).json({ status: false, message: "Error" });
    }
  };
}

// Export nonce functions for server initialization
export { initializeNonces, syncNoncesWithBlockchain };
