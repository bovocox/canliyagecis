# VecizAI Redis Entegrasyon Planı

## 1. Genel Bakış

Bu doküman, VecizAI'nin Redis entegrasyonunu ve queue yapısına geçiş planını açıklar. Hedef, basit ama ölçeklenebilir bir mimari kurmaktır.

### Desteklenecek İşlemler
- 🎯 YouTube Transkript İşleme
- 📝 Metin Özetleme
- 🎤 Whisper ile Ses Analizi

## 2. Redis Yapılandırması

### Kurulum
```bash
# Docker ile Redis kurulumu
docker run --name veciz-redis -p 6379:6379 -d redis:latest
```

### Temel Konfigürasyon
```conf
maxmemory 512mb
maxmemory-policy allkeys-lru
```

## 3. Queue Yapısı

### Queue İsimleri
```
veciz:queue:transcript   # Transkript işlemleri
veciz:queue:summary     # Özetleme işlemleri
veciz:queue:whisper     # Ses analizi işlemleri
```

### Öncelik Seviyeleri
1. HIGH (1): Premium kullanıcılar
2. MEDIUM (2): Normal kullanıcılar
3. LOW (3): Retry işlemleri

## 4. Kod Yapısı

### Redis Bağlantısı
```typescript
// src/config/redis.ts
import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  maxRetriesPerRequest: 3
});
```

### Queue Service
```typescript
// src/services/queueService.ts
export class QueueService {
  private readonly queues = {
    transcript: 'veciz:queue:transcript',
    summary: 'veciz:queue:summary',
    whisper: 'veciz:queue:whisper'
  };

  async addToQueue(
    queueName: keyof typeof this.queues,
    data: any,
    priority: number = 2
  ) {
    const task = {
      id: uuidv4(),
      data,
      priority,
      createdAt: Date.now()
    };

    await redis.zadd(
      this.queues[queueName],
      priority,
      JSON.stringify(task)
    );

    return task.id;
  }

  async getNextTask(queueName: keyof typeof this.queues) {
    const result = await redis.zpopmin(this.queues[queueName]);
    if (result.length === 0) return null;
    return JSON.parse(result[0]);
  }
}
```

### Worker Base Class
```typescript
// src/workers/baseWorker.ts
export abstract class BaseWorker {
  protected abstract queueName: string;
  protected abstract processTask(task: any): Promise<void>;

  async start() {
    while (true) {
      const task = await queueService.getNextTask(this.queueName);
      if (task) {
        try {
          await this.processTask(task);
        } catch (error) {
          await this.handleError(task, error);
        }
      }
      await sleep(1000); // 1 saniye bekle
    }
  }

  protected async handleError(task: any, error: any) {
    const retryCount = task.retryCount || 0;
    if (retryCount < 3) {
      // Tekrar kuyruğa ekle
      await queueService.addToQueue(
        this.queueName,
        task.data,
        3, // Düşük öncelik
        { retryCount: retryCount + 1 }
      );
    }
  }
}
```

### Spesifik Worker'lar
```typescript
// src/workers/transcriptWorker.ts
export class TranscriptWorker extends BaseWorker {
  protected queueName = 'transcript';

  protected async processTask(task: any) {
    const { videoId, language } = task.data;
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: language
    });
    await saveTranscript(videoId, transcript);
  }
}

// src/workers/summaryWorker.ts
export class SummaryWorker extends BaseWorker {
  protected queueName = 'summary';

  protected async processTask(task: any) {
    const { text } = task.data;
    const summary = await generateSummary(text);
    await saveSummary(task.id, summary);
  }
}

// src/workers/whisperWorker.ts
export class WhisperWorker extends BaseWorker {
  protected queueName = 'whisper';

  protected async processTask(task: any) {
    const { audioUrl } = task.data;
    const transcript = await processWithWhisper(audioUrl);
    await saveWhisperTranscript(task.id, transcript);
  }
}
```

## 5. Kullanım Örnekleri

### Transkript İsteği
```typescript
// Transkript isteği geldiğinde
app.post('/api/transcript', async (req, res) => {
  const { videoId, language } = req.body;
  
  // Cache kontrol
  const cached = await redis.get(`transcript:${videoId}:${language}`);
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  // Queue'ya ekle
  const taskId = await queueService.addToQueue('transcript', {
    videoId,
    language
  });
  
  res.json({ taskId, status: 'processing' });
});
```

### Özetleme İsteği
```typescript
app.post('/api/summary', async (req, res) => {
  const { text } = req.body;
  const taskId = await queueService.addToQueue('summary', { text });
  res.json({ taskId, status: 'processing' });
});
```

### Whisper İsteği
```typescript
app.post('/api/whisper', async (req, res) => {
  const { audioUrl } = req.body;
  const taskId = await queueService.addToQueue('whisper', { audioUrl });
  res.json({ taskId, status: 'processing' });
});
```

## 6. Rate Limiting

```typescript
// src/middleware/rateLimiter.ts
export const rateLimiter = async (req, res, next) => {
  const key = `ratelimit:${req.user.id}`;
  const limit = req.user.isPremium ? 20 : 10; // Premium kullanıcılar için daha yüksek limit
  
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, 60); // 1 dakika
  }
  
  if (current > limit) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  next();
};
```

## 7. Monitoring

```typescript
// src/monitoring/queueStats.ts
export async function getQueueStats() {
  const stats = {};
  
  for (const [name, key] of Object.entries(queueService.queues)) {
    stats[name] = {
      waiting: await redis.zcard(key),
      processing: await redis.get(`${key}:processing`) || 0
    };
  }
  
  return stats;
}
```

## 8. Geçiş Planı

1. **Hazırlık (1 gün)**
   - Redis kurulumu
   - Base worker ve queue service implementasyonu

2. **Transkript Geçişi (2 gün)**
   - Mevcut transcript worker'ı yeni yapıya taşı
   - Test ve monitoring ekle

3. **Yeni Özelliklerin Eklenmesi (3-4 gün)**
   - Özetleme worker'ı
   - Whisper worker'ı
   - Her biri için test ve monitoring

## 9. İleride Yapılabilecekler

1. Worker pool implementasyonu
2. Detaylı monitoring ve alerting
3. Dead letter queue
4. Priority queue optimizasyonları

Bu plan ile basit ama etkili bir queue yapısı kurmuş olacağız. İhtiyaç duydukça sistemi geliştirebiliriz.
