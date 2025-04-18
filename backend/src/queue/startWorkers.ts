import { initializeQueues } from './config/queue';
import logger from '../utils/logger';
import { transcriptWorker } from './workers/transcript.worker';
import { summaryWorker } from './workers/summary.worker';
import { translationWorker } from './workers/translation.worker';

/**
 * Starts all BullMQ workers
 */
export async function startWorkers(): Promise<void> {
  try {
    logger.info('Starting BullMQ workers...');
    
    // Her bir worker'ı bağımsız olarak başlat
    // Böylece birinde hata olursa diğerleri etkilenmez
    
    // Transcript worker'ı başlat
    try {
      logger.info('Starting transcript worker...');
      transcriptWorker.start();
      logger.info('Transcript worker started successfully');
    } catch (error) {
      logger.error('Error starting transcript worker:', error);
      // Hata olsa bile devam et, diğer worker'lar çalışabilir
    }
    
    // Summary worker'ı başlat
    try {
      logger.info('Starting summary worker...');
      summaryWorker.start();
      logger.info('Summary worker started successfully');
    } catch (error) {
      logger.error('Error starting summary worker:', error);
      // Hata olsa bile devam et
    }
    
    // Translation worker'ı başlatmaya çalış (opsiyonel)
    try {
      logger.info('Starting translation worker...');
      translationWorker.start();
      logger.info('Translation worker started successfully');
    } catch (error) {
      logger.error('Error starting translation worker:', error);
      // Bu worker henüz aktif olmadığı için hata bekleniyor, devam et
    }
    
    // Kuyruk durumlarını logla
    try {
      await initializeQueues();
    } catch (error) {
      logger.error('Error initializing queues:', error);
    }
    
    logger.info('Workers started successfully');
    
    return Promise.resolve();
  } catch (error) {
    logger.error('Error starting workers:', error);
    return Promise.reject(error);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('📥 Shutting down workers...');
  
  process.exit(0);
});

// Handle unexpected errors
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception in worker process', { error });
  // Don't exit - let the process continue and try to recover
});

export default startWorkers; 