import {Request , Response } from 'express';
import dbservices from '../services/dbservices';
import cache from '../config/cache';


export default class TransactionXDC{
   
  static getDailyTransactionCounts = async (req: Request, res: Response): Promise<any> => {
    try {
      const cacheKey = 'dailyTransactionCounts';
      const cachedData = cache.get(cacheKey);

      if (cachedData) {
        return res.status(200).json(cachedData);
      }

      const result = await dbservices.TransactionsXDC.getDailyTransactionCounts();
      const response = {
        success: true,
        count: result.count,
        data: result.data,
      };

      cache.set(cacheKey, response);
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to fetch daily transaction counts' });
    }
  };


  static getDailyActiveUsers = async (req: Request, res: Response): Promise<any> => {
    try {
      const cacheKey = 'dailyActiveUsers';
      const cachedData = cache.get(cacheKey);

      if (cachedData) {
        return res.status(200).json(cachedData);
      }

      const result = await dbservices.TransactionsXDC.getDailyActiveUsers();
      const response = {
        success: true,
        count: result.count,
        data: result.data,
      };

      cache.set(cacheKey, response);
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to fetch daily active users' });
    }
  }; 

  static getMonthlyUsers = async (req: Request, res: Response): Promise<any> => {
    try {
      const cacheKey = 'monthlyActiveUsers';
      const cachedData = cache.get(cacheKey);

      if (cachedData) {
        return res.status(200).json(cachedData);
      }

      const result = await dbservices.TransactionsXDC.getMonthlyActiveUsers();
      const response = {
        success: true,
        count: result,
      };

      cache.set(cacheKey, response);
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to fetch daily active users' });
    }
  }; 

  static getMonthlyTransaction = async (req: Request, res: Response): Promise<any> => {
    try {
      const cacheKey = 'monthlyTransactionCount';
      const cachedData = cache.get(cacheKey);

      if (cachedData) {
        return res.status(200).json(cachedData);
      }

      const result = await dbservices.TransactionsXDC.getMonthlyTransactions();
      const response = {
        success: true,
        count: result,
      };
      
      cache.set(cacheKey, response);
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to fetch daily active users' });
    }
  }; 
}