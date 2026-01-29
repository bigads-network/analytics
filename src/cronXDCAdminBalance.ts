import cron from "node-cron";
import logger from "./config/logger";
import { envConfigs } from "./config/envconfig";
import { ethers } from "ethers";
import TelegramBot from "node-telegram-bot-api";

// Initialize Telegram bot
const token = envConfigs.telegram_token;
const bot = new TelegramBot(token, { polling: false });
const CHAT_ID = envConfigs.adminId; // Same chat ID as used for other alerts

// XDC admin private keys mapping
const xdcAdminPrivateKeys = [
  envConfigs.adminPrivatKey_Xdc,
  envConfigs.adminPrivatKey_Xdc1,
  envConfigs.adminPrivatKey_Xdc2,
  envConfigs.adminPrivatKey_Xdc3,
  envConfigs.adminPrivatKey_Xdc4,
];

// Get XDC RPC provider
const getXDCProvider = () => {
  const providers = envConfigs.xdcProviders;
  if (!providers || providers.length === 0) {
    throw new Error("No XDC providers configured");
  }
  // Use first provider or rotate if needed
  return new ethers.providers.JsonRpcProvider(providers[0]);
};

// Track previous balance state to detect changes
const previousBalanceState = new Map<
  number,
  { address: string; balance: number; status: "has_balance" | "no_balance" }
>();

// Alert throttling to avoid spam
const alertTimeouts = new Map<string, number>();
const ALERT_COOLDOWN_MS = 3600000; // 1 hour cooldown between same alerts

const canSendAlert = (key: string): boolean => {
  const lastAlert = alertTimeouts.get(key);
  if (!lastAlert || Date.now() - lastAlert > ALERT_COOLDOWN_MS) {
    alertTimeouts.set(key, Date.now());
    return true;
  }
  return false;
};

// Send telegram notification
const sendTelegramNotification = async (message: string): Promise<void> => {
  try {
    await bot.sendMessage(CHAT_ID, message, { parse_mode: "HTML" });
    logger.info(`[XDC-BALANCE] Telegram notification sent`);
  } catch (error) {
    logger.error(`[XDC-BALANCE] Failed to send Telegram notification: ${error}`);
  }
};

// Check XDC admin balances
const checkXDCAdminBalances = async () => {
  const MIN_BALANCE_XDC = 0.001; // Minimum balance threshold
  const startTime = Date.now();

  try {
    logger.info(
      `[XDC-BALANCE] Starting XDC admin balance check (${xdcAdminPrivateKeys.length} wallets)...`
    );

    const provider = getXDCProvider();
    const balanceResults: Array<{
      index: number;
      address: string;
      balance: number;
      hasBalance: boolean;
    }> = [];

    // Check all admin wallets
    for (let i = 0; i < xdcAdminPrivateKeys.length; i++) {
      const privKey = xdcAdminPrivateKeys[i];

      if (!privKey || privKey.length === 0) {
        logger.debug(`[XDC-BALANCE] Wallet${i} skipped (no private key)`);
        continue;
      }

      try {
        const wallet = new ethers.Wallet(privKey, provider);
        const address = await wallet.getAddress();
        const balanceWei = await provider.getBalance(address);
        const balanceXdc = parseFloat(ethers.utils.formatEther(balanceWei));
        const hasBalance = balanceXdc >= MIN_BALANCE_XDC;

        balanceResults.push({
          index: i,
          address,
          balance: balanceXdc,
          hasBalance,
        });

        // Check for state change
        const previousState = previousBalanceState.get(i);
        const currentStatus = hasBalance ? "has_balance" : "no_balance";

        if (!previousState) {
          // First check
          previousBalanceState.set(i, {
            address,
            balance: balanceXdc,
            status: currentStatus,
          });
          logger.info(
            `[XDC-BALANCE] Wallet${i} (${address.slice(0, 10)}...): ${balanceXdc.toFixed(6)} XDC - ${
              hasBalance ? "✅ HAS BALANCE" : "❌ NO BALANCE"
            }`
          );
        } else if (previousState.status !== currentStatus) {
          // State changed
          previousBalanceState.set(i, {
            address,
            balance: balanceXdc,
            status: currentStatus,
          });

          if (!hasBalance && canSendAlert(`XDC_WALLET_${i}_NO_BALANCE`)) {
            // Balance dropped below threshold
            const msg = `🔴 <b>XDC ADMIN WALLET - NO BALANCE</b>\n\n` +
              `Wallet${i}: <code>${address}</code>\n` +
              `Balance: ${balanceXdc.toFixed(6)} XDC\n` +
              `Threshold: ${MIN_BALANCE_XDC} XDC\n\n` +
              `⚠️ Wallet requires refund to continue operations!`;
            await sendTelegramNotification(msg);
          } else if (hasBalance && canSendAlert(`XDC_WALLET_${i}_BALANCE_RECOVERED`)) {
            // Balance recovered
            const msg = `✅ <b>XDC ADMIN WALLET - BALANCE RECOVERED</b>\n\n` +
              `Wallet${i}: <code>${address}</code>\n` +
              `Balance: ${balanceXdc.toFixed(6)} XDC\n\n` +
              `🟢 Wallet is operational again!`;
            await sendTelegramNotification(msg);
          }
        }
      } catch (error) {
        logger.error(
          `[XDC-BALANCE] Error checking Wallet${i}: ${error instanceof Error ? error.message : error}`
        );
      }
    }

    // Generate summary report
    const durationMs = Date.now() - startTime;
    const walletsWithBalance = balanceResults.filter((r) => r.hasBalance).length;
    const walletsWithoutBalance = balanceResults.filter((r) => !r.hasBalance).length;

    logger.info(
      `[XDC-BALANCE] Check complete in ${durationMs}ms - ` +
        `${walletsWithBalance} with balance, ${walletsWithoutBalance} without balance`
    );

    // Send periodic summary if there are wallets without balance
    if (walletsWithoutBalance > 0 && canSendAlert("XDC_BALANCE_SUMMARY")) {
      let summaryMsg = `<b>📊 XDC ADMIN BALANCE SUMMARY</b>\n\n`;
      summaryMsg += `✅ With Balance: <code>${walletsWithBalance}/${balanceResults.length}</code>\n`;
      summaryMsg += `❌ Without Balance: <code>${walletsWithoutBalance}/${balanceResults.length}</code>\n\n`;

      const noBalanceWallets = balanceResults.filter((r) => !r.hasBalance);
      if (noBalanceWallets.length > 0) {
        summaryMsg += `<b>Low Balance Wallets:</b>\n`;
        noBalanceWallets.forEach((r) => {
          summaryMsg += `Wallet${r.index}: ${r.balance.toFixed(6)} XDC\n`;
          summaryMsg += `<code>${r.address}</code>\n`;
        });
      }

      summaryMsg += `\n<i>⏰ ${new Date().toLocaleString()}</i>`;
      await sendTelegramNotification(summaryMsg);
    }
  } catch (error) {
    logger.error(
      `[XDC-BALANCE] Critical error in balance check: ${
        error instanceof Error ? error.message : error
      }`
    );

    // Send error alert
    const errorMsg = `🔴 <b>XDC ADMIN BALANCE CHECK - ERROR</b>\n\n` +
      `Failed to check wallet balances\n\n` +
      `Error: ${error instanceof Error ? error.message.slice(0, 100) : "Unknown error"}\n\n` +
      `Manual intervention may be required!`;
    await sendTelegramNotification(errorMsg).catch(() => {});
  }
};

logger.info("XDC Admin Balance Monitor cron worker starting...");

// Run balance check every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  await checkXDCAdminBalances();
});

// Also run once on startup
(async () => {
  await checkXDCAdminBalances();
})();

logger.info("XDC Admin Balance Monitor initialized (checks every 5 minutes)");
