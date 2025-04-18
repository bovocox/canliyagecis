import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import logger from '../utils/logger';

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
const envPath = path.resolve(process.cwd(), envFile);

dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

logger.info('Supabase Configuration:', {
  url: supabaseUrl ? 'Set' : 'Not Set',
  anonKey: supabaseAnonKey ? 'Set' : 'Not Set',
  serviceKey: supabaseServiceKey ? 'Set' : 'Not Set',
  envFile,
  nodeEnv: process.env.NODE_ENV,
  environment: process.env.NODE_ENV || 'development',
  service: 'veciz-ai'
});

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  const error = new Error('Required Supabase environment variables are not set');
  logger.error('Supabase Configuration Error:', {
    error: error.message,
    envFile,
    nodeEnv: process.env.NODE_ENV,
    environment: process.env.NODE_ENV || 'development',
    service: 'veciz-ai',
    cwd: process.cwd()
  });
  throw error;
}

// Create Supabase client with anonymous key (for public operations)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

// Create Supabase admin client with service role key (for admin operations)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export const getServiceSupabase = () => supabaseAdmin;

export default supabase; 