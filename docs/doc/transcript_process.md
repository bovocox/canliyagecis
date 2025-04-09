# Transcript Oluşturma Süreci

## Genel Bakış

Bu dokümantasyon, VecizAI uygulamasında bir video için transcript oluşturma sürecini detaylı olarak açıklamaktadır. Süreç, frontend'den başlayıp backend'de tamamlanan ve çeşitli servisler aracılığıyla yönetilen bir yapıya sahiptir.

## Süreç Akışı

### 1. Frontend'de Başlatma

#### 1.1. Video İşleme Başlatma
- `processVideoWithLanguage` fonksiyonu ile süreç başlatılır
- Parametreler:
  - `videoId`: YouTube video ID'si
  - `language`: Transcript dili (tr/en)

```typescript
const processVideoWithLanguage = async (language: string) => {
  showLanguageModal.value = false;
  const currentVideoUrl = pendingVideoUrl.value || searchQuery.value;
  isLoadingTranscript.value = true;
  isLoadingSummary.value = true;
  
  const extractedVideoId = getVideoId(currentVideoUrl);
  // ... video işleme ve polling başlatma
};
```

#### 1.2. Polling Mekanizması
- `startPolling` fonksiyonu ile durum kontrolü başlatılır
- Her 3 saniyede bir kontrol yapılır
- Transcript durumu sürekli izlenir

```typescript
const startPolling = (videoId: string, language: string) => {
  transcriptIntervalRef.value = window.setInterval(async () => {
    try {
      const transcript = await pollForTranscript(videoId, language);
      // ... transcript durumu kontrolü
    } catch (e) {
      // ... hata yönetimi
    }
  }, 3000);
};
```

### 2. Backend API Endpoints

#### 2.1. Transcript Routes
- `/api/transcripts/from-video`: Yeni transcript oluşturma
- `/api/transcripts/status/:videoId`: Transcript durumu kontrolü
- `/api/transcripts/:videoId`: Transcript içeriği alma

```typescript
router.post('/from-video', createTranscriptFromVideo);
router.get('/status/:videoId', getTranscriptStatus);
router.get('/:videoId', getTranscriptForVideo);
```

### 3. Backend Controller Katmanı

#### 3.1. Transcript Controller
- Request validasyonu
- Service katmanı ile iletişim
- Hata yönetimi
- Logging

```typescript
export const createTranscriptFromVideo = async (req: Request, res: Response) => {
  try {
    const { videoId, language } = req.body;
    const result = await transcriptService.getOrCreateTranscript(videoId, language, false);
    return res.status(result.status === 'pending' ? 202 : 200).json(result);
  } catch (error) {
    return handleApiError(res, error, 'Error creating transcript from video');
  }
};
```

### 4. Service Katmanı

#### 4.1. Transcript Service
Transcript oluşturma ve yönetme sürecinin ana mantığını içerir.

##### 4.1.1. Cache Kontrolü
```typescript
const cachedTranscript = await cacheService.getTranscript(videoId, language);
if (cachedTranscript && cachedTranscript.status === 'completed') {
  return { status: 'completed', data: cachedTranscript };
}
```

##### 4.1.2. Database Kontrolü
```typescript
const existingTranscript = await this.databaseService.getRawTranscript(videoId, language);
if (existingTranscript && existingTranscript.status === 'completed') {
  await cacheService.setTranscript(videoId, language, existingTranscript);
  return { status: 'completed', data: existingTranscript };
}
```

##### 4.1.3. Yeni Transcript Oluşturma
```typescript
const newTranscript = await this.createAndQueueTranscript(videoId, language);
return {
  status: 'pending',
  transcript_id: newTranscript.id,
  message: 'Transcript creation started'
};
```

### 5. Queue Sistemi

#### 5.1. Queue Service
- Transcript işlerini sırayla işler
- Asenkron çalışır
- Hata durumlarını yönetir

```typescript
await queueService.addToQueue({
  type: 'transcript',
  data: {
    videoId,
    language,
    transcriptId
  }
});
```

## Veri Akışı

1. Frontend -> Backend API
2. API -> Controller
3. Controller -> Service
4. Service -> Cache/Database
5. Service -> Queue
6. Queue -> External Services (YouTube API/Whisper)
7. Queue -> Database
8. Frontend Polling -> Backend API

## Kullanılan Servisler

### 1. Cache Service
- Transcript verilerini önbelleğe alır
- Performansı artırır
- Redis kullanır

### 2. Database Service
- Transcript verilerini kalıcı olarak saklar
- Supabase kullanır

### 3. Queue Service
- İşleri sıraya alır
- Asenkron işleme sağlar
- Hata durumlarını yönetir

## Hata Yönetimi

### 1. Frontend
- API hataları yakalanır
- Kullanıcıya uygun mesajlar gösterilir
- Polling mekanizması hataları yönetir

### 2. Backend
- Controller seviyesinde hata yakalama
- Service seviyesinde detaylı hata yönetimi
- Queue seviyesinde retry mekanizması

## Logging

- Her seviyede detaylı logging
- Hata durumlarında extra logging
- Performance monitoring
- Request/Response logging

## Optimizasyonlar

1. Cache Kullanımı
   - Sık kullanılan transcriptler cache'de tutulur
   - Cache hit rate optimize edilir

2. Queue Sistemi
   - İşler sırayla ve kontrollü işlenir
   - Sistem yükü dengelenir

3. Polling Mekanizması
   - 3 saniyelik interval ile sistem yükü optimize edilir
   - Gereksiz istekler engellenir

## Güvenlik

1. API Güvenliği
   - Rate limiting
   - Authentication kontrolleri
   - Input validasyonu

2. Veri Güvenliği
   - Hassas veriler şifrelenir
   - Kullanıcı verileri korunur

## Monitoring ve Maintenance

1. Sistem Monitoring
   - Service health checks
   - Performance metrics
   - Error tracking

2. Maintenance
   - Cache temizleme
   - Queue monitoring
   - Database optimization 