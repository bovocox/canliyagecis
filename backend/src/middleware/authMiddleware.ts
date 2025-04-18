import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import logger from '../utils/logger';

const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('No auth token provided');
      return res.status(401).json({ error: 'No auth token provided' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      logger.error('Invalid auth token', { error });
      return res.status(401).json({ error: 'Invalid auth token' });
    }

    // Add user info to request
    (req as any).userId = user.id;
    next();
    
  } catch (error) {
    logger.error('Auth middleware error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default authMiddleware; 