import { Request, Response } from 'express';
import dbservices from '../services/dbservices';
import { dashboardCache } from '../config/cache';
import DashboardCacheManager from '../services/dashboardCacheManager';

export default class Dashboard {
  // Unified dashboard endpoint that returns all data
  // static getAllDashboardData = async (req: Request, res: Response): Promise<any> => {
  //   try {
  //     const cacheKey = 'dashboardData:all';
  //     const cachedData = dashboardCache.get(cacheKey);

  //     // Add ETag support to prevent duplicate requests
  //     if (cachedData) {
  //       const etag = crypto
  //         .createHash('md5')
  //         .update(JSON.stringify(cachedData))
  //         .digest('hex');
        
  //       res.setHeader('ETag', etag);
  //       res.setHeader('Cache-Control', 'private, max-age=480'); // 8 minutes
        
  //       // Check if client has the same version
  //       if (req.headers['if-none-match'] === etag) {
  //         return res.status(304).end(); // Not Modified
  //       }

  //       return res.status(200).json(cachedData);
  //     }

  //     // Fetch all data in parallel for better performance
  //     const days = parseInt(req.query.days as string) || 90;
      
  //     const [
  //       userCounts,
  //       dailyActiveUsers,
  //       dailyTransactions,
  //       monthlyUsers,
  //       monthlyTransactions,
  //     ] = await Promise.all([
  //       dbservices.User.counts(),
  //       dbservices.TransactionsXDC.getDailyActiveUsers(days),
  //       dbservices.TransactionsXDC.getDailyTransactionCounts(days),
  //       dbservices.TransactionsXDC.getMonthlyActiveUsers(),
  //       dbservices.TransactionsXDC.getMonthlyTransactions(),

  //     ]);

  //     const response = {
  //       success: true,
  //       timestamp: new Date().toISOString(),
  //       cacheDuration: 480, // Let frontend know cache duration (8 minutes)
  //       data: {
  //         userCounts,
  //         dailyActiveUsers: {
  //           count: dailyActiveUsers.count,
  //           data: dailyActiveUsers.data
  //         },
  //         dailyTransactions: {
  //           count: dailyTransactions.count,
  //           data: dailyTransactions.data
  //         },
  //         monthlyUsers,
  //         monthlyTransactions
  //       },
  //     };

  //     // Cache the response
  //     dashboardCache.set(cacheKey, response);

  //     // Generate ETag for the response
  //     const etag = crypto
  //       .createHash('md5')
  //       .update(JSON.stringify(response))
  //       .digest('hex');
      
  //     res.setHeader('ETag', etag);
  //     res.setHeader('Cache-Control', 'private, max-age=480'); // 8 minutes
  //     res.setHeader('X-Cache', 'MISS'); // Indicate cache miss

  //     return res.status(200).json(response);
  //   } catch (error) {
  //     res.status(500).json({ 
  //       success: false,
  //       error: error.message || 'Failed to fetch dashboard data' 
  //     });
  //   }
  // };

  static getAllDashboardData = async (
    req: Request,
    res: Response,
  ): Promise<any> => {
    try {
      const { snapshot, freshness, refreshTriggered } =
        await DashboardCacheManager.getAllSnapshot();

      const { response, etag, refreshedAt, expiresAt } = snapshot;

      if (req.headers["if-none-match"] === etag) {
        res.setHeader("ETag", etag);
        return res.status(304).end();
      }

      const now = Date.now();
      const cacheAgeSeconds = Math.max(
        0,
        Math.floor((now - refreshedAt) / 1000),
      );
      const ttlRemainingSeconds = Math.max(
        0,
        Math.floor((expiresAt - now) / 1000),
      );

      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      res.setHeader("X-Cache", freshness === "fresh" ? "HIT" : "STALE");
      res.setHeader("X-Cache-Age", cacheAgeSeconds.toString());
      res.setHeader("X-Cache-TTL", ttlRemainingSeconds.toString());

      if (refreshTriggered) {
        res.setHeader("X-Cache-Refresh", "in-progress");
      }

      const lastError = DashboardCacheManager.getLastError("all");
      if (lastError) {
        res.setHeader("X-Cache-Last-Error", lastError);
      }

      return res.status(200).json(response);
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error?.message || "Failed to fetch dashboard data",
      });
    }
  };

  static getAllDashboardDataAVAX = async (
    req: Request,
    res: Response,
  ): Promise<any> => {
    try {
      const { snapshot, freshness, refreshTriggered } =
        await DashboardCacheManager.getAvaxSnapshot();

      const { response, etag, refreshedAt, expiresAt } = snapshot;

      if (req.headers["if-none-match"] === etag) {
        res.setHeader("ETag", etag);
        return res.status(304).end();
      }

      const now = Date.now();
      const cacheAgeSeconds = Math.max(
        0,
        Math.floor((now - refreshedAt) / 1000),
      );
      const ttlRemainingSeconds = Math.max(
        0,
        Math.floor((expiresAt - now) / 1000),
      );

      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      res.setHeader("X-Cache", freshness === "fresh" ? "HIT" : "STALE");
      res.setHeader("X-Cache-Age", cacheAgeSeconds.toString());
      res.setHeader("X-Cache-TTL", ttlRemainingSeconds.toString());

      if (refreshTriggered) {
        res.setHeader("X-Cache-Refresh", "in-progress");
      }

      const lastError = DashboardCacheManager.getLastError("avax");
      if (lastError) {
        res.setHeader("X-Cache-Last-Error", lastError);
      }

      return res.status(200).json(response);
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error?.message || "Failed to fetch dashboard data",
      });
    }
  };

  //   static getAllDashboardDataAVAX = async (req: Request, res: Response): Promise<any> => {
  //   try {
  //     const cacheKey = 'dashboardData:avax';
  //     const cachedData = dashboardCache.get(cacheKey);

  //     // Add ETag support to prevent duplicate requests
  //     if (cachedData) {
  //       const etag = crypto
  //         .createHash('md5')
  //         .update(JSON.stringify(cachedData))
  //         .digest('hex');
        
  //       res.setHeader('ETag', etag);
  //       res.setHeader('Cache-Control', 'private, max-age=480'); // 8 minutes
        
  //       // Check if client has the same version
  //       if (req.headers['if-none-match'] === etag) {
  //         return res.status(304).end(); // Not Modified
  //       }

  //       return res.status(200).json(cachedData);
  //     }

  //     // Fetch all data in parallel for better performance
  //     const days = parseInt(req.query.days as string) || 90;
      
  //     const [
  //       userCountsAvax,
  //       dailyActiveUsersAvax,
  //       dailyTransactionsAvax,
  //       monthlyUsersAvax,
  //       monthlyTransactionsAvax
  //     ] = await Promise.all([
  //       dbservices.User.countsAvax(),
  //       dbservices.TransactionsAvax.getDailyActiveUsers(days),
  //       dbservices.TransactionsAvax.getDailyTransactionCounts(days),
  //       dbservices.TransactionsAvax.getMonthlyActiveUsers(),
  //       dbservices.TransactionsAvax.getMonthlyTransactions()

  //     ]);

  //     const response = {
  //       success: true,
  //       timestamp: new Date().toISOString(),
  //       cacheDuration: 480, // Let frontend know cache duration (8 minutes)
  //       data: {
  //         userCounts: userCountsAvax,
  //         dailyActiveUsers: {
  //           count: dailyActiveUsersAvax.count,
  //           data: dailyActiveUsersAvax.data
  //         },
  //         dailyTransactions: {
  //           count: dailyTransactionsAvax.count,
  //           data: dailyTransactionsAvax.data
  //         },
  //         monthlyUsers: monthlyUsersAvax,
  //         monthlyTransactions: monthlyTransactionsAvax
  //       }
  //     };

  //     // Cache the response
  //     dashboardCache.set(cacheKey, response);

  //     // Generate ETag for the response
  //     const etag = crypto
  //       .createHash('md5')
  //       .update(JSON.stringify(response))
  //       .digest('hex');
      
  //     res.setHeader('ETag', etag);
  //     res.setHeader('Cache-Control', 'private, max-age=480'); // 8 minutes
  //     res.setHeader('X-Cache', 'MISS'); // Indicate cache miss

  //     return res.status(200).json(response);
  //   } catch (error) {
  //     res.status(500).json({ 
  //       success: false,
  //       error: error.message || 'Failed to fetch dashboard data' 
  //     });
  //   }
  // };



  // Progressive loading endpoint - returns data as it becomes available
 
  
 
 
  static getDashboardDataProgressive = async (req: Request, res: Response): Promise<any> => {
    try {
      // Set up SSE (Server-Sent Events) for progressive loading
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      const days = parseInt(req.query.days as string) || 90;
      const sendData = (eventName: string, data: any) => {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Check cache for each metric individually
      const cachedUserCounts = dashboardCache.get('dashboard:userCounts');
      if (cachedUserCounts) {
        sendData('userCounts', { cached: true, data: cachedUserCounts });
      } else {
        dbservices.User.counts().then(data => {
          dashboardCache.set('dashboard:userCounts', data);
          sendData('userCounts', { cached: false, data });
        }).catch(err => sendData('error', { metric: 'userCounts', error: err.message }));
      }

      const cachedDailyUsers = dashboardCache.get(`dashboard:dailyUsers:${days}`);
      if (cachedDailyUsers) {
        sendData('dailyActiveUsers', { cached: true, data: cachedDailyUsers });
      } else {
        dbservices.TransactionsXDC.getDailyActiveUsers(days).then(data => {
          dashboardCache.set(`dashboard:dailyUsers:${days}`, data);
          sendData('dailyActiveUsers', { cached: false, data });
        }).catch(err => sendData('error', { metric: 'dailyActiveUsers', error: err.message }));
      }

      const cachedDailyTx = dashboardCache.get(`dashboard:dailyTransactions:${days}`);
      if (cachedDailyTx) {
        sendData('dailyTransactions', { cached: true, data: cachedDailyTx });
      } else {
        dbservices.TransactionsXDC.getDailyTransactionCounts(days).then(data => {
          dashboardCache.set(`dashboard:dailyTransactions:${days}`, data);
          sendData('dailyTransactions', { cached: false, data });
        }).catch(err => sendData('error', { metric: 'dailyTransactions', error: err.message }));
      }

      const cachedMonthlyUsers = dashboardCache.get('dashboard:monthlyUsers');
      if (cachedMonthlyUsers) {
        sendData('monthlyUsers', { cached: true, data: cachedMonthlyUsers });
      } else {
        dbservices.TransactionsXDC.getMonthlyActiveUsers().then(data => {
          dashboardCache.set('dashboard:monthlyUsers', data);
          sendData('monthlyUsers', { cached: false, data });
        }).catch(err => sendData('error', { metric: 'monthlyUsers', error: err.message }));
      }

      const cachedMonthlyTx = dashboardCache.get('dashboard:monthlyTransactions');
      if (cachedMonthlyTx) {
        sendData('monthlyTransactions', { cached: true, data: cachedMonthlyTx });
      } else {
        dbservices.TransactionsXDC.getMonthlyTransactions().then(data => {
          dashboardCache.set('dashboard:monthlyTransactions', data);
          sendData('monthlyTransactions', { cached: false, data });
        }).catch(err => sendData('error', { metric: 'monthlyTransactions', error: err.message }));
      }

      // Send completion event after a delay
      setTimeout(() => {
        sendData('complete', { message: 'All data loaded' });
        res.end();
      }, 1000);

    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to stream dashboard data' 
      });
    }
  };

  // Individual metric endpoints with proper caching headers
  static getUserCounts = async (req: Request, res: Response): Promise<any> => {
    try {
      const cacheKey = 'dashboard:userCounts';
      const cachedData = dashboardCache.get(cacheKey);

      res.setHeader('Cache-Control', 'private, max-age=480');
      res.setHeader('X-Cache', cachedData ? 'HIT' : 'MISS');

      if (cachedData) {
        return res.status(200).json({
          success: true,
          cached: true,
          data: cachedData
        });
      }

      const counts = await dbservices.User.counts();
      dashboardCache.set(cacheKey, counts);

      res.status(200).json({
        success: true,
        cached: false,
        data: counts
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch user counts'
      });
    }
  };

  // Utility function to refresh the dashboard cache (for cron worker)
  static refreshDashboardCache = async (): Promise<boolean> => {
    try {
      await DashboardCacheManager.refreshAll("external-trigger");
      return true;
    } catch (error) {
      return false;
    }
  };

  static refreshDashboardCacheAvax = async (): Promise<boolean> => {
    try {
      await DashboardCacheManager.refreshAvax("external-trigger");
      return true;
    } catch (error) {
      return false;
    }
  };


  //   static refreshDashboardCacheAvax = async () => {
  //   try {
  //     const cacheKey = 'dashboardData:avax';
  //     // Fetch all data in parallel for better performance
  //     const days = 90;
  //     const [
  //       userCountsAvax,
  //       dailyActiveUsersAvax,
  //       dailyTransactionsAvax,
  //       monthlyUsersAvax,
  //       monthlyTransactionsAvax
  //     ] = await Promise.all([
  //       dbservices.User.countsAvax(),
  //       dbservices.TransactionsAvax.getDailyActiveUsers(days),
  //       dbservices.TransactionsAvax.getDailyTransactionCounts(days),
  //       dbservices.TransactionsAvax.getMonthlyActiveUsers(),
  //       dbservices.TransactionsAvax.getMonthlyTransactions()
  //     ]);
  //     const response = {
  //       success: true,
  //       timestamp: new Date().toISOString(),
  //       cacheDuration: 480,
  //       data: {
  //         userCounts: userCountsAvax,
  //         dailyActiveUsers: {
  //           count: dailyActiveUsersAvax.count,
  //           data: dailyActiveUsersAvax.data
  //         },
  //         dailyTransactions: {
  //           count: dailyTransactionsAvax.count,
  //           data: dailyTransactionsAvax.data
  //         },
  //         monthlyUsers: monthlyUsersAvax,
  //         monthlyTransactions: monthlyTransactionsAvax
  //       }
  //     };
  //     dashboardCache.set(cacheKey, response);
  //     return true;
  //   } catch (error) {
  //     return false;
  //   }
  // }
} 