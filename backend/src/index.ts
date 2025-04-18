import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';
import videoRoutes from './routes/videoRoutes';
import transcriptRoutes from './routes/transcriptRoutes';
import summaryRoutes from './routes/summaryRoutes';
import channelRoutes from './routes/channelRoutes';
import cronRoutes from './routes/cronRoutes';
import { startWorkers } from './queue/startWorkers';
import { CronService } from './services/cron.service';
import testRoutes from './routes/testRoutes';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import logger from './utils/logger';
import redis from './config/redis';
import { workerEventEmitter } from './services/queueService';

// Load environment variables based on NODE_ENV
dotenv.config({
  path: `.env.${process.env.NODE_ENV || 'development'}`
});

const app = express();
const port = process.env.PORT || 3000;
// HTTP server oluşturma
const server = http.createServer(app);

// Middleware
// Test amaçlı olarak CSP kısıtlamalarını kaldıralım
app.use(helmet({
  contentSecurityPolicy: false, // CSP kısıtlamalarını devre dışı bırak
}));

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://vecizaiprod-7ra05gxaq-metins-projects-bbe2c3c0.vercel.app',
    'https://vecizai-prod.vercel.app',
    'https://veciz.ai',
    'https://www.veciz.ai',
    'http://veciz.ai',
    'http://www.veciz.ai',
    'https://veciz-ai-prod-d2f90f1c0523.herokuapp.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static dosyaları servis et (varsa) - API rotalarından ÖNCE tanımlanmalı!
const publicPath = path.join(process.cwd(), 'public');
console.log(`🌐 Serving static files from: ${publicPath}`);
app.use(express.static(publicPath));

// Routes
app.use('/api/videos', videoRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use('/api/summaries', summaryRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/test', testRoutes);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Asenkron olarak sunucuyu başlat
const startServer = async () => {
  try {
    // Redis bağlantısını kontrol et
    logger.info('Redis bağlantısı kontrol ediliyor...');
    await new Promise((resolve) => {
      // Redis bağlantı durumunu kontrol et
      // 'ready': Bağlı ve hazır
      // 'connect': Bağlantı sürecinde
      // 'connecting': Bağlanmaya çalışıyor
      // 'reconnecting': Yeniden bağlanmaya çalışıyor
      
      const redisStatus = redis.status;
      logger.info(`Redis durumu: ${redisStatus}`);
      
      if (redisStatus === 'ready') {
        logger.info('Redis zaten bağlı ve hazır');
        resolve(true);
      } else if (redisStatus === 'connect' || redisStatus === 'connecting' || redisStatus === 'reconnecting') {
        logger.info('Redis bağlanma sürecinde, bekleniyor...');
        // Hazır olduğunda ilerle
        redis.once('ready', () => {
          logger.info('Redis hazır duruma geldi');
          resolve(true);
        });
        
        // 10 saniye içinde hazır olmazsa yine de devam et
        setTimeout(() => {
          logger.warn('Redis 10 saniye içinde hazır olmadı, yine de devam ediliyor');
          resolve(true);
        }, 10000);
      } else {
        // Bağlı değil ve bağlanmaya çalışmıyor, bağlanmayı dene
        logger.info('Redis bağlı değil, bağlanmayı deniyoruz...');
        
        // Bağlantı hatası durumunda uygulamayı çökertmemek için try-catch içinde bağlan
        try {
          redis.connect()
            .then(() => {
              logger.info('Redis bağlantısı başarılı');
              resolve(true);
            })
            .catch((err) => {
              logger.error('Redis bağlantı hatası, ancak devam ediliyor:', err);
              // Hata olsa bile devam et
              resolve(true);
            });
        } catch (connectError) {
          logger.error('Redis bağlantı exception hatası, devam ediliyor:', connectError);
          // Exception olsa bile devam et
          resolve(true);
        }
      }
    });

    // BullMQ worker'larını başlat
    logger.info('BullMQ worker\'lar başlatılıyor...');
    try {
      await startWorkers();
      logger.info('BullMQ worker\'lar başlatıldı.');
      
      // Worker restart event listener ekle
      workerEventEmitter.on('restart_workers', async (data) => {
        logger.warn('Worker restart eventi algılandı:', data);
        try {
          logger.info('🧩 BullMQ kuyrukları yeniden başlatılıyor...');
          await startWorkers();
          logger.info('✅ BullMQ kuyrukları başarıyla yeniden başlatıldı');
        } catch (restartError) {
          logger.error('Worker yeniden başlatma hatası:', restartError);
        }
      });
      
    } catch (workersError) {
      logger.error('BullMQ worker\'ları başlatılırken hata:', workersError);
      // Worker hatası olsa bile devam et
    }

    // Cron servisini başlat
    try {
      const cronService = new CronService();
      cronService.start();
    } catch (cronError) {
      logger.error('Cron servisi başlatılırken hata:', cronError);
      // Cron hatası olsa bile devam et
    }

    // Sunucuyu başlat
    server.listen(port, () => {
      logger.info(`Server running on port ${port}`);
    });

  } catch (error) {
    logger.error('Sunucu başlatma hatası:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('📢 Received shutdown signal');
  
  try {
    // Bağlantıları kapat
    logger.info('🔄 Closing Redis connection...');
    await redis.quit();
    logger.info('✅ Redis connection closed');
    
    logger.info('👋 Server shutting down gracefully');
    process.exit(0);
  } catch (error) {
    logger.error(`❌ Error during graceful shutdown: ${error}`);
    process.exit(1);
  }
};

// Shutdown sinyallerini yakala
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;