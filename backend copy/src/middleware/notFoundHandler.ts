import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  logger.warn('Route not found:', { path: req.path, method: req.method });
  
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.path} not found`
  });
}; 