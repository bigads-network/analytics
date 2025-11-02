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


// Memory management settings
const MAX_QUEUE_SIZE = 1000; // Max transactions in globalBatch
const CHUNK_SIZE = 50; // Process this many at once
const MEMORY_CHECK_INTERVAL = 10000; // Check memory every 10s
const MAX_MEMORY_USAGE = 0.8; // Reject if memory > 80%

// Performance tuning
const BATCH_SIZE = 50;
const BATCH_TIMEOUT_MS = 30 * 1000; // Process every 30s
const RPC_RETRY_DELAY_MS = 2000;
const MAX_PROVIDER_SWITCHES = 3;
const MAX_TX_RETRIES = 3;
const PARALLEL_WALLETS = 8;
const MAX_CONCURRENT_TXS = 100;

// Memory tracking
let lastMemoryCheck = Date.now();
let isMemoryPressureHigh = false;

// Rate limiting / throttling settings
const TX_PER_SECOND = Number(process.env.TX_PER_SECOND) || 100; // global TPS target
const PER_WALLET_THROTTLE_MS = Math.max(0, Math.ceil(1000 / Math.max(1, Math.floor(TX_PER_SECOND / PARALLEL_WALLETS))));

// Global active sends counter to limit concurrent on-chain requests
let globalActiveTxs = 0;

async function waitForSlot() {
  while (globalActiveTxs >= MAX_CONCURRENT_TXS) {
    await delay(50);
  }
  globalActiveTxs += 1;
}

const nonceTracker = new Map<string, number>();
const walletLocks = new Map<string, boolean>();
let isProcessingBatch = false;
let pendingProcessRequest = false;

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

let globalBatch: {
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
  let retries = 0;
  let currentProvider = provider;

  while (retries < MAX_TX_RETRIES) {
    try {
      const callData = contractInterface.interface.encodeFunctionData(
        "storeMetadata",
        [tx.userData.saAddress, tx.metadata, tx.gameId]
      );

      // Wait for a global slot (protects memory and RPC concurrency)
      await waitForSlot();

      try {
        const txResponse = await wallet.sendTransaction({
          to: contractAddress,
          data: callData,
          value: 0n,
          nonce: nonce,
          gasLimit: 100000, // Set explicit gas limit
        });

        return { hash: txResponse.hash, tx };
      } finally {
        // release slot immediately after the send attempt is made
        globalActiveTxs = Math.max(0, globalActiveTxs - 1);
      }
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
  
  // Process transactions sequentially per wallet to preserve nonce order
  const results: Array<{ hash: string; tx: any } | null> = [];
  for (let index = 0; index < transactions.length; index++) {
    const tx = transactions[index];
    const txNonce = nonce + index;
    markNonceUsed(walletAddress, txNonce);

    try {
      const r = await sendSingleTransaction(
        wallet,
        provider,
        contractAddress,
        contractInterface,
        tx,
        txNonce,
        walletAddress
      );
      if (r) results.push(r);
    } catch (err) {
      logger.error("Error in per-wallet transaction send loop", { err });
    }

    // Throttle between sends to avoid burst memory/RPC pressure
    if (PER_WALLET_THROTTLE_MS > 0 && index + 1 < transactions.length) {
      await delay(PER_WALLET_THROTTLE_MS);
    }
  }

  return results.filter((r) => r !== null) as Array<{ hash: string; tx: any }>;
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

  const transactionsToProcess = [...globalBatch.transactions];
  globalBatch.transactions = [];
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

    // Process in smaller chunks to manage memory
    const successfulTxs: Array<{ hash: string; tx: any }> = [];
    
    for (let i = 0; i < transactionsToProcess.length; i += CHUNK_SIZE) {
      const chunk = transactionsToProcess.slice(i, i + CHUNK_SIZE);
      const walletBatches = splitTransactionsByWallet(chunk);
      
      // Process chunk across wallets
      const walletPromises = Array.from(walletBatches.entries()).map(
        ([walletIndex, txs]) => processWalletBatch(walletIndex, txs, contractAddress, abi)
      );

      const results = await Promise.all(walletPromises);
      const chunkResults = results.flat();
      
      // Save results and clear references
      successfulTxs.push(...chunkResults);
      
      // Clear chunk references
      chunk.length = 0;
      walletBatches.clear();
      
      // Brief delay to allow GC
      if (i + CHUNK_SIZE < transactionsToProcess.length) {
        await delay(100);
      }
    }

    // Clear the source array
    transactionsToProcess.length = 0;

    // Process DB saves in chunks too
    for (let i = 0; i < successfulTxs.length; i += CHUNK_SIZE) {
      const chunk = successfulTxs.slice(i, i + CHUNK_SIZE);
      const dbPromises = chunk.map(({ hash, tx }) =>
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

      await Promise.allSettled(dbPromises);
      
      // Clear chunk references
      chunk.forEach(item => {
        if (item) {
          item.tx = null;
        }
      });
      chunk.length = 0;

      // Brief delay between chunks
      if (i + CHUNK_SIZE < successfulTxs.length) {
        await delay(100);
      }
    }

    // No pending dbPromises here (they are awaited per-chunk above)

    logger.info(
      `Successfully processed ${successfulTxs.length}/${transactionsToProcess.length} transactions`,
      {
        hashes: successfulTxs.map((r) => r.hash),
      }
    );
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

  // Check memory pressure
  static checkMemoryPressure(): boolean {
    const now = Date.now();
    if (now - lastMemoryCheck > MEMORY_CHECK_INTERVAL) {
      if (global.gc) {
        // Suggest garbage collection when checking memory
        global.gc();
      }

      const memUsage = process.memoryUsage();
      const heapUsed = memUsage.heapUsed;
      const heapTotal = memUsage.heapTotal;
      const memoryUsageRatio = heapUsed / heapTotal;

      isMemoryPressureHigh = memoryUsageRatio > MAX_MEMORY_USAGE;
      lastMemoryCheck = now;

      if (isMemoryPressureHigh) {
        logger.warn("High memory pressure detected", {
          heapUsed: Math.round(heapUsed / 1024 / 1024) + "MB",
          heapTotal: Math.round(heapTotal / 1024 / 1024) + "MB", 
          usageRatio: Math.round(memoryUsageRatio * 100) + "%",
        });
      }
    }
    return isMemoryPressureHigh;
  }

  static fireEvent = async (req: Request, res: Response): Promise<any> => {
    try {
      // Check queue size and memory pressure
      if (globalBatch.transactions.length >= MAX_QUEUE_SIZE) {
        return res.status(503).json({
          status: false,
          message: "Event queue is full, please retry later",
          queueSize: globalBatch.transactions.length
        });
      }

      if (User.checkMemoryPressure()) {
        return res.status(503).json({
          status: false,
          message: "Server is under high memory pressure, please retry later"
        });
      }

      const eventId = req.params.eventId;
      const { gameId, id } = await dbservices.User.getGameid(eventId);
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
      if (!devicedata) {
        return res
          .status(400)
          .json({ status: false, message: "Device data is required" });
      }

      // console.log(devicedata)
      let userExist = await dbservices.User.userExits(devicedata);
      const gameDetails = await dbservices.User.getGameDetails(gameId, eventId);

      if (userExist) {
        if (gameDetails.creatorId === userExist.id) {
          return res
            .status(500)
            .send({ status: false, message: "Cannot fire event for own game" });
        }
      }

      const userId = userExist ? userExist.userId : `user_${this.generateId()}`;
      const datetime = new Date().toISOString();

      // If user doesn't exist, create them first
      if (!userExist) {
        // console.log("not exisssss")
        const privKey = "0x" + sha512_256(userId);
        // const privKey ="0x63a2075b2432ec19652761fa4d3c585bf5ccb6360c5a5666ebb2e2b63929cc41";
        const rpcUrl = getRandomElement(rpcProviders);
        const rpcHttpProvider= new ethers.providers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
        const wallet_address = await wallet.getAddress();
        if (!rpcHttpProvider) {
          return res
            .status(500)
            .json({ status: false, message: "Error creating RPC provider" });
        }
        if (!wallet) {
          return res
            .status(500)
            .json({ status: false, message: "Error creating wallet" });
        }

        // console.log(wallet_address, "wallet_address");
        // console.log(wallet_address ,"wallet addressssss")
        // return ;
        const chainName = avalanche;

        const modularSdk = new ModularSdk(privKey, {
          chainId: 43114, // XDC Mainnet
          bundlerProvider: new EtherspotBundler(
            43114,
            "etherspot_3ZmG9JseTT1MD3v9QgPezHKB"
          ),
        });

        const saAddress = await modularSdk.getCounterFactualAddress();
        // console.log(saAddress ,"Account................................");
        const saveResult = await dbservices.User.saveUser(userId, devicedata, saAddress, wallet_address);

        if (!saveResult) {
            throw new Error("Error saving user details");
        }

        userExist = saveResult;
        // userExist = await dbservices.User.saveUser(
        //   userId,
        //   devicedata,
        //   saAddress,
        //   wallet_address
        // );
      }

      const metadata = JSON.stringify({
        role: userExist?.role,
        // smartAccountAddress: userExist?.walletAddress,
        gameId: gameDetails.id,
        eventId: gameDetails.events[0].id,
      });

      // Add transaction to global batch — keep only minimal user info to reduce memory
      const minimalUserData = {
        id: userExist.id,
        saAddress: userExist.saAddress,
        role: userExist.role,
      };

      globalBatch.transactions.push({
        userId,
        gameId,
        eventId: id,
        metadata,
        userData: minimalUserData,
      });

      // Remove heavy references early
      // @ts-ignore - allow clearing to free memory
      userExist = null;

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

      logger.info(
        ` current batch size:${globalBatch.transactions.length} with remaining time: ${remainingTime}`
      );
      // Immediate response with tracking information
      return res.status(202).json({
        status: true,
        message: "Event received and being processed",
        eventId: eventId,
        gameId: gameId,
        userId: userId,
        timestamp: datetime,
        // batchInfo: {
        //   currentBatchSize: globalBatch.transactions.length,
        //   batchStartedAt: new Date(globalBatch.batchStartTime!).toISOString(),
        //   willProcessIn:
        //     globalBatch.transactions.length >= BATCH_SIZE
        //       ? "Immediately (batch size reached)"
        //       : `${Math.ceil(remainingTime / 1000)} seconds`,
        // },
      });
    } catch (error) {
      console.error("Error in fireEvent:", error);
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };
}
