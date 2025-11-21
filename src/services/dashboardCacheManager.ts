import crypto from "crypto";
import dbservices from "./dbservices";
import logger from "../config/logger";

type CacheKey = "all" | "avax";

interface DashboardSnapshot {
  response: any;
  etag: string;
  refreshedAt: number;
  expiresAt: number;
  refreshDurationMs: number;
}

interface SnapshotResult {
  snapshot: DashboardSnapshot;
  freshness: "fresh" | "stale";
  refreshTriggered: boolean;
}

interface SnapshotOptions {
  waitForFresh?: boolean;
}

const CACHE_TTL_MINUTES = 25;
const CACHE_TTL_MS = CACHE_TTL_MINUTES * 60 * 1000;
const CACHE_TTL_SECONDS = CACHE_TTL_MINUTES * 60;

class DashboardCacheManager {
  private static snapshots = new Map<CacheKey, DashboardSnapshot>();
  private static refreshPromises = new Map<CacheKey, Promise<DashboardSnapshot>>();
  private static lastErrors = new Map<CacheKey, string>();

  static async getAllSnapshot(options?: SnapshotOptions): Promise<SnapshotResult> {
    return this.getSnapshot("all", options);
  }

  static async getAvaxSnapshot(options?: SnapshotOptions): Promise<SnapshotResult> {
    return this.getSnapshot("avax", options);
  }

  static async refreshAll(reason = "manual"): Promise<DashboardSnapshot> {
    return this.refresh("all", reason);
  }

  static async refreshAvax(reason = "manual"): Promise<DashboardSnapshot> {
    return this.refresh("avax", reason);
  }

  static getLastError(key: CacheKey): string | undefined {
    return this.lastErrors.get(key);
  }

  private static async getSnapshot(
    key: CacheKey,
    options: SnapshotOptions = {},
  ): Promise<SnapshotResult> {
    const { waitForFresh = false } = options;
    const snapshot = this.snapshots.get(key);

    if (!snapshot) {
      const fresh = await this.refresh(key, "cold-start");
      return {
        snapshot: fresh,
        freshness: "fresh",
        refreshTriggered: false,
      };
    }

    const now = Date.now();
    const isExpired = now >= snapshot.expiresAt;
    let refreshTriggered = false;

    if (isExpired && waitForFresh) {
      try {
        const fresh = await this.refresh(key, "stale-request");
        return {
          snapshot: fresh,
          freshness: "fresh",
          refreshTriggered: true,
        };
      } catch (error: any) {
        logger.error(
          `[DashboardCacheManager] Failed refresh for ${key} during wait: ${
            error?.message || error
          }`,
        );
      }
    }

    if (isExpired) {
      refreshTriggered = true;
      if (!this.refreshPromises.has(key)) {
        this.refresh(key, "background-stale").catch((error: any) => {
          logger.error(
            `[DashboardCacheManager] Background refresh failed for ${key}: ${
              error?.message || error
            }`,
          );
        });
      }
    }

    return {
      snapshot,
      freshness: isExpired ? "stale" : "fresh",
      refreshTriggered: refreshTriggered || this.refreshPromises.has(key),
    };
  }

  private static async refresh(
    key: CacheKey,
    reason: string,
  ): Promise<DashboardSnapshot> {
    const existing = this.refreshPromises.get(key);
    if (existing) {
      return existing;
    }

    const loader =
      key === "all" ? this.loadAllDashboardData : this.loadAvaxDashboardData;

    const promise = (async () => {
      const started = Date.now();
      logger.info(
        `[DashboardCacheManager] Refreshing ${key} cache (reason: ${reason})`,
      );

      try {
        const response = await loader.call(this);
        const refreshedAt = Date.now();
        const duration = refreshedAt - started;
        const snapshot = this.buildSnapshot(response, refreshedAt, duration);
        this.snapshots.set(key, snapshot);
        this.lastErrors.delete(key);
        logger.info(
          `[DashboardCacheManager] ${key} cache refreshed in ${duration}ms`,
        );
        return snapshot;
      } catch (error: any) {
        const message = error?.message || "Unknown error";
        this.lastErrors.set(key, message);
        logger.error(
          `[DashboardCacheManager] Failed to refresh ${key} cache: ${message}`,
        );
        throw error;
      } finally {
        this.refreshPromises.delete(key);
      }
    })();

    this.refreshPromises.set(key, promise);
    return promise;
  }

  private static buildSnapshot(
    response: any,
    refreshedAt: number,
    refreshDurationMs: number,
  ): DashboardSnapshot {
    const meta = {
      refreshedAt: new Date(refreshedAt).toISOString(),
      expiresAt: new Date(refreshedAt + CACHE_TTL_MS).toISOString(),
      ttlSeconds: CACHE_TTL_SECONDS,
      refreshDurationMs,
    };

    const responseWithMeta = {
      ...response,
      meta: {
        ...(response?.meta ?? {}),
        cache: meta,
      },
    };

    const etag = crypto
      .createHash("md5")
      .update(JSON.stringify(responseWithMeta))
      .digest("hex");

    return {
      response: responseWithMeta,
      etag,
      refreshedAt,
      refreshDurationMs,
      expiresAt: refreshedAt + CACHE_TTL_MS,
    };
  }

  private static async loadAllDashboardData(): Promise<any> {
    const days = 90;
    const [
      userCounts,
      dailyActiveUsers,
      dailyTransactions,
      monthlyUsersSeries,
      monthlyTransactions,
    ] = await Promise.all([
      this.timed("xdc.user.counts", () => dbservices.User.counts()),
      this.timed("xdc.daily.activeUsers", () =>
        dbservices.TransactionsXDC.getDailyActiveUsers(days),
      ),
      this.timed("xdc.daily.transactions", () =>
        dbservices.TransactionsXDC.getDailyTransactionCounts(days),
      ),
      this.timed("xdc.monthly.activeUsersSeries", () =>
        dbservices.TransactionsXDC.getMonthlyActiveUsersSeries(4),
      ),
      this.timed("xdc.monthly.transactions", () =>
        dbservices.TransactionsXDC.getMonthlyTransactions(),
      ),
    ]);

    const dailyActiveUsersAverage60 =
      this.computeAverageOfLastN(
        dailyActiveUsers.data,
        60,
        (item: any) => Number(item.daily_active_users) || 0,
      );

    const monthlyUsersAverage4 =
      this.computeAverageOfFirstN(
        monthlyUsersSeries,
        4,
        (item: any) => Number(item.active_users) || 0,
      );

    const monthlyUsersCurrent =
      (monthlyUsersSeries?.[0] && Number(monthlyUsersSeries[0].active_users)) || 0;

    return {
      success: true,
      timestamp: new Date().toISOString(),
      cacheDurationSeconds: CACHE_TTL_SECONDS,
      data: {
        userCounts,
        dailyActiveUsers: {
          count: dailyActiveUsers.count,
          data: dailyActiveUsers.data,
          averageLast60Days: dailyActiveUsersAverage60,
        },
        dailyTransactions: {
          count: dailyTransactions.count,
          data: dailyTransactions.data,
        },
        monthlyUsers: monthlyUsersCurrent,
        monthlyUsersDetail: {
          currentMonth: monthlyUsersCurrent,
          averageLast4Months: monthlyUsersAverage4,
          data: monthlyUsersSeries,
        },
        monthlyTransactions,
      },
    };
  }

  private static async loadAvaxDashboardData(): Promise<any> {
    const days = 90;
    const [
      userCounts,
      dailyActiveUsers,
      dailyTransactions,
      monthlyUsersSeries,
      monthlyTransactions,
    ] = await Promise.all([
      this.timed("avax.user.counts", () => dbservices.User.countsAvax()),
      this.timed("avax.daily.activeUsers", () =>
        dbservices.TransactionsAvax.getDailyActiveUsers(days),
      ),
      this.timed("avax.daily.transactions", () =>
        dbservices.TransactionsAvax.getDailyTransactionCounts(days),
      ),
      this.timed("avax.monthly.activeUsersSeries", () =>
        dbservices.TransactionsAvax.getMonthlyActiveUsersSeries(4),
      ),
      this.timed("avax.monthly.transactions", () =>
        dbservices.TransactionsAvax.getMonthlyTransactions(),
      ),
    ]);

    const dailyActiveUsersAverage60 =
      this.computeAverageOfLastN(
        dailyActiveUsers.data,
        60,
        (item: any) => Number(item.daily_active_users) || 0,
      );

    const monthlyUsersAverage4 =
      this.computeAverageOfFirstN(
        monthlyUsersSeries,
        4,
        (item: any) => Number(item.active_users) || 0,
      );

    const monthlyUsersCurrent =
      (monthlyUsersSeries?.[0] && Number(monthlyUsersSeries[0].active_users)) || 0;

    return {
      success: true,
      timestamp: new Date().toISOString(),
      cacheDurationSeconds: CACHE_TTL_SECONDS,
      data: {
        userCounts,
        dailyActiveUsers: {
          count: dailyActiveUsers.count,
          data: dailyActiveUsers.data,
          averageLast60Days: dailyActiveUsersAverage60,
        },
        dailyTransactions: {
          count: dailyTransactions.count,
          data: dailyTransactions.data,
        },
        monthlyUsers: monthlyUsersCurrent,
        monthlyUsersDetail: {
          currentMonth: monthlyUsersCurrent,
          averageLast4Months: monthlyUsersAverage4,
          data: monthlyUsersSeries,
        },
        monthlyTransactions,
      },
    };
  }

  private static async timed<T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const started = Date.now();
    try {
      const result = await fn();
      logger.info(
        `[DashboardCacheManager] Query ${label} completed in ${Date.now() - started}ms`,
      );
      return result;
    } catch (error) {
      logger.error(
        `[DashboardCacheManager] Query ${label} failed after ${Date.now() - started}ms`,
      );
      throw error;
    }
  }

  private static computeAverage(values: number[]): number {
    if (!values.length) {
      return 0;
    }
    const sum = values.reduce((acc, value) => acc + value, 0);
    return Math.round(sum / values.length);
  }

  private static computeAverageOfLastN<T>(
    items: T[],
    n: number,
    selector: (item: T) => number,
  ): number {
    if (!items || !items.length) {
      return 0;
    }
    const slice = items.slice(-n);
    const values = slice.map(selector).filter((v) => Number.isFinite(v));
    return this.computeAverage(values);
  }

  private static computeAverageOfFirstN<T>(
    items: T[],
    n: number,
    selector: (item: T) => number,
  ): number {
    if (!items || !items.length) {
      return 0;
    }
    const slice = items.slice(0, n);
    const values = slice.map(selector).filter((v) => Number.isFinite(v));
    return this.computeAverage(values);
  }
}

export default DashboardCacheManager;
export type { DashboardSnapshot };

