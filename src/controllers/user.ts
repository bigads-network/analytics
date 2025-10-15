import { Request, Response } from "express";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { sha512_256 } from "js-sha512";
import { ModularSdk } from "@etherspot/modular-sdk";
import { ethers } from "ethers";
import pLimit from "p-limit";
import {
  envConfigs,
} from "../config/envconfig";
import { generateGameToken } from "../config/gameToken";
import dbservices from "../services/dbservices";
import { avalanche, polygon, polygonAmoy, xdc } from "viem/chains";
import logger from "../config/logger";
import { dashboardCache } from "../config/cache";
import NodeCache from "node-cache";
import { rpc } from "viem/utils";
import {
  getCounterFactualAddress,
  withEtherspotClient,
} from "../services/etherspot";

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


const BATCH_SIZE = 50; // Smaller batches to spread load evenly per second
const BATCH_TIMEOUT_MS = 4000; // 1s cadence to steadily drain backlog
const RPC_RETRY_DELAY_MS = 2_000;
const MAX_PROVIDER_SWITCHES = 3;
const MAX_TX_RETRIES = 3;
const PARALLEL_WALLETS = 8; // Use more admin wallets if provided
const MAX_CONCURRENT_TXS = 100; // Tighter limiter to avoid overwhelming providers
const txLimiter = pLimit(MAX_CONCURRENT_TXS); // Concurrency limiter for transactions
const dbCache = new NodeCache({ stdTTL: 100, checkperiod: 100 }); // 30s TTL for DB lookups

const nonceTracker = new Map<string, number>();
const walletLocks = new Map<string, boolean>();
let isProcessingBatch = false;
let pendingProcessRequest = false;

// Lightweight in-memory provisioning queue for new users
type ProvisionJob = {
  userId: string;
  devicedata: any;
  gameId: number;
  eventDbId: number;
  metadata: string;
};

export const provisionQueue: ProvisionJob[] = [];
let activeProvisionWorkers = 0;
const MAX_PROVISION_CONCURRENCY = 8;
const MAX_QUEUE_SIZE = 500; // cap to avoid unbounded memory growth

async function processProvisionJob(job: ProvisionJob) {
  const { userId, devicedata, gameId, eventDbId, metadata } = job;
  try {
    const privKey = "0x" + sha512_256(userId);
    const wallet = new ethers.Wallet(privKey);
    const wallet_address = await wallet.getAddress();

    let saAddress: string;
    const saStart = Date.now();
    saAddress = await getCounterFactualAddress({
      privateKey: privKey,
      chainId: 43114,
    });
    const saEnd = Date.now();
    if (Math.floor(Math.random() * 20) === 0) logger.info("Provisioned SA (queue)", { userId, saTimeMs: saEnd - saStart });

    const saved = await dbservices.User.saveUser(
      userId,
      devicedata,
      saAddress,
      wallet_address
    );

    // Enqueue event to the transaction batch with the now-saved user
    globalBatch.transactions.push({
      userId,
      gameId,
      eventId: eventDbId,
      metadata,
      userData: saved,
    });

    if (globalBatch.transactions.length === 1) {
      globalBatch.batchStartTime = Date.now();
      globalBatch.timeout = setTimeout(() => {
        processGlobalBatch();
      }, BATCH_TIMEOUT_MS);
    }

    if (globalBatch.transactions.length >= BATCH_SIZE) {
      clearTimeout(globalBatch.timeout!);
      await processGlobalBatch();
    }
  } catch (error) {
    logger.error("Provisioning failed", { userId, error });
  }
}

async function drainProvisionQueue() {
  while (activeProvisionWorkers < MAX_PROVISION_CONCURRENCY && provisionQueue.length > 0) {
    const job = provisionQueue.shift()!;
    activeProvisionWorkers += 1;
    processProvisionJob(job)
      .catch((error) => logger.error("Provision job error", { error }))
      .finally(() => {
        activeProvisionWorkers -= 1;
        // Schedule next jobs
        setImmediate(() => drainProvisionQueue());
      });
  }
}

function enqueueProvision(job: ProvisionJob) {
  provisionQueue.push(job);
  // Kick the worker
  setImmediate(() => drainProvisionQueue());
}

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

async function getTrackedNonce(
  provider: ethers.providers.JsonRpcProvider,
  walletAddress: string
) {
  const pendingNonce = await provider.getTransactionCount(
    walletAddress,
    "pending"
  );
  const trackedNonce = nonceTracker.get(walletAddress);
  const effectiveNonce =
    trackedNonce !== undefined && trackedNonce >= pendingNonce
      ? trackedNonce
      : pendingNonce;
  nonceTracker.set(walletAddress, effectiveNonce);
  return effectiveNonce;
}

const markNonceUsed = (walletAddress: string, nonce: number) => {
  nonceTracker.set(walletAddress, nonce + 1);
};

const resetTrackedNonce = (walletAddress: string) => {
  nonceTracker.delete(walletAddress);
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
];

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

export let globalBatch: {
  transactions: {
    userId: string;
    gameId: number;
    eventId: number;
    metadata: string;
    userData: any;
  }[];
  timeout: NodeJS.Timeout | null;
  batchStartTime: number | null;
} = {
  transactions: [],
  timeout: null,
  batchStartTime: null,
};

const MAX_GLOBAL_QUEUE = 1000; // cap global batch queue size

// Split transactions across multiple wallets
function splitTransactionsByWallet(
  transactions: any[]
): Map<number, any[]> {
  const walletBatches = new Map<number, any[]>();
  
  transactions.forEach((tx, index) => {
    const walletIndex = index % PARALLEL_WALLETS;
    if (!walletBatches.has(walletIndex)) {
      walletBatches.set(walletIndex, []);
    }
    walletBatches.get(walletIndex)!.push(tx);
  });
  
  return walletBatches;
}

// Process single transaction with retry logic
async function sendSingleTransaction(
  wallet: ethers.Wallet,
  provider: ethers.providers.JsonRpcProvider,
  contractAddress: string,
  contractInterface: ethers.Contract,
  tx: any,
  nonce: number,
  walletAddress: string
): Promise<{ hash: string; tx: any } | null> {
  const txStart = Date.now();
  if (Math.floor(Math.random() * 20) === 0) logger.info("Sending transaction", { userId: tx.userId, nonce, wallet: walletAddress });
  let retries = 0;
  let currentProvider = provider;

  while (retries < MAX_TX_RETRIES) {
    try {
      const callData = contractInterface.interface.encodeFunctionData(
        "storeMetadata",
        [tx.userData.saAddress, tx.metadata, tx.gameId]
      );

      const txResponse = await txLimiter(() => wallet.sendTransaction({
        to: contractAddress,
        data: callData,
        value: 0n,
        nonce: nonce,
        gasLimit: 100000,
        maxFeePerGas: ethers.utils.parseUnits("2", "gwei"), // 10 gwei = current network + buffer
        maxPriorityFeePerGas: ethers.utils.parseUnits("0.2", "gwei"), // 2 gwei priority for faster confirmation
      }));

      const txEnd = Date.now();
      logger.info("Transaction sent", { hash: txResponse.hash, sendTimeMs: txEnd - txStart });
      return { hash: txResponse.hash, tx };
    } catch (error) {
      logger.error("Error sending transaction", {
        wallet: walletAddress,
        nonce,
        retry: retries,
        error,
      });

      if (isNonceError(error)) {
        resetTrackedNonce(walletAddress);
        return null; // Skip this transaction
      }

      if (isRetryableNetworkError(error) && retries < MAX_TX_RETRIES - 1) {
        retries++;
        await delay(RPC_RETRY_DELAY_MS * retries);
        
        // Switch provider
        currentProvider = getNextProvider();
        wallet = new ethers.Wallet(wallet.privateKey, currentProvider);
      } else {
        logger.error("Transaction failed after retries", {
          wallet: walletAddress,
          nonce,
          error,
        });
        return null;
      }
    }
  }
  
  return null;
}

// Process transactions for a single wallet in parallel
async function processWalletBatch(
  walletIndex: number,
  transactions: any[],
  contractAddress: string,
  abi: any[]
): Promise<Array<{ hash: string; tx: any }>> {
  const privKey = adminPrivateKeys[walletIndex];
  const provider = getNextProvider();
  
  let wallet = new ethers.Wallet(privKey, provider);
  const walletAddress = await wallet.getAddress();

  const contractInterface = new ethers.Contract(
    contractAddress,
    abi,
    provider
  );

  let nonce = await getTrackedNonce(provider, walletAddress);
  
  // Send all transactions in parallel with Promise.all (bounded by txLimiter)
  const txPromises = transactions.map(async (tx, index) => {
    const txNonce = nonce + index;
    markNonceUsed(walletAddress, txNonce);
    
    return sendSingleTransaction(
      wallet,
      provider,
      contractAddress,
      contractInterface,
      tx,
      txNonce,
      walletAddress
    );
  });

  const results = await Promise.all(txPromises);
  return results.filter((r) => r !== null) as Array<{ hash: string; tx: any }>;
}

async function processGlobalBatch() {
  if (Math.floor(Math.random() * 20) === 0) logger.info("processGlobalBatch called", { transactions: globalBatch.transactions.length, isProcessing: isProcessingBatch });
  if (isProcessingBatch) {
    pendingProcessRequest = true;
    logger.info("Batch already processing, request queued");
    return;
  }

  if (globalBatch.transactions.length === 0) {
    logger.info("No transactions to process");
    return;
  }

  const batchStartTime = Date.now();
  logger.info("Starting batch processing", { batchSize: globalBatch.transactions.length, startTime: batchStartTime });
  isProcessingBatch = true;

  // Strict chunking: process only up to BATCH_SIZE per run
  const transactionsToProcess = globalBatch.transactions.splice(0, Math.min(BATCH_SIZE, globalBatch.transactions.length));
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

    // Split transactions across wallets
    const walletBatches = splitTransactionsByWallet(transactionsToProcess);
    
    // Process all wallets in parallel
    const walletPromises = Array.from(walletBatches.entries()).map(
      ([walletIndex, txs]) =>
        processWalletBatch(walletIndex, txs, contractAddress, abi)
    );

    const allResults = await Promise.all(walletPromises);
    const successfulTxs = allResults.flat();

    // Batch database saves - Don't await individual saves
    const dbPromises = successfulTxs.map(({ hash, tx }) =>
      dbservices.User.saveTransactionDetails_Avax(
        tx.gameId,
        tx.userData.id,
        tx.eventId,
        hash,
        chainName.name,
        "0"
      ).catch((error) => {
        logger.error("Database save failed", {
          gameId: tx.gameId,
          userId: tx.userData.id,
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
        hashes: successfulTxs.map((r) => r.hash),
      }
    );
    const batchEndTime = Date.now();
    const processingTime = batchEndTime - batchStartTime;
    logger.info("Batch processing completed", { processingTimeMs: processingTime, tps: successfulTxs.length / (processingTime / 1000) });
  } catch (error) {
    console.error(`Error processing global batch:`, error);
    
    // Requeue failed transactions
    globalBatch.transactions = [...transactionsToProcess, ...globalBatch.transactions];
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
    const requestStart = Date.now();
  // Sample hot-path logs to reduce overhead (log 1 in ~20 requests)
  if (Math.floor(Math.random() * 20) === 0) {
    logger.info("fireEvent called", { eventId: req.params.eventId, timestamp: requestStart });
  }
    try {
      const eventId = req.params.eventId;
      const dbStart = Date.now();
      if (Math.floor(Math.random() * 20) === 0) logger.info("Getting game ID for event", { eventId });
      const { gameId, id } = await dbservices.User.getGameid(eventId);
      const dbEnd = Date.now();
      if (Math.floor(Math.random() * 20) === 0) logger.info("Game ID retrieved", { eventId, gameId, id, dbTimeMs: dbEnd - dbStart });
    //  console.log("step 1 - Enter");
      // if (!gameId || !id) {
      //   return res
      //     .status(400)
      //     .json({ status: false, message: "Invalid Game or Event ID" });
      // }

      // const eventCheck = await dbservices.User.eventCheck(gameId, eventId);
      // if (!eventCheck) {
      //   return res.status(400).json({
      //     status: false,
      //     message: "Event does not exist for this game",
      //   });
      // }

      // if (req.body?.devicedata?.OS && typeof req.body.devicedata.OS === 'string') {
      //   req.body.devicedata.OS = `${req.body.devicedata.OS} XDC`;
      // }
      
      const { devicedata } = req.body;
      if (Math.floor(Math.random() * 20) === 0) logger.info("Checking device data");
      if (!devicedata) {
        logger.warn("Device data missing");
        return res
          .status(400)
          .json({ status: false, message: "Device data is required" });
      }

      const userCheckStart = Date.now();
      if (Math.floor(Math.random() * 20) === 0) logger.info("Checking user exists");
      // Normalize and bound cache keys to avoid cardinality explosion
      const normOs = typeof devicedata?.OS === 'string' ? devicedata.OS.trim().toLowerCase() : '';
      const normDeviceId = typeof devicedata?.deviceId === 'string' ? devicedata.deviceId.trim().slice(0, 64) : '';
      const cacheKey = `userExits:${normOs}:${normDeviceId}`;
      let userExist = dbCache.get(cacheKey);
      if (!userExist) {
        userExist = await dbservices.User.userExits(devicedata);
        if (userExist) dbCache.set(cacheKey, userExist);
      }
      const userCheckEnd = Date.now();
      if (Math.floor(Math.random() * 20) === 0) logger.info("User check complete", { userExists: !!userExist, userCheckTimeMs: userCheckEnd - userCheckStart });
      const gameCacheKey = `gameDetails:${gameId}:${eventId}`;
      let gameDetails = dbCache.get(gameCacheKey);
      if (!gameDetails) {
        gameDetails = await dbservices.User.getGameDetails(gameId, eventId);
        if (gameDetails) dbCache.set(gameCacheKey, gameDetails);
      }

      if (userExist) {
        if ((gameDetails as any).creatorId === (userExist as any).id) {
          return res
            .status(500)
            .send({ status: false, message: "Cannot fire event for own game" });
        }
      }

      const userId = userExist ? (userExist as any).userId : `user_${this.generateId()}`;
      const datetime = new Date().toISOString();

      // If user doesn't exist, enqueue provisioning and return 202 immediately
      if (!userExist) {
        const queuedMetadata = JSON.stringify({
          role: undefined,
          gameId: (gameDetails as any).id,
          eventId: (gameDetails as any).events[0].id,
        });
         // If queue is saturated, accept but do not enqueue more (caller can retry)
         if (provisionQueue.length >= MAX_QUEUE_SIZE) {
           return res.status(202).json({
             status: true,
             message: "System is busy; provisioning deferred. Please retry shortly.",
             eventId: eventId,
             gameId: gameId,
             userId: userId,
             timestamp: new Date().toISOString(),
             queueInfo: { provisioningQueueLength: provisionQueue.length, maxQueue: MAX_QUEUE_SIZE },
           });
         }

         enqueueProvision({
          userId,
          devicedata,
          gameId,
          eventDbId: id,
          metadata: queuedMetadata,
        });

        const responseTime = Date.now() - requestStart;
        if (Math.floor(Math.random() * 20) === 0) logger.info("New user queued for provisioning", { userId, responseTimeMs: responseTime });

        return res.status(202).json({
          status: true,
          message: "User provisioning queued; event will be processed shortly",
          eventId: eventId,
          gameId: gameId,
          userId: userId,
          timestamp: new Date().toISOString(),
          queueInfo: {
            provisioningQueueLength: provisionQueue.length,
          },
        });
      }

      const metadata = JSON.stringify({
        role: (userExist as any)?.role,
        gameId: (gameDetails as any).id,
        eventId: (gameDetails as any).events[0].id,
      });

      // Add transaction to global batch
      if (Math.floor(Math.random() * 20) === 0) logger.info("Adding to batch", { userId, gameId, eventId: id, batchSize: globalBatch.transactions.length });
      // Guard global batch queue saturation
      if (globalBatch.transactions.length >= MAX_GLOBAL_QUEUE) {
        return res.status(202).json({
          status: true,
          message: "System is busy; event queued for later processing.",
          eventId: eventId,
          gameId: gameId,
          userId: userId,
          timestamp: datetime,
          queueInfo: { globalQueueLength: globalBatch.transactions.length, maxQueue: MAX_GLOBAL_QUEUE },
        });
      }

      globalBatch.transactions.push({
        userId,
        gameId,
        eventId: id,
        metadata,
        userData: userExist,
      });
      if (Math.floor(Math.random() * 20) === 0) logger.info("Transaction added to batch", { batchSize: globalBatch.transactions.length });

      // Start timer if this is the first transaction in batch
      if (globalBatch.transactions.length === 1) {
        globalBatch.batchStartTime = Date.now();
        globalBatch.timeout = setTimeout(() => {
          processGlobalBatch();
        }, BATCH_TIMEOUT_MS);
      }

      // Process immediately if batch size reached
      if (globalBatch.transactions.length >= BATCH_SIZE) {
        clearTimeout(globalBatch.timeout!);
        await processGlobalBatch();
      }

      // Calculate remaining time for response
      const remainingTime = globalBatch.batchStartTime
        ? BATCH_TIMEOUT_MS - (Date.now() - globalBatch.batchStartTime)
        : 0;

      // Immediate response with tracking information
      const responseTime = Date.now() - requestStart;
      if (Math.floor(Math.random() * 20) === 0) logger.info("fireEvent response sent", { eventId, gameId, userId, batchSize: globalBatch.transactions.length, totalRequestTimeMs: responseTime });
      return res.status(202).json({
        status: true,
        message: "Event received and being processed",
        eventId: eventId,
        gameId: gameId,
        userId: userId,
        timestamp: datetime,
        batchInfo: {
          currentBatchSize: globalBatch.transactions.length,
          willProcessIn:
            globalBatch.transactions.length >= BATCH_SIZE
              ? "Immediately (batch size reached)"
              : `${Math.ceil(remainingTime / 1000)} seconds`,
        },
      });
    } catch (error) {
      logger.error("Error in fireEvent:", { error: error.message, stack: error.stack, eventId: req.params.eventId });
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };
}
