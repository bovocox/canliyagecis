import { Request, Response } from 'express';
import { Summary, SummaryResponse, SummaryStatus } from '../types/summary';
import SummaryService from '../services/summaryService';
import queueService from '../services/queueService';
import DatabaseService from '../services/databaseService';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import cacheService from '../services/cacheService';
import { supabase } from '../config/supabase';
import { redis } from '../config/redis';
// Notification service has been removed
// import { notifySummaryCompleted, notifySummaryError } from '../services/notificationService';
import VideoService from '../services/videoService';

class SummaryController {
  private summaryService: SummaryService;
  private databaseService: DatabaseService;
  private videoService: VideoService;

  constructor() {
    this.summaryService = new SummaryService();
    this.databaseService = new DatabaseService();
    this.videoService = new VideoService();
  }

  /**
   * Video özeti oluşturmak için istek alır
   * @param videoId YouTube video ID'si
   * @param language İstenen özet dili
   * @param isPublic Özetin herkese açık olup olmadığı
   */
  async createSummary(req: Request, res: Response): Promise<void> {
    try {
      const { videoId, language, isPublic = false } = req.body;
      const userId = (req as any).userId;
      
      logger.info('Özet oluşturma isteği alındı', {
        videoId,
        language,
        isPublic,
        userId,
        function: 'SummaryController.createSummary'
      });
      
      if (!videoId || !language) {
        logger.warn('Eksik parametreler', {
          videoId,
          language,
          function: 'SummaryController.createSummary'
        });
        res.status(400).json({ error: 'Video ID and language are required' });
        return;
      }

      // Önce transkript kontrolü yap
      const transcript = await this.databaseService.getRawTranscript(videoId, language);
      if (!transcript || transcript.status !== 'completed') {
        logger.warn('Transkript hazır değil', {
          videoId,
          language,
          transcriptStatus: transcript?.status,
          function: 'SummaryController.createSummary'
        });
        res.status(404).json({ 
          status: 'pending',
          message: 'Waiting for transcript completion'
        });
        return;
      }
      
      // Özet oluştur veya mevcut özeti getir
      const summary = await this.summaryService.findOrCreateSummary(videoId, language);
      
      // Kullanıcı-özet ilişkisi oluştur
      if (userId) {
        logger.info('Kullanıcı-özet ilişkisi oluşturuluyor', {
          summaryId: summary.id,
          userId,
          function: 'SummaryController.createSummary'
        });
        await this.databaseService.createUserSummary(summary.id, userId);
      }

      // Eğer özet zaten işlenmişse ve tamamlanmışsa, direkt döndür
      if (summary.status === 'completed') {
        logger.info('Tamamlanmış özet bulundu', {
          summaryId: summary.id,
          videoId,
          language,
          function: 'SummaryController.createSummary'
        });
        res.status(200).json({
          id: summary.id,
          status: 'completed',
          content: summary.content
        });
        return;
      }
      
      // Özet henüz tamamlanmamışsa kuyruğa ekle
      logger.info('Özet işleme kuyruğuna ekleniyor', {
        summaryId: summary.id,
        videoId,
        language,
        function: 'SummaryController.createSummary'
      });

      await queueService.addToQueue({
        type: 'summary',
        data: {
          videoId,
          language,
          isPublic,
          userId,
          summaryId: summary.id
        }
      });
      
      const response: SummaryResponse = {
        id: summary.id,
        status: summary.status,
        message: `Summary is ${summary.status}`
      };
      
      logger.info('Özet oluşturma isteği tamamlandı', {
        summaryId: summary.id,
        status: summary.status,
        function: 'SummaryController.createSummary'
      });
      
      res.status(202).json(response);
    } catch (error: any) {
      logger.error('createSummary Özet oluşturma hatası', {
        error: error.message,
        function: 'SummaryController.createSummary'
      });
      res.status(500).json({ error: `Failed to create summary: ${error.message}` });
    }
  }

  /**
   * Bir video özeti durumunu kontrol eder
   * @param videoId YouTube video ID'si
   * @param language Özet dili
   */
  async getSummaryStatus(req: Request, res: Response): Promise<void> {
    try {
      const { videoId } = req.params;
      const language = String(req.query.language || 'en');

      logger.info('Özet durumu kontrolü başlatıldı', {
        videoId,
        language,
        function: 'SummaryController.getSummaryStatus'
      });

      if (!videoId) {
        logger.warn('Video ID eksik', {
          function: 'SummaryController.getSummaryStatus'
        });
        res.status(400).json({ error: 'Video ID is required' });
        return;
      }

      try {
        // Özeti bul veya oluştur - race condition'ı önlemek için
        const summary = await this.summaryService.findOrCreateSummary(videoId, language);

        // Eğer özet tamamlanmışsa
        if (summary.status === 'completed') {
          res.json({
            status: 'completed',
            content: summary.content
          });
          return;
        }

        // Eğer özet pending veya processing durumundaysa
        if (summary.status === 'pending' || summary.status === 'processing') {
          res.json({
            status: summary.status,
            task_id: summary.id,
            message: `Summary is ${summary.status}`
          });
          return;
        }

        // Eğer özet failed durumundaysa
        if (summary.status === 'failed') {
          logger.info('Failed durumundaki özet yeniden başlatılıyor', {
            videoId,
            language,
            summaryId: summary.id,
            function: 'SummaryController.getSummaryStatus'
          });

          // Durumu pending'e çevir
          await this.databaseService.updateRawSummary(summary.id, {
            status: 'pending',
            error: undefined,
            updated_at: new Date()
          });

          // Kuyruğa ekle
          await queueService.addToQueue({
            type: 'summary',
            data: {
              videoId,
              language,
              summaryId: summary.id
            }
          });

          res.json({
            status: 'pending',
            task_id: summary.id,
            message: 'Summary restarted'
          });
          return;
        }

        // Yeni oluşturulmuş özet için kuyruğa ekle
        await queueService.addToQueue({
          type: 'summary',
          data: {
            videoId,
            language,
            summaryId: summary.id
          }
        });

        res.json({
          status: 'pending',
          task_id: summary.id,
          message: 'Summary creation started'
        });

      } catch (error) {
        logger.error('Özet işlemi sırasında hata oluştu', {
          error: error instanceof Error ? error.message : 'Unknown error',
          videoId,
          language,
          function: 'SummaryController.getSummaryStatus'
        });
        
        if (error instanceof Error && error.message.includes('Transcript not found')) {
          res.status(404).json({ 
            status: 'pending',
            message: 'Waiting for transcript completion'
          });
          return;
        }
        
        throw error;
      }
    } catch (error) {
      logger.error('Özet durumu kontrol edilirken hata oluştu', {
        error: error instanceof Error ? error.message : 'Unknown error',
        function: 'SummaryController.getSummaryStatus'
      });
      res.status(500).json({ 
        status: 'error',
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Mevcut bir özeti getirir
   * @param videoId YouTube video ID'si
   * @param language Özet dili
   */
  async getSummary(req: Request, res: Response): Promise<void> {
    try {
      const { videoId } = req.params;
      const { language } = req.query;
      
      logger.info('Özet getirme isteği başlatıldı', {
        videoId,
        language,
        function: 'SummaryController.getSummary'
      });
      
      if (!videoId || !language) {
        logger.warn('Eksik parametreler', {
          videoId,
          language,
          function: 'SummaryController.getSummary'
        });
        res.status(400).json({ error: 'Video ID and language are required' });
        return;
      }
      
      logger.info('Redis cache kontrolü yapılıyor', {
        videoId,
        language,
        function: 'SummaryController.getSummary'
      });
      
      const cachedSummary = await cacheService.getFromCache(videoId, language as string);
      
      if (cachedSummary && cachedSummary.status === 'completed') {
        logger.info('Özet cache\'den döndürülüyor', {
          videoId,
          language,
          function: 'SummaryController.getSummary'
        });
        res.status(200).json(cachedSummary);
        return;
      }
      
      logger.info('Veritabanı kontrolü yapılıyor', {
        videoId,
        language,
        function: 'SummaryController.getSummary'
      });
      
      const summary = await this.databaseService.getRawSummary(videoId, language as string);
      
      if (!summary) {
        logger.warn('Özet bulunamadı', {
          videoId,
          language,
          function: 'SummaryController.getSummary'
        });
        res.status(404).json({ error: 'Summary not found' });
        return;
      }
      
      if (summary.status === 'completed') {
        logger.info('Tamamlanmış özet cache\'e ekleniyor', {
          videoId,
          language,
          function: 'SummaryController.getSummary'
        });
        await cacheService.setToCache(videoId, language as string, summary);
      }
      
      if (summary.status !== 'completed') {
        logger.info('Özet henüz tamamlanmamış', {
          videoId,
          language,
          status: summary.status,
          function: 'SummaryController.getSummary'
        });
        res.status(202).json({
          id: summary.id,
          status: summary.status,
          message: `Summary is ${summary.status}`
        });
        return;
      }
      
      logger.info('Özet başarıyla döndürülüyor', {
        videoId,
        language,
        function: 'SummaryController.getSummary'
      });
      
      res.status(200).json(summary);
    } catch (error: any) {
      logger.error('Özet getirme hatası', {
        error: error.message,
        function: 'SummaryController.getSummary'
      });
      res.status(500).json({ error: 'Failed to get summary' });
    }
  }

  /**
   * Özet işlemi tamamlandığında çağrılır
   * @param summaryId Özet ID'si
   */
  async summaryCompleted(summaryId: string, content: string): Promise<void> {
    try {
      logger.info('Özet tamamlandı bildirimi alındı', {
        summaryId,
        function: 'SummaryController.summaryCompleted'
      });
      
      await this.databaseService.updateRawSummary(summaryId, {
        status: 'completed',
        content,
        updated_at: new Date()
      });
      
      // Özet için video ID'sini al - doğrudan DB'den sorgulama yap
      const { data: summary } = await supabase
        .from('summaries')
        .select('video_id')
        .eq('id', summaryId)
        .single();
      
      if (summary && summary.video_id) {
        // Check if a notification has already been sent for this summary
        const updateSentKey = `veciz:notification:summary_update_sent:${summaryId}`;
        const updateSent = await redis.get(updateSentKey);
        
        if (!updateSent) {
          // Redis ile tamamlanma durumunu bildir
          logger.info('Özet tamamlandı bildirimi gönderiliyor', {
            summaryId,
            videoId: summary.video_id,
            function: 'SummaryController.summaryCompleted'
          });
          
          // Redis ile tamamlanma durumunu bildir
          // notifySummaryCompleted(summary.video_id, {
          //   status: 'completed',
          //   content,
          //   videoId: summary.video_id
          // });
          
          // Mark that a notification has been sent for this summary to prevent duplicates
          await redis.set(updateSentKey, '1', 'EX', 60); // Expires in 60 seconds
        } else {
          logger.info('Mükerrer bildirim önlendi', {
            summaryId,
            videoId: summary.video_id,
            function: 'SummaryController.summaryCompleted'
          });
        }
      }
      
      logger.info('Özet başarıyla güncellendi', {
        summaryId,
        status: 'completed',
        function: 'SummaryController.summaryCompleted'
      });
    } catch (error: any) {
      logger.error('Özet tamamlama hatası', {
        error: error.message,
        summaryId,
        function: 'SummaryController.summaryCompleted'
      });
    }
  }

  /**
   * Özet işlemi başarısız olduğunda çağrılır
   * @param summaryId Özet ID'si
   * @param error Hata detayları
   */
  async summaryFailed(summaryId: string, error: any): Promise<void> {
    try {
      logger.info('Özet başarısız bildirimi alındı', {
        summaryId,
        error: error.message,
        function: 'SummaryController.summaryFailed'
      });
      
      await this.databaseService.updateRawSummary(summaryId, {
        status: 'failed',
        error: error.message || 'Unknown error',
        updated_at: new Date()
      });
      
      // Özet için video ID'sini al
      const { data: summary } = await supabase
        .from('summaries')
        .select('video_id')
        .eq('id', summaryId)
        .single();
      
      if (summary && summary.video_id) {
        // Check if a notification has already been sent for this summary
        const updateSentKey = `veciz:notification:summary_update_sent:${summaryId}`;
        const updateSent = await redis.get(updateSentKey);
        
        if (!updateSent) {
          // Redis ile hata durumunu bildir
          logger.info('Özet başarısız bildirimi gönderiliyor', {
            summaryId,
            videoId: summary.video_id,
            function: 'SummaryController.summaryFailed'
          });
          
          // Redis ile hata durumunu bildir
          // notifySummaryError(summary.video_id, error.message || 'Unknown error');
          
          // Mark that a notification has been sent for this summary to prevent duplicates
          await redis.set(updateSentKey, '1', 'EX', 60); // Expires in 60 seconds
        } else {
          logger.info('Mükerrer hata bildirimi önlendi', {
            summaryId,
            videoId: summary.video_id,
            function: 'SummaryController.summaryFailed'
          });
        }
      }
      
      logger.error('Özet başarısız olarak işaretlendi', {
        summaryId,
        error: error.message,
        function: 'SummaryController.summaryFailed'
      });
    } catch (error: any) {
      logger.error('Özet başarısız işaretleme hatası', {
        error: error.message,
        summaryId,
        function: 'SummaryController.summaryFailed'
      });
    }
  }

  /**
   * Herkese açık özetleri getirir
   * @param req HTTP isteği
   * @param res HTTP yanıtı
   */
  async getPublicSummaries(req: Request, res: Response): Promise<void> {
    try {
      const { language = 'en', limit = 10 } = req.query;
      
      logger.info('Herkese açık özetler getiriliyor', {
        language,
        limit,
        function: 'SummaryController.getPublicSummaries'
      });
      
      const summaries = await this.databaseService.getRawPublicSummaries(
        language.toString(),
        Number(limit)
      );
      
      logger.info('Herkese açık özetler başarıyla getirildi', {
        language,
        count: summaries.length,
        function: 'SummaryController.getPublicSummaries'
      });
      
      res.status(200).json(summaries);
    } catch (error: any) {
      logger.error('Herkese açık özetleri getirme hatası', {
        error: error.message,
        function: 'SummaryController.getPublicSummaries'
      });
      res.status(500).json({ error: 'Failed to get public summaries' });
    }
  }

  /**
   * Kullanıcının özetlerini getirir
   * @param req HTTP isteği
   * @param res HTTP yanıtı
   */
  async getUserSummaries(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      
      logger.info('Kullanıcı özetleri getiriliyor', {
        userId,
        function: 'SummaryController.getUserSummaries'
      });
      
      const summaries = await this.databaseService.getUserSummaries(userId);
      
      logger.info('Kullanıcı özetleri başarıyla getirildi', {
        userId,
        count: summaries.length,
        function: 'SummaryController.getUserSummaries'
      });
      
      res.status(200).json(summaries);
    } catch (error: any) {
      logger.error('Kullanıcı özetlerini getirme hatası', {
        error: error.message,
        function: 'SummaryController.getUserSummaries'
      });
      res.status(500).json({ error: 'Failed to get user summaries' });
    }
  }

  /**
   * Özetin okundu durumunu günceller
   * @param req HTTP isteği
   * @param res HTTP yanıtı
   */
  async updateSummaryReadStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).userId;
      const { is_read } = req.body;

      logger.info('Özet okundu durumu güncelleniyor', {
        userSummaryId: id,
        userId,
        is_read,
        function: 'SummaryController.updateSummaryReadStatus'
      });

      await this.databaseService.updateUserSummaryReadStatus(id, userId, is_read);

      logger.info('Özet okundu durumu güncellendi', {
        userSummaryId: id,
        userId,
        is_read,
        function: 'SummaryController.updateSummaryReadStatus'
      });

      res.status(200).json({ message: 'Summary read status updated successfully' });
    } catch (error: any) {
      logger.error('Özet okundu durumu güncelleme hatası', {
        error: error.message,
        function: 'SummaryController.updateSummaryReadStatus'
      });
      res.status(500).json({ error: 'Failed to update summary read status' });
    }
  }

  /**
   * Özet için değerlendirme ve yorum ekler
   * @param req HTTP isteği
   * @param res HTTP yanıtı
   */
  async addSummaryFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).userId;
      const { rating, comment } = req.body;

      logger.info('Özet değerlendirmesi ekleniyor', {
        userSummaryId: id,
        userId,
        rating,
        function: 'SummaryController.addSummaryFeedback'
      });

      await this.databaseService.saveSummaryFeedback(id, userId, rating, comment);

      logger.info('Özet değerlendirmesi eklendi', {
        userSummaryId: id,
        userId,
        rating,
        function: 'SummaryController.addSummaryFeedback'
      });

      res.status(200).json({ message: 'Summary feedback saved successfully' });
    } catch (error: any) {
      logger.error('Özet değerlendirmesi ekleme hatası', {
        error: error.message,
        function: 'SummaryController.addSummaryFeedback'
      });
      res.status(500).json({ error: 'Failed to save summary feedback' });
    }
  }

  /**
   * Özet için değerlendirmeyi getirir
   * @param req HTTP isteği
   * @param res HTTP yanıtı
   */
  async getSummaryFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).userId;

      logger.info('Özet değerlendirmesi getiriliyor', {
        userSummaryId: id,
        userId,
        function: 'SummaryController.getSummaryFeedback'
      });

      const feedback = await this.databaseService.getFeedback(id, userId);

      logger.info('Özet değerlendirmesi getirildi', {
        userSummaryId: id,
        userId,
        function: 'SummaryController.getSummaryFeedback',
        hasFeedback: !!feedback
      });

      res.status(200).json(feedback);
    } catch (error: any) {
      logger.error('Özet değerlendirmesi getirme hatası', {
        error: error.message,
        function: 'SummaryController.getSummaryFeedback'
      });
      res.status(500).json({ error: 'Failed to get summary feedback' });
    }
  }

  async getRecentSummaries(req: Request, res: Response): Promise<void> {
    try {
      const summaries = await this.databaseService.getRecentSummaries(4);
      res.json(summaries);
    } catch (error) {
      logger.error('Error getting recent summaries:', error);
      res.status(500).json({ error: 'Failed to get recent summaries' });
    }
  }
}

export default SummaryController; 