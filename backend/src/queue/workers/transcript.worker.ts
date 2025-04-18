import { Job } from 'bullmq';
import { TranscriptService } from '../../services/transcriptService';
import { SummaryService } from '../../services/summaryService';
import logger from '../../utils/logger';
import queueService, { BullMQJobData } from '../../services/queueService';
import { TranscriptStatus } from '../../types/transcript';
import { YoutubeTranscript } from 'youtube-transcript';

/**
 * Transcript worker - BullMQ implementasyonu
 * Bu worker, transkript oluşturma işlerini arka planda işler
 */
class TranscriptWorker {
  private transcriptService: TranscriptService;
  private summaryService: SummaryService;
  private workerId: string;
  private isStarted: boolean = false;
  
  constructor() {
    this.transcriptService = new TranscriptService();
    this.summaryService = new SummaryService();
    this.workerId = `transcript-worker-${Date.now()}`;
    
    logger.info('Transcript worker başlatılıyor', {
      workerId: this.workerId,
      function: 'TranscriptWorker.constructor'
    });
  }
  
  /**
   * Worker'ı başlatır ve BullMQ servisine kaydeder
   */
  start(): void {
    try {
      // Eğer zaten başlatıldıysa tekrar başlatma
      if (this.isStarted) {
        logger.info('Transcript worker zaten çalışıyor', {
          workerId: this.workerId,
          function: 'TranscriptWorker.start'
        });
        return;
      }
      
      logger.info('Transcript worker kaydediliyor', {
        workerId: this.workerId,
        function: 'TranscriptWorker.start'
      });
      
      // BullMQ worker'ı kaydet - transcript queue'suna bağlan
      queueService.registerWorker(
        'transcript', 
        this.processJob.bind(this),
        2 // Aynı anda en fazla 2 iş işlenebilir
      );
      
      this.isStarted = true;
      logger.info('Transcript worker başarıyla başlatıldı', {
        workerId: this.workerId,
        function: 'TranscriptWorker.start'
      });
    } catch (error) {
      logger.error('Transcript worker başlatılırken hata', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        workerId: this.workerId,
        function: 'TranscriptWorker.start'
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
      function: 'TranscriptWorker.processJob'
    };

    try {
      const { videoId, language, taskId, useWhisper = false, isPublic = false } = job.data;
      
      // Veri doğrulama kontrolü
      if (!videoId || !language || !taskId) {
        const error = new Error(`Geçersiz iş verileri: videoId, language ve taskId zorunludur`);
        logger.error('Transkript işi geçersiz veri nedeniyle reddedildi', {
          ...logContext,
          videoId,
          language,
          taskId,
          error: error.message
        });
        
        await queueService.markTaskFailed('transcript', taskId || String(job.id), error);
        throw error;
      }
      
      logger.info('Transkript işi başlatılıyor', {
        ...logContext,
        videoId,
        language,
        taskId,
        useWhisper,
        isPublic
      });
      
      // YouTube'dan transkript alma
      let formattedText = '';
      try {
        logger.debug('YouTube\'dan transkript alınıyor', {
          ...logContext,
          videoId,
          language
        });
        
        const transcriptOptions = { lang: language };
        const transcriptData = await YoutubeTranscript.fetchTranscript(videoId, transcriptOptions);
        
        if (!transcriptData || transcriptData.length === 0) {
          throw new Error(`Transkript bulunamadı`);
        }
        
        formattedText = transcriptData.map((item: any) => item.text).join(' ');
        
        logger.info('Transkript başarıyla alındı', {
          ...logContext,
          videoId,
          language,
          textLength: formattedText.length
        });
      } catch (transcriptError) {
        const error = new Error(`YouTube'dan transkript alınamadı: ${transcriptError instanceof Error ? transcriptError.message : 'Unknown error'}`);
        logger.error('Transkript alma hatası', {
          ...logContext,
          videoId,
          language,
          taskId,
          error: error.message,
          stack: transcriptError instanceof Error ? transcriptError.stack : undefined
        });
        
        await queueService.markTaskFailed('transcript', taskId, error);
        throw error;
      }
      
      try {
        logger.debug('Transkript veritabanına kaydediliyor', {
          ...logContext,
          videoId,
          taskId
        });
        
        await this.transcriptService.markTranscriptCompleted(taskId, formattedText);
        
        logger.info('Transkript başarıyla kaydedildi', {
          ...logContext,
          videoId,
          language,
          taskId
        });
        
        await queueService.markTaskComplete('transcript', taskId);
        
        // Özet işlemini başlat
        try {
          const userId = job.data.userId;
          
          logger.info('Özet işlemi başlatılıyor', {
            ...logContext,
            videoId,
            language,
            taskId,
            userId: userId || 'system'
          });
          
          await this.summaryService.handleTranscriptCompletion(
            videoId, 
            language,
            userId || 'system'
          );
          
          logger.info('Özet işlemi başarıyla başlatıldı', {
            ...logContext,
            videoId,
            taskId
          });
        } catch (summaryError) {
          logger.error('Özet başlatma hatası', {
            ...logContext,
            videoId,
            taskId,
            error: summaryError instanceof Error ? summaryError.message : 'Unknown error',
            stack: summaryError instanceof Error ? summaryError.stack : undefined
          });
          // Özet hatası transkript işlemini etkilemez
        }
        
        return {
          status: 'success',
          transcriptId: taskId,
          message: 'Transkript oluşturuldu'
        };
      } catch (dbError) {
        const error = new Error(`Veritabanı işlemi başarısız: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
        logger.error('Veritabanı kayıt hatası', {
          ...logContext,
          videoId,
          taskId,
          error: error.message,
          stack: dbError instanceof Error ? dbError.stack : undefined
        });
        
        await queueService.markTaskFailed('transcript', taskId, error);
        throw error;
      }
    } catch (error) {
      logger.error('Beklenmeyen hata', {
        ...logContext,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        jobData: job.data
      });
      
      if (job.data?.taskId) {
        await queueService.markTaskFailed('transcript', job.data.taskId, error as Error);
      }
      
      throw error;
    }
  }
}

export const transcriptWorker = new TranscriptWorker();
