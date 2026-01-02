import { Request, Response } from 'express';
import logger from '../config/logger';

export default class Monitoring {
  private static transactionStats = {
    queued: 0,
    sent: 0,
    failed: 0,
    dropped: 0,
    requestsReceived: 0,
    lastReset: new Date(),
  };

  // ========== CRITICAL FIX: ADD HEALTH CHECK ENDPOINT ==========
  // Detects when transaction system has stopped
  static getHealthStatus = async (req: Request, res: Response): Promise<any> => {
    try {
      const uptime = process.uptime();
      const memUsage = process.memoryUsage();

      // Calculate transaction throughput (sent in last 60 seconds)
      const timeSinceReset = Date.now() - Monitoring.transactionStats.lastReset.getTime();
      const txPerSecond = timeSinceReset > 0 
        ? (Monitoring.transactionStats.sent / (timeSinceReset / 1000)).toFixed(2)
        : '0.00';

      // Determine health status
      let healthStatus = 'healthy';
      const alerts: string[] = [];
      
      // Check if transactions are being sent
      if (Monitoring.transactionStats.sent === 0 && Monitoring.transactionStats.requestsReceived > 10) {
        healthStatus = 'critical';
        alerts.push('NO TRANSACTIONS SENT - System appears to be blocked');
      }
      
      // Check failure rate
      const totalAttempted = Monitoring.transactionStats.sent + Monitoring.transactionStats.failed;
      if (totalAttempted > 0) {
        const failureRate = (Monitoring.transactionStats.failed / totalAttempted) * 100;
        if (failureRate > 50) {
          healthStatus = healthStatus === 'healthy' ? 'degraded' : healthStatus;
          alerts.push(`HIGH FAILURE RATE: ${failureRate.toFixed(1)}%`);
        }
      }
      
      // Check queue buildup
      if (Monitoring.transactionStats.queued > 1000) {
        healthStatus = healthStatus === 'healthy' ? 'degraded' : healthStatus;
        alerts.push(`LARGE QUEUE BUILDUP: ${Monitoring.transactionStats.queued} transactions`);
      }

      const stats = {
        status: healthStatus,
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(uptime / 60)}m`,
        memory: {
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        },
        transactions: {
          ...Monitoring.transactionStats,
          throughput: `${txPerSecond} tx/sec`,
        },
        alerts,
      };

      const statusCode = healthStatus === 'critical' ? 503 : 200;
      res.status(statusCode).json({
        success: healthStatus !== 'critical',
        data: stats,
      });
    } catch (error) {
      logger.error('Health check error', {
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(503).json({ success: false, error: 'Health check failed', status: 'critical' });
    }
  };

  static setQueueSize(size: number) {
    Monitoring.transactionStats.queued = size;
  }

  static setRequestsReceived(count: number) {
    Monitoring.transactionStats.requestsReceived = count;
  }

  static getQueueStatus = async (req: Request, res: Response): Promise<any> => {
    try {
      const uptime = process.uptime();
      const memUsage = process.memoryUsage();

      const stats = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(uptime / 60)}m`,
        memory: {
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        },
        transactions: Monitoring.transactionStats,
      };

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Monitoring error', {
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({ success: false, error: 'Monitoring failed' });
    }
  };

  static resetStats = async (req: Request, res: Response): Promise<any> => {
    try {
      Monitoring.transactionStats = {
        queued: 0,
        sent: 0,
        failed: 0,
        dropped: 0,
        requestsReceived: 0,
        lastReset: new Date(),
      };
      logger.info('Stats reset');
      res.status(200).json({ success: true, message: 'Stats reset' });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Reset failed' });
    }
  };

  static recordSent() {
    Monitoring.transactionStats.sent++;
  }

  static recordFailed() {
    Monitoring.transactionStats.failed++;
  }

  static recordDropped(count: number) {
    Monitoring.transactionStats.dropped += count;
  }
}
