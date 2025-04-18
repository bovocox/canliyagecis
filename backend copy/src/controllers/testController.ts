import { Request, Response } from 'express';
// Artık notificationService'i kullanmıyoruz, bu import'u kaldırıyoruz
// import { notifyTranscriptCompleted, notifySummaryCompleted } from '../services/notificationService';
import logger from '../utils/logger';
import redis from '../config/redis';
import queueService from '../services/queueService';

class TestController {
  // Test ping endpoint
  ping(req: Request, res: Response) {
    return res.json({ status: 'ok', message: 'pong' });
  }
  
  // Test message using Redis
  async testRedisMessage(req: Request, res: Response) {
    try {
      const { message } = req.params;
      
      // Use Redis to publish the test message
      const payload = JSON.stringify({
        message,
        timestamp: Date.now(),
        type: 'test'
      });
      
      const subscribers = await redis.publish('test', payload);
      
      return res.json({ 
        status: 'ok', 
        message: `Test message '${message}' sent to ${subscribers} Redis subscribers` 
      });
    } catch (error) {
      logger.error('Error sending test message:', error);
      return res.status(500).json({ 
        status: 'error', 
        message: `Failed to send test message: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
    }
  }
  
  // Test with a specific video ID using Redis
  async testRedisVideoMessage(req: Request, res: Response) {
    try {
      const { videoId } = req.params;
      
      // Use Redis to publish the video-specific test message
      const payload = JSON.stringify({
        videoId, 
        message: `Test message for video ${videoId}`,
        timestamp: Date.now(),
        type: 'video_update'
      });
      
      const subscribers = await redis.publish('test', payload);
      
      return res.json({ 
        status: 'ok', 
        message: `Test message for video ${videoId} sent to ${subscribers} Redis subscribers` 
      });
    } catch (error) {
      logger.error(`Error sending test message for video ${req.params.videoId}:`, error);
      return res.status(500).json({ 
        status: 'error', 
        message: `Failed to send test message: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
    }
  }
  
  // Test transcript notification
  testTranscriptUpdate(req: Request, res: Response) {
    const { videoId, status } = req.params;
    // Artık notification servisini kullanmıyoruz, sadece log kaydı tutalım
    
    logger.info(`Test transcript update: ${status} for video ${videoId}`);
    
    return res.json({ 
      status: 'ok', 
      message: `Test transcript update (${status}) logged for video ${videoId}. Note: Notifications are now disabled, use polling instead.`
    });
  }
  
  // Test summary notification
  testSummaryUpdate(req: Request, res: Response) {
    const { videoId, status } = req.params;
    // Artık notification servisini kullanmıyoruz, sadece log kaydı tutalım
    
    logger.info(`Test summary update: ${status} for video ${videoId}`);
    
    return res.json({ 
      status: 'ok', 
      message: `Test summary update (${status}) logged for video ${videoId}. Note: Notifications are now disabled, use polling instead.`
    });
  }

  // Test transcript notification with query parameters
  async testTranscript(req: Request, res: Response) {
    try {
      const videoId = req.query.videoId as string || 'test-video';
      const status = req.query.status as string || 'completed';
      
      // Test verisi oluştur
      const data = {
        videoId,
        status,
        formatted_text: "Bu bir transcript test mesajıdır.",
        timestamp: Date.now(),
        id: `test-transcript-${Date.now()}`
      };
      
      // Artık Redis üzerinden bildirim göndermiyoruz, sadece log kaydı
      logger.info(`Test transcript created: ${JSON.stringify(data)}`);
      
      res.json({
        success: true,
        message: 'Test transcript logged (notifications are disabled, use polling)',
        data
      });
    } catch (error) {
      logger.error('Error in test transcript:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process test transcript',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  // Test summary notification with query parameters
  async testSummary(req: Request, res: Response) {
    try {
      const videoId = req.query.videoId as string || 'test-video';
      const status = req.query.status as string || 'completed';
      
      // Test verisi oluştur
      const data = {
        videoId,
        status,
        content: "Bu bir summary test mesajıdır.",
        timestamp: Date.now(),
        id: `test-summary-${Date.now()}`
      };
      
      // Artık Redis üzerinden bildirim göndermiyoruz, sadece log kaydı
      logger.info(`Test summary created: ${JSON.stringify(data)}`);
      
      res.json({
        success: true,
        message: 'Test summary logged (notifications are disabled, use polling)',
        data
      });
    } catch (error) {
      logger.error('Error in test summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process test summary',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * BullMQ queue istatistiklerini getirir
   */
  async getBullQueueStats(req: Request, res: Response) {
    try {
      const stats = await queueService.getQueueStats();
      
      // Redis queue bilgilerini getir
      const redisInfo = await redis.info();
      const redisMemory = await redis.info('memory');
      
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        bullMQ: {
          stats,
          queueNames: Object.keys(stats)
        },
        redis: {
          status: redis.status,
          memory: redisMemory,
          connectionInfo: {
            connected: redis.status === 'ready',
            uptime: redisInfo.includes('uptime_in_seconds') 
              ? redisInfo.split('uptime_in_seconds:')[1].split('\r\n')[0]
              : 'unknown'
          }
        }
      });
    } catch (error) {
      logger.error('Error getting BullMQ stats:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get BullMQ stats',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Bir test işini BullMQ kuyruğuna ekler
   */
  async addTestJobToBullQueue(req: Request, res: Response) {
    try {
      const { type, videoId } = req.query;
      
      // Gerekli parametre kontrolü
      if (!type || !videoId) {
        return res.status(400).json({
          status: 'error',
          message: 'type ve videoId parametreleri gereklidir'
        });
      }
      
      if (type !== 'transcript' && type !== 'summary') {
        return res.status(400).json({
          status: 'error',
          message: 'type parametresi "transcript" veya "summary" olmalıdır'
        });
      }
      
      // Test iş ID'si oluştur
      const testJobId = `test-${type}-${Date.now()}`;
      
      // Test işini kuyruğa ekle
      await queueService.addToQueue({
        type: type as 'transcript' | 'summary',
        data: {
          videoId: videoId as string,
          language: 'tr',
          [type === 'transcript' ? 'transcriptId' : 'summaryId']: testJobId
        }
      });
      
      res.json({
        status: 'ok',
        message: `Test ${type} job added to queue`,
        jobId: testJobId,
        videoId,
        type
      });
    } catch (error) {
      logger.error('Error adding test job to BullMQ:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to add test job to BullMQ',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Redis'te bekleyen işleri sorgular ve detaylarını getirir
   */
  async getQueuedJobs(req: Request, res: Response) {
    try {
      const type = req.query.type as string || 'transcript';
      
      if (type !== 'transcript' && type !== 'summary') {
        return res.status(400).json({
          status: 'error',
          message: 'type parametresi "transcript" veya "summary" olmalıdır'
        });
      }
      
      // Kuyruk istatistiklerini al
      const stats = await queueService.getQueueStats();
      
      try {
        // Kuyruğu al
        const queue = queueService.getQueue(type);
        
        // Bekleyen, aktif ve tamamlanan işleri al
        const waitingJobs = await queue.getJobs(['waiting'], 0, 10);
        const activeJobs = await queue.getJobs(['active'], 0, 5);
        const completedJobs = await queue.getJobs(['completed'], 0, 5);
        const failedJobs = await queue.getJobs(['failed'], 0, 5);
        
        // İşleri formatlayarak döndür
        const formatJobs = async (jobs: any[]) => {
          const formattedJobs = [];
          
          for (const job of jobs) {
            formattedJobs.push({
              id: job.id,
              state: job.id ? await job.getState() : 'unknown',
              data: job.data,
              added: new Date(job.timestamp).toISOString(),
              processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
              finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
              attemptsMade: job.attemptsMade || 0
            });
          }
          
          return formattedJobs;
        };
        
        // Sonuçları döndür
        res.json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          type,
          stats,
          queueDetails: {
            waiting: {
              count: await queue.getWaitingCount(),
              jobs: await formatJobs(waitingJobs)
            },
            active: {
              count: await queue.getActiveCount(),
              jobs: await formatJobs(activeJobs)
            },
            completed: {
              count: await queue.getCompletedCount(),
              jobs: await formatJobs(completedJobs)
            },
            failed: {
              count: await queue.getFailedCount(),
              jobs: await formatJobs(failedJobs)
            }
          }
        });
      } catch (queueError) {
        // Kuyruk bulunamadı veya başka bir hata oluştu
        logger.error('Error getting queue jobs:', queueError);
        return res.status(500).json({
          status: 'error',
          message: 'Kuyruk işleri alınamadı',
          error: queueError instanceof Error ? queueError.message : 'Unknown error'
        });
      }
    } catch (error) {
      logger.error('Error getting queued jobs:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Kuyruk işleri alınamadı',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export default new TestController(); 