import { Job } from 'bullmq';
import queueService, { BullMQJobData } from '../../services/queueService';
import logger from '../../utils/logger';

// TranslationService import sorunu düzeltildi - Aslında bu servisi kullanmak için şu anda hazır değiliz
// Servis oluşturulana kadar bu satırı yorum satırı olarak tutuyoruz
// import { TranslationService } from '../../services/translationService'; 

/**
 * Translation worker - Not implemented yet
 * Bu worker, çeviri işlerini arka planda gerçekleştirecek
 */
class TranslationWorker {
  // private translationService: TranslationService;
  private workerId: string;
  
  constructor() {
    // this.translationService = new TranslationService();
    this.workerId = `translation-worker-${Date.now()}`;
    
    logger.info(`Translation worker başlatılıyor. Worker ID: ${this.workerId}`);
  }
  
  /**
   * Worker'ı başlatır
   */
  start(): void {
    logger.info('Translation worker kaydediliyor...');
    
    // BullMQ worker'ı kaydet - Bu kısmı translationQueue oluşturulduğunda aktifleştir
    /* 
    queueService.registerWorker(
      'translation', 
      this.processJob.bind(this),
      1 // Aynı anda en fazla 1 çeviri işi
    );
    */
    
    logger.info('Translation worker başarıyla başlatıldı');
  }
  
  /**
   * BullMQ işini işleyen metod - şu anda pasif
   */
  private async processJob(job: Job<BullMQJobData>): Promise<any> {
    const { taskId, text, sourceLanguage, targetLanguage } = job.data as any;
    
    logger.info(`Çeviri işi başlatılıyor (BullMQ Job ID: ${job.id})`, {
      jobId: job.id,
      taskId,
      sourceLanguage,
      targetLanguage,
      textLength: text?.length || 0
    });
    
    try {
      // Çeviri işlemini gerçekleştir
      // TranslationService hazır olduğunda aktifleştirilecek
      // const translatedText = await this.translationService.translateText(
      //   text,
      //   sourceLanguage,
      //   targetLanguage
      // );
      
      // Şimdilik test amaçlı basit bir çeviri
      const translatedText = `[Translated: ${text?.substring(0, 50)}...]`;
      
      logger.info(`Çeviri işi tamamlandı (BullMQ Job ID: ${job.id})`, {
        jobId: job.id,
        taskId,
        translatedTextLength: translatedText?.length || 0
      });
      
      // İşi tamamlandı olarak işaretle
      await queueService.markTaskComplete('translation', taskId);
      
      return {
        originalText: text,
        translatedText,
        sourceLanguage,
        targetLanguage
      };
      
    } catch (error) {
      logger.error(`Çeviri işi sırasında hata (BullMQ Job ID: ${job.id})`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        jobId: job.id,
        taskId
      });
      
      // İşi başarısız olarak işaretle
      await queueService.markTaskFailed('translation', taskId, error);
      
      throw error;
    }
  }
}

export const translationWorker = new TranslationWorker();
