import cron from 'node-cron';
import User from './controllers/user';
import logger from './config/logger';

logger.info('Games cache cron worker started.');

// Run every 7 minutes
cron.schedule('*/7 * * * *', async () => {
  logger.info(`[${new Date().toISOString()}] Refreshing games cache...`);
  const success = await User.refreshGamesCache();
  if (success) {
    logger.info(`[${new Date().toISOString()}] Games cache refreshed successfully.`);
  } else {
    logger.error(`[${new Date().toISOString()}] Failed to refresh games cache.`);
  }
});

// Run once on startup as well
(async () => {
  const success = await User.refreshGamesCache();
  if (success) {
    logger.info(`[${new Date().toISOString()}] Games cache initialized successfully.`);
  } else {
    logger.error(`[${new Date().toISOString()}] Failed to initialize games cache.`);
  }
})(); 