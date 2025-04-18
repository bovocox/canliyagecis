import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';
import { User } from '@supabase/supabase-js';

export interface CustomRequest extends Request {
  user?: User;
}

export const authenticateToken = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({ message: 'Authentication failed' });
  }
};
