# Özet Oluşturma Süreci

## Genel Bakış

Bu dokümantasyon, VecizAI uygulamasında bir video için özet oluşturma sürecini detaylı olarak açıklamaktadır. Süreç, transcript oluşturulduktan sonra başlar ve benzer şekilde frontend'den backend'e uzanan bir yapıya sahiptir.

## Süreç Akışı

### 1. Frontend'de Başlatma

#### 1.1. Video İşleme ve Özet Başlatma
- `loadInitialVideo` fonksiyonu ile süreç başlar
- Transcript oluşturulduktan sonra özet oluşturma tetiklenir
- Parametreler:
  - `videoId`: YouTube video ID'si
  - `language`: Özet dili (tr/en)

```typescript
const loadInitialVideo = async (videoId: string) => {
  try {
    isLoading.value = true;
    error.value = '';
    
    // Dil belirleme
    const language = 'en'; // Default video için sabit dil
    
    // Video işleme başlatma
    await processVideoWithLanguage(language);
    
    // Özet durumu kontrol edilmeye başlanır
    startPolling(videoId, language);
  } catch (error) {
    console.error('Error in loadInitialVideo:', error);
  }
};
```

#### 1.2. Özet Polling Mekanizması
- `startPolling` fonksiyonu özet durumunu kontrol eder
- Her 3 saniyede bir kontrol yapılır
- Özet durumu sürekli izlenir

```typescript
const pollForSummary = async (videoId: string, language: string) => {
  const statusResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/summaries/status/${videoId}?language=${language}`);
  
  if (statusResponse.status === 404) {
    // Özet yoksa oluştur
    await createSummary(videoId, language);
  }
  
  return await statusResponse.json();
};
```

### 2. Backend API Endpoints

#### 2.1. Summary Routes
- `/api/summaries/from-video`: Yeni özet oluşturma
- `/api/summaries/status/:videoId`: Özet durumu kontrolü
- `/api/summaries/:videoId`: Özet içeriği alma

```typescript
router.post('/from-video', createSummaryFromVideo);
router.get('/status/:videoId', getSummaryStatus);
router.get('/:videoId', getSummaryForVideo);
```

### 3. Backend Controller Katmanı

#### 3.1. Summary Controller
- Request validasyonu
- Service katmanı ile iletişim
- Hata yönetimi
- Logging

```typescript
export const createSummaryFromVideo = async (req: Request, res: Response) => {
  try {
    const { videoId, language } = req.body;
    const result = await summaryService.getOrCreateSummary(videoId, language);
    return res.status(result.status === 'pending' ? 202 : 200).json(result);
  } catch (error) {
    return handleApiError(res, error, 'Error creating summary from video');
  }
};
```

### 4. Service Katmanı

#### 4.1. Summary Service
Özet oluşturma ve yönetme sürecinin ana mantığını içerir.

##### 4.1.1. Cache Kontrolü
```typescript
const cachedSummary = await cacheService.getSummary(videoId, language);
if (cachedSummary && cachedSummary.status === 'completed') {
  return { status: 'completed', data: cachedSummary };
}
```

##### 4.1.2. Database Kontrolü
```typescript
const existingSummary = await this.databaseService.getRawSummary(videoId, language);
if (existingSummary && existingSummary.status === 'completed') {
  await cacheService.setSummary(videoId, language, existingSummary);
  return { status: 'completed', data: existingSummary };
}
```

##### 4.1.3. Yeni Özet Oluşturma
```typescript
const newSummary = await this.createAndQueueSummary(videoId, language);
return {
  status: 'pending',
  summary_id: newSummary.id,
  message: 'Summary creation started'
};
```

### 5. Queue Sistemi

#### 5.1. Queue Service
- Özet işlerini sırayla işler
- Asenkron çalışır
- Hata durumlarını yönetir

```typescript
await queueService.addToQueue({
  type: 'summary',
  data: {
    videoId,
    language,
    summaryId
  }
});
```

## Veri Akışı

1. Frontend -> Backend API
2. API -> Controller
3. Controller -> Service
4. Service -> Cache/Database
5. Service -> Queue
6. Queue -> AI Service (Gemini/GPT)
7. Queue -> Database
8. Frontend Polling -> Backend API

## Kullanılan Servisler

### 1. Cache Service
- Özet verilerini önbelleğe alır
- Performansı artırır
- Redis kullanır

### 2. Database Service
- Özet verilerini kalıcı olarak saklar
- Supabase kullanır

### 3. Queue Service
- İşleri sıraya alır
- Asenkron işleme sağlar
- Hata durumlarını yönetir

### 4. AI Service
- Gemini/GPT API ile iletişim kurar
- Özet oluşturma işlemini gerçekleştirir
- Prompt yönetimini sağlar

## Hata Yönetimi

### 1. Frontend
- API hataları yakalanır
- Kullanıcıya uygun mesajlar gösterilir
- Polling mekanizması hataları yönetir

### 2. Backend
- Controller seviyesinde hata yakalama
- Service seviyesinde detaylı hata yönetimi
- Queue seviyesinde retry mekanizması
- AI service hata yönetimi

## Logging

- Her seviyede detaylı logging
- Hata durumlarında extra logging
- Performance monitoring
- AI service response logging

## Optimizasyonlar

1. Cache Kullanımı
   - Sık kullanılan özetler cache'de tutulur
   - Cache hit rate optimize edilir

2. Queue Sistemi
   - İşler sırayla ve kontrollü işlenir
   - Sistem yükü dengelenir

3. Polling Mekanizması
   - 3 saniyelik interval ile sistem yükü optimize edilir
   - Gereksiz istekler engellenir

4. AI Service Optimizasyonları
   - Token kullanımı optimizasyonu
   - Prompt optimizasyonu
   - Batch processing

## Güvenlik

1. API Güvenliği
   - Rate limiting
   - Authentication kontrolleri
   - Input validasyonu

2. Veri Güvenliği
   - Hassas veriler şifrelenir
   - Kullanıcı verileri korunur
   - AI API anahtarları güvenliği

## Monitoring ve Maintenance

1. Sistem Monitoring
   - Service health checks
   - Performance metrics
   - Error tracking
   - AI service monitoring

2. Maintenance
   - Cache temizleme
   - Queue monitoring
   - Database optimization
   - AI service optimizasyonu 