/**
 * Bu script, BullMQ ve Redis arasındaki Pub/Sub mekanizmasını test etmek için kullanılır.
 * 
 * Kullanım:
 * npm run ts-node src/test-redis-queue.ts
 * 
 * Bu script:
 * 1. Yeni bir BullMQ kuyruğu ve worker oluşturur
 * 2. Kuyruğa örnek bir iş ekler
 * 3. Worker'ın işi alıp işleyip işlemediğini kontrol eder
 */

import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

// ENV dosyasını yükle
dotenv.config({ path: path.join(__dirname, '../.env.development') });

// Redis URL'sini kontrol et
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
console.log(`Redis URL (gizlenmiş): ${REDIS_URL.replace(/\/\/(.+?)@/, '//***@')}`);

// Redis bağlantı ayarları
const redisOptions = {
  maxRetriesPerRequest: null,   // BullMQ için gerekli
  enableReadyCheck: false,      // Upstash için önemli
  enableOfflineQueue: true,
  connectTimeout: 30000,        // 30 saniye bağlantı zaman aşımı
  tls: {
    rejectUnauthorized: false   // TLS bağlantısı için gerekli
  },
  retryStrategy: (times: number) => {
    const maxDelay = 30000;     // 30 saniye maksimum gecikme
    const delay = Math.min(Math.exp(times) * 500, maxDelay);
    console.warn(`Redis bağlantı hatası, ${delay}ms sonra yeniden denenecek (deneme: ${times})`);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    // Yeniden bağlanmayı gerektiren hata durumları
    const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND'];
    if (targetErrors.some(code => err.message.includes(code))) {
      console.warn(`Redis hatası nedeniyle yeniden bağlanılıyor: ${err.message}`);
      return true;
    }
    return false;
  },
  // Pub/Sub kanalları için polling modunu devre dışı bırakıyoruz
  enableAutoPipelining: false,
  // Redis'e bağlantıyı canlı tutmak için ping işlemi ekleyelim
  keepAlive: 5000, // 5 saniyede bir ping
  connectionName: `pubsub_test_${Math.floor(Math.random() * 1000)}`
};

// Redis bağlantısı
const connection = new Redis(REDIS_URL, redisOptions);

// Test kuyruğu adı
const QUEUE_NAME = 'veciz_test_queue';

// Bağlantıları temizleme
async function cleanup() {
  console.log('Bağlantılar temizleniyor...');
  await queue.close();
  await worker.close();
  await connection.quit();
  console.log('Bağlantılar kapatıldı.');
  process.exit(0);
}

// Hata durumunda temizleme
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
  console.error('Yakalanamayan hata:', err);
  cleanup();
});

// Kuyruk oluştur
const queue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  }
});

// Worker oluştur
const worker = new Worker(QUEUE_NAME, async (job) => {
  console.log(`İş işleniyor: ${job.id}`, job.data);
  // İş işleme simülasyonu
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log(`İş tamamlandı: ${job.id}`);
  return { completed: true, jobId: job.id, timestamp: new Date() };
}, {
  connection,
  concurrency: 1,
  stalledInterval: 10000,
  maxStalledCount: 2,
  drainDelay: 5
});

// Worker olaylarını dinle
worker.on('ready', () => {
  console.log('Worker hazır');
});

worker.on('active', (job) => {
  console.log(`İş aktif: ${job.id}`);
});

worker.on('completed', (job) => {
  console.log(`İş tamamlandı (olay): ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`İş başarısız oldu: ${job?.id}`, err);
});

worker.on('error', (err) => {
  console.error('Worker hatası:', err);
});

// Test işi ekle
async function addTestJob() {
  try {
    console.log('Worker ve kuyruk oluşturuldu, 3 saniye sonra test işi eklenecek...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const job = await queue.add('test-job', {
      videoId: 's1ax8Tx_Jz0',
      language: 'tr',
      taskId: `test-${Date.now()}`,
      timestamp: new Date()
    });
    
    console.log(`Test işi eklendi, ID: ${job.id}`);
    console.log('İş işleniyorsa, yukarıda "İş aktif" ve "İş tamamlandı" logları görmelisiniz.');
    
    // 10 saniye bekle ve kuyruk durumunu kontrol et
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const completed = await queue.getCompletedCount();
    const failed = await queue.getFailedCount();
    
    console.log('\nKuyruk durumu:');
    console.log(`- Bekleyen işler: ${waiting}`);
    console.log(`- Aktif işler: ${active}`);
    console.log(`- Tamamlanan işler: ${completed}`);
    console.log(`- Başarısız işler: ${failed}`);
    
    if (completed > 0) {
      console.log('\n✅ TEST BAŞARILI: İş başarıyla işlendi!');
      console.log('BullMQ ve Redis arasındaki Pub/Sub mekanizması çalışıyor.');
    } else {
      console.log('\n❌ TEST BAŞARISIZ: İş işlenmedi.');
      console.log('Pub/Sub mekanizması çalışmıyor olabilir.');
    }
    
    // 2 saniye daha bekle ve çık
    await new Promise(resolve => setTimeout(resolve, 2000));
    await cleanup();
    
  } catch (error) {
    console.error('Test sırasında hata:', error);
    await cleanup();
  }
}

// Test işi ekle
console.log('Redis bağlantısı kuruluyor...');
connection.on('connect', () => {
  console.log('Redis bağlantısı kuruldu');
});

connection.on('ready', () => {
  console.log('Redis bağlantısı hazır');
  addTestJob();
});

connection.on('error', (err) => {
  console.error('Redis bağlantı hatası:', err);
}); 