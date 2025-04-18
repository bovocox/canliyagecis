import { redis } from '../config/redis';
import { Transcript } from '../types/transcript';
import { Summary } from '../types/summary';
import logger from '../utils/logger';

/**
 * Önbellek (Cache) Servisi
 * 
 * Her veri türü için optimize edilmiş TTL (Time-To-Live) değerleri ve
 * standart anahtar şeması ile veritabanı yükünü azaltmak için önbellek yönetimi sağlar.
 */
class CacheService {
  // Anahtar önekleri
  private readonly TRANSCRIPT_PREFIX = 'transcript:';
  private readonly SUMMARY_PREFIX = 'summary:';
  private readonly VIDEO_PREFIX = 'video:';
  private readonly TASK_PREFIX = 'task:';
  private readonly RESULT_PREFIX = 'result:';
  
  // Veri türüne göre optimize edilmiş TTL değerleri (saniye cinsinden)
  private readonly TTL = {
    TRANSCRIPT: 3600 * 12, // 12 saat (transkriptler nadiren değişir)
    SUMMARY: 3600 * 24,    // 24 saat (özetler çok nadiren değişir)
    VIDEO: 3600 * 24,      // 24 saat (video metadata nadiren değişir)
    TASK: 300,             // 5 dakika (task durumları sık değişir)
    RESULT: 3600 * 3,      // 3 saat (sonuçlar orta sıklıkta değişir)
    DEFAULT: 3600          // 1 saat (varsayılan değer)
  };

  /**
   * Standart önbellek anahtarı oluşturur
   * Format: prefix:primaryKey[:secondaryKey][:tertiaryKey]
   * 
   * @param prefix Anahtar öneki (veri türünü belirler)
   * @param primaryKey Ana tanımlayıcı (genellikle id veya video_id)
   * @param secondaryKey İkincil tanımlayıcı (örn. dil)
   * @param tertiaryKey Üçüncül tanımlayıcı (opsiyonel)
   * @returns Oluşturulan standart önbellek anahtarı
   */
  private generateCacheKey(
    prefix: string, 
    primaryKey: string, 
    secondaryKey?: string,
    tertiaryKey?: string
  ): string {
    let key = `${prefix}${primaryKey}`;
    
    if (secondaryKey) {
      key += `:${secondaryKey}`;
    }
    
    if (tertiaryKey) {
      key += `:${tertiaryKey}`;
    }
    
    return key;
  }

  /**
   * Verinin önbellekte ne kadar süre kalacağını belirler
   * 
   * @param dataType Veri türü (TRANSCRIPT, SUMMARY, vs.)
   * @param data Veri değeri
   * @returns TTL değeri (saniye cinsinden)
   */
  private determineTTL(dataType: keyof typeof this.TTL, data?: any): number {
    // Bazı veri türleri için duruma göre TTL'i ayarla
    if (dataType === 'TASK' && data?.status === 'processing') {
      return this.TTL.TASK / 2; // İşlenen tasklar için daha kısa TTL
    }
    
    if (dataType === 'TRANSCRIPT' && data?.is_manual) {
      return this.TTL.TRANSCRIPT * 2; // Manuel transkriptler daha uzun süre önbellekte kalsın
    }
    
    return this.TTL[dataType] || this.TTL.DEFAULT;
  }

  /**
   * Önbellekten veri okur
   * 
   * @param key Önbellek anahtarı
   * @param context Log için context bilgisi
   * @returns Önbellekteki veri veya null
   */
  private async get<T>(key: string, context: Record<string, any> = {}): Promise<T | null> {
    try {
      const cached = await redis.get(key);

      if (cached) {
        logger.info('Cache hit', {
          key,
          ...context,
          function: 'CacheService.get'
        });
        return JSON.parse(cached) as T;
      }

      logger.info('Cache miss', {
        key,
        ...context,
        function: 'CacheService.get'
      });
      return null;
    } catch (error) {
      logger.error('Error getting data from cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        key,
        ...context,
        function: 'CacheService.get'
      });
      return null;
    }
  }

  /**
   * Veriyi önbelleğe yazar
   * 
   * @param key Önbellek anahtarı
   * @param data Önbelleğe yazılacak veri
   * @param ttl TTL değeri (saniye cinsinden)
   * @param context Log için context bilgisi
   */
  private async set<T>(key: string, data: T, ttl: number, context: Record<string, any> = {}): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(data), 'EX', ttl);
      
      logger.info('Successfully cached data', {
        key,
        ttl,
        ...context,
        function: 'CacheService.set'
      });
    } catch (error) {
      logger.error('Error caching data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        key,
        ...context,
        function: 'CacheService.set'
      });
    }
  }

  /**
   * Önbellekten veri siler
   * 
   * @param key Önbellek anahtarı
   * @param context Log için context bilgisi
   */
  private async invalidate(key: string, context: Record<string, any> = {}): Promise<void> {
    try {
      await redis.del(key);
      
      logger.info('Successfully invalidated cache', {
        key,
        ...context,
        function: 'CacheService.invalidate'
      });
    } catch (error) {
      logger.error('Error invalidating cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        key,
        ...context,
        function: 'CacheService.invalidate'
      });
    }
  }

  // Compatibility methods for old cache service
  async getFromCache(videoId: string, language: string): Promise<any> {
    return this.getTranscript(videoId, language);
  }

  async setToCache(videoId: string, language: string, data: any): Promise<void> {
    return this.setTranscript(videoId, language, data);
  }

  // Transcript Cache İşlemleri
  async getTranscript(videoId: string, language: string): Promise<Transcript | null> {
    const key = this.generateCacheKey(this.TRANSCRIPT_PREFIX, videoId, language);
    return this.get<Transcript>(key, { videoId, language });
  }

  async setTranscript(videoId: string, language: string, data: Transcript): Promise<void> {
    const key = this.generateCacheKey(this.TRANSCRIPT_PREFIX, videoId, language);
    const ttl = this.determineTTL('TRANSCRIPT', data);
    return this.set<Transcript>(key, data, ttl, { videoId, language });
  }

  async invalidateTranscript(videoId: string, language: string): Promise<void> {
    const key = this.generateCacheKey(this.TRANSCRIPT_PREFIX, videoId, language);
    return this.invalidate(key, { videoId, language });
  }

  // Summary Cache İşlemleri
  async getSummary(videoId: string, language: string): Promise<Summary | null> {
    const key = this.generateCacheKey(this.SUMMARY_PREFIX, videoId, language);
    return this.get<Summary>(key, { videoId, language });
  }

  async setSummary(videoId: string, language: string, data: Summary): Promise<void> {
    const key = this.generateCacheKey(this.SUMMARY_PREFIX, videoId, language);
    const ttl = this.determineTTL('SUMMARY', data);
    return this.set<Summary>(key, data, ttl, { videoId, language });
  }

  async invalidateSummary(videoId: string, language: string): Promise<void> {
    const key = this.generateCacheKey(this.SUMMARY_PREFIX, videoId, language);
    return this.invalidate(key, { videoId, language });
  }
}

// Singleton instance
export const cacheService = new CacheService();
export default cacheService; 