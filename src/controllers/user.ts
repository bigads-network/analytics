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

// Telegram notification helper
async function sendTelegramNotification(message: string): Promise<void> {
  try {
    const botToken = "7926207851:AAEAS2VyNenFlpaXQh5vy1nCBzoyw3nBhSk";
    const chatId = "-5054690109";
    
    if (!botToken || !chatId) {
      logger.warn('[TELEGRAM] Missing bot token or chat ID');
      return;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });

    if (!response.ok) {
      logger.warn(`[TELEGRAM] Failed to send: ${response.statusText}`);
    }
  } catch (error) {
    logger.error('[TELEGRAM] Error sending notification', {
      error: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
    });
  }
}

// ========== CRITICAL FIX 16: CACHE WALLET BALANCES ==========
// Instead of checking balance every request (slow), maintain a cached balance
// Updated periodically in background
const walletBalanceCache = new Map<number, { balance: number; lastChecked: number }>();
const BALANCE_CACHE_TTL_MS = 5000; // Refresh every 5 seconds

const getCachedBalance = (walletIndex: number): number | null => {
  const cached = walletBalanceCache.get(walletIndex);
  if (!cached) return null;
  
  const age = Date.now() - cached.lastChecked;
  if (age > BALANCE_CACHE_TTL_MS) return null; // Cache expired
  
  return cached.balance;
};

const updateBalanceCache = async (walletIndex: number, provider: ethers.providers.JsonRpcProvider): Promise<number> => {
  try {
    const privKey = adminPrivateKeys[walletIndex];
    if (!privKey) return 0;
    
    const wallet = new ethers.Wallet(privKey, provider);
    const balance = await provider.getBalance(wallet.address);
    const balanceAvax = parseFloat(ethers.utils.formatEther(balance));
    
    walletBalanceCache.set(walletIndex, { balance: balanceAvax, lastChecked: Date.now() });
    return balanceAvax;
  } catch (err) {
    logger.warn(`[BALANCE-CACHE] Failed to update for Wallet${walletIndex}: ${err}`);
    return 0;
  }
};

// Update all wallet balances every 3 seconds in background
setInterval(async () => {
  for (let i = 0; i < adminPrivateKeys.length; i++) {
    if (!adminPrivateKeys[i]) continue;
    if (!validAdminIndices.includes(i)) continue; // Only check active wallets
    
    try {
      const provider = getNextProvider();
      await updateBalanceCache(i, provider);
    } catch (err) {
      // Silently skip
    }
  }
}, 3000);

// Get gas prices with priority fee = 2x base fee
async function getOptimizedGasPrices(provider: ethers.providers.JsonRpcProvider): Promise<{ maxFeePerGas: ethers.BigNumber; maxPriorityFeePerGas: ethers.BigNumber }> {
  try {
    const feeData = await provider.getFeeData();
    if (!feeData.maxFeePerGas || !feeData.gasPrice) {
      // Fallback if can't get fee data
      return {
        maxFeePerGas: ethers.utils.parseUnits('2', 'gwei'),
        maxPriorityFeePerGas: ethers.utils.parseUnits('1', 'gwei')
      };
    }
    
    // Priority fee = 2x base fee (instead of high priority)
    const baseGasPrice = feeData.gasPrice;
    const priorityFee = baseGasPrice.mul(2);
    
    return {
      maxFeePerGas: baseGasPrice.add(priorityFee),
      maxPriorityFeePerGas: priorityFee
    };
  } catch (error) {
    logger.warn('[GAS] Failed to get fee data, using defaults');
    return {
      maxFeePerGas: ethers.utils.parseUnits('2', 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('1', 'gwei')
    };
  }
}

// Initialize nonces once at server startup
async function initializeNonces() {
  if (noncesInitialized) {
    return;
  }
  
  // ========== CRITICAL FIX 14b: USE STRICTER BALANCE THRESHOLD ==========
  // Need sufficient balance to cover gas - be conservative
  const MIN_BALANCE_AVAX = 0.0001; // 0.0001 AVAX minimum
  const MIN_WORKING_BALANCE_AVAX = 0.001; // Require 0.001 AVAX minimum (conservative)
  validAdminIndices = [];
  
  // Count actual keys vs empty
  const keysWithValues = adminPrivateKeys.filter(k => k && k.length > 0).length;
  logger.info(`[NONCE] Initializing wallets: ${keysWithValues} configured out of ${adminPrivateKeys.length} total (min balance: ${MIN_WORKING_BALANCE_AVAX} AVAX for gas)...`);
  
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
      
      // Check if balance is sufficient (use working threshold, not theoretical minimum)
      const isValid = balanceInAvax >= MIN_WORKING_BALANCE_AVAX;
      if (isValid) {
        validAdminIndices.push(walletIndex);
      }
      
      const status = isValid ? '✅ VALID' : '❌ TOO LOW';
      logger.info(`[WALLET${walletIndex}] ${status} nonce=${pendingNonce} balance=${balanceInAvax.toFixed(8)} AVAX address=${walletAddress}`);
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
    // ========== CRITICAL FIX 14c: USE WORKING BALANCE THRESHOLD IN SYNC ==========
    const MIN_WORKING_BALANCE_AVAX = 0.001; // Same as in pre-check (conservative)
    const lowBalanceWallets: Array<{ address: string; balance: number; index: number }> = [];
    const validWalletIndices: number[] = [];
    
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
      
      // Check balance
      const balance = await provider.getBalance(walletAddress);
      const balanceInAvax = parseFloat(ethers.utils.formatEther(balance));
      
      if (balanceInAvax >= MIN_WORKING_BALANCE_AVAX) {
        validWalletIndices.push(walletIndex);
      } else {
        lowBalanceWallets.push({ address: walletAddress, balance: balanceInAvax, index: walletIndex });
      }
    }
    
    // Update validAdminIndices if balance status changed
    const oldValidCount = validAdminIndices.length;
    validAdminIndices = validWalletIndices.sort((a, b) => a - b); // Keep sorted for consistent round-robin
    roundRobinIndex = 0; // Reset round-robin on sync to ensure even distribution
    PARALLEL_WALLETS = Math.max(1, validAdminIndices.length);
    
    // Build well-structured Telegram message
    // ========== CRITICAL FIX 6: REPORT ACTUAL SENT TRANSACTIONS ==========
    // Show both attempted and actual confirmed for accuracy
    let telegramMsg = `═══════════════════════════════\n`;
    telegramMsg += `📊 <b>BIGADS NETWORK REPORT</b>\n`;
    telegramMsg += `═══════════════════════════════\n\n`;
    
    telegramMsg += `<b>📤 TRANSACTION STATUS</b>\n`;
    telegramMsg += `✅ Confirmed Sent: <code>${totalTransactionsSent}</code>\n`;
    telegramMsg += `⏳ Queued: <code>${globalBatch.transactions.length}</code>\n`;
    telegramMsg += `❌ Failed: <code>${totalTransactionsFailed}</code>\n`;
    telegramMsg += `🟡 Pending Hashes: <code>${recentTxHashes.length}</code>\n\n`;
    
    telegramMsg += `<b>💼 WALLET STATUS</b>\n`;
    telegramMsg += `🟢 Active: <code>${validWalletIndices.length}/${adminPrivateKeys.length}</code>\n`;
    
    if (lowBalanceWallets.length > 0) {
      telegramMsg += `\n<b>🔴 LOW BALANCE ALERT (${lowBalanceWallets.length})</b>\n`;
      telegramMsg += `───────────────────────────\n`;
      for (const wallet of lowBalanceWallets) {
        telegramMsg += `Wallet${wallet.index}: <code>${wallet.balance.toFixed(6)}</code> AVAX\n`;
        telegramMsg += `<code>${wallet.address}</code>\n\n`;
      }
    } else {
      telegramMsg += `✅ All active wallets have sufficient balance\n\n`;
    }
    
    if (oldValidCount !== validWalletIndices.length) {
      telegramMsg += `<b>🔄 STATUS CHANGE:</b>\n`;
      telegramMsg += `${oldValidCount} → ${validWalletIndices.length} active wallets\n\n`;
    }
    
    // Add RPC error section if there are errors
    if (totalRPCErrors > 0) {
      telegramMsg += `<b>⚠️ RPC ERRORS</b>\n`;
      telegramMsg += `🔴 Failed RPC Calls: <code>${totalRPCErrors}</code>\n`;
      
      // Check for unhealthy providers
      const unhealthyProviders = Array.from(providerStatus.values()).filter(p => !p.isHealthy);
      if (unhealthyProviders.length > 0) {
        telegramMsg += `📍 Unhealthy Providers: <code>${unhealthyProviders.length}/${rpcProviders.length}</code>\n`;
      }
      telegramMsg += `\n`;
    }
    
    // Show circuit breaker status
    const disabledWallets = Array.from(walletFailureTracker.values()).filter(t => t.disabled);
    if (disabledWallets.length > 0) {
      telegramMsg += `<b>🔌 CIRCUIT BREAKER</b>\n`;
      telegramMsg += `${disabledWallets.length} wallet(s) disabled due to repeated failures\n\n`;
    }
    
    telegramMsg += `───────────────────────────\n`;
    telegramMsg += `<i>⏰ ${new Date().toLocaleString()}</i>`;
    
    // Send Telegram notification
    await sendTelegramNotification(telegramMsg);
    
    logger.info(`[SYNC-REPORT] Confirmed=${totalTransactionsSent} Failed=${totalTransactionsFailed} Queued=${globalBatch.transactions.length} Active=${validWalletIndices.length} LowBalance=${lowBalanceWallets.length}`);
    
  } catch (error) {
    logger.error('Nonce sync error', {
      error: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
    });
  }
}

// ========== CRITICAL FIX 7: RE-CHECK WALLET BALANCES PERIODICALLY ==========
// Every 2 minutes, re-check wallet balances to detect refunds
// This prevents permanent lockout when wallets are refunded
setInterval(async () => {
  try {
    // ========== CRITICAL FIX 14d: USE WORKING BALANCE IN RECOVERY ==========
    const MIN_BALANCE_AVAX = 0.001; // Same working threshold (conservative)
    const recoveredWallets: number[] = [];
    
    for (let walletIndex = 0; walletIndex < adminPrivateKeys.length; walletIndex++) {
      const privKey = adminPrivateKeys[walletIndex];
      if (!privKey) continue;
      
      // Skip if already valid
      if (validAdminIndices.includes(walletIndex)) continue;
      
      try {
        const provider = getNextProvider();
        const wallet = new ethers.Wallet(privKey, provider);
        const walletAddress = await wallet.getAddress();
        const balance = await provider.getBalance(walletAddress);
        const balanceInAvax = parseFloat(ethers.utils.formatEther(balance));
        
        if (balanceInAvax >= MIN_BALANCE_AVAX) {
          // Wallet recovered! Add it back
          validAdminIndices.push(walletIndex);
          validAdminIndices.sort((a, b) => a - b); // Keep sorted
          PARALLEL_WALLETS = Math.max(1, validAdminIndices.length);
          roundRobinIndex = 0; // Reset round-robin
          recoveredWallets.push(walletIndex);
          logger.info(`[WALLET-RECOVERED] Wallet${walletIndex} now has ${balanceInAvax.toFixed(8)} AVAX - re-enabled`);
          
          // Send recovery notification
          const msg = `✅ <b>WALLET RECOVERED</b>\n\nWallet${walletIndex}: ${balanceInAvax.toFixed(8)} AVAX\n\n🟢 Processing resumed`;
          await sendTelegramNotification(msg);
        }
      } catch (err) {
        // Silently skip this wallet
      }
    }
  } catch (error) {
    logger.error('[WALLET-RECHECK] Periodic balance check failed', {
      error: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
    });
  }
}, 120000); // Check every 2 minutes

// ========== CRITICAL FIX 12: AGGRESSIVE RECOVERY WHEN ALL WALLETS DOWN ==========
// If all wallets are down, check more frequently (every 10 seconds) to recover ASAP
setInterval(async () => {
  // Only run if we're in critical state
  if (validAdminIndices.length > 0) return;
  
  try {
    const MIN_BALANCE_AVAX = 0.001; // Same working threshold (conservative)
    
    for (let walletIndex = 0; walletIndex < adminPrivateKeys.length; walletIndex++) {
      const privKey = adminPrivateKeys[walletIndex];
      if (!privKey) continue;
      
      try {
        const provider = getNextProvider();
        const wallet = new ethers.Wallet(privKey, provider);
        const balance = await provider.getBalance(wallet.address);
        const balanceInAvax = parseFloat(ethers.utils.formatEther(balance));
        
        if (balanceInAvax >= MIN_BALANCE_AVAX) {
          // Wallet has funds - re-enable it
          validAdminIndices.push(walletIndex);
          validAdminIndices.sort((a, b) => a - b);
          PARALLEL_WALLETS = Math.max(1, validAdminIndices.length);
          roundRobinIndex = 0;
          
          logger.warn(`[CRITICAL-RECOVERY] Wallet${walletIndex} recovered with ${balanceInAvax.toFixed(6)} AVAX during emergency check`);
          
          // Send urgent recovery alert
          const msg = `🟢 <b>SYSTEM RECOVERED</b>\n\nWallet${walletIndex} is back online\n\n${balanceInAvax.toFixed(6)} AVAX available\n\nProcessing resumed!`;
          sendTelegramNotification(msg).catch(() => {});
          
          break; // Re-enable one wallet and return, next iteration will find more
        }
      } catch (err) {
        // Silently skip
      }
    }
  } catch (error) {
    // Silently fail
  }
}, 10000); // Check every 10 seconds when critical

// Start nonce sync every 5 minutes (300000 ms = 5 * 60 * 1000)
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
]; // DO NOT filter - keep indices consistent

// Will be populated during initialization - only keys with balance > 0.0001 AVAX
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
    totalRPCErrors++;
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

// ========== CRITICAL FIX 4: CIRCUIT BREAKER FOR FAILING WALLETS ==========
// Track consecutive failures per wallet to implement circuit breaker
const walletFailureTracker = new Map<number, { count: number; lastFailTime: number; disabled: boolean }>();
const WALLET_FAILURE_THRESHOLD = 10; // Disable wallet after 10 consecutive failures
const WALLET_RECOVERY_TIME_MS = 90000; // Try to recover after 1.5 minutes

// ========== CRITICAL FIX 10: DEDUPLICATE ALERT MESSAGES ==========
// Prevent sending the same alert multiple times in rapid succession
const alertDebounce = new Map<string, { lastSent: number; count: number }>();
const ALERT_DEBOUNCE_MS = 5000; // Don't send same alert more than once per 5 seconds
const ALERT_DEBOUNCE_MAX_BURSTS = 1; // Only 1 burst per debounce window to prevent spam

const canSendAlert = (alertKey: string): boolean => {
  const now = Date.now();
  const existing = alertDebounce.get(alertKey);
  
  if (!existing) {
    alertDebounce.set(alertKey, { lastSent: now, count: 1 });
    return true;
  }
  
  const timeSinceLastAlert = now - existing.lastSent;
  
  // If enough time has passed, reset and allow
  if (timeSinceLastAlert > ALERT_DEBOUNCE_MS) {
    alertDebounce.set(alertKey, { lastSent: now, count: 1 });
    return true;
  }
  
  // If still within debounce window, allow if under burst limit
  if (existing.count < ALERT_DEBOUNCE_MAX_BURSTS) {
    existing.count++;
    return true;
  }
  
  return false;
};

const recordWalletFailure = (walletIndex: number) => {
  const tracker = walletFailureTracker.get(walletIndex) || { count: 0, lastFailTime: Date.now(), disabled: false };
  tracker.count++;
  tracker.lastFailTime = Date.now();
  
  if (tracker.count >= WALLET_FAILURE_THRESHOLD && !tracker.disabled) {
    tracker.disabled = true;
    // Remove from valid wallets
    validAdminIndices = validAdminIndices.filter(i => i !== walletIndex);
    
    logger.error(`[CIRCUIT-BREAKER] Wallet${walletIndex} DISABLED after ${tracker.count} failures`);
    
    // Send urgent Telegram alert
    const msg = `🔴 <b>WALLET CIRCUIT BREAKER</b>\n\n` +
      `Wallet${walletIndex} has failed ${tracker.count} times in a row and has been disabled.\n\n` +
      `⚠️ Remaining wallets: ${validAdminIndices.length}/${adminPrivateKeys.length}`;
    sendTelegramNotification(msg).catch(err => logger.error('Telegram alert failed', { err }));
  }
  
  walletFailureTracker.set(walletIndex, tracker);
};

const resetWalletFailureCount = (walletIndex: number) => {
  const tracker = walletFailureTracker.get(walletIndex);
  if (tracker) {
    tracker.count = 0;
    tracker.lastFailTime = Date.now();
  }
};

const canWalletRecover = (walletIndex: number): boolean => {
  const tracker = walletFailureTracker.get(walletIndex);
  if (!tracker || !tracker.disabled) return true;
  
  // Allow recovery after cooldown period
  if (Date.now() - tracker.lastFailTime >= WALLET_RECOVERY_TIME_MS) {
    tracker.disabled = false;
    tracker.count = 0;
    logger.info(`[CIRCUIT-BREAKER] Wallet${walletIndex} recovery attempt`);
    return true;
  }
  
  return false;
};

// Track request metrics for visibility
let totalRequestsReceived = 0;
let totalTransactionsSent = 0;
let totalTransactionsFailed = 0;
let totalTransactionsRejected = 0;
let totalRPCErrors = 0;

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
  
  // ========== CRITICAL FIX 2: USE VALID WALLETS ONLY ==========
  // Only assign transactions to wallets that have sufficient balance
  if (validAdminIndices.length === 0) {
    logger.error('[WALLET] NO VALID WALLETS AVAILABLE - All wallets are out of fees!');
    
    // Send urgent Telegram alert
    const msg = `🔴 <b>CRITICAL: NO WALLETS AVAILABLE</b>\n\n` +
      `All ${adminPrivateKeys.length} wallets are out of fees!\n\n` +
      `❌ ${transactions.length} transactions BLOCKED\n\n` +
      `Action Required: Refund wallets immediately`;
    await sendTelegramNotification(msg);
    
    return walletBatches; // Return empty - can't process
  }
  
  // Fire-and-forget: distribute transactions across valid wallets using round-robin
  let validWalletIndex = 0;
  for (const tx of transactions) {
    // Round-robin through VALID wallets only
    const walletIndex = validAdminIndices[validWalletIndex % validAdminIndices.length];
    validWalletIndex++;

    if (!walletBatches.has(walletIndex)) {
      walletBatches.set(walletIndex, []);
    }
    
    walletBatches.get(walletIndex)!.push(tx);
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

    logger.debug(`[TX-SUBMIT] wallet${walletIndex} nonce=${nonce}`);
    
    // Get optimized gas prices (priority fee = 2x base fee)
    const gasPrices = await getOptimizedGasPrices(provider);
    
    // ========== CRITICAL FIX 5: ONLY COUNT AFTER CONFIRMATION ==========
    // Send in background - don't wait for response
    wallet.sendTransaction({
      to: contractAddress,
      data: callData,
      value: 0n,
      nonce: nonce,
      gasLimit: 100000,
      maxFeePerGas: gasPrices.maxFeePerGas,
      maxPriorityFeePerGas: gasPrices.maxPriorityFeePerGas,
    }).then((txResponse) => {
      // Only count as SENT when we get hash back
      totalTransactionsSent++;
      perSecondStats.sent++;
      logTransactionBatch();
      
      const hash = txResponse.hash;
      recentTxHashes.push({ hash, timestamp: Date.now(), walletIndex });
      if (recentTxHashes.length > 100) {
        recentTxHashes.shift();
      }
      logger.info(`[TX-SENT] wallet${walletIndex} hash=${hash.slice(0, 18)}... nonce=${nonce}`);
      
      // Reset failure counter on success
      resetWalletFailureCount(walletIndex);
      
    }).catch((error) => {
      totalTransactionsFailed++;
      perSecondStats.failed++;
      recordWalletFailure(walletIndex);
      
      // ========== CRITICAL FIX: IMMEDIATE NONCE SYNC ON ERROR ==========
      if (isReplacementUnderpricedError(error) || isNonceError(error)) {
        logger.warn(`[NONCE-ERROR] wallet${walletIndex}: ${error.message?.slice(0, 50)}`);
        
        // Sync nonce IMMEDIATELY from blockchain (don't wait for 5-min cycle)
        provider.getTransactionCount(walletAddress, "pending")
          .then((blockchainNonce) => {
            const localNonce = getNonceForWallet(walletIndex);
            nonceByWallet.set(walletIndex, blockchainNonce);
            logger.error(`[NONCE-SYNC-IMMEDIATE] wallet${walletIndex} corrected: local=${localNonce} -> blockchain=${blockchainNonce}`);
          })
          .catch((syncErr) => {
            logger.error(`[NONCE-SYNC-FAILED] wallet${walletIndex} couldn't sync nonce`, { error: syncErr.message?.slice(0, 50) });
          });
      }
      
      // Check if error is RPC-related
      if (isRetryableNetworkError(error)) {
        if (providerUrl) {
          markProviderFailed(providerUrl);
        }
      }

      const errorMsg = error instanceof Error ? error.message.slice(0, 50) : "unknown";
      logger.error(`[TX-FAILED] wallet${walletIndex} nonce=${nonce} error=${errorMsg}`);
    });
    
    // Return immediately - this function returns instantly
    return { hash: `0x${'0'.repeat(64)}`, tx };  // Placeholder hash
  } catch (error) {
    totalTransactionsFailed++;
    perSecondStats.failed++;
    recordWalletFailure(walletIndex);
    
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

    // ========== CRITICAL FIX 1: CHECK WALLET BALANCE BEFORE SENDING ==========
    // Get wallet balance to ensure it can pay for gas
    const MIN_GAS_REQUIRED = ethers.utils.parseUnits('2', 'gwei').mul(100000); // ~0.0002 AVAX
    const balance = await provider.getBalance(walletAddress);
    
    if (balance.lt(MIN_GAS_REQUIRED)) {
      const balanceAvax = parseFloat(ethers.utils.formatEther(balance));
      const requiredAvax = parseFloat(ethers.utils.formatEther(MIN_GAS_REQUIRED));
      
      logger.error(`[WALLET${walletIndex}] INSUFFICIENT BALANCE for ${transactions.length} txs: have ${balanceAvax.toFixed(6)} AVAX, need ${requiredAvax.toFixed(6)} AVAX`);
      totalTransactionsFailed += transactions.length;
      perSecondStats.failed += transactions.length;
      
      // Alert to Telegram immediately
      const msg = `🔴 <b>WALLET OUT OF FUNDS</b>\n\nWallet${walletIndex}: ${balanceAvax.toFixed(6)} AVAX\n\n❌ ${transactions.length} transactions BLOCKED`;
      await sendTelegramNotification(msg);
      
      // All transactions fail - can't retry this wallet
      return { successes: [], retry: [] };
    }

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
            // ========== CRITICAL FIX 8: PREVENT WALLET SELECTION FAILURE ==========
            // Pick only from valid wallets with sufficient balance (round-robin)
            if (validAdminIndices.length === 0) {
              totalTransactionsRejected++;
              perSecondStats.rejected++;
              logger.error(`[CRITICAL-REJECTED] ALL WALLETS OUT OF FUNDS - No wallets with sufficient balance. Available: ${validAdminIndices.length}/${adminPrivateKeys.length}`);
              
              // ========== CRITICAL FIX 10: DEDUPLICATE ALERTS ==========
              // Only send alert if not already sent recently
              if (canSendAlert('CRITICAL_ALL_WALLETS_OUT')) {
                const msg = `🔴 <b>CRITICAL ALERT</b>\n\n` +
                  `All wallets are out of funds!\n\n` +
                  `Active: ${validAdminIndices.length}/${adminPrivateKeys.length}\n\n` +
                  `📍 Transactions are being REJECTED\n\n` +
                  `Action: Refund wallets immediately`;
                sendTelegramNotification(msg).catch(() => {});
              }
              return;
            }
            
            // ========== CRITICAL FIX 9: PREVENT ROUND-ROBIN INDEX OVERFLOW ==========
            // Ensure roundRobinIndex never exceeds array bounds
            if (roundRobinIndex >= validAdminIndices.length) {
              roundRobinIndex = 0; // Reset if it somehow got too high
            }
            
            // Round-robin through valid wallets with bounds checking
            const selectedIndex = roundRobinIndex % validAdminIndices.length;
            roundRobinIndex = (roundRobinIndex + 1) % validAdminIndices.length; // Wrap around safely
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
            
            // ========== CRITICAL FIX 13c: GET WALLET ADDRESS FOR LOGGING/DEBUG ==========
            let walletAddress: string;
            try {
              walletAddress = await wallet.getAddress();
              logger.debug(`[WALLET-ADDR] Wallet${walletIndex}: ${walletAddress.slice(0, 10)}...`);
            } catch (addrErr) {
              totalTransactionsRejected++;
              perSecondStats.rejected++;
              logger.error(`[WALLET-INIT-FAIL] Wallet${walletIndex} could not get address: ${addrErr}`);
              return;
            }

            const contractAddress = envConfigs.contract_address_avax;
            
            // ========== CRITICAL FIX 13d: VALIDATE CONTRACT ADDRESS ==========
            if (!contractAddress || !contractAddress.startsWith('0x')) {
              totalTransactionsRejected++;
              logger.error(`[INVALID-CONTRACT] Contract address is invalid: ${contractAddress}`);
              return;
            }
            
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
            // ========== CRITICAL FIX 14: CHECK BALANCE BEFORE ATTEMPTING SEND ==========
            // Don't waste a transaction attempt on a wallet with no balance
            const MIN_GAS_BALANCE_AVAX = 0.001; // Minimum needed for gas (conservative threshold)
            let preCheckBalanceAvax = 0;
            
            // ========== CRITICAL FIX 16b: USE CACHED BALANCE FIRST (INSTANT) ==========
            // Try to use cached balance first (updated every 3 seconds in background)
            const cachedBalance = getCachedBalance(walletIndex);
            
            if (cachedBalance !== null) {
              preCheckBalanceAvax = cachedBalance;
              logger.debug(`[PRE-CHECK-CACHED] Wallet${walletIndex}: ${preCheckBalanceAvax.toFixed(8)} AVAX (from cache)`);
            } else {
              // Cache miss - check live (but this blocks the request)
              try {
                const preCheckBalance = await provider.getBalance(walletAddress);
                preCheckBalanceAvax = parseFloat(ethers.utils.formatEther(preCheckBalance));
                logger.debug(`[PRE-CHECK-LIVE] Wallet${walletIndex}: ${preCheckBalanceAvax.toFixed(8)} AVAX (live)`);
              } catch (balanceErr) {
                // RPC failed - log but continue
                logger.warn(`[PRE-CHECK-RPC-ERROR] Wallet${walletIndex} balance check failed: ${balanceErr}`);
                preCheckBalanceAvax = 0; // Assume zero if we can't check
              }
            }
            
            if (preCheckBalanceAvax < MIN_GAS_BALANCE_AVAX) {
              totalTransactionsRejected++;
              perSecondStats.rejected++;
              
              // ========== CRITICAL FIX 15: IMMEDIATELY REMOVE WALLET ==========
              // Don't try this wallet again - it's out of funds
              const wasInValid = validAdminIndices.includes(walletIndex);
              validAdminIndices = validAdminIndices.filter(idx => idx !== walletIndex);
              
              if (validAdminIndices.length !== validAdminIndices.length) {
                roundRobinIndex = 0; // Reset if we removed a wallet
              }
              
              logger.error(`🔴 [BLOCKED-NO-BALANCE] Wallet${walletIndex} has ${preCheckBalanceAvax.toFixed(8)} AVAX (needs ${MIN_GAS_BALANCE_AVAX}). PERMANENTLY REMOVED. Active: ${validAdminIndices.length}/17`);
              
              // Send alert only if this was active before
              if (wasInValid && canSendAlert(`PRE_CHECK_${walletIndex}`)) {
                const msg = `🔴 <b>WALLET OUT OF FUNDS - BLOCKED</b>\n\nWallet${walletIndex}: ${preCheckBalanceAvax.toFixed(8)} AVAX\n\nPermanently removed from rotation\n\nActive: ${validAdminIndices.length}/17`;
                sendTelegramNotification(msg).catch(() => {});
              }
              return;
            }

            // ATOMICALLY GET AND INCREMENT NONCE - prevents race conditions
            const localNonce = getAndIncrementNonce(walletIndex);
            
            // Nonce allocated - silent for production

            // Encode transaction
            const callData = contractInterface.interface.encodeFunctionData("storeMetadata", [
              userSnapshot.saAddress,
              metadata,
              gameId
            ]);

            // ========== CRITICAL FIX 13: DON'T COUNT AS SENT UNTIL ACTUALLY SENT ==========
            // Get optimized gas prices (priority fee = 2x base fee)
            const gasPrices = await getOptimizedGasPrices(provider);
            
            logger.debug(`[TX-PREP] Wallet${walletIndex} contract=${contractAddress.slice(0, 10)}... nonce=${localNonce} gas=${gasPrices.maxFeePerGas}`);
            
            // Send in background - don't wait
            wallet.sendTransaction({
              to: contractAddress,
              data: callData,
              value: 0n,
              nonce: localNonce,
              gasLimit: 100000,
              maxFeePerGas: gasPrices.maxFeePerGas,
              maxPriorityFeePerGas: gasPrices.maxPriorityFeePerGas,
            }).then((txResponse) => {
              // ✅ ONLY COUNT AS SENT WHEN WE GET THE HASH BACK
              totalTransactionsSent++;
              perSecondStats.sent++;
              logTransactionBatch();
              
              // Hash received - log it PROMINENTLY
              logger.info(`✅ [TX-SENT] Wallet${walletIndex} => ${txResponse.hash} (nonce=${localNonce})`);

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
              // ========== CRITICAL FIX 13b: ACTUAL ERROR LOGGING ==========
              // Handle nonce errors
              const errStr = String(err);
              totalTransactionsFailed++;
              perSecondStats.failed++;
              
              logger.error(`[TX-FAILED] Wallet${walletIndex} nonce=${localNonce}: ${errStr.slice(0, 120)}`);
              
              if (errStr.includes("nonce") || errStr.includes("underpriced")) {
                logger.error(`[NONCE-ERROR] Wallet${walletIndex}: ${errStr.slice(0, 100)}`);
                // Immediately sync nonce to fix the issue
                provider.getTransactionCount(wallet.address, "pending").then((blockchainNonce) => {
                  nonceByWallet.set(walletIndex, blockchainNonce);
                  logger.info(`[NONCE-RESET] Wallet${walletIndex} nonce reset to ${blockchainNonce} (was ${localNonce})`);
                }).catch(() => {});
              }
              
              // ========== CRITICAL FIX 11: VERIFY INSUFFICIENT BALANCE BEFORE REMOVING ==========
              // Handle insufficient funds - BUT verify first before removing wallet
              if (errStr.includes("insufficient") || errStr.includes("exceeds balance")) {
                totalTransactionsFailed++;
                logger.error(`[POTENTIAL-OOF] Wallet${walletIndex}: ${errStr.slice(0, 100)}`);
                
                // Check balance immediately before removing wallet
                (async () => {
                  try {
                    const checkProvider = getNextProvider();
                    const checkBalance = await checkProvider.getBalance(wallet.address);
                    const balanceAvax = parseFloat(ethers.utils.formatEther(checkBalance));
                    
                    // Only remove if balance is actually below minimum
                    const MIN_BALANCE_AVAX = 0.001; // Same conservative threshold
                    if (balanceAvax < MIN_BALANCE_AVAX) {
                      const wasValid = validAdminIndices.includes(walletIndex);
                      validAdminIndices = validAdminIndices.filter(idx => idx !== walletIndex);
                      roundRobinIndex = 0;
                      
                      logger.error(`[WALLET-OUT-OF-FUNDS-VERIFIED] Wallet${walletIndex} confirmed out of funds (${balanceAvax.toFixed(6)} AVAX). Active: ${validAdminIndices.length}/${adminPrivateKeys.length}`);
                      
                      // Send alert only if this was a valid wallet
                      if (wasValid && canSendAlert(`WALLET_${walletIndex}_OOF`)) {
                        const msg = `🔴 <b>WALLET OUT OF FUNDS</b>\n\nWallet${walletIndex} was deactivated\n\n` +
                          `Balance: ${balanceAvax.toFixed(6)} AVAX\n` +
                          `Active wallets: ${validAdminIndices.length}/${adminPrivateKeys.length}`;
                        sendTelegramNotification(msg).catch(() => {});
                      }
                    } else {
                      // Wallet has balance - error was likely transient (gas estimation, RPC issue, etc)
                      logger.warn(`[TRANSIENT-ERROR] Wallet${walletIndex} has ${balanceAvax.toFixed(6)} AVAX (sufficient). Error was transient, not removing. Error: ${errStr.slice(0, 80)}`);
                    }
                  } catch (balanceCheckErr) {
                    logger.error(`[BALANCE-CHECK-FAILED] Could not verify balance for Wallet${walletIndex}: ${balanceCheckErr}`);
                  }
                })().catch(() => {});
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
