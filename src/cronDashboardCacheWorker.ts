import cron from 'node-cron';
import Dashboard from './controllers/dashboard';
import logger from './config/logger';

logger.info('Dashboard cache cron worker started.');

// Run every 7 minutes
cron.schedule('*/7 * * * *', async () => {
  logger.info(`[${new Date().toISOString()}] Refreshing dashboard cache...`);
  const success = await Dashboard.refreshDashboardCache();
  if (success) {
    logger.info(`[${new Date().toISOString()}] Dashboard cache refreshed successfully.`);
  } else {
    logger.error(`[${new Date().toISOString()}] Failed to refresh dashboard cache.`);
  }
});

// Run once on startup as well
(async () => {
  const success = await Dashboard.refreshDashboardCache();
  if (success) {
    logger.info(`[${new Date().toISOString()}] Dashboard cache initialized successfully.`);
  } else {
    logger.error(`[${new Date().toISOString()}] Failed to initialize dashboard cache.`);
  }
})(); 