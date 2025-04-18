# Veciz.ai Production Geçiş Dokümantasyonu

## 1. Domain ve DNS Ayarları

### Domain Ayarları (Vercel)
1. Vercel Dashboard -> Your Project -> Settings -> Domains
2. "Add Domain" ile `veciz.ai` eklendi
3. DNS ayarları domain sağlayıcıda yapılandırıldı:
   ```
   A Kaydı:
   Host: @
   Value: [Vercel'in verdiği IP]
   TTL: Auto/3600

   CNAME Kaydı:
   Host: www
   Value: cname.vercel-dns.com
   TTL: Auto/3600
   ```

## 2. Frontend Ayarları (Vercel)

### Environment Variables
```env
# .env.production
VITE_APP_ENV=production
VITE_API_URL=https://veciz-ai-prod-d2f90f1c0523.herokuapp.com
VITE_SUPABASE_URL=https://kucdcohxeccihjggdbub.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Vercel Build Settings
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

## 3. Backend Ayarları (Heroku)

### Environment Variables
```bash
# Temel Ayarlar
NODE_ENV=production
PORT=3000

# CORS ve Security
CORS_ORIGIN=https://veciz.ai,https://www.veciz.ai
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# Redis Ayarları
REDIS_URL=[Heroku Redis URL'i]
REDIS_TLS=true
REDIS_CACHE_TTL=3600
REDIS_USERNAME=[varsa Redis kullanıcı adı]
REDIS_PASSWORD=[varsa Redis şifresi]

# Supabase Ayarları
SUPABASE_URL=https://kucdcohxeccihjggdbub.supabase.co
SUPABASE_ANON_KEY=[Supabase Anon Key]
SUPABASE_SERVICE_ROLE_KEY=[Supabase Service Role Key]

# Google API Ayarları
GOOGLE_CLIENT_ID=[Google Client ID]
GOOGLE_CLIENT_SECRET=[Google Client Secret]
GOOGLE_API_KEY=[Google API Key]

# Gemini API Ayarları
GEMINI_API_KEY=[Gemini API Key]

# Logging ve Monitoring
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true
```

### Heroku Config Vars Komutları
```bash
# Temel ayarları set et
heroku config:set NODE_ENV=production -a veciz-ai-prod
heroku config:set PORT=3000 -a veciz-ai-prod

# CORS ayarları
heroku config:set CORS_ORIGIN="https://veciz.ai,https://www.veciz.ai" -a veciz-ai-prod
heroku config:set RATE_LIMIT_WINDOW_MS=900000 -a veciz-ai-prod
heroku config:set RATE_LIMIT_MAX=100 -a veciz-ai-prod

# Redis ayarları (URL otomatik olarak Heroku tarafından set edilir)
heroku config:set REDIS_TLS=true -a veciz-ai-prod
heroku config:set REDIS_CACHE_TTL=3600 -a veciz-ai-prod

# Supabase ayarları
heroku config:set SUPABASE_URL=https://kucdcohxeccihjggdbub.supabase.co -a veciz-ai-prod
heroku config:set SUPABASE_ANON_KEY=[key] -a veciz-ai-prod
heroku config:set SUPABASE_SERVICE_ROLE_KEY=[key] -a veciz-ai-prod

# Google API ayarları
heroku config:set GOOGLE_CLIENT_ID=[id] -a veciz-ai-prod
heroku config:set GOOGLE_CLIENT_SECRET=[secret] -a veciz-ai-prod
heroku config:set GOOGLE_API_KEY=[key] -a veciz-ai-prod

# Gemini API ayarları
heroku config:set GEMINI_API_KEY=[key] -a veciz-ai-prod

# Logging ayarları
heroku config:set LOG_LEVEL=info -a veciz-ai-prod
heroku config:set ENABLE_REQUEST_LOGGING=true -a veciz-ai-prod
```

### Environment Variables Güvenlik Notları
1. Tüm API key'leri güvenli bir şekilde saklayın
2. Production key'lerini asla GitHub'a commit etmeyin
3. Düzenli olarak key'leri rotate edin
4. Heroku Config Vars'ı düzenli olarak yedekleyin:
   ```bash
   # Tüm config vars'ı dışa aktar
   heroku config -a veciz-ai-prod > config_vars_backup.txt
   ```

### Heroku Buildpacks
```
1. heroku/nodejs
```

### Procfile
```
web: cd backend && npm start
```

### CORS Ayarları (backend/src/index.ts)
```typescript
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://veciz.ai',
    'https://www.veciz.ai',
    'https://veciz-ai-prod-d2f90f1c0523.herokuapp.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

## 4. Supabase Ayarları

### URL Configuration
```
Site URL: https://veciz.ai
Redirect URLs:
- https://veciz.ai/auth/callback
- https://veciz.ai/auth/v1/callback
```

### Auth Settings
- Email auth enabled
- Google OAuth enabled

## 5. Google Cloud Ayarları

### OAuth 2.0 Client Configuration
```
Authorized JavaScript origins:
- https://veciz.ai
- https://www.veciz.ai

Authorized redirect URIs:
- https://veciz.ai/callback
- https://veciz.ai/auth/callback
```

## 6. Redis Ayarları

### Heroku Redis Configuration
```typescript
// backend/src/config/redis.ts
const redisUrl = process.env.REDIS_URL;
export const CACHE_TTL = env.REDIS_CACHE_TTL;

export const redis = new Redis(redisUrl, {
  tls: {
    rejectUnauthorized: false
  },
  connectTimeout: 20000,
  commandTimeout: 10000,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: true,
  autoResubscribe: true,
  autoResendUnfulfilledCommands: true,
  enableReadyCheck: false
});
```

## 7. Deployment Komutları

### Frontend (Vercel)
```bash
# Otomatik deployment Vercel GitHub integration ile
git push origin master
```

### Backend (Heroku)
```bash
# Heroku remote'u ekle
heroku git:remote -a veciz-ai-prod

# Deploy
git push heroku master
```

## 8. SSL Sertifikaları
- Vercel: Otomatik Let's Encrypt SSL
- Heroku: Otomatik SSL (herokuapp.com domain'i için)

## 9. Monitoring ve Logging

### Backend Logging
```typescript
// Winston logger configured
// Log seviyeleri: error, warn, info, debug
logger.info('Server running on port ${port}');
```

### Health Check Endpoints
```
Frontend: https://veciz.ai
Backend: https://veciz-ai-prod-d2f90f1c0523.herokuapp.com/api/health
```

## 10. Kontrol Listesi

- [ ] Frontend Vercel'de deploy edildi
- [ ] Backend Heroku'da deploy edildi
- [ ] DNS ayarları yapılandırıldı
- [ ] SSL sertifikaları aktif
- [ ] CORS ayarları doğru
- [ ] Google OAuth çalışıyor
- [ ] Supabase auth çalışıyor
- [ ] Redis bağlantısı aktif
- [ ] Health check endpoint'leri çalışıyor

## 11. Troubleshooting

### CORS Hataları
```bash
# CORS origins'i güncelle
heroku config:set CORS_ORIGIN="https://veciz.ai,https://www.veciz.ai" -a veciz-ai-prod
```

### Redis Bağlantı Hataları
```bash
# Redis URL'i kontrol et
heroku config:get REDIS_URL -a veciz-ai-prod

# Redis bağlantısını test et
heroku redis:info -a veciz-ai-prod
```

### Domain SSL Kontrolü
```bash
curl -vI https://veciz.ai
curl -vI https://veciz-ai-prod-d2f90f1c0523.herokuapp.com
```

## 12. Önemli Notlar

1. Environment variable'ları düzenli olarak yedekleyin
2. Heroku ve Vercel dashboard'larında log'ları düzenli kontrol edin
3. SSL sertifikalarının geçerlilik sürelerini takip edin
4. Redis memory kullanımını monitör edin
5. Regular backup planı oluşturun

## 13. Faydalı Komutlar

```bash
# Heroku logs
heroku logs --tail -a veciz-ai-prod

# Redis metrics
heroku redis:info -a veciz-ai-prod

# Domain durumu
heroku domains -a veciz-ai-prod

# Config vars
heroku config -a veciz-ai-prod
``` 