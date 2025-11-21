import cron from "node-cron";
import logger from "./config/logger";
import DashboardCacheManager from "./services/dashboardCacheManager";

const logSnapshot = (
  context: string,
  snapshot: { refreshedAt: number; refreshDurationMs: number; expiresAt: number },
) => {
  const ageSeconds = Math.floor((Date.now() - snapshot.refreshedAt) / 1000);
  const ttlSeconds = Math.floor((snapshot.expiresAt - Date.now()) / 1000);
  logger.info(
    `[${new Date().toISOString()}] AVAX dashboard cache ${context} in ${
      snapshot.refreshDurationMs
    }ms (age=${ageSeconds}s, ttlRemaining=${Math.max(ttlSeconds, 0)}s)`,
  );
};

const refreshDashboardCache = async (reason: string) => {
  try {
    const snapshot = await DashboardCacheManager.refreshAvax(reason);
    logSnapshot(`refresh (${reason})`, snapshot);
  } catch (error: any) {
    logger.error(
      `[${new Date().toISOString()}] Failed AVAX dashboard cache refresh (${reason}): ${
        error?.message || error
      }`,
    );
  }
};

logger.info("Dashboard cache cron worker started (AVAX).");

// Run every 25 minutes
cron.schedule("*/25 * * * *", async () => {
  await refreshDashboardCache("cron");
});

// Run once on startup as well
(async () => {
  await refreshDashboardCache("startup");
})();
