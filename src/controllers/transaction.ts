import {Request , Response } from 'express';
import dbservices from '../services/dbservices';
import { dashboardCache } from '../config/cache';


export default class TransactionXDC{
   
  static getDailyTransactionCounts = async (req: Request, res: Response): Promise<any> => {
    try {
      const days = parseInt(req.query.days as string) || 90;
      const cacheKey = `dailyTransactionCounts:${days}`;
      const cachedData = dashboardCache.get(cacheKey);

      res.setHeader('Cache-Control', 'private, max-age=1500');
      res.setHeader('X-Cache', cachedData ? 'HIT' : 'MISS');

      if (cachedData) {
        return res.status(200).json(cachedData);
      }

      const result = await dbservices.TransactionsXDC.getDailyTransactionCounts(days);
      const response = {
        success: true,
        count: result.count,
        data: result.data,
      };

      dashboardCache.set(cacheKey, response);
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to fetch daily transaction counts' });
    }
  };


  static getDailyActiveUsers = async (req: Request, res: Response): Promise<any> => {
    try {
      const days = parseInt(req.query.days as string) || 90;
      const cacheKey = `dailyActiveUsers:${days}`;
      const cachedData = dashboardCache.get(cacheKey);

      res.setHeader('Cache-Control', 'private, max-age=1500');
      res.setHeader('X-Cache', cachedData ? 'HIT' : 'MISS');

      if (cachedData) {
        return res.status(200).json(cachedData);
      }

      const result = await dbservices.TransactionsXDC.getDailyActiveUsers(days);
      const response = {
        success: true,
        count: result.count,
        data: result.data,
      };

      dashboardCache.set(cacheKey, response);
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to fetch daily active users' });
    }
  }; 

  static getMonthlyUsers = async (req: Request, res: Response): Promise<any> => {
    try {
      const cacheKey = 'monthlyActiveUsers';
      const cachedData = dashboardCache.get(cacheKey);

      res.setHeader('Cache-Control', 'private, max-age=1500');
      res.setHeader('X-Cache', cachedData ? 'HIT' : 'MISS');

      if (cachedData) {
        return res.status(200).json(cachedData);
      }

      const result = await dbservices.TransactionsXDC.getMonthlyActiveUsers();
      const response = {
        success: true,
        count: result,
      };

      dashboardCache.set(cacheKey, response);
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to fetch daily active users' });
    }
  }; 

  static getMonthlyTransaction = async (req: Request, res: Response): Promise<any> => {
    try {
      const cacheKey = 'monthlyTransactionCount';
      const cachedData = dashboardCache.get(cacheKey);

      res.setHeader('Cache-Control', 'private, max-age=1500');
      res.setHeader('X-Cache', cachedData ? 'HIT' : 'MISS');

      if (cachedData) {
        return res.status(200).json(cachedData);
      }

      const result = await dbservices.TransactionsXDC.getMonthlyTransactions();
      const response = {
        success: true,
        count: result,
      };
      
      dashboardCache.set(cacheKey, response);
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to fetch daily active users' });
    }
  }; 
}