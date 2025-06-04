import {Request , Response } from 'express';
import dbservices from '../services/dbservices';


export default class TransactionXDC{
   
  static getDailyTransactionCounts = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await dbservices.TransactionsXDC.getDailyTransactionCounts();
      res.status(200).json({
        success: true,
        count: result.count,
        data: result.data,
      });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to fetch daily transaction counts' });
    }
  };


  static getDailyActiveUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await dbservices.TransactionsXDC.getDailyActiveUsers();
      res.status(200).json({
        success: true,
        count: result.count,
        data: result.data,
      });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to fetch daily active users' });
    }
  }; 
}