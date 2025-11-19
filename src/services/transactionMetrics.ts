import logger from '../config/logger';

/**
 * Lightweight transaction metrics - tracks key indicators without large data structures
 * Helps diagnose issues without adding memory overhead
 */
export class TransactionMetrics {
  private static totalSent = 0;
  private static totalFailed = 0;
  private static totalDropped = 0;
  private static maxQueueSize = 0;
  private static adminUtilization: Map<number, { sent: number; failed: number }> = new Map();
  private static lastReportTime = Date.now();
  private static reportIntervalMs = 60000; // Report every minute

  static recordSent(adminIndex: number) {
    this.totalSent++;
    const stats = this.adminUtilization.get(adminIndex) || { sent: 0, failed: 0 };
    stats.sent++;
    this.adminUtilization.set(adminIndex, stats);
    this.maybeReport();
  }

  static recordFailed(adminIndex: number) {
    this.totalFailed++;
    const stats = this.adminUtilization.get(adminIndex) || { sent: 0, failed: 0 };
    stats.failed++;
    this.adminUtilization.set(adminIndex, stats);
    this.maybeReport();
  }

  static recordDropped(count: number) {
    this.totalDropped += count;
    this.maybeReport();
  }

  static recordQueueSize(size: number) {
    if (size > this.maxQueueSize) {
      this.maxQueueSize = size;
    }
    this.maybeReport();
  }

  private static maybeReport() {
    const now = Date.now();
    if (now - this.lastReportTime >= this.reportIntervalMs) {
      this.report();
      this.lastReportTime = now;
    }
  }

  private static report() {
    const adminStats = Array.from(this.adminUtilization.entries())
      .map(([idx, stats]) => `A${idx}:${stats.sent}/${stats.failed}`)
      .join(' ');

    logger.info(
      `📊 Metrics: sent=${this.totalSent} failed=${this.totalFailed} dropped=${this.totalDropped} peak_queue=${this.maxQueueSize} admins=[${adminStats}]`
    );
  }

  static reset() {
    this.totalSent = 0;
    this.totalFailed = 0;
    this.totalDropped = 0;
    this.maxQueueSize = 0;
    this.adminUtilization.clear();
  }

  static getStats() {
    return {
      totalSent: this.totalSent,
      totalFailed: this.totalFailed,
      totalDropped: this.totalDropped,
      maxQueueSize: this.maxQueueSize,
      adminCount: this.adminUtilization.size,
    };
  }
}

export default TransactionMetrics;
