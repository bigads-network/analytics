import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { envConfigs } from './envconfig';

const secretKey = envConfigs.game_jwt_secret ;

export const generateGameToken = (gameId: number | string): string => {
  
    const expiration = envConfigs.game_timeout_expiration ? parseInt(envConfigs.game_timeout_expiration, 10) : 60;
    const payload = { gameId };
    const options = { expiresIn: `${expiration}m` }; // Correct format for expiration

    const token = jwt.sign(payload, secretKey, options);
  
    return token;
  };
  

  export const authenticateGameToken = (req: Request, res: Response, next: NextFunction): void => {
    const token = req.headers['game_authorization_token'] as string;
  
    if (!token) {
      res.status(401).json({ message: "Token is missing from gameAuthorization header" });
      return; // Ensure the function exits after sending a response
    }
  
    try {
      const decoded = jwt.verify(token, secretKey);
  
      // console.log(decoded ,"decodeeeeee gam,e tokennn" );
      // Attach the decoded gameId to the request object
      req.body.gameId = (decoded as { gameId: string | number }).gameId; // Attach gameId to the request
  
      next(); // Call the next middleware
    } catch (error) {
      res.status(403).json({ message: "Invalid or expired Game token", error: error.message });
    }
  };