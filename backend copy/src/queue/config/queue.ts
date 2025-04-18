import queueService from '../../services/queueService';
import logger from '../../utils/logger';

/**
 * Tüm kuyrukları ve worker'ları başlatır
 */
export async function initializeQueues(): Promise<void> {
  try {
    logger.info('🧩 BullMQ kuyrukları başlatılıyor...');
    
    // Kuyruk durumlarını logla
    try {
      const queueStats = await queueService.getQueueStats();
      logger.info('📊 BullMQ kuyruk istatistikleri:', queueStats);
    } catch (statsError) {
      logger.error('❌ BullMQ kuyruk istatistikleri alınamadı:', statsError);
      // Hata olsa bile devam et
    }
    
    logger.info('✅ BullMQ kuyrukları başarıyla başlatıldı');
    
    return Promise.resolve();
  } catch (error) {
    logger.error('❌ BullMQ kuyrukları başlatılırken hata:', error);
    return Promise.reject(error);
  }
}

export default {
  initializeQueues
};
