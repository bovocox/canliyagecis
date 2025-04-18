import Redis from 'ioredis';
import logger from '../../utils/logger';

// Redis URL'sini doğrudan env'den alıyoruz - Sadece REDIS_URL kullanılıyor
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
logger.info(`BullMQ Redis URL: ${REDIS_URL.replace(/\/\/(.+?)@/, '//***@')}`);

/**
 * Bu Redis config dosyası BullMQ için kullanılır.
 * Ana Redis bağlantı noktası, /config/redis.ts içerisinde tanımlanmıştır.
 * Bu, BullMQ'nun kendi Redis bağlantısını yönetmesine izin vermek içindir.
 */

// Redis bağlantısı oluştur
const createRedisInstance = () => {
  try {
    logger.info('BullMQ için Redis bağlantısı oluşturuluyor...', {
      url: REDIS_URL.replace(/\/\/(.+?)@/, '//***@') // Şifreyi gizleme
    });
    
    const instance = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null, // BullMQ için null olarak ayarlanması öneriliyor
      enableReadyCheck: false, // Upstash için önemli
      enableOfflineQueue: true,
      connectTimeout: 30000, // 30 saniye bağlantı zaman aşımı - artırıldı
      tls: {
        rejectUnauthorized: false // SSL sertifika doğrulamasını devre dışı bırak
      },
      retryStrategy(times) {
        // Geliştirilmiş yeniden deneme stratejisi 
        const maxDelay = 30000; // 30 saniye maksimum gecikme süresi
        const delay = Math.min(Math.exp(times) * 500, maxDelay); // Daha yavaş artan gecikme
        logger.warn(`BullMQ Redis bağlantı hatası, ${delay}ms sonra yeniden denenecek (deneme: ${times})`, {
          function: 'redis.retryStrategy'
        });
        return delay;
      },
      reconnectOnError(err) {
        // Yeniden bağlanmayı gerektiren hata durumları
        const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'SELF_SIGNED_CERT_IN_CHAIN'];
        if (targetErrors.some(code => err.message.includes(code))) {
          logger.warn(`Redis hatası nedeniyle yeniden bağlanılıyor: ${err.message}`);
          return true;
        }
        return false;
      },
      connectionName: `bullmq_queue_${Math.floor(Math.random() * 1000)}`,
      showFriendlyErrorStack: true // Geliştirme sırasında hata ayrıntılarını göster
    });
    
    // Redis bağlantı olaylarını dinle
    instance.on('connect', async () => {
      logger.info('BullMQ Redis bağlantısı başarılı', {
        status: instance.status
      });
      
      // Log seviyesini minimuma düşür
      try {
        await instance.config('SET', 'loglevel', 'none');
        logger.info('Redis log seviyesi none olarak ayarlandı');
      } catch (error) {
        logger.warn('Redis log seviyesi ayarlanamadı', { error });
      }
    });
    
    instance.on('ready', () => {
      logger.info('BullMQ Redis bağlantısı hazır');
    });
    
    instance.on('error', (err) => {
      logger.error('BullMQ Redis bağlantı hatası', {
        error: err.message
      });
    });
    
    instance.on('close', () => {
      logger.warn('BullMQ Redis bağlantısı kapandı');
    });

    instance.on('reconnecting', () => {
      logger.warn('BullMQ Redis yeniden bağlanıyor');
    });
    
    return instance;
  } catch (error) {
    logger.error('BullMQ Redis bağlantısı oluşturulurken hata', {
      error
    });
    throw error;
  }
};

// Redis bağlantısını dışa aktar
export const queueRedis = createRedisInstance();

// Redis URL'sini dışa aktar
export const redisConfig = {
  url: REDIS_URL
};

export default queueRedis;
