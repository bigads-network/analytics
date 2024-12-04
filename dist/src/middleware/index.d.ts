import { Request, Response, NextFunction } from "express";
import { AnyZodObject } from "zod";
export declare const authenticateUserJwt: () => (req: any, res: any, next: NextFunction) => Promise<any>;
export declare const authenticateUser: ((req: any, res: any, next: NextFunction) => Promise<any>)[];
export declare const validateRequest: (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=index.d.ts.map