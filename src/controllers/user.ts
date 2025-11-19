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

// const BATCH_SIZE = 1; // Ensure every incoming event is its own on-chain transaction
// const BATCH_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
// const RPC_RETRY_DELAY_MS = 2_000;
// const MAX_PROVIDER_SWITCHES = 3;
// const MAX_TX_RETRIES = 3;
// const nonceTracker = new Map<string, number>();
// let isProcessingBatch = false;
// let pendingProcessRequest = false;
// const retryableRpcErrors = new Set([
//   "ETIMEDOUT",
//   "ECONNRESET",
//   "EHOSTUNREACH",
//   "ECONNABORTED",
//   "ETIMEOUT",
// ]);

// const delay = (ms: number) =>
//   new Promise((resolve) => {
//     setTimeout(resolve, ms);
//   });

// async function getTrackedNonce(
//   provider: ethers.providers.JsonRpcProvider,
//   walletAddress: string
// ) {
//   const pendingNonce = await provider.getTransactionCount(
//     walletAddress,
//     "pending"
//   );
//   const trackedNonce = nonceTracker.get(walletAddress);
//   const effectiveNonce =
//     trackedNonce !== undefined && trackedNonce >= pendingNonce
//       ? trackedNonce
//       : pendingNonce;
//   nonceTracker.set(walletAddress, effectiveNonce);
//   return effectiveNonce;
// }

// const markNonceUsed = (walletAddress: string, nonce: number) => {
//   nonceTracker.set(walletAddress, nonce + 1);
// };

// const resetTrackedNonce = (walletAddress: string) => {
//   nonceTracker.delete(walletAddress);
// };

// const nonceErrorMessages = [
//   "nonce has already been used",
//   "nonce too low",
//   "replacement transaction underpriced",
// ];

// const isNonceError = (error: any) => {
//   const code = error?.code;
//   if (code && typeof code === "string") {
//     if (code.toLowerCase().includes("nonce")) {
//       return true;
//     }
//   }
//   const message = (error?.message || "").toLowerCase();
//   return nonceErrorMessages.some((x) => message.includes(x));
// };

// const isRetryableNetworkError = (error: any) => {
//   const code = error?.code;
//   if (code && retryableRpcErrors.has(code)) {
//     return true;
//   }
//   const message = (error?.message || "").toLowerCase();
//   return (
//     message.includes("timeout") ||
//     message.includes("timed out") ||
//     message.includes("connection refused") ||
//     message.includes("429") ||
//     message.includes("rate limit") ||
//     message.includes("network error")
//   );
// };

// // Structure to track global batch

// const adminPrivateKeys = [
//   envConfigs.adminPrivatKey_avax,
//   envConfigs.adminPrivatKey_avax1,
//   envConfigs.adminPrivatKey_avax2,
//   envConfigs.adminPrivatKey_avax3,
//   envConfigs.adminPrivatKey_avax4,
//   envConfigs.adminPrivatKey_avax5,
//   envConfigs.adminPrivatKey_avax6,
//   envConfigs.adminPrivatKey_avax7,
// ];

// const rpcProviders = [
//  envConfigs.provider_url_AVAX,
//  envConfigs.provider_url_AVAX1,
//  envConfigs.provider_url_AVAX2,
//  envConfigs.provider_url_AVAX3,
//  envConfigs.provider_url_AVAX4,
//  envConfigs.provider_url_AVAX5,
//  envConfigs.provider_url_AVAX6,
//  envConfigs.provider_url_AVAX7,
//  envConfigs.provider_url_AVAX8,
//  envConfigs.provider_url_AVAX9,
//  envConfigs.provider_url_AVAX10,
//  envConfigs.provider_url_AVAX11,
//  envConfigs.provider_url_AVAX12,
//  envConfigs.provider_url_AVAX13,
//  envConfigs.provider_url_AVAX14,
//  envConfigs.provider_url_AVAX15,
// ];

// // Function to get random element from array
// function getRandomElement<T>(array: T[]): T {
//   return array[Math.floor(Math.random() * array.length)];
// }

// let currentKeyIndex = 0;

// function getNextAdminKey(): string {
//   const key = adminPrivateKeys[currentKeyIndex];
//   currentKeyIndex = (currentKeyIndex + 1) % adminPrivateKeys.length;
//   return key;
// }


// let globalBatch: {
//   transactions: {
//     userId: string;
//     gameId: number;
//     eventId: number;
//     metadata: string;
//     userData: any;
//   }[];
//   timeout: NodeJS.Timeout | null;
//   batchStartTime: number | null;
// } = {
//   transactions: [],
//   timeout: null,
//   batchStartTime: null,
// };

// // Helper function to process a single user's batch

// async function processGlobalBatch() {
//   if (isProcessingBatch) {
//     pendingProcessRequest = true;
//     return;
//   }

//   if (globalBatch.transactions.length === 0) {
//     return;
//   }

//   isProcessingBatch = true;

//   const transactionsToProcess = [...globalBatch.transactions];
//   globalBatch.transactions = [];
//   if (globalBatch.timeout) {
//     clearTimeout(globalBatch.timeout);
//   }
//   globalBatch.timeout = null;
//   globalBatch.batchStartTime = null;

//   let processedCount = 0;
//   const transactionHashes: string[] = [];

//   const requeueTransactions = () => {
//     if (processedCount >= transactionsToProcess.length) {
//       return;
//     }

//     const remaining = transactionsToProcess.slice(processedCount);
//     if (remaining.length === 0) {
//       return;
//     }

//     globalBatch.transactions = [...remaining, ...globalBatch.transactions];
//     globalBatch.batchStartTime = Date.now();

//     if (globalBatch.timeout) {
//       clearTimeout(globalBatch.timeout);
//     }

//     globalBatch.timeout = setTimeout(() => {
//       processGlobalBatch().catch((error) =>
//         logger.error("Error processing re-queued batch", { error })
//       );
//     }, BATCH_TIMEOUT_MS);
//   };

//   const schedulePendingBatch = () => {
//     if (globalBatch.transactions.length === 0) {
//       return;
//     }

//     setImmediate(() => {
//       processGlobalBatch().catch((error) =>
//         logger.error("Error in scheduled batch processing", { error })
//       );
//     });
//   };

//   try {
//     const privKey = getNextAdminKey();
//     // console.log(privKey, "privvvvvvvvvvvvvvvvv");

//     let providerSwitchCount = 0;
//     let rpcUrl = getRandomElement(rpcProviders);
//     let rpcHttpProvider: ethers.providers.JsonRpcProvider | null = null;

//     while (!rpcHttpProvider && providerSwitchCount <= MAX_PROVIDER_SWITCHES) {
//       try {
//         rpcHttpProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
//         await rpcHttpProvider.getNetwork();
//       } catch (providerError) {
//         logger.warn("Failed to initialise RPC provider", {
//           rpcUrl,
//           providerSwitchCount,
//           error: providerError,
//         });
//         providerSwitchCount += 1;
//         if (providerSwitchCount > MAX_PROVIDER_SWITCHES) {
//           throw providerError;
//         }
//         await delay(RPC_RETRY_DELAY_MS * providerSwitchCount);
//         rpcUrl = getRandomElement(rpcProviders);
//       }
//     }

//     if (!rpcHttpProvider) {
//       throw new Error("Unable to initialise RPC provider");
//     }

//     // console.log("Using RPC provider:", rpcUrl);

//     const createWalletWithProvider = () =>
//       new ethers.Wallet(privKey, rpcHttpProvider!);

//     let wallet = createWalletWithProvider();
//     const wallet_address = await wallet.getAddress();

//     // console.log("Using admin wallet:", wallet_address);

//     const chainName = avalanche;

//     const contractAddress = envConfigs.contract_address_avax;
//     const abi = [
//       {
//         "anonymous": false,
//         "inputs": [
//           {
//             "indexed": true,
//             "internalType": "address",
//             "name": "user",
//             "type": "address"
//           },
//           {
//             "indexed": true,
//             "internalType": "uint256",
//             "name": "gameId",
//             "type": "uint256"
//           },
//           {
//             "indexed": false,
//             "internalType": "string",
//             "name": "metadata",
//             "type": "string"
//           }
//         ],
//         "name": "MetadataStored",
//         "type": "event"
//       },
//       {
//         "inputs": [
//           {
//             "internalType": "address",
//             "name": "user",
//             "type": "address"
//           },
//           {
//             "internalType": "string",
//             "name": "metadata",
//             "type": "string"
//           },
//           {
//             "internalType": "uint256",
//             "name": "gameId",
//             "type": "uint256"
//           }
//         ],
//         "name": "storeMetadata",
//         "outputs": [],
//         "stateMutability": "nonpayable",
//         "type": "function"
//       }
//     ];

//     const contractInterface = new ethers.Contract(
//       contractAddress,
//       abi,
//       rpcHttpProvider
//     );

//     let nonce = await getTrackedNonce(rpcHttpProvider, wallet_address);
//     // console.log(nonce, "nnceeee");

//     for (let index = 0; index < transactionsToProcess.length; index++) {
//       const tx = transactionsToProcess[index];
//       const callData = contractInterface.interface.encodeFunctionData(
//         "storeMetadata",
//         [
//           tx.userData.saAddress,
//           tx.metadata,
//           tx.gameId,
//         ]
//       );

//       // Track nonce immediately without waiting for success
//       markNonceUsed(wallet_address, nonce);
//       const currentNonce = nonce;
//       nonce += 1;
//       processedCount += 1;

//       wallet.sendTransaction({
//         to: contractAddress,
//         data: callData,
//         value: 0n,
//         nonce: currentNonce,
//       }).then((trx) => {
//         // console.log(trx.hash ,"...................hah cominggggg...");
//         transactionHashes.push(trx.hash);
//       }).catch((error) => {
//         logger.error("Error sending transaction", {
//           wallet: wallet_address,
//           nonce: currentNonce,
//           rpcUrl,
//           error,
//         });

//         if (isNonceError(error)) {
//           resetTrackedNonce(wallet_address);
//           // Note: Nonce tracking is already updated, so we continue
//         }

//         if (isRetryableNetworkError(error) && providerSwitchCount < MAX_PROVIDER_SWITCHES) {
//           providerSwitchCount += 1;
//           delay(RPC_RETRY_DELAY_MS * providerSwitchCount).then(() => {
//             rpcUrl = getRandomElement(rpcProviders);
//             rpcHttpProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
//             wallet = createWalletWithProvider();
//             logger.warn("Switched RPC provider due to retryable error", {
//               wallet: wallet_address,
//               rpcUrl,
//               providerSwitchCount,
//             });
//           });
//         } else {
//           // If we can't retry, log the error
//           logger.error("Transaction failed and cannot be retried", {
//             wallet: wallet_address,
//             nonce: currentNonce,
//             error,
//           });
//         }
//       });
//     }

//     // if (transactionHashes.length > 0) {
//     //   console.log(
//     //     "Last transaction hash:",
//     //     transactionHashes[transactionHashes.length - 1]
//     //   );
//     // }

//     for (let index = 0; index < transactionsToProcess.length; index++) {
//       const tx = transactionsToProcess[index];
//       const hash = transactionHashes[index];
//       await dbservices.User.saveTransactionDetails_Avax(
//         tx.gameId,
//         tx.userData.id,
//         tx.eventId,
//         hash,
//         chainName.name,
//         "0"
//       );
//     }

//     logger.info(
//       `Successfully processed ${transactionsToProcess.length} transactions for admin wallet ${wallet_address}`,
//       {
//         rpc: rpcUrl,
//         hashes: transactionHashes,
//       }
//     );
//   } catch (error) {
//     console.error(`Error processing global batch:`, error);
//     requeueTransactions();
//   } finally {
//     isProcessingBatch = false;

//     if (pendingProcessRequest) {
//       pendingProcessRequest = false;
//       schedulePendingBatch();
//     }
//   }
// }


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
  if (noncesInitialized) return;
  
  logger.info('Initializing nonces from blockchain...');
  
  try {
    for (let walletIndex = 0; walletIndex < adminPrivateKeys.length; walletIndex++) {
      const privKey = adminPrivateKeys[walletIndex];
      if (!privKey) continue;
      
      const provider = getNextProvider();
      const wallet = new ethers.Wallet(privKey, provider);
      const walletAddress = await wallet.getAddress();
      
      // Get pending nonce from blockchain (includes pending transactions)
      const pendingNonce = await provider.getTransactionCount(walletAddress, "pending");
      nonceByWallet.set(walletIndex, pendingNonce);
      
      logger.info(`Wallet ${walletIndex} (${walletAddress.slice(0, 8)}): initialized nonce=${pendingNonce}`);
    }
    
    noncesInitialized = true;
    logger.info('Nonce initialization complete');
  } catch (error) {
    logger.error('Error initializing nonces', {
      error: error instanceof Error ? error.message.slice(0, 100) : 'unknown',
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
    const callData = contractInterface.interface.encodeFunctionData(
      "storeMetadata",
      [tx.userSnapshot.saAddress, tx.metadata, tx.gameId]
    );

    // Send transaction immediately without waiting for confirmation
    const txResponse = await wallet.sendTransaction({
      to: contractAddress,
      data: callData,
      value: 0n,
      nonce: nonce,
      gasLimit: 100000,
    });

    // Increment sent counter and log immediately with hash
    totalTransactionsSent++;
    logger.info(`TX sent hash=${txResponse.hash.slice(0, 12)} nonce=${nonce} wallet=${walletAddress.slice(0, 8)}`);
    return { hash: txResponse.hash, tx };
  } catch (error) {
    // Log error but don't retry - fire and forget
    totalTransactionsFailed++;
    logger.warn(`TX send failed nonce=${nonce}`, { 
      error: error instanceof Error ? error.message.slice(0, 100) : "unknown"
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
  if (!transactions.length) {
    return { successes: [], retry: [] };
  }

  // Validate wallet index is within range
  if (walletIndex < 0 || walletIndex >= adminPrivateKeys.length) {
    logger.error(`Invalid wallet index ${walletIndex} (available: ${adminPrivateKeys.length})`);
    return { successes: [], retry: [] };
  }

  const privKey = adminPrivateKeys[walletIndex];
  
  // Validate private key exists and is valid before processing
  if (!privKey || privKey.length === 0) {
    logger.error(`Admin wallet ${walletIndex} has invalid/empty private key`);
    return { successes: [], retry: [] };
  }

  const provider = getNextProvider();
  let wallet = new ethers.Wallet(privKey, provider);
  const walletAddress = await wallet.getAddress();

  const contractInterface = new ethers.Contract(
    contractAddress,
    abi,
    provider
  );

  // Get current nonce for this wallet (local, no RPC call) - initialized at startup
  let nonce = getNonceForWallet(walletIndex);

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
        logger.debug(`TX dropped: wallet=${walletIndex} nonce=${txNonce}`);
      }
    }
  );

  return { successes, retry };
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
    
    // Process all wallets in parallel
    const walletPromises = Array.from(walletBatches.entries()).map(
      ([walletIndex, txs]) =>
        processWalletBatch(walletIndex, txs, contractAddress, abi)
    );

    const allResults = await Promise.all(walletPromises);
    const successfulTxs = allResults.flatMap((result) => result.successes);

    const retryCandidates = allResults.flatMap((result) => result.retry);
    if (retryCandidates.length) {
      const trimmed = trimTransactionsForRequeue(retryCandidates);
      enqueueTransactionsAtFront(trimmed);
    }

    // Batch database saves - Don't await individual saves
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
    await Promise.allSettled(dbPromises);

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
    logger.error(`Batch processing error`, { 
      error: errorMsg.slice(0, 100),
      stack: errorStack.split('\n')[1] // Log just the next line of stack for context
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
    isProcessingBatch = false;

    // If there are remaining transactions after processing, ensure batchStartTime is set
    // This handles the case where transactions accumulated during processing
    if (globalBatch.transactions.length > 0 && !globalBatch.batchStartTime) {
      globalBatch.batchStartTime = Date.now();
      if (!globalBatch.timeout) {
        globalBatch.timeout = setTimeout(() => {
          processGlobalBatch();
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
      
      // RETURN 202 IMMEDIATELY - do all heavy work in background
      const transactionId = this.generateId();
      const timestamp = new Date().toISOString();
      
      // Increment request counter immediately
      totalRequestsReceived++;
      Monitoring.setRequestsReceived(totalRequestsReceived);
      
      logger.info(`Event received: eventId=${eventId} transactionId=${transactionId}`);
      
      // Return 202 INSTANTLY - do NOT wait for anything
      res.status(202).json({
        status: true,
        message: "Event accepted for processing",
        transactionId: transactionId,
        eventId: eventId,
        timestamp: timestamp,
      });

      // ============ ALL HEAVY WORK HAPPENS HERE IN BACKGROUND (NO AWAIT) ============
      // This function doesn't block the response
      (async () => {
        try {
          // Validate request
          if (!devicedata) {
            logger.warn(`Event rejected - no device data: eventId=${eventId}`);
            return;
          }

          // DB lookups
          const gameIdResult = await dbservices.User.getGameid(eventId);
          const { gameId, id } = gameIdResult;
          
          if (!gameId || !id) {
            logger.warn(`Event rejected - invalid game: eventId=${eventId}`);
            return;
          }

          let userExist = await dbservices.User.userExits(devicedata);
          const gameDetails = await dbservices.User.getGameDetails(gameId, eventId);

          if (!gameDetails) {
            logger.warn(`Event rejected - no game details: eventId=${eventId}`);
            return;
          }

          if (userExist && gameDetails.creatorId === userExist.id) {
            logger.warn(`Event rejected - creator firing own game: eventId=${eventId}`);
            return;
          }

          const userId = userExist ? userExist.userId : `user_${this.generateId()}`;

          // If user doesn't exist, create them (non-blocking background operation)
          if (!userExist) {
            try {
              const privKey = "0x" + sha512_256(userId);
              const rpcUrl = getRandomElement(rpcProviders);
              const rpcHttpProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
              const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
              const wallet_address = await wallet.getAddress();

              const modularSdk = new ModularSdk(privKey, {
                chainId: 43114, // XDC Mainnet
                bundlerProvider: new EtherspotBundler(
                  43114,
                  "etherspot_3ZmG9JseTT1MD3v9QgPezHKB"
                ),
              });

              const saAddress = await modularSdk.getCounterFactualAddress();
              const saveResult = await dbservices.User.saveUser(userId, devicedata, saAddress, wallet_address);

              if (!saveResult) {
                logger.error(`Failed to save new user: userId=${userId}`);
                return;
              }

              userExist = saveResult;
              logger.debug(`New user created: userId=${userId} eventId=${eventId}`);
            } catch (error) {
              logger.error(`Error creating user in background`, {
                error: error instanceof Error ? error.message.slice(0, 100) : "unknown",
                userId,
              });
              return;
            }
          }

          // Build transaction
          const userSnapshot = createUserSnapshot(userExist);

          if (userSnapshot.id === null || !userSnapshot.saAddress) {
            logger.error("User snapshot missing critical identifiers in background", {
              userId: userSnapshot.id,
              saAddress: userSnapshot.saAddress,
            });
            return;
          }

          const eventDetails = gameDetails?.events?.[0];
          if (!eventDetails) {
            logger.warn(`Event details unavailable: eventId=${eventId}`);
            return;
          }

          const metadata = JSON.stringify({
            role: userSnapshot.role,
            gameId: gameDetails.id,
            eventId: eventDetails.id,
          });

          // Check queue capacity
          if (globalBatch.transactions.length >= MAX_QUEUE_SIZE) {
            logger.warn("Queue full, dropping event", {
              eventId: eventId,
              queueSize: globalBatch.transactions.length,
            });
            return;
          }

          const newTransaction: QueuedTransaction = {
            userId,
            gameId,
            eventId: id,
            metadata,
            userSnapshot,
            attempts: 0,
            sizeBytes: estimateTransactionSize({
              userId,
              gameId,
              eventId: id,
              metadata,
              userSnapshot,
            }),
          };

          if (currentQueueBytes + newTransaction.sizeBytes > MAX_QUEUE_BYTES) {
            logger.warn("Queue byte pressure, dropping event", {
              eventId: eventId,
              queueBytes: currentQueueBytes,
              incomingBytes: newTransaction.sizeBytes,
            });
            return;
          }

          // Queue the transaction
          globalBatch.transactions.push(newTransaction);
          currentQueueBytes += newTransaction.sizeBytes;

          logger.info(`Event queued: eventId=${eventId} userId=${userId} queueSize=${globalBatch.transactions.length}`);

          // Start timer if this is the first transaction in batch AND not currently processing
          if (globalBatch.transactions.length === 1 && !isProcessingBatch) {
            globalBatch.batchStartTime = Date.now();
            globalBatch.timeout = setTimeout(() => {
              processGlobalBatch();
            }, BATCH_TIMEOUT_MS);
          }

          // Process immediately if batch size reached (fire-and-forget)
          if (globalBatch.transactions.length >= BATCH_SIZE) {
            if (globalBatch.timeout) {
              clearTimeout(globalBatch.timeout);
              globalBatch.timeout = null;
            }
            // Fire-and-forget: don't await
            processGlobalBatch().catch((error) => {
              logger.error("Background batch processing error", {
                error: error instanceof Error ? error.message.slice(0, 100) : "unknown",
              });
            });
          }
        } catch (bgError) {
          logger.error("Error in background event processing", {
            error: bgError instanceof Error ? bgError.message.slice(0, 100) : "unknown",
            eventId,
          });
        }
      })(); // Invoke immediately but don't await
    } catch (error) {
      logger.error("Error in fireEvent endpoint", { 
        error: error instanceof Error ? error.message.slice(0, 100) : "unknown" 
      });
      return res.status(500).json({
        status: false,
        message: "Internal server error",
      });
    }
  };
}

// Export nonce functions for server initialization
export { initializeNonces, syncNoncesWithBlockchain };
