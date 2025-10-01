import cron from 'node-cron';
import Dashboard from './controllers/dashboard';
import logger from './config/logger';

logger.info('Dashboard cache cron worker started avax.');

// Run every 25 minutes
cron.schedule('*/25 * * * *', async () => {
  logger.info(`[${new Date().toISOString()}] Refreshing dashboard cache.. AVAX.`);
  const success = await Dashboard.refreshDashboardCacheAvax();
  if (success) {
    logger.info(`[${new Date().toISOString()}] Dashboard cache refreshed successfully.`);
  } else {
    logger.error(`[${new Date().toISOString()}] Failed to refresh dashboard cache.`);
  }
});

// Run once on startup as well
(async () => {
  const success = await Dashboard.refreshDashboardCacheAvax();
  if (success) {
    logger.info(`[${new Date().toISOString()}] Dashboard cache initialized successfully AVAX.`);
  } else {
    logger.error(`[${new Date().toISOString()}] Failed to initialize dashboard cache.`);
  }
})(); 