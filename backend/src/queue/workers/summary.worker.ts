import { Job } from 'bullmq';
import { SummaryService } from '../../services/summaryService';
import logger from '../../utils/logger';
import queueService, { BullMQJobData } from '../../services/queueService';

/**
 * Summary worker - BullMQ implementasyonu
 * Bu worker, özet oluşturma işlerini arka planda işler
 */
class SummaryWorker {
  private summaryService: SummaryService;
  private workerId: string;
  private isStarted: boolean = false;
  
  constructor() {
    this.summaryService = new SummaryService();
    this.workerId = `summary-worker-${Date.now()}`;
    
    logger.info('Summary worker başlatılıyor', {
      workerId: this.workerId,
      function: 'SummaryWorker.constructor'
    });
  }
  
  /**
   * Worker'ı başlatır ve BullMQ servisine kaydeder
   */
  start(): void {
    try {
      // Eğer zaten başlatıldıysa tekrar başlatma
      if (this.isStarted) {
        logger.info('Summary worker zaten çalışıyor', {
          workerId: this.workerId,
          function: 'SummaryWorker.start'
        });
        return;
      }
      
      logger.info('Summary worker kaydediliyor', {
        workerId: this.workerId,
        function: 'SummaryWorker.start'
      });
      
      // BullMQ worker'ı kaydet
      queueService.registerWorker(
        'summary', 
        this.processJob.bind(this),
        1 // Aynı anda en fazla 1 özet işi (CPU/API kullanımını sınırlandırmak için)
      );
      
      this.isStarted = true;
      logger.info('Summary worker başarıyla başlatıldı', {
        workerId: this.workerId,
        function: 'SummaryWorker.start'
      });
    } catch (error) {
      logger.error('Summary worker başlatılırken hata', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        workerId: this.workerId,
        function: 'SummaryWorker.start'
      });
      throw error;
    }
  }
  
  /**
   * BullMQ işini işleyen metod
   */
  private async processJob(job: Job<BullMQJobData>): Promise<any> {
    const logContext = {
      jobId: job.id,
      workerId: this.workerId,
      function: 'SummaryWorker.processJob'
    };

    try {
      const { videoId, language, taskId, transcriptId, useWhisper = false, isPublic = false, userId } = job.data;
      
      // Veri doğrulama kontrolü
      if (!videoId || !language || !taskId || !transcriptId) {
        const error = new Error(`Geçersiz iş verileri: videoId, language, taskId ve transcriptId zorunludur`);
        logger.error('Özet işi geçersiz veri nedeniyle reddedildi', {
          ...logContext,
          videoId,
          language,
          taskId,
          transcriptId,
          error: error.message
        });
        
        await queueService.markTaskFailed('summary', taskId || String(job.id), error);
        throw error;
      }
      
      logger.info('Özet işi başlatılıyor', {
        ...logContext,
        videoId,
        language,
        taskId,
        transcriptId,
        userId: userId || 'system'
      });
      
      try {
        // Özet durumunu güncelle
        logger.debug('Özet durumu processing olarak güncelleniyor', {
          ...logContext,
          taskId,
          videoId,
          language
        });
        
        // Önce mevcut özeti al
        const existingSummary = await this.summaryService.getSummary(videoId, language);
        if (!existingSummary) {
          throw new Error(`Summary not found with ID: ${taskId}`);
        }
        
        // Durumu güncelle
        await this.summaryService.updateSummary(taskId, {
          status: 'processing',
          video_id: videoId,
          language: language,
          updated_at: new Date()
        });
        
        // Özet işleme
        logger.info('Özet işlemi başlıyor', {
          ...logContext,
          videoId,
          language,
          taskId
        });
        
        const summaryResult = await this.summaryService.processSummary(videoId, language, taskId);
        
        // Özet içeriği doğrulama
        if (!summaryResult || !summaryResult.content || summaryResult.content.trim().length === 0) {
          throw new Error('Özet içeriği boş veya geçersiz');
        }

        // Özet içeriği minimum uzunluk kontrolü (en az 100 karakter olmalı)
        if (summaryResult.content.length < 100) {
          logger.warn('Özet içeriği çok kısa', {
            ...logContext,
            videoId,
            taskId,
            contentLength: summaryResult.content.length
          });
        }
        
        logger.info('Özet içeriği başarıyla oluşturuldu', {
          ...logContext,
          videoId,
          taskId,
          contentLength: summaryResult.content.length,
          contentPreview: summaryResult.content.substring(0, 100) + '...' // İlk 100 karakteri log'a ekle
        });
        
        // Özet durumunu güncelle
        logger.debug('Özet durumu completed olarak güncelleniyor', {
          ...logContext,
          taskId,
          videoId,
          language
        });
        
        await this.summaryService.updateSummary(taskId, {
          status: 'completed',
          content: summaryResult.content,
          video_id: videoId,
          language: language,
          updated_at: new Date()
        });
        
        await queueService.markTaskComplete('summary', taskId);
        
        logger.info('Özet işlemi başarıyla tamamlandı', {
          ...logContext,
          videoId,
          taskId,
          processedAt: new Date().toISOString()
        });
        
        return {
          status: 'completed',
          summaryId: taskId,
          content: summaryResult.content
        };
      } catch (processError) {
        logger.error('Özet işleme hatası', {
          ...logContext,
          videoId,
          taskId,
          error: processError instanceof Error ? processError.message : 'Unknown error',
          stack: processError instanceof Error ? processError.stack : undefined
        });
        
        // Özet durumunu güncelle
        await this.summaryService.updateSummary(taskId, {
          status: 'failed',
          error: processError instanceof Error ? processError.message : 'Bilinmeyen bir hata oluştu'
        });
        
        await queueService.markTaskFailed('summary', taskId, processError);
        throw processError;
      }
    } catch (error) {
      const taskId = job?.data?.taskId;
      const videoId = job?.data?.videoId;
      
      logger.error('Beklenmeyen hata', {
        ...logContext,
        videoId,
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        jobData: job.data
      });
      
      // Hata durumunu güncelle
      if (taskId) {
        try {
          await this.summaryService.updateSummary(taskId, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu'
          });
          
          logger.debug('Hata durumu veritabanına kaydedildi', {
            ...logContext,
            taskId,
            videoId
          });
        } catch (dbError) {
          logger.error('Hata durumu veritabanına kaydedilemedi', {
            ...logContext,
            taskId,
            videoId,
            error: dbError instanceof Error ? dbError.message : 'Unknown error',
            stack: dbError instanceof Error ? dbError.stack : undefined
          });
        }
        
        await queueService.markTaskFailed('summary', taskId, error);
      }
      
      throw error;
    }
  }
}

export const summaryWorker = new SummaryWorker();
