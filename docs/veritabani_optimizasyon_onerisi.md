# VecizAI Veritabanı Optimizasyon Önerileri

Bu doküman, VecizAI uygulamasının veritabanı performansını artırmak için öneriler sunmaktadır. Analizlerimiz, uygulama performansını iyileştirmek için veritabanı indeksleri ve önbellek stratejisi üzerine odaklanmaktadır.

## 1. Veritabanı İndeksleri

Supabase sorgu istatistiklerine göre, en yoğun sorgulanan tablolar ve sütunlar için aşağıdaki indekslerin eklenmesi önerilmektedir:

```sql
-- Önce gerekli eklentileri yükle
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- transcripts tablosu indeksleri
CREATE INDEX IF NOT EXISTS idx_transcripts_video_language ON public.transcripts(video_id, language);
CREATE INDEX IF NOT EXISTS idx_transcripts_status ON public.transcripts(status);
CREATE INDEX IF NOT EXISTS idx_transcripts_created_at ON public.transcripts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_source ON public.transcripts(source);

-- tasks tablosu indeksleri
CREATE INDEX IF NOT EXISTS idx_tasks_status_locked ON public.tasks(status) WHERE locked_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status_created_at ON public.tasks(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_locked_by ON public.tasks(locked_by) WHERE locked_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_video_id ON public.tasks(video_id);

-- summaries tablosu indeksleri
CREATE INDEX IF NOT EXISTS idx_summaries_video_language ON public.summaries(video_id, language);
CREATE INDEX IF NOT EXISTS idx_summaries_status ON public.summaries(status);
CREATE INDEX IF NOT EXISTS idx_summaries_created_at ON public.summaries(created_at DESC);

-- videos tablosu indeksleri
CREATE INDEX IF NOT EXISTS idx_videos_video_id ON public.videos(video_id);
CREATE INDEX IF NOT EXISTS idx_videos_channel_id ON public.videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_title_gist ON public.videos USING gin(title gin_trgm_ops);

-- whisper_tasks tablosu indeksleri
CREATE INDEX IF NOT EXISTS idx_whisper_tasks_status ON public.whisper_tasks(status);
CREATE INDEX IF NOT EXISTS idx_whisper_tasks_created_at ON public.whisper_tasks(created_at ASC);

-- İstatistikleri güncelleme
ANALYZE public.transcripts;
ANALYZE public.tasks;
ANALYZE public.summaries;
ANALYZE public.videos;
ANALYZE public.whisper_tasks;
```

## 2. Önbellek (Cache) Stratejisi

### 2.1. Önbellek TTL ve Anahtar Şeması Optimizasyonu

CacheService'i aşağıdaki şekilde optimize edilmiştir:

1. **Veri Türüne Özel TTL Tanımlamaları**:
   ```typescript
   private readonly TTL = {
     TRANSCRIPT: 3600 * 12, // 12 saat (transkriptler nadiren değişir)
     SUMMARY: 3600 * 24,    // 24 saat (özetler çok nadiren değişir)
     VIDEO: 3600 * 24,      // 24 saat (video metadata nadiren değişir)
     TASK: 300,             // 5 dakika (task durumları sık değişir)
     RESULT: 3600 * 3,      // 3 saat (sonuçlar orta sıklıkta değişir)
     DEFAULT: 3600          // 1 saat (varsayılan değer)
   };
   ```

2. **Standart Anahtar Şeması**:
   ```typescript
   private generateCacheKey(
     prefix: string, 
     primaryKey: string, 
     secondaryKey?: string,
     tertiaryKey?: string
   ): string {
     let key = `${prefix}${primaryKey}`;
     
     if (secondaryKey) {
       key += `:${secondaryKey}`;
     }
     
     if (tertiaryKey) {
       key += `:${tertiaryKey}`;
     }
     
     return key;
   }
   ```

### 2.2. DatabaseService Önbellek Optimizasyon Planı

`DatabaseService`'teki temel veri erişim metodlarının önbellek kullanacak şekilde optimize edilmesi önerilmektedir:

#### 2.2.1. getRawTranscript Metodu Optimizasyonu

```typescript
async getRawTranscript(videoId: string, language: string): Promise<any> {
  try {
    // 1. Önce önbellekten kontrol et
    const cachedTranscript = await cacheService.getTranscript(videoId, language);
    if (cachedTranscript) {
      logger.info('Transkript önbellekten alındı', { videoId, language });
      return cachedTranscript;
    }

    // 2. Önbellekte yoksa DB'den al
    logger.info('DB\'den transkript getiriliyor', { videoId, language });
    const { data, error } = await supabase
      .from('transcripts')
      .select('*')
      .eq('video_id', videoId)
      .eq('language', language)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.info('Transkript bulunamadı', { videoId, language });
        return null;
      }
      throw error;
    }

    // 3. DB'den alınan veriyi önbelleğe kaydet
    if (data) {
      await cacheService.setTranscript(videoId, language, data);
    }

    return data;
  } catch (error) {
    logger.error('DB\'den transkript getirme hatası', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      videoId, 
      language
    });
    throw error;
  }
}
```

#### 2.2.2. getRawSummary Metodu Optimizasyonu

```typescript
async getRawSummary(videoId: string, language: string): Promise<Summary | null> {
  try {
    // Parametreleri kontrol et
    if (!videoId || !language) {
      logger.error('Geçersiz parametreler', { videoId, language });
      throw new Error('Invalid parameters: videoId and language are required');
    }

    // 1. Önce önbellekten kontrol et
    const cachedSummary = await cacheService.getSummary(videoId, language);
    if (cachedSummary) {
      logger.info('Özet önbellekten alındı', { 
        videoId, 
        language,
        status: cachedSummary.status,
        id: cachedSummary.id
      });
      return cachedSummary;
    }

    // 2. Önbellekte yoksa DB'den al
    logger.info('DB\'den özet getiriliyor', { 
      videoId, 
      language,
      query: {
        video_id: videoId,
        language: language
      }
    });

    // DB sorgusu
    const { data: allData, error: allError } = await supabaseAdmin
      .from('summaries')
      .select('*')
      .eq('video_id', videoId)
      .eq('language', language)
      .order('created_at', { ascending: false });

    if (allError) {
      logger.error('Özet DB sorgusunda hata (tüm kayıtlar)', { 
        error: allError, 
        videoId, 
        language,
        query: {
          video_id: videoId,
          language: language
        }
      });
      throw allError;
    }

    // En son kaydı al
    if (!allData || allData.length === 0) {
      logger.info('Özet DB\'de bulunamadı', { 
        videoId, 
        language,
        totalRecords: 0
      });
      return null;
    }

    const latestRecord = allData[0];
    
    // 3. DB'den alınan veriyi önbelleğe kaydet
    await cacheService.setSummary(videoId, language, latestRecord);

    logger.info('Özet bulundu', {
      videoId,
      language,
      status: latestRecord.status,
      id: latestRecord.id
    });

    return latestRecord as Summary;
  } catch (error: any) {
    logger.error('DB\'den özet getirme hatası', { 
      error: error.message,
      videoId,
      language,
      stack: error.stack
    });
    throw error;
  }
}
```

#### 2.2.3. Veri Değiştiren Metodlarda Önbellek İnvalidasyonu

**saveRawTranscript** ve **updateRawSummary** metodlarına önbellek invalidasyonu eklenmelidir:

```typescript
async saveRawTranscript(videoId: string, language: string, data: any): Promise<void> {
  try {
    // ... mevcut kod ...
    
    // Veritabanına kaydettikten sonra önbelleği güncelle
    await cacheService.setTranscript(videoId, language, {
      video_id: videoId,
      language,
      ...data,
      updated_at: new Date().toISOString()
    });
    
  } catch (error) {
    // ... mevcut kod ...
  }
}

async updateRawSummary(summaryId: string, updates: Partial<Summary>): Promise<void> {
  try {
    // ... mevcut kod ...
    
    // Güncellenen özeti DB'den tekrar al
    if (updates.video_id && updates.language) {
      // Önbelleği invalide et
      await cacheService.invalidateSummary(updates.video_id, updates.language);
    }
    
  } catch (error: any) {
    // ... mevcut kod ...
  }
}
```

## 3. İleri Düzey Optimizasyonlar (Gelecek Aşamalar)

### 3.1. Bağlantı Havuzu (Connection Pool) Yapılandırması

```typescript
constructor() {
  this.pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    max: 20, // Eşzamanlı bağlantı sayısı
    idleTimeoutMillis: 30000, // Boşta kalan bağlantının kapatılacağı süre (ms)
    connectionTimeoutMillis: 5000 // Bağlantı zaman aşımı (ms)
  });
}
```

### 3.2. Batch İşlemleri

Çoklu veri işlemleri için batch (toplu) operasyonlar kullanılmalıdır:

```typescript
async updateMultipleSummaries(updates: Array<{ id: string, data: Partial<Summary> }>) {
  const { error } = await supabaseAdmin
    .from('summaries')
    .upsert(
      updates.map(update => ({ id: update.id, ...update.data, updated_at: new Date() }))
    );
}
```

### 3.3. Önbellek İstatistikleri

Önbellek performansını izlemek için istatistikler tutulmalıdır:

```typescript
class CacheMetrics {
  private hits = 0;
  private misses = 0;
  
  recordHit() {
    this.hits++;
  }
  
  recordMiss() {
    this.misses++;
  }
  
  getHitRate() {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }
}
```

## 4. Uygulama Sırası

Önerilen optimizasyonların aşağıdaki sırayla uygulanması tavsiye edilir:

1. **Veritabanı İndekslerinin Eklenmesi**
2. **CacheService Optimizasyonu**
3. **DatabaseService'in Temel Metodlarının Optimizasyonu**:
   - `getRawTranscript`
   - `getRawSummary`
4. **Veri Değiştiren Metodların Optimizasyonu**:
   - `saveRawTranscript`
   - `updateRawSummary`
   - `createRawSummary`
5. **Diğer Metodların Optimizasyonu**
6. **İleri Düzey Optimizasyonlar**

## 5. Beklenen Faydalar

- Veritabanı yükünün önemli ölçüde azalması
- Sorgu yanıt sürelerinin kısalması
- Uygulama genel performansının artması
- Veritabanı maliyetlerinin azalması
- Ölçeklenebilirliğin artması 