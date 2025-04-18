import winston from 'winston';
import { env } from '../config/env';

// Prodüksiyon ortamı için log seviyesini ayarla
// Öncelik: 1. LOG_LEVEL çevre değişkeni 2. NODE_ENV'e göre (production -> error, diğer -> info)
const logLevel = env.LOG_LEVEL || (env.NODE_ENV === 'production' ? 'error' : 'info');

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'veciz-ai', environment: env.NODE_ENV },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    // Sadece development ortamında konsola log bas
    ...(env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ] : [])
  ]
});

// Log seviyesini kontrol eden yardımcı fonksiyon
const shouldLog = (level: string): boolean => {
  const levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
  };
  
  return levels[level as keyof typeof levels] <= levels[logLevel as keyof typeof levels];
};

// Cron servisi için log fonksiyonları
export const logCron = (action: string, level: 'info' | 'error' | 'warn' | 'debug', message: string, meta?: any) => {
  if (shouldLog(level)) {
    logger.log({
      level,
      message: `[CronService] [${action}] - ${message}`,
      ...meta
    });
  }
};

export const logService = (service: string, action: string, level: 'info' | 'error' | 'warn' | 'debug', message: string, meta?: any) => {
  if (shouldLog(level)) {
    logger.log({
      level,
      message: `[${service}] [${action}] - ${message}`,
      ...meta
    });
  }
};

// Sistem log fonksiyonları
export const systemLogger = {
  // TranscriptController Logları
  transcriptController: {
    getTranscriptStart: (videoId: string, language: string) => 
      shouldLog('info') && logger.info(`[TranscriptController] [getTranscriptForVideo] - Transkript isteği başlatıldı`, { videoId, language }),
    
    cacheCheck: (videoId: string) => 
      shouldLog('debug') && logger.debug(`[TranscriptController] [getTranscriptForVideo] - Cache kontrolü yapılıyor`, { videoId }),
    
    dbCheck: (videoId: string) => 
      shouldLog('debug') && logger.debug(`[TranscriptController] [getTranscriptForVideo] - DB kontrolü yapılıyor`, { videoId }),
    
    queueAdd: (videoId: string) => 
      shouldLog('info') && logger.info(`[TranscriptController] [getTranscriptForVideo] - Task kuyruğa ekleniyor`, { videoId })
  },

  // QueueService Logları
  queueService: {
    addTask: (taskType: string, taskId: string) => 
      shouldLog('info') && logger.info(`[QueueService] [addToQueue] - Yeni task ekleniyor`, { taskType, taskId }),
    
    getTask: (taskType: string) => 
      shouldLog('debug') && logger.debug(`[QueueService] [getNextTask] - Sıradaki task alınıyor`, { taskType }),
    
    completeTask: (taskType: string, taskId: string) => 
      shouldLog('info') && logger.info(`[QueueService] [markTaskComplete] - Task tamamlandı`, { taskType, taskId }),
    
    failTask: (taskType: string, taskId: string, error: any) => 
      logger.error(`[QueueService] [markTaskFailed] - Task başarısız`, { taskType, taskId, error })
  },

  // SubscriberTranscriptWorker Logları
  transcriptWorker: {
    start: () => 
      shouldLog('info') && logger.info(`[SubscriberTranscriptWorker] [start] - Worker başlatılıyor`),
    
    processTask: (videoId: string) => 
      shouldLog('info') && logger.info(`[SubscriberTranscriptWorker] [processTask] - Task işleniyor`, { videoId }),
    
    youtubeAttempt: (videoId: string) => 
      shouldLog('debug') && logger.debug(`[SubscriberTranscriptWorker] [getYoutubeTranscript] - YouTube transkript deneniyor`, { videoId }),
    
    youtubeSuccess: (videoId: string) =>
      shouldLog('info') && logger.info(`[SubscriberTranscriptWorker] [getYoutubeTranscript] - YouTube transkript başarılı`, { videoId }),

    youtubeFailed: (videoId: string) =>
      shouldLog('warn') && logger.warn(`[SubscriberTranscriptWorker] [getYoutubeTranscript] - YouTube transkript başarısız`, { videoId }),
    
    whisperStart: (videoId: string) => 
      shouldLog('info') && logger.info(`[SubscriberTranscriptWorker] [processTask] - Whisper işlemi başlatılıyor`, { videoId })
  },

  // WhisperService Logları
  whisperService: {
    start: (videoId: string) => 
      shouldLog('info') && logger.info(`[WhisperService] [transcribeVideo] - Transkript işlemi başlatılıyor`, { videoId }),
    
    segment: (segmentIndex: number, totalSegments: number) => 
      shouldLog('debug') && logger.debug(`[WhisperService] [transcribeSegment] - Segment işleniyor`, { segmentIndex, totalSegments }),
    
    complete: (videoId: string) => 
      shouldLog('info') && logger.info(`[WhisperService] [transcribeVideo] - Transkript tamamlandı`, { videoId }),

    segmentCompleted: (segmentPath: string) =>
      shouldLog('debug') && logger.debug(`[WhisperService] [transcribeSegment] - Segment tamamlandı`, { segmentPath })
  },

  // AudioService Logları
  audioService: {
    download: (videoId: string) => 
      shouldLog('info') && logger.info(`[AudioService] [downloadAudio] - Ses dosyası indiriliyor`, { videoId }),
    
    split: (videoId: string, segmentCount: number) => 
      shouldLog('info') && logger.info(`[AudioService] [splitAudio] - Ses dosyası bölünüyor`, { videoId, segmentCount }),
    
    cleanup: (videoId: string) => 
      shouldLog('debug') && logger.debug(`[AudioService] [cleanupAudio] - Ses dosyaları temizleniyor`, { videoId }),

    getDuration: (id: string) =>
      shouldLog('debug') && logger.debug(`[AudioService] [getDuration] - Süre bilgisi alınıyor`, { id }),

    durationRetrieved: (id: string, duration: number, title?: string, size?: number) =>
      shouldLog('debug') && logger.debug(`[AudioService] [getDuration] - Süre bilgisi alındı`, { id, duration, title, size }),

    errorGettingDuration: (id: string, error: any) =>
      logger.error(`[AudioService] [getDuration] - Süre bilgisi alınamadı`, { id, error }),

    segmentCreating: (segmentIndex: number, totalSegments: number, startTime: number, outputPath: string) =>
      shouldLog('debug') && logger.debug(`[AudioService] [splitAudio] - Segment oluşturuluyor`, { segmentIndex, totalSegments, startTime, outputPath }),

    segmentCreated: (segmentIndex: number, outputPath: string) =>
      shouldLog('debug') && logger.debug(`[AudioService] [splitAudio] - Segment başarıyla oluşturuldu`, { segmentIndex, outputPath }),

    segmentCreationError: (segmentIndex: number, error: string, outputPath: string) =>
      logger.error(`[AudioService] [splitAudio] - Segment oluşturulurken hata`, { segmentIndex, error, outputPath }),

    segmentChecked: (segmentIndex: number, outputPath: string, size: number) =>
      shouldLog('debug') && logger.debug(`[AudioService] [splitAudio] - Segment dosyası kontrol edildi`, { segmentIndex, outputPath, size }),

    allSegmentsCreated: (segmentCount: number, segmentPaths: string[]) =>
      shouldLog('info') && logger.info(`[AudioService] [splitAudio] - Tüm segmentler başarıyla oluşturuldu`, { segmentCount, segmentPaths }),

    splitError: (error: string, stack: string | undefined, inputPath: string) =>
      logger.error(`[AudioService] [splitAudio] - Ses dosyası bölünürken hata oluştu`, { error, stack, inputPath })
  },

  // CacheService Logları
  cacheService: {
    get: (videoId: string) => 
      shouldLog('debug') && logger.debug(`[TranscriptCacheService] [getFromCache] - Cache'den veri alınıyor`, { videoId }),
    
    set: (videoId: string) => 
      shouldLog('debug') && logger.debug(`[TranscriptCacheService] [setToCache] - Cache'e veri kaydediliyor`, { videoId }),
    
    invalidate: (videoId: string) => 
      shouldLog('info') && logger.info(`[TranscriptCacheService] [invalidateCache] - Cache temizleniyor`, { videoId })
  },

  // VideoController Logları
  videoController: {
    getFromUrl: (url: string) => 
      shouldLog('info') && logger.info(`[VideoController] [getVideoFromUrl] - Video bilgileri alınıyor`, { url }),
    
    create: (videoId: string) => 
      shouldLog('info') && logger.info(`[VideoController] [createVideo] - Video kaydı oluşturuluyor`, { videoId }),
    
    get: (videoId: string) => 
      shouldLog('debug') && logger.debug(`[VideoController] [getVideo] - Video bilgileri getiriliyor`, { videoId })
  }
};

export default logger;
