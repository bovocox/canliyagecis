import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import logger from '../utils/logger';
import { systemLogger } from '../utils/logger';
import crypto from 'crypto';
import queueRedis from '../queue/config/redis';
import { EventEmitter } from 'events';

/**
 * Worker yeniden başlatma olayları için EventEmitter
 */
export const workerEventEmitter = new EventEmitter();

// Redis bağlantı bilgileri
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Queue görevleri için interface
 */
export interface QueueTask {
  id?: string; // Task ID
  type: 'transcript' | 'summary';
  data: {
    videoId: string;
    language: string;
    transcriptId?: string;
    summaryId?: string;
    userId?: string;
    useWhisper?: boolean;
    isPublic?: boolean;
    reprocess?: boolean;
  };
}

/**
 * BullMQ job verisi için interface
 */
export interface BullMQJobData {
  taskId: string; // transcript veya summary ID
  videoId: string;
  language: string;
  userId?: string;
  useWhisper?: boolean;
  isPublic?: boolean;
  reprocess?: boolean;
  transcriptId?: string; // summary işleri için
  summaryId?: string; // transcript işleri için (ileri kullanım için)
}

/**
 * BullMQ tabanlı Queue servisi
 */
class QueueService {
  private queues: { [key: string]: Queue } = {};
  private workers: { [key: string]: Worker } = {};
  
  // Queue isimleri
  private readonly queueNames = {
    transcript: 'veciz_queue_transcript',
    summary: 'veciz_queue_summary'
  };
  
  /**
   * Redis bağlantısı oluşturur ve ayarlar
   */
  private createRedisConnection() {
    try {
      // Önce queueRedis kullanmayı dene (nodejs üzerinden process.env.REDIS_URL'yi kullanıyor)
      return queueRedis;
    } catch (err) {
      // Fallback olarak yeni bir bağlantı oluştur
      logger.warn('queueRedis bağlantısı kullanılamadı, yeni bağlantı oluşturuluyor', {
        error: err instanceof Error ? err.message : String(err)
      });
      
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        username: process.env.REDIS_USERNAME || undefined,
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        maxRetriesPerRequest: null,
        retryStrategy(times: number) {
          // Exponential backoff with max delay
          const maxDelay = 30000; // 30 saniye
          const delay = Math.min(Math.pow(2, times) * 100, maxDelay);
          logger.warn(`Redis bağlantı hatası, ${delay}ms sonra yeniden denenecek (deneme: ${times})`);
          return delay;
        },
        reconnectOnError(err: Error) {
          // Sadece bağlantı hatalarında yeniden bağlanma girişimi yap
          const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND'];
          if (targetErrors.some(code => err.message.includes(code))) {
            logger.warn(`Redis hatası nedeniyle yeniden bağlanılıyor: ${err.message}`);
            return true;
          }
          return false;
        }
      };
      
      // Redis URL varsa, onu kullan (env'den oku)
      if (REDIS_URL) {
        logger.info(`Redis URL kullanılıyor (config kullanmak yerine): ${REDIS_URL.replace(/\/\/(.+?)@/, '//***@')}`);
        return new Redis(REDIS_URL, {
          maxRetriesPerRequest: null, // BullMQ için null olarak ayarlanması öneriliyor
          retryStrategy: redisConfig.retryStrategy,
          reconnectOnError: redisConfig.reconnectOnError
        });
      }
      
      return new Redis(redisConfig);
    }
  }
  
  // Ana Redis bağlantısı
  private redisConnection: Redis;
  
  constructor() {
    // Redis bağlantısını kur
    this.redisConnection = this.createRedisConnection();

    // Redis URL'sini loglama
    logger.info(`QueueService kullanılan Redis URL: ${process.env.REDIS_URL?.replace(/\/\/(.+?)@/, '//***@') || 'redis://localhost:6379'}`);
    
    // Bağlantı olaylarını dinle
    this.setupRedisListeners(this.redisConnection);
    
    // Kuyrukları oluştur
    Object.entries(this.queueNames).forEach(([key, name]) => {
      // Queue oluştur
      this.queues[key] = new Queue(name, {
        connection: this.redisConnection,
        // BullMQ'nun konfigürasyonunu optimize edelim
        defaultJobOptions: {
          removeOnComplete: false, // İşleri tamamlanınca otomatik silme - debug için
          removeOnFail: false,     // Başarısız işleri sakla - debug için
          attempts: 3,            // Başarısız olursa 3 kez dene
          backoff: {              // Yeniden deneme stratejisi
            type: 'exponential',
            delay: 1000           // İlk denemeden 1 saniye sonra
          }
        }
      });
      
      logger.info(`Created BullMQ queue: ${name}`, {
        function: 'QueueService.constructor'
      });
    });
    
    // Verimli kapatma için event listener ekle
    process.on('SIGTERM', this.gracefulShutdown.bind(this));
    process.on('SIGINT', this.gracefulShutdown.bind(this));
    
    logger.info('BullMQ queue service initialized', {
      function: 'QueueService.constructor'
    });
  }
  
  /**
   * Redis bağlantı olaylarını dinler
   */
  private setupRedisListeners(connection: Redis) {
    connection.on('connect', () => {
      logger.info('Redis connected', {
        function: 'QueueService.setupRedisListeners'
      });
    });
    
    connection.on('ready', () => {
      logger.info('Redis ready', {
        function: 'QueueService.setupRedisListeners'
      });
    });
    
    connection.on('error', (err) => {
      logger.error('Redis connection error', {
        error: err.message,
        function: 'QueueService.setupRedisListeners'
      });
      
      // Eğer bağlantı hatası varsa ve bağlantı durumu 'ready' değilse worker'ları yeniden başlatmayı dene
      if (connection.status !== 'ready') {
        // Worker'leri yeniden başlatma olayını tetikle
        workerEventEmitter.emit('restart_workers', {
          reason: 'redis_connection_error',
          error: err.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    connection.on('close', () => {
      logger.warn('Redis connection closed', {
        function: 'QueueService.setupRedisListeners'
      });
    });
    
    connection.on('reconnecting', () => {
      logger.warn('Redis reconnecting', {
        function: 'QueueService.setupRedisListeners'
      });
    });
    
    connection.on('end', () => {
      logger.warn('Redis connection ended', {
        function: 'QueueService.setupRedisListeners'
      });
    });
  }
  
  /**
   * Queue'ya yeni bir iş ekler
   */
  async addToQueue(task: QueueTask): Promise<string> {
    try {
      // Task ID kontrolü
      const taskId = task.type === 'transcript' ? task.data.transcriptId : task.data.summaryId;
      
      if (!taskId) {
        throw new Error(`Invalid task: ${task.type} task must have a valid ID`);
      }
      
      systemLogger.queueService.addTask(task.type, taskId);
      
      // BullMQ için iş verisi formatla
      const jobData: BullMQJobData = {
        taskId: taskId, // Tip hatasını düzeltmek için kesin atama yapıyoruz
        videoId: task.data.videoId || '', // Boş string ile varsayılan değer
        language: task.data.language || '', // Boş string ile varsayılan değer
        userId: task.data.userId,
        useWhisper: task.data.useWhisper,
        isPublic: task.data.isPublic,
        reprocess: task.data.reprocess,
        transcriptId: task.data.transcriptId,
        summaryId: task.data.summaryId
      };
      
      logger.info('Adding task to queue', {
        taskType: task.type,
        taskId,
        function: 'QueueService.addToQueue'
      });
      
      // BullMQ kuyruğuna ekle
      const queue = this.queues[task.type];
      
      if (!queue) {
        throw new Error(`Queue not found for task type: ${task.type}`);
      }

      // Redis bağlantı durumu kontrol
      if (this.redisConnection.status !== 'ready') {
        logger.warn('Redis bağlantısı hazır değil, yeniden bağlanmaya çalışılıyor', {
          currentStatus: this.redisConnection.status
        });
        
        // Redis bağlantısını yenile
        await this.redisConnection.ping().catch(() => {
          logger.warn('Redis ping başarısız, yeni bağlantı oluşturuluyor');
          this.redisConnection = this.createRedisConnection();
          this.setupRedisListeners(this.redisConnection);
        });
      }
      
      // İşi kuyruğa ekle (job ID olarak taskId kullan)
      const job = await queue.add(task.type, jobData, {
        jobId: taskId, // Aynı ID ile tekrar eklememek için
        removeOnComplete: false, // Tamamlanan işleri otomatik temizleme (debug için)
        removeOnFail: false,    // Başarısız işleri sakla (debug için)
        attempts: 3,            // Başarısız olursa 3 kez dene
        backoff: {              // Yeniden deneme stratejisi
          type: 'exponential',
          delay: 5000           // İlk denemeden 5 saniye sonra
        }
      });
      
      logger.info('Successfully added task to queue', {
        taskType: task.type,
        taskId,
        jobId: job.id,
        function: 'QueueService.addToQueue'
      });
      
      // job.id undefined olabilir, kontrol edelim
      return job.id || taskId; // Eğer job.id undefined ise, taskId'yi döndür
      
    } catch (error) {
      logger.error('Failed to add task to queue', {
        error: error instanceof Error ? error.message : 'Unknown error',
        taskType: task.type,
        taskId: task.type === 'transcript' ? task.data.transcriptId : task.data.summaryId,
        function: 'QueueService.addToQueue'
      });
      throw error;
    }
  }
  
  /**
   * Worker kaydeder
   * @param type Worker tipi ('transcript' veya 'summary')
   * @param processor İş işleme fonksiyonu
   * @param concurrency Eşzamanlı çalışacak iş sayısı
   */
  registerWorker(
    type: 'transcript' | 'summary',
    processor: (job: Job<BullMQJobData>) => Promise<any>,
    concurrency: number = 1
  ): void {
    // Redis URL'yi loglama
    logger.info(`Worker için Redis URL: ${REDIS_URL.replace(/\/\/(.+?)@/, '//***@')}`);
    
    // Worker oluştur
    const worker = new Worker(this.queueNames[type], processor, {
      connection: this.redisConnection,
      concurrency,
      lockDuration: 90000,        // 90 saniye lock süresi (önceden 60000)
      stalledInterval: 90000,     // 90 saniyede bir takılmış işleri kontrol et (önceden 30000)
      maxStalledCount: 2,         // Bir iş en fazla 2 kez takılı kabul edilsin
      drainDelay: 15000,         // Queue boş olduğunda 15 saniye bekle
      lockRenewTime: 45000,      // Lock'u 45 saniyede bir yenile
    });
    
    // Worker olaylarını dinle
    this.setupWorkerListeners(type, worker);
    
    // Worker'ı kaydet
    this.workers[type] = worker;
    
    logger.info(`Worker registered for ${type} queue`, {
      concurrency,
      function: 'QueueService.registerWorker'
    });
  }
  
  // Worker event listener'ları
  private setupWorkerListeners(type: string, worker: Worker) {
    // Hata durumları için event listener
    worker.on('failed', (job, error) => {
      if (!job) return;
      
      logger.error(`Job failed in ${type} queue`, {
        jobId: job.id,
        error: error.message,
        attempts: job.attemptsMade,
        function: 'QueueService.worker.failed'
      });
      
      systemLogger.queueService.failTask(type, job.id || 'unknown', error);
    });
    
    // Tamamlanan işler için event listener
    worker.on('completed', (job) => {
      if (!job) return;
      
      logger.info(`Job completed in ${type} queue`, {
        jobId: job.id,
        function: 'QueueService.worker.completed'
      });
      
      systemLogger.queueService.completeTask(type, job.id || 'unknown');
    });
    
    // Worker aktif olduğunda logger ekle
    worker.on('active', (job) => {
      if (!job) return;
      
      logger.info(`Job active in ${type} queue`, {
        jobId: job.id,
        function: 'QueueService.worker.active'
      });
    });

    // Worker'ın hazır olduğunu dinleme
    worker.on('ready', () => {
      logger.info(`Worker ready for ${type} queue`, {
        function: 'QueueService.worker.ready'
      });
    });
    
    // Worker hata durumunu dinleme
    worker.on('error', (error) => {
      logger.error(`Worker error for ${type} queue`, {
        error: error.message,
        function: 'QueueService.worker.error'
      });
      
      // Çalışmaya devam edebilmek için yeniden başlatma olayını tetikle
      workerEventEmitter.emit('restart_workers', {
        reason: 'worker_error',
        type,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    });
    
    // Worker bağlantı kaybı durumunu dinleme
    worker.on('closed', () => {
      logger.warn(`Worker closed for ${type} queue`, {
        function: 'QueueService.worker.close'
      });
    });
    
    // Worker daha uzun süre bağlantı kesintisi durumunu dinleme
    worker.on('closing', (msg) => {
      logger.warn(`Worker closing for ${type} queue: ${msg}`, {
        function: 'QueueService.worker.closing'
      });
    });
  }
  
  /**
   * Tüm worker'ları başlatır
   */
  startAllWorkers(): void {
    // Her bir worker tipini kontrol et ve gerekiyorsa başlat
    Object.entries(this.workers).forEach(([type, worker]) => {
      try {
        if (worker.isRunning()) {
          logger.info(`Worker for ${type} queue is already running`);
          return;
        }
        
        // Worker durmuş, yeniden başlat
        logger.info(`Starting worker for ${type} queue`);
        
        // Eski worker'ı kapat
        worker.close().catch(err => {
          logger.error(`Error closing old worker for ${type} queue`, {
            error: err.message,
            function: 'QueueService.startAllWorkers'
          });
        });
        
        // Worker'ı yeniden başlatma olayını tetikle
        workerEventEmitter.emit('restart_workers', {
          reason: 'manual_restart',
          type,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error(`Error starting worker for ${type} queue`, {
          error: error instanceof Error ? error.message : String(error),
          function: 'QueueService.startAllWorkers'
        });
      }
    });
  }
  
  /**
   * İşin tamamlandığını işaretler
   */
  async markTaskComplete(type: string, taskId: string): Promise<void> {
    try {
      systemLogger.queueService.completeTask(type, taskId);
      
      // BullMQ ile işleri otomatik olarak tamamlanan işaretlediği için,
      // burada ek bir işlem yapmaya gerek yok. Sadece log ekliyoruz.
      logger.info('Marked task as complete', {
        type,
        taskId,
        function: 'QueueService.markTaskComplete'
      });
    } catch (error) {
      systemLogger.queueService.failTask(type, taskId, error);
      
      logger.error('Error marking task as complete', {
        error,
        type,
        taskId,
        function: 'QueueService.markTaskComplete'
      });
      
      throw error;
    }
  }
  
  /**
   * İşin başarısız olduğunu işaretler
   */
  async markTaskFailed(type: string, taskId: string, error: any): Promise<void> {
    try {
      systemLogger.queueService.failTask(type, taskId, error);
      
      // İş BullMQ tarafından otomatik olarak başarısız işaretleneceği için,
      // burada ek bir işlem yapmaya gerek yok. Sadece log ekliyoruz.
      logger.error('Task failed', {
        error: error instanceof Error ? error.message : error,
        type,
        taskId,
        function: 'QueueService.markTaskFailed'
      });
    } catch (err) {
      logger.error('Error marking task as failed', {
        error: err,
        originalError: error,
        type,
        taskId,
        function: 'QueueService.markTaskFailed'
      });
    }
  }
  
  /**
   * Tüm kuyrukları ve worker'ları temiz bir şekilde kapatır
   */
  async gracefulShutdown(): Promise<void> {
    logger.info('Gracefully shutting down BullMQ queues and workers', {
      function: 'QueueService.gracefulShutdown'
    });
    
    try {
      // Worker'ları kapat
      const workerPromises = Object.entries(this.workers).map(async ([type, worker]) => {
        logger.info(`Closing worker for ${type} queue`);
        await worker.close();
      });
      
      // Queue'ları kapat
      const queuePromises = Object.entries(this.queues).map(async ([type, queue]) => {
        logger.info(`Closing queue for ${type}`);
        await queue.close();
      });
      
      // Tüm kapanma işlemlerini bekle
      await Promise.all([...workerPromises, ...queuePromises]);
      
      // Redis bağlantısını kapat (eğer hala açıksa)
      if (this.redisConnection && this.redisConnection.status === 'ready') {
        logger.info('Closing Redis connection');
        await this.redisConnection.quit();
      }
      
      logger.info('All BullMQ resources closed successfully', {
        function: 'QueueService.gracefulShutdown'
      });
    } catch (error) {
      logger.error('Error during BullMQ graceful shutdown', {
        error,
        function: 'QueueService.gracefulShutdown'
      });
      throw error;
    }
  }
  
  /**
   * Kuyruk istatistiklerini getirir
   */
  async getQueueStats(): Promise<any> {
    const stats: any = {};
    
    for (const [type, queue] of Object.entries(this.queues)) {
      stats[type] = {
        waiting: await queue.getWaitingCount(),
        active: await queue.getActiveCount(),
        completed: await queue.getCompletedCount(),
        failed: await queue.getFailedCount(),
        delayed: await queue.getDelayedCount()
      };
    }
    
    return stats;
  }
  
  /**
   * Belirli bir kuyruk tipine ait Queue nesnesini döndürür
   * @param type Kuyruk tipi ('transcript' veya 'summary')
   * @returns Queue nesnesi
   */
  getQueue(type: string): Queue {
    const queue = this.queues[type];
    
    if (!queue) {
      throw new Error(`Queue not found for type: ${type}`);
    }
    
    return queue;
  }
  
  /**
   * Bir işin kuyruktaki durumunu getirir
   */
  async getJobStatus(type: string, jobId: string): Promise<'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown'> {
    try {
      const queue = this.queues[type];
      
      if (!queue) {
        throw new Error(`Queue not found for job type: ${type}`);
      }
      
      const job = await queue.getJob(jobId);
      
      if (!job) {
        return 'unknown';
      }
      
      const state = await job.getState();
      return state as 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';
      
    } catch (error) {
      logger.error('Error getting job status', {
        error,
        type,
        jobId,
        function: 'QueueService.getJobStatus'
      });
      
      return 'unknown';
    }
  }
}

// Singleton instance
const queueService = new QueueService();
export default queueService; 