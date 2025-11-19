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
