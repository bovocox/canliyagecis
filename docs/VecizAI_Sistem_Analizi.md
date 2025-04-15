# VecizAI Sistem Analizi ve Dokümantasyonu

Bu belge, VecizAI platformunun mimari yapısını, iş akışlarını ve bileşenlerini açıklamaktadır. VecizAI, YouTube video transkript'lerini otomatik olarak oluşturan ve işleyen bir platformdur.

## İçindekiler

1. [Genel Mimari](#genel-mimari)
2. [Backend Yapısı](#backend-yapısı)
3. [Frontend Yapısı](#frontend-yapısı)
4. [Veri Akışı ve İş Süreçleri](#veri-akışı-ve-i̇ş-süreçleri)
5. [Anahtar Bileşenler](#anahtar-bileşenler)
6. [Deployment Notları](#deployment-notları)

## Genel Mimari

VecizAI, modern bir web uygulamasıdır ve aşağıdaki temel bileşenlerden oluşmaktadır:

- **Backend**: Node.js ve Express.js kullanılarak TypeScript ile geliştirilmiş RESTful API.
- **Frontend**: Vue 3, Pinia ve TypeScript kullanılarak geliştirilmiş SPA (Single Page Application).
- **Veritabanı**: Supabase (PostgreSQL).
- **İş Kuyrukları**: Transkriptlerin asenkron işlenmesi için worker sistemi.

```
+-------------+       +-------------+       +-------------+
|   Frontend  | <---> |   Backend   | <---> |  Supabase   |
|   (Vue 3)   |       |  (Express)  |       | (PostgreSQL)|
+-------------+       +------+------+       +-------------+
                            |
                     +------v------+
                     |   Workers   |
                     | (Transcript)|
                     +-------------+
```

## Backend Yapısı

Backend, Express.js framework'üyle birlikte TypeScript kullanılarak yapılandırılmıştır ve aşağıdaki temel bileşenleri içerir:

### Dizin Yapısı

```
backend/
├── src/
│   ├── api/            # Harici API'larla etkileşim için servisler
│   ├── config/         # Ortam yapılandırması
│   ├── controllers/    # HTTP isteklerini işleyen kontrolörler
│   ├── middleware/     # Express middleware'leri
│   ├── models/         # Veri modelleri ve şemaları
│   ├── queue/          # İş kuyrukları yönetimi 
│   ├── routes/         # API endpoint tanımları
│   ├── services/       # İş mantığı servisleri
│   ├── utils/          # Yardımcı fonksiyonlar
│   ├── workers/        # Asenkron işleri yürüten worker'lar
│   └── index.ts        # Ana giriş noktası
└── .env.development    # Geliştirme ortamı değişkenleri
└── .env.production     # Üretim ortamı değişkenleri
```

### Anahtar Bileşenler

1. **API Controllers**:
   - `videoController.ts`: Video işlemleri için endpoint kontrolörü
   - `transcriptController.ts`: Transkript oluşturma ve yönetme işlemleri

2. **Routes**:
   - `videoRoutes.ts`: Video ile ilgili endpoint tanımları
   - `transcriptRoutes.ts`: Transkript ile ilgili endpoint tanımları

3. **Workers**:
   - `transcriptWorker.ts`: Arka planda transkript işleme görevleri

## Frontend Yapısı

Frontend, Vue 3 framework'ü, Pinia durum yönetimi ve TypeScript kullanılarak geliştirilmiştir. TailwindCSS, UI tasarımı için kullanılmıştır.

### Dizin Yapısı

```
frontend/
├── public/             # Statik dosyalar
├── src/
│   ├── assets/         # Resimler, fontlar vb.
│   ├── components/     # Yeniden kullanılabilir Vue bileşenleri
│   ├── config/         # Yapılandırma dosyaları (örn. Supabase)
│   ├── locales/        # Çok dilli destek için çeviriler
│   ├── router/         # Vue Router yapılandırması
│   ├── stores/         # Pinia durum yönetimi
│   ├── styles/         # Stil tanımları ve tema
│   ├── utils/          # Yardımcı fonksiyonlar
│   ├── views/          # Sayfa görünümleri
│   ├── App.vue         # Ana uygulama bileşeni
│   └── main.ts         # Uygulama başlangıç noktası
├── .env.development    # Geliştirme ortamı değişkenleri
└── .env.production     # Üretim ortamı değişkenleri
```

### Anahtar Bileşenler

1. **Views**:
   - `HomeView.vue`: Ana sayfa ve video işleme formu
   - `ChannelsView.vue`: Kanal bazlı görünüm
   - `SummariesView.vue`: Özet görünümleri
   - `ResultView.vue`: Sonuç görünümü

2. **Stores**:
   - `tasks.ts`: Asenkron görevleri izleme ve yönetme
   - `auth.ts`: Kimlik doğrulama durumu yönetimi
   - `languageStore.ts`: Çok dilli destek için dil desteği

## Veri Akışı ve İş Süreçleri

### Transkript İşleme Akışı

VecizAI'nin temel işlevi, YouTube videolarının transkriptlerini işlemektir. Bu süreç şu adımları içerir:

1. **Video Gönderimi**: Kullanıcı, transkript oluşturmak istediği YouTube video URL'sini girer ve dil seçer.

2. **Durum Kontrolü**:
   ```
   Transcript var mı? -> Hemen göster
   Task var mı? -> Durumunu göster
   İkisi de yoksa -> Yeni task oluştur
   ```

3. **Task Yönetimi**:
   - Yeni task `pending` durumunda oluşturulur
   - Worker tarafından alındığında `processing` durumuna güncellenir
   - İşlem tamamlandığında `completed` durumuna güncellenir
   - Hata durumunda `failed` olarak işaretlenir

4. **Sonuç Gösterimi**: İşlem tamamlandığında, transkript kullanıcıya gösterilir.

### Durum Makinesi:

```
     +----------+
     |  Pending |
     +-----+----+
           |
           v
    +------+------+
    | Processing  |
    +------+------+
           |
           v
   +-------+--------+
   |                |
+--+--+        +----+---+
|Done |        | Failed |
+-----+        +--------+
```

## Anahtar Bileşenler

### Backend API Endpoints

| Endpoint | Metod | Açıklama |
|----------|-------|----------|
| `/api/videos` | POST | Yeni bir video ekler |
| `/api/videos/:id` | GET | Video bilgilerini getirir |
| `/api/transcripts` | POST | Yeni bir transkript oluşturma talebi |
| `/api/transcripts/video/:videoId` | GET | Belirli bir videoya ait transkripti getirir |
| `/api/transcripts/:videoId` | GET | Transkript detaylarını getirir |

### Veri Modelleri

**Transcript Model**:
```typescript
interface Transcript {
  id?: string;
  video_id: string;
  language: string;
  source: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  formatted_text?: string;
  text?: string;
  segments: Segment[];
  created_at?: string;
  updated_at?: string;
  is_manual?: boolean;
}
```

**Task Model**:
```typescript
interface Task {
  id: string;
  video_id: string;
  task_type: 'transcript_fetch';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  language: string;
  error?: string;
}
```

## Deployment Notları

### Ortam Değişkenleri

Backend için gerekli ortam değişkenleri (`.env.production`):
- `PORT`: Sunucu portu
- `NODE_ENV`: Ortam (production/development)
- `CORS_ORIGIN`: İzin verilen CORS kaynakları
- `SUPABASE_URL`: Supabase sunucu URL'si
- `SUPABASE_KEY`: Supabase API anahtarı

Frontend için gerekli ortam değişkenleri (`.env.production`):
- `VITE_API_URL`: Backend API URL'si
- `VITE_SUPABASE_URL`: Supabase URL'si
- `VITE_SUPABASE_KEY`: Supabase açık API anahtarı

### Göz Önünde Bulundurulması Gerekenler

1. **Ölçeklenebilirlik**: Worker mimarisi, yüksek yükler altında çalışmak için daha fazla worker eklenerek ölçeklenebilir.

2. **Güvenlik**: API anahtarları ve diğer hassas bilgiler her zaman ortam değişkenleri üzerinden sağlanmalıdır.

3. **Hata İşleme**: Tüm sistemde kapsamlı hata yönetimi uygulanmıştır. Worker hataları ve API hataları sistematik olarak izlenir ve loglanır.

4. **I18n Desteği**: Sistem, Türkçe ve İngilizce dil desteğiyle uluslararasılaştırılmıştır.

---

Bu dokümantasyon, VecizAI sisteminin teknik bir anlayışını sağlamak amacıyla oluşturulmuştur. Geliştiriciler, bu belgeyi projeyi anlamak, geliştirmek ve bakımını yapmak için bir referans olarak kullanabilirler.

2025 © VecizAI
