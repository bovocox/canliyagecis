# Veciz.AI - Video Özet Platformu

## Proje Hakkında
Veciz.AI, YouTube videolarını otomatik olarak özetleyen ve farklı dillerde sunan bir yapay zeka platformudur.

## Teknoloji Stack'i
- Frontend: Vue.js 3 + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Veritabanı: PostgreSQL (Supabase)
- Cache & Queue: Redis (Upstash)
- AI: Google Gemini
- Authentication: Supabase Auth
- Deployment: 
  - Frontend: Vercel
  - Backend: Heroku

## Kurulum

### Backend Kurulumu
```bash
cd backend
npm install
npm run dev  # Geliştirme için
npm run build  # Production build için
npm start  # Production'da çalıştırmak için
```

### Frontend Kurulumu
```bash
cd frontend
npm install
npm run dev  # Geliştirme için
npm run build  # Production build için
```

## Environment Variables

### Backend (.env)
```env
NODE_ENV=production
PORT=3000

# Redis Configuration
REDIS_URL=your_redis_url
REDIS_TLS=true
REDIS_CACHE_TTL=3600

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google API Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_API_KEY=your_google_api_key

# Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key
```

### Frontend (.env.production)
```env
VITE_APP_ENV=production
VITE_API_URL=https://api.veciz.ai
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Deployment

### Backend (Heroku)
```bash
git push heroku main
```

### Frontend (Vercel)
```bash
# Vercel CLI ile
vercel --prod

# veya GitHub entegrasyonu ile otomatik deployment
git push origin main
```

## API Endpoints

### Video İşlemleri
- `POST /api/videos/process`: Yeni video işleme başlat
- `GET /api/videos/:videoId/status`: Video işleme durumunu kontrol et
- `GET /api/videos/:videoId/summary`: Video özetini getir

### Transkript İşlemleri
- `GET /api/transcripts/:videoId`: Video transkriptini getir
- `GET /api/transcripts/:videoId/status`: Transkript durumunu kontrol et

### Özet İşlemleri
- `GET /api/summaries/:videoId`: Video özetini getir
- `GET /api/summaries/:videoId/status`: Özet durumunu kontrol et

## Mimari

### Queue Sistemi
- BullMQ kullanılarak asenkron iş kuyruğu yönetimi
- Transkript ve özet işlemleri için ayrı worker'lar
- Redis ile durum yönetimi ve cache

### Cron Jobs
- Video işleme durumu kontrolü
- Kullanıcı-özet ilişkilerinin güncellenmesi
- Log temizleme

## Lisans
Bu proje özel lisans altında dağıtılmaktadır. Tüm hakları saklıdır. 