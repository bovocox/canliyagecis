import Redis from 'ioredis';
import { env } from './env';

// Redis bağlantı URL'i environment variable'dan gelecek
const redisUrl = process.env.REDIS_URL;
export const CACHE_TTL = env.REDIS_CACHE_TTL;

if (!redisUrl) {
  throw new Error('Redis URL is not set in environment variables');
}

export const redis = new Redis(redisUrl, {
  tls: {
    rejectUnauthorized: false // SSL sertifika doğrulamasını devre dışı bırak
  },
  // Optimize Redis connection settings
  connectTimeout: 20000,         // 20 saniye bağlantı zaman aşımı (varsayılan 10s)
  commandTimeout: 10000,         // 10 saniye komut zaman aşımı
  maxRetriesPerRequest: 3,       // 3 kez yeniden deneme
  enableOfflineQueue: true,      // Çevrimdışıyken komutları sırala
  autoResubscribe: true,         // Otomatik olarak kanal aboneliklerini yeniden oluştur
  autoResendUnfulfilledCommands: true,  // Yerine getirilmemiş komutları otomatik olarak tekrar gönder
  enableReadyCheck: false,       // Upstash Redis için önemli
  retryStrategy(times) {
    // Üstel geri çekilme ile yeniden deneme: her başarısız denemede daha uzun bekle
    const delay = Math.min(Math.exp(times) * 100, 10000); // max 10 saniye
    console.log(`⏳ Redis bağlantı hatası, ${delay}ms sonra yeniden denenecek (deneme: ${times})`);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'SELF_SIGNED_CERT_IN_CHAIN'];
    const shouldReconnect = targetErrors.some(e => err.message.includes(e));
    if (shouldReconnect) {
      console.log(`🔄 Redis bağlantı hatası nedeniyle yeniden bağlanılıyor: ${err.message}`);
    }
    return shouldReconnect;
  },
  connectionName: `veciz_ai_${env.NODE_ENV}_${Math.floor(Math.random() * 1000)}`,
  showFriendlyErrorStack: true, // Geliştirme sırasında hata ayrıntılarını göster
});

// Redis connection events
redis.on('error', (error) => {
  console.error('❌ Redis connection error:', error);
});

redis.on('connect', async () => {
  console.log('✅ Redis connected');
  // Log level ayarlama kodu kaldırıldı
});

redis.on('ready', () => {
  console.log('✅ Redis ready');
});

redis.on('close', () => {
  console.log('🔄 Redis connection closed');
});

redis.on('reconnecting', (timeToReconnect: number) => {
  console.log(`⏳ Redis reconnecting in ${timeToReconnect}ms...`);
});

export default redis;
