# Transkript İndirme ve Özetleme İş Akışı

Bu doküman, transkript indirmeden özetleme işlemine kadar sistemin nasıl çalıştığını anlatır.

## Genel İş Akışı

1. Kullanıcı bir video özetleme isteği yapar
2. Sistem önce transkript indirir
3. Transkript tamamlandığında otomatik olarak özetleme işlemi tetiklenir
4. Özetleme işlemi arka planda asenkron olarak çalışır

## Servisler ve Görevleri

### 1. TranscriptWorker (Transkript İndirme)

- Transkript işini kuyruktan alır
- YouTube videosu için transkript indirir veya Whisper kullanır
- İşlem tamamlandığında `markTranscriptCompleted` metodunu çağırır
- Bu metod, `triggerSummaryGeneration` ile özetleme işlemini başlatır

```typescript
// TranscriptWorker'da transkript tamamlandığında yapılması gerekenler
async markTranscriptCompleted(transcriptId: string, text: string): Promise<void> {
  try {
    // Transkript durumunu güncelle
    await this.databaseService.updateTranscript(transcriptId, {
      status: 'completed',
      updated_at: new Date()
    });

    // Transkript bilgilerini al 
    const transcript = await this.databaseService.getTranscriptById(transcriptId);
    
    if (transcript) {
      // Özetleme işlemini tetikle
      this.triggerSummaryGeneration(transcript.video_id, transcript.language, transcriptId);
    }
    
    // İşi tamamlandı olarak işaretle
    await this.queueService.markTaskComplete('transcript', transcriptId);
  } catch (error) {
    console.error(`Error marking transcript completed: ${error.message}`);
    throw error;
  }
}

// Özetleme işini kuyruğa ekle
private async triggerSummaryGeneration(videoId: string, language: string, transcriptId: string): Promise<void> {
  try {
    // Özet servisi ile yeni özet oluştur (veritabanına kaydedilecek)
    const summaryService = new SummaryService();
    const summary = await summaryService.generateSummary(videoId, language);
    
    // Özet işini kuyruğa ekle
    await this.queueService.addToQueue({
      type: 'summary',
      data: {
        videoId,
        language,
        summaryId: summary.id,
        transcriptId
      }
    });
  } catch (error) {
    console.error(`Error triggering summary generation: ${error.message}`);
    // Hata olsa bile ana işlemi etkilemesin
  }
}
```

### 2. SummaryWorker (Özetleme)

- Özet işlerini kuyruktan alır ve işler
- `SummaryService.processSummary` metodunu çağırarak özet oluşturur

```typescript
// SummaryWorker'ın iş işleme fonksiyonu
protected async processTask(data: any): Promise<void> {
  try {
    const { videoId, language, summaryId } = data;
    
    // SummaryService'in processSummary metodunu çağır
    await this.summaryService.processSummary(videoId, language, summaryId);
    
  } catch (error) {
    // Hata durumunu yönet
    if (data.summaryId) {
      await this.updateSummaryStatus(data.summaryId, 'failed', error);
    }
    throw error;
  }
}
```

### 3. SummaryService (Özet İşlemleri)

- Özetleme işlemlerini yönetir
- 3 aşamalı kontrol yapar: Redis Cache → Database → Gemini API
- `generateSummary` metodu özet kaydı oluşturur
- `processSummary` metodu asıl özet içeriğini oluşturur

```typescript
// Özet kaydı oluşturma veya varsa getirme
async generateSummary(videoId: string, language: string, userId?: string): Promise<Summary> {
  // 1. Redis cache'de kontrol et
  const cachedSummary = await summaryCacheService.getFromCache(videoId, language);
  if (cachedSummary && cachedSummary.status === 'completed') {
    return cachedSummary;
  }
  
  // 2. Veritabanında kontrol et
  const dbSummary = await this.databaseService.getSummary(videoId, language);
  if (dbSummary && dbSummary.status === 'completed') {
    await summaryCacheService.setToCache(videoId, language, dbSummary);
    return dbSummary;
  }
  
  // 3. Yeni özet kaydı oluştur
  const summaryId = uuidv4();
  const newSummary = {
    id: summaryId,
    video_id: videoId,
    language,
    status: 'pending',
    content: '',
    // ...diğer alanlar
  };
  
  return await this.databaseService.createSummary(newSummary);
}

// Özet içeriği oluşturma
async processSummary(videoId: string, language: string, summaryId: string): Promise<void> {
  try {
    // Önce durumu güncelle
    await this.databaseService.updateSummary(summaryId, { status: 'processing' });
    
    // Transkript verisi al
    const transcript = await this.databaseService.getTranscript(videoId, language);
    
    // İçerik türünü belirle
    const contentType = await this.promptManager.categorizeContent(transcript.text);
    
    // Uygun promptu al
    const prompt = await this.promptManager.getPrompt(language, contentType);
    
    // Gemini API ile özet oluştur
    const summaryText = await this.geminiService.generateSummary(
      prompt.replace('{transcript}', transcript.text),
      ''
    );
    
    // Özeti güncelle
    await this.databaseService.updateSummary(summaryId, {
      content: summaryText,
      status: 'completed'
    });
    
    // Cache'e ekle
    const updatedSummary = await this.databaseService.getSummary(videoId, language);
    if (updatedSummary) {
      await summaryCacheService.setToCache(videoId, language, updatedSummary);
    }
  } catch (error) {
    // Hata durumunu yönet
    await this.databaseService.updateSummary(summaryId, {
      status: 'failed',
      error: error.message
    });
    throw error;
  }
}
```

### 4. SummaryCacheService (Önbellek)

- Redis önbelleğinde özetleri saklar ve getirir
- Performansı artırmak için tekrarlanan istekleri hızlandırır

```typescript
async getFromCache(videoId: string, language: string): Promise<Summary | null> {
  const cacheKey = `summary:${videoId}:${language}`;
  const cachedData = await redis.get(cacheKey);
  
  if (cachedData) {
    return JSON.parse(cachedData);
  }
  
  return null;
}

async setToCache(videoId: string, language: string, data: Summary): Promise<void> {
  const cacheKey = `summary:${videoId}:${language}`;
  await redis.set(cacheKey, JSON.stringify(data), 'EX', 86400); // 24 saat
}
```

### 5. QueueService (Kuyruk Yönetimi)

- Redis tabanlı iş kuyruklarını yönetir
- Özetleme işlerini asenkron olarak işlenmek üzere kuyruğa ekler

```typescript
// Kuyruk tipleri: 'transcript' ve 'summary'
async addToQueue(task: QueueTask): Promise<void> {
  const queueKey = task.type === 'transcript' ? 'veciz:queue:transcript' : 'veciz:queue:summary';
  await redis.lpush(queueKey, JSON.stringify(task));
  
  // Bildirim yayınla
  await redis.publish('veciz:queue:notification', JSON.stringify({
    type: task.type,
    action: 'added',
    timestamp: Date.now()
  }));
}
```

## Uygulama Adımları

1. **QueueService'i Güncelleyin**: 
   - `summary` tipinde işleri destekleyecek şekilde güncellendi
   - İlgili queue ve lock key'lerini tanımladık

2. **SummaryCacheService Oluşturun**:
   - Özetleri Redis önbelleğinde saklamak için yeni bir servis oluşturuldu
   - `getFromCache` ve `setToCache` metodları eklendi

3. **SummaryService'i Güncelleyin**:
   - Redis önbellek ve veritabanı kontrolleri eklendi
   - `processSummary` metodu eklendi ve Gemini API entegrasyonu tamamlandı

4. **SummaryWorker'ı Güncelleyin**:
   - `processTask` metodunu `SummaryService.processSummary` çağıracak şekilde güncellendi

5. **Transcript Tamamlanma İşlemini Güncelleyin**:
   - Transkript başarıyla tamamlandığında özet işini kuyruğa ekleyecek kodu ekleyin

## Redis Veri Yapısı

```
# Kuyruklar
veciz:queue:transcript - Transkript kuyruk işleri
veciz:queue:summary - Özet kuyruk işleri

# İşlenen İşler
veciz:processing:transcript:<id> - İşlenmekte olan transkript işleri
veciz:processing:summary:<id> - İşlenmekte olan özet işleri

# Kilitler
veciz:lock:transcript - Transkript iş kilidi
veciz:lock:summary - Özet iş kilidi

# Önbellek
transcript:<videoId>:<language> - Transkript önbellek
summary:<videoId>:<language> - Özet önbellek
```

## Kurulum

1. Bağımlılıkları yükleyin:
   - `redis` paketi
   - `uuid` paketi

2. Redis bağlantısı için `.env` dosyasını düzenleyin:
   ```
   REDIS_URL=redis://localhost:6379
   REDIS_CACHE_TTL=86400
   ```

3. Servisleri `index.ts` dosyasında kaydedin ve worker'ları `startWorkers.ts` dosyasında başlatın. 