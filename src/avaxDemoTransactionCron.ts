import cron from 'node-cron';
import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { envConfigs } from './config/envconfig';
import logger from './config/logger';

// ====== CONFIGURATION ======
const METADATA_CONTRACT_ADDRESS = envConfigs.contract_address_avax || '0x06E9B71283700D1a319070f14976D3ABa6c27745';

// Contract ABI for storeMetadata function
const CONTRACT_ABI = [
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'metadata', type: 'string' },
      { name: 'gameId', type: 'uint256' },
    ],
    name: 'storeMetadata',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// Demo games
const DEMO_GAMES = [
  { id: 1, name: 'Dragon Quest' },
  { id: 2, name: 'Space Odyssey' },
  { id: 3, name: 'Crypto Miners' },
  { id: 4, name: 'NFT Warriors' },
  { id: 5, name: 'Token Traders' },
];

// Demo device IDs
const DEMO_DEVICE_IDS = [
  uuidv4(),
  uuidv4(),
  uuidv4(),
  uuidv4(),
  uuidv4(),
];

// RPC Provider URLs
const RPC_URLS = [
  envConfigs.provider_url_AVAX,
  envConfigs.provider_url_AVAX1,
  envConfigs.provider_url_AVAX2,
  envConfigs.provider_url_AVAX3,
  envConfigs.provider_url_AVAX4,
].filter(Boolean) as string[];

if (!RPC_URLS.length) {
  logger.error('[AVAX DEMO] No RPC URLs configured. Set PROVIDER_URL_AVAX* in .env');
  process.exit(1);
}

// Admin private key
const ADMIN_PRIVATE_KEY = envConfigs.adminPrivatKey_avax;
if (!ADMIN_PRIVATE_KEY) {
  logger.error('[AVAX DEMO] No admin private key configured. Set ADMIN_PRIVATEKEY_AVAX in .env');
  process.exit(1);
}

// ====== HELPER FUNCTIONS ======
let rpcIndex = 0;

function getNextRpc(): string {
  const rpc = RPC_URLS[rpcIndex % RPC_URLS.length];
  rpcIndex++;
  return rpc;
}

function generateDemoData() {
  const game = DEMO_GAMES[Math.floor(Math.random() * DEMO_GAMES.length)];
  const deviceId = DEMO_DEVICE_IDS[Math.floor(Math.random() * DEMO_DEVICE_IDS.length)];
  const userId = `user_${uuidv4()}`;
  const sessionId = `session_${uuidv4()}`;

  return {
    game,
    userId,
    sessionId,
    deviceId,
    deviceType: ['mobile', 'web', 'desktop'][Math.floor(Math.random() * 3)],
    action: ['play', 'purchase', 'upgrade', 'trade'][Math.floor(Math.random() * 4)],
    amount: (Math.random() * 1000).toFixed(2),
    timestamp: new Date().toISOString(),
  };
}

async function sendDemoTransaction() {
  try {
    const startTime = Date.now();
    const demoData = generateDemoData();
    const rpcUrl = getNextRpc();

    logger.info(`[AVAX DEMO] Starting transaction...`);
    logger.info(`[AVAX DEMO] RPC: ${rpcUrl}`);
    logger.info(`[AVAX DEMO] Game: ${demoData.game.name}, User: ${demoData.userId}`);

    // Create provider and wallet
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(METADATA_CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

    // Prepare metadata
    const metadata = JSON.stringify({
      userId: demoData.userId,
      sessionId: demoData.sessionId,
      deviceId: demoData.deviceId,
      deviceType: demoData.deviceType,
      action: demoData.action,
      amount: demoData.amount,
      timestamp: demoData.timestamp,
    });

    // Send transaction
    logger.info(`[AVAX DEMO] Sending transaction to contract...`);
    const tx = await contract.storeMetadata(
      wallet.address,
      metadata,
      demoData.game.id
    );

    logger.info(`[AVAX DEMO] Transaction sent: ${tx.hash}`);
    logger.info(`[AVAX DEMO] Waiting for confirmation...`);

    // Wait for confirmation
    const receipt = await tx.wait(1);

    const duration = Date.now() - startTime;
    if (receipt) {
      logger.info(`[AVAX DEMO] ✅ CONFIRMED in ${duration}ms`);
      logger.info(`[AVAX DEMO] Block: ${receipt.blockNumber}, Gas Used: ${receipt.gasUsed.toString()}`);
      return {
        success: true,
        hash: tx.hash,
        block: receipt.blockNumber,
        duration,
      };
    } else {
      logger.warn(`[AVAX DEMO] ⚠️ PENDING (timeout waiting for confirmation after ${duration}ms)`);
      return {
        success: true,
        hash: tx.hash,
        confirmed: false,
        duration,
      };
    }
  } catch (error: any) {
    logger.error(`[AVAX DEMO] ❌ Transaction failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ====== CRON SCHEDULE ======
logger.info('[AVAX DEMO] Starting demo transaction cron (every 10 seconds)...');

// Run every 10 seconds
cron.schedule('*/10 * * * * *', async () => {
  logger.info(`\n[AVAX DEMO] [${new Date().toISOString()}] Executing demo transaction...`);
  const result = await sendDemoTransaction();

  if (result.success) {
    logger.info(`[AVAX DEMO] Result: ${JSON.stringify(result)}\n`);
  }
});

// Run once on startup
(async () => {
  logger.info('[AVAX DEMO] Running initial demo transaction on startup...');
  await sendDemoTransaction();
})();

logger.info('[AVAX DEMO] Cron worker initialized. Waiting for next scheduled run...');
