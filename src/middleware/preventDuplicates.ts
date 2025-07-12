import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { dashboardCache } from '../config/cache';

interface RequestFingerprint {
  timestamp: number;
  responseData?: any;
}

// Middleware to prevent duplicate requests
export const preventDuplicateRequests = (windowMs: number = 5000) => {
  const requestMap = new Map<string, RequestFingerprint>();

  // Clean up old entries every minute
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of requestMap.entries()) {
      if (now - value.timestamp > windowMs) {
        requestMap.delete(key);
      }
    }
  }, 60000);

  return (req: Request, res: Response, next: NextFunction): void => {
    // Generate request fingerprint
    const fingerprint = crypto
      .createHash('md5')
      .update(`${req.method}:${req.originalUrl}:${req.ip}:${JSON.stringify(req.query)}`)
      .digest('hex');

    const existing = requestMap.get(fingerprint);
    const now = Date.now();

    // Check if this is a duplicate request within the window
    if (existing && (now - existing.timestamp) < windowMs) {
      // If we have cached response data, return it
      if (existing.responseData) {
        res.setHeader('X-Duplicate-Request', 'true');
        res.setHeader('X-Original-Timestamp', existing.timestamp.toString());
        res.status(200).json(existing.responseData);
        return;
      }
      
      // Otherwise, just indicate it's a duplicate
      res.status(429).json({
        success: false,
        error: 'Duplicate request detected. Please wait before retrying.',
        retryAfter: Math.ceil((windowMs - (now - existing.timestamp)) / 1000)
      });
      return;
    }

    // Store the request fingerprint
    requestMap.set(fingerprint, { timestamp: now });

    // Intercept the response to cache it
    const originalSend = res.json;
    res.json = function(data: any) {
      // Cache successful responses
      if (res.statusCode === 200) {
        requestMap.set(fingerprint, { 
          timestamp: now, 
          responseData: data 
        });
      }
      return originalSend.call(this, data);
    };

    next();
  };
};

// Middleware specifically for dashboard endpoints
export const dashboardDuplicatePrevention = preventDuplicateRequests(3000); // 3 second window 