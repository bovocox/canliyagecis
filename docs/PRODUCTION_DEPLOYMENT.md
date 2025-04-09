# VecizAI Üretim Ortamına Geçiş Rehberi

Bu döküman, VecizAI uygulamasını üretim ortamına hazırlamak ve dağıtmak için gereken adımları içerir.

## 1. Optimizasyonların Kontrol Listesi

Tüm optimizasyonlar başarıyla tamamlandı mı?

- [x] Veritabanı indeksleri optimize edildi
- [x] Veritabanı yapısal iyileştirmeleri eklendi
- [x] VACUUM ile veritabanı temizlendi
- [x] Redis bağlantı ayarları optimize edildi
- [x] Veritabanı bağlantı havuzu yapılandırıldı
- [x] Log seviyesi üretim için ayarlandı
- [x] Cron job'ları 3 saatte bir çalışacak şekilde optimize edildi

## 2. Üretim Ortamına Geçiş

### 2.1. Ortam Değişkenlerini Ayarlama

`.env.production` dosyasını kontrol edin ve aşağıdaki değişkenleri doğru şekilde ayarlayın:

```
NODE_ENV=production
LOG_LEVEL=error
DATABASE_URL=your_production_db_url
SUPABASE_URL=your_production_supabase_url
SUPABASE_ANON_KEY=your_production_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_production_supabase_service_role_key
UPSTASH_REDIS_URL=your_production_redis_url
REDIS_CACHE_TTL=3600
WORKER_COUNT=10
```

### 2.2. Uygulamayı Derleme

```bash
# Bağımlılıkları yükle
npm install

# TypeScript kodunu derle
npm run build
```

### 2.3. Üretim Modunda Başlatma

```bash
# Backend'i üretim modunda çalıştır
npm run start:prod

# Ya da doğrudan Node.js ile çalıştır
NODE_ENV=production LOG_LEVEL=error node dist/index.js
```

### 2.4. Worker Sayısını Ayarlama

Üretim ortamında daha fazla worker çalıştırmak için `WORKER_COUNT` çevre değişkenini ayarlayın veya doğrudan `startWorkers` fonksiyonuna parametre olarak geçin.

Önerilen worker sayısı: CPU çekirdek sayısı x 2

## 3. Performans İzleme

Üretim ortamında performansı izlemek için aşağıdaki konulara dikkat edin:

### 3.1. Log Dosyaları

Üretim modunda, yalnızca error seviyesindeki loglar kaydedilir:

- `logs/error.log`: Sadece hataları içerir
- `logs/combined.log`: Tüm logları içerir

Log seviyesini değiştirmek için:

```bash
LOG_LEVEL=warn node dist/index.js
```

Mevcut log seviyeleri: error, warn, info, debug

### 3.2. Veritabanı Performansı

Periyodik olarak aşağıdaki SQL sorguları ile veritabanı performansını kontrol edin:

```sql
-- İndeks kullanım istatistikleri
SELECT
    schemaname,
    relname,
    indexrelname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Tablo boyutları
SELECT
    nspname || '.' || relname AS relation,
    pg_size_pretty(pg_total_relation_size(C.oid)) AS total_size
FROM pg_class C
LEFT JOIN pg_namespace N ON (N.oid = C.relnamespace)
WHERE nspname NOT IN ('pg_catalog', 'information_schema')
AND C.relkind <> 'i'
AND nspname !~ '^pg_toast'
ORDER BY pg_total_relation_size(C.oid) DESC;
```

### 3.3. Redis İzleme

Redis bellek kullanımı ve performansını izlemek için:

```bash
redis-cli info memory
redis-cli info stats
```

## 4. Bakım Rutinleri

### 4.1. Periyodik Veritabanı Bakımı

Her ay aşağıdaki bakım işlemlerini gerçekleştirin:

```sql
-- Veri analizini güncelle
ANALYZE VERBOSE;

-- Tablo temizliği
VACUUM ANALYZE transcripts;
VACUUM ANALYZE summaries;
VACUUM ANALYZE user_summaries;
```

### 4.2. Log Rotasyonu

Log dosyalarının boyutunu kontrol edin ve gerekirse eski logları arşivleyin:

```bash
# Logs dizinindeki dosya boyutlarını kontrol et
du -sh logs/*

# Eski logları arşivle 
tar -czf logs_archive_$(date +%Y%m%d).tar.gz logs/
rm logs/combined.log
touch logs/combined.log
```

### 4.3. Cron Job Kontrolü

Cron job'ları 3 saatte bir çalışacak şekilde ayarlanmıştır, düzgün çalıştıklarından emin olun:

```bash
# Log dosyalarında cron job çalışma kayıtlarını kontrol edin
grep "CronService" logs/combined.log | tail -20

# Cron job'larının son çalışma zamanlarını kontrol edin
grep "User summary update job started" logs/combined.log | tail -5
grep "User-channel summary relation job started" logs/combined.log | tail -5
```

Eğer cron job'ları düzgün çalışmıyorsa uygulamayı yeniden başlatın:

```bash
npm run start:prod
```

## 5. Sorun Giderme

### 5.1. Yaygın Hatalar

**Hata**: REDIS_URL bulunamadı
**Çözüm**: `.env.production` dosyasında UPSTASH_REDIS_URL değişkenini kontrol edin

**Hata**: Veritabanı bağlantı hatası
**Çözüm**: DATABASE_URL'yi kontrol edin ve ağ erişimi sağlayın

### 5.2. Hata Ayıklama

Üretim ortamında geçici olarak daha detaylı loglar almak için:

```bash
LOG_LEVEL=debug NODE_ENV=production node dist/index.js
```

## 6. Ölçeklendirme

Sistem yükü arttıkça aşağıdaki adımları değerlendirebilirsiniz:

1. Redis önbellek TTL değerlerini artırma
2. Worker sayısını artırma 
3. Veritabanı bağlantı havuzu boyutunu artırma
4. Veriler büyüdükçe tablo partitioning uygulama
5. Okuma ve yazma işlemlerini ayırmak için read replica kullanma

## 7. Güvenlik Kontrolleri

- API endpointlerinde rate limiting uygulama
- Redis ve veritabanı bağlantılarını şifreli hale getirme
- Tüm bağımlılıkları güvenlik açıkları için tarama
- Güvenlik duvarı ayarlarıyla sadece gerekli portlara erişim sağlama 