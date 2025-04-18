import * as dotenv from 'dotenv';
import path from 'path';

const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production'
  : '.env.development';

const envPath = path.resolve(process.cwd(), envFile);
console.log('📝 Loading environment from:', envPath);

dotenv.config({ path: envPath });

// Environment variables interface
interface Env {
  NODE_ENV: string;
  LOG_LEVEL: string;
  REDIS_URL: string | undefined;
  REDIS_CACHE_TTL: number;
  SUPABASE_URL: string | undefined;
  SUPABASE_ANON_KEY: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY: string | undefined;
  DATABASE_URL: string | undefined;
}

// Redis URL kontrolü
const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  console.log(`🔌 Redis URL bulundu: ${redisUrl.replace(/\/\/(.+?)@/, '//***@')}`);
} else {
  console.error('❌ Redis URL bulunamadı! Bu kritik bir hatadır.');
}

// Environment variables
export const env: Env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  REDIS_URL: process.env.REDIS_URL,
  REDIS_CACHE_TTL: parseInt(process.env.REDIS_CACHE_TTL || '3600', 10),
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL: process.env.DATABASE_URL
};

// Redis URL'sini son kez kontrol et
if (env.REDIS_URL) {
  console.log(`✅ Kullanılan Redis URL: ${env.REDIS_URL.replace(/\/\/(.+?)@/, '//***@')}`);
} else {
  console.error('❌ Redis URL ayarlanmamış! Bu kritik bir hatadır.');
}
