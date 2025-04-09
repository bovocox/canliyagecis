# Polling'den WebSocket'e Geçiş Kılavuzu

## İçindekiler

1. [Mevcut Durum](#1-mevcut-durum)
2. [WebSocket Avantajları](#2-websocket-avantajları)
3. [Değişiklik Yapılacak Alanlar](#3-değişiklik-yapılacak-alanlar)
   - [Backend Değişiklikleri](#31-backend-değişiklikleri)
   - [Frontend Değişiklikleri](#32-frontend-değişiklikleri)
4. [Implementasyon Adımları](#4-implementasyon-adımları)
5. [Potansiyel Zorluklar ve Çözümleri](#5-potansiyel-zorluklar-ve-çözümleri)
6. [Test Stratejisi](#6-test-stratejisi)
7. [İzlenmesi Gereken Metrikler](#7-izlenmesi-gereken-metrikler)

## 1. Mevcut Durum

Şu anki sistem yapısı polling üzerine kuruludur:

- `pollingService.ts` dosyası ile periyodik API çağrıları yapılmaktadır
- Transkript durumu için 3 saniye, özet durumu için 5 saniye aralıkla polling yapılır
- Her polling çağrısı Redis üzerinde yük oluşturur
- Aktif kullanıcı sayısı arttıkça, API ve Redis üzerindeki yük katlanarak artar
- `videoProcessingService.pollTranscriptStatus` ve `videoProcessingService.pollSummaryStatus` fonksiyonları bu polling mekanizmasını yönetir

## 2. WebSocket Avantajları

WebSocket'e geçişin sağlayacağı avantajlar:

- **Sunucu Yükü Azalır**: Tekrarlanan HTTP istekleri yerine tek bir bağlantı kullanılır
- **Redis Yükü Azalır**: İstek sayısı dramatik şekilde düşer
- **Gerçek Zamanlı Güncellemeler**: Anlık bildirimler (polling gecikmesi olmadan)
- **Trafik Azalır**: WebSocket mesajları HTTP'ye göre daha az paket yükü içerir
- **Ölçeklenebilirlik**: Yüksek kullanıcı sayılarında daha etkin çalışır
- **Daha İyi UX**: Kullanıcı işlemlerin durumunu daha hızlı görür

## 3. Değişiklik Yapılacak Alanlar

### 3.1 Backend Değişiklikleri

#### Socket.IO Server Kurulumu

```javascript
// app.js veya server.js dosyasında
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"]
  }
});

// Socket bağlantılarını dinle
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Kullanıcı belirli bir video odasına katılıyor
  socket.on('join_video_room', (videoId) => {
    socket.join(`video:${videoId}`);
    console.log(`Client ${socket.id} joined room for video ${videoId}`);
  });
  
  // Kullanıcı odadan ayrılıyor
  socket.on('leave_video_room', (videoId) => {
    socket.leave(`video:${videoId}`);
    console.log(`Client ${socket.id} left room for video ${videoId}`);
  });
  
  // Bağlantı kesildiğinde
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
```

#### Transcript Servisi Güncellemesi

```javascript
// transcriptService.ts dosyasında
class TranscriptService {
  constructor(private io: Server) {}
  
  async createTranscript(videoId, language) {
    // Mevcut transkript oluşturma kodu...
    
    // Durum değişikliğini bildir
    this.io.to(`video:${videoId}`).emit('transcript_status_updated', {
      videoId,
      status: 'processing',
      message: 'Transcript creation started'
    });
    
    return result;
  }
  
  async updateTranscriptStatus(videoId, status, data = null) {
    // Veritabanı güncellemesi
    await this.db.updateTranscriptStatus(videoId, status, data);
    
    // Socket.IO üzerinden bildirim gönderme
    this.io.to(`video:${videoId}`).emit('transcript_status_updated', {
      videoId,
      status,
      data,
      updatedAt: new Date().toISOString()
    });
  }
}
```

#### Summary Servisi Güncellemesi

```javascript
// summaryService.ts dosyasında
class SummaryService {
  constructor(private io: Server) {}
  
  async createSummary(videoId, language) {
    // Mevcut özet oluşturma kodu...
    
    // Durum değişikliğini bildir
    this.io.to(`video:${videoId}`).emit('summary_status_updated', {
      videoId,
      status: 'processing',
      message: 'Summary creation started'
    });
    
    return result;
  }
  
  async updateSummaryStatus(videoId, status, data = null) {
    // Veritabanı güncellemesi
    await this.db.updateSummaryStatus(videoId, status, data);
    
    // Socket.IO üzerinden bildirim gönderme
    this.io.to(`video:${videoId}`).emit('summary_status_updated', {
      videoId,
      status,
      data,
      updatedAt: new Date().toISOString()
    });
  }
}
```

### 3.2 Frontend Değişiklikleri

#### Socket.IO Client Servisi

Yeni bir `socketService.ts` dosyası oluşturun:

```javascript
// frontend/src/services/socketService.ts
import { io, Socket } from "socket.io-client";
import { ref } from 'vue';

class SocketService {
  socket: Socket | null = null;
  isConnected = ref(false);
  
  constructor() {
    this.init();
  }
  
  init() {
    this.socket = io(import.meta.env.VITE_API_URL);
    
    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      this.isConnected.value = true;
    });
    
    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      this.isConnected.value = false;
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.isConnected.value = false;
    });
  }
  
  joinVideoRoom(videoId: string) {
    if (!this.socket || !this.isConnected.value) return;
    this.socket.emit('join_video_room', videoId);
  }
  
  leaveVideoRoom(videoId: string) {
    if (!this.socket || !this.isConnected.value) return;
    this.socket.emit('leave_video_room', videoId);
  }
  
  onTranscriptStatusUpdated(callback: (data: any) => void) {
    if (!this.socket) return;
    this.socket.on('transcript_status_updated', callback);
    return () => this.socket?.off('transcript_status_updated', callback);
  }
  
  onSummaryStatusUpdated(callback: (data: any) => void) {
    if (!this.socket) return;
    this.socket.on('summary_status_updated', callback);
    return () => this.socket?.off('summary_status_updated', callback);
  }
  
  disconnect() {
    this.socket?.disconnect();
  }
  
  // Bağlantı koparsa yeniden bağlanma denemesi
  reconnect() {
    if (this.socket) {
      this.socket.connect();
    } else {
      this.init();
    }
  }
}

export default new SocketService();
```

#### VideoProcessingService Güncellemesi

```javascript
// frontend/src/services/videoProcessingService.ts
import socketService from './socketService';
import { useVideoStore } from '../stores/videoStore';
import { useUIStore } from '../stores/uiStore';

export class VideoProcessingService {
  // ... mevcut kod
  
  async handleVideoProcess(videoId: string, language: string) {
    try {
      // Eski video işlemi için bağlantıyı kapat
      if (this.currentVideoId) {
        socketService.leaveVideoRoom(this.currentVideoId);
      }
      
      // Yeni video için bağlantı kur
      this.currentVideoId = videoId;
      socketService.joinVideoRoom(videoId);
      
      // Event listener'ları temizle ve yeniden kur
      this.setupSocketListeners();
      
      // Video işleme başlat
      await this.processVideoWithLanguage(language);
      
      return true;
    } catch (error) {
      console.error('Error in handleVideoProcess:', error);
      this.error.value = error instanceof Error ? error.message : 'Failed to process video';
      throw error;
    }
  }
  
  setupSocketListeners() {
    // Önceki listener'ları kaldır
    if (this.transcriptListener) this.transcriptListener();
    if (this.summaryListener) this.summaryListener();
    
    // Yeni listener'ları kur
    this.transcriptListener = socketService.onTranscriptStatusUpdated(
      this.handleTranscriptUpdate.bind(this)
    );
    
    this.summaryListener = socketService.onSummaryStatusUpdated(
      this.handleSummaryUpdate.bind(this)
    );
  }
  
  handleTranscriptUpdate(data) {
    const videoStore = useVideoStore();
    
    // Sadece mevcut video için güncellemeleri işle
    if (data.videoId !== this.currentVideoId) return;
    
    console.log('Transcript status update:', data);
    
    if (data.status === 'completed') {
      videoStore.setLoadingState('transcript', false);
      videoStore.setTranscriptData(data.data);
      this.processingStatus.value.currentStep = 'Transcript ready!';
    } 
    else if (data.status === 'processing') {
      this.processingStatus.value.currentStep = data.message || 'Creating transcript...';
    }
    else if (data.status === 'failed') {
      videoStore.setLoadingState('transcript', false);
      this.error.value = data.error || 'Failed to create transcript';
    }
  }
  
  handleSummaryUpdate(data) {
    const videoStore = useVideoStore();
    
    // Sadece mevcut video için güncellemeleri işle
    if (data.videoId !== this.currentVideoId) return;
    
    console.log('Summary status update:', data);
    
    if (data.status === 'completed') {
      videoStore.setLoadingState('summary', false);
      videoStore.setSummaryData(data.data);
      this.processingStatus.value.currentStep = 'Summary ready!';
    } 
    else if (data.status === 'processing') {
      this.processingStatus.value.currentStep = data.message || 'Creating summary...';
    }
    else if (data.status === 'failed') {
      videoStore.setLoadingState('summary', false);
      this.error.value = data.error || 'Failed to create summary';
    }
  }
  
  // ... diğer metodlar
}
```

#### HomeView.vue Güncellemesi

```javascript
// HomeView.vue içinde
import socketService from '../services/socketService';

// ... diğer kod

onMounted(async () => {
  console.log('🔄 Component mounted');
  
  // Click listener'ı ekle
  document.addEventListener('click', closeMenu);
  
  // Default video ID'sini ayarla
  const defaultVideoId = 'lFZvLeMbJ_U';
  videoStore.setVideoId(defaultVideoId);
  
  // Default video yüklemesi
  console.log('🎬 Loading default video:', defaultVideoId);
  try {
    await videoProcessingService.handleVideoProcess(defaultVideoId, languageStore.currentLocale);
    // Load available summaries after processing
    summaries.value = await videoProcessingService.loadAvailableSummaries({ language: languageStore.currentLocale });
  } catch (err) {
    console.error('Error loading default video:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load default video';
  }
});

onUnmounted(() => {
  console.log('🔄 Component unmounting');
  
  // Click listener'ı kaldır
  document.removeEventListener('click', closeMenu);
  
  // Socket bağlantısını kapat
  if (videoData.value?.id) {
    socketService.leaveVideoRoom(videoData.value.id);
  }
});

// ... diğer kod
```

## 4. Implementasyon Adımları

1. **Backend Hazırlık**
   - Socket.IO kütüphanesini kur: `npm install socket.io`
   - HTTP server ve Socket.IO server'ı yapılandır
   - Temel event handler'ları tanımla

2. **Servis Entegrasyonu**
   - Transkript ve özet servislerini güncelle
   - Socket odaları ve mesaj gönderme mantığını entegre et
   - Durum değişikliklerinde socket event'leri tetikle

3. **Frontend Socket Servisini Oluşturma**
   - Socket.IO client'ı kur: `npm install socket.io-client`
   - SocketService sınıfını geliştir
   - Bağlantı ve odaya katılma mantığını implement et

4. **VideoProcessingService Güncellemesi**
   - Mevcut polling kodunu WebSocket dinleyicileriyle değiştir
   - Socket event handler'ları ekle
   - Bağlantı/bağlantı kesintisi durumlarını yönet

5. **Bileşen Entegrasyonu**
   - HomeView ve ilgili diğer bileşenleri güncelle
   - Lifecycle hook'larda socket bağlantılarını yönet

6. **Polling Kodunu Temizleme**
   - PollingService'deki polling mantığını kaldır/düzenle
   - Sadece gerekli durumlarda fallback için kodu tut

7. **Test ve Validasyon**
   - WebSocket implementasyonunu çeşitli senaryolarda test et
   - Hataları tespit et ve düzelt
   - Performans karşılaştırmasını yap

## 5. Potansiyel Zorluklar ve Çözümleri

1. **Bağlantı Kesintileri**
   - **Sorun**: WebSocket bağlantısı kopabilir veya kurulamayabilir
   - **Çözüm**: Otomatik yeniden bağlanma mekanizması ve polling'e fallback
   
   ```javascript
   // socketService.ts
   reconnectWithPolling() {
     // WebSocket bağlantısı kurulamadı, polling'e dön
     if (!this.isConnected.value && this.currentVideoId) {
       console.log('Falling back to polling');
       return pollingService.startPolling(this.currentVideoId);
     }
   }
   ```

2. **Çoklu Sunucu Ölçeklenebilirliği**
   - **Sorun**: Birden fazla sunucu instance'ı olduğunda Socket.IO mesajları yayınlanmayabilir
   - **Çözüm**: Redis adapter kullanımı
   
   ```javascript
   // server.js
   const { createAdapter } = require("@socket.io/redis-adapter");
   const { createClient } = require("redis");
   
   const pubClient = createClient({ url: "redis://localhost:6379" });
   const subClient = pubClient.duplicate();
   
   Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
     io.adapter(createAdapter(pubClient, subClient));
   });
   ```

3. **Güvenlik Duvarı ve Proxy Sorunları**
   - **Sorun**: WebSocket tüm ortamlarda desteklenmeyebilir
   - **Çözüm**: Socket.IO'nun alternatif transport seçeneklerini yapılandırma
   
   ```javascript
   // server.js
   const io = new Server(server, {
     transports: ['websocket', 'polling'],
     allowUpgrades: true,
     cors: { ... }
   });
   ```

4. **Kullanıcı Sayısı Artışı**
   - **Sorun**: Yüksek eşzamanlı kullanıcılar socket bağlantılarını doldurabilir
   - **Çözüm**: Socket bağlantı havuzunu optimize et ve ölçeklendirme testleri yap

## 6. Test Stratejisi

1. **Birim Testleri**
   - Socket.IO client ve server mock'ları oluştur
   - Servis katmanlarının WebSocket entegrasyonunu test et
   - Bağlantı/bağlantı kesintisi durumlarını simüle et

2. **Entegrasyon Testleri**
   - Socket.IO iletişiminin end-to-end testleri
   - Farklı API durumlarını simüle et ve WebSocket mesajlarını kontrol et
   - Rate limiting ve hata durumlarını test et

3. **Yük Testleri**
   - Çok sayıda eşzamanlı WebSocket bağlantısını simüle et
   - Redis ve CPU yükünü polling vs WebSocket için karşılaştır
   - Yüksek trafikte sistem performansını değerlendir

## 7. İzlenmesi Gereken Metrikler

1. **Sistem Performansı**
   - Redis CPU ve bellek kullanımı (öncesi/sonrası)
   - API sunucu kaynak kullanımı
   - WebSocket bağlantı sayısı ve kullanımı

2. **Kullanıcı Deneyimi**
   - Transkript/özet yükleme süreleri
   - Kullanıcı arayüzü yanıt süresi
   - Hata oranları (bağlantı kopma, yeniden bağlanma)

3. **Ağ Trafiği**
   - HTTP istek sayısı/boyutu (polling vs WebSocket)
   - WebSocket mesaj sayısı/boyutu
   - Bandwidth kullanımı

Bu dökümantasyon, polling yapısından WebSocket yapısına geçiş için temel bir kılavuzdur. Uygulamanın özel ihtiyaçlarına göre düzenlemeler yapılabilir.




Socket.IO Geçişi: Adım Adım Uygulama Planı
Adım 1: Temel Socket.IO Kurulumu
Hedef: En basit Socket.IO bağlantısı kurarak tarayıcı ve sunucu arasında temel iletişimi sağlamak.
Yapılacaklar:
Backend:
Apply to socketegecis...
Run
cd backend
   npm install socket.io
server.js veya app.js dosyasını güncelleyin:
Frontend
 cd frontend
   npm install socket.io-client
   Yeni socketService.ts dosyası oluşturun:

   Test Uygulaması:
HomeView.vue üzerinde test butonu ekleyin:
Test Kriterleri:
Backend konsolunda "Client connected" mesajı görünmelidir
Frontend konsolunda "Connected to socket server" mesajı görünmelidir
Test butonuna tıklandığında, backend konsolunda "Received ping" mesajı görünmelidir
Test butonuna tıklandığında, alert ile "Socket works! Server responded: Server pong!" mesajı görünmelidir
Geçiş Kriteri: Temel Socket.IO bağlantısı sorunsuz çalıştığında, Adım 2'ye geçin.

Adım 2: Video Odaları Ekleme
Hedef: Her video için ayrı odalar oluşturarak, video-spesifik mesajlaşma altyapısını kurmak.
Yapılacaklar:
Backend:
server.js dosyasına oda yönetimi ekleyin:
Frontend:
socketService.ts dosyasını güncelleyin:
HomeView Entegrasyonu:
HomeView.vue içindeki onMounted ve onUnmounted hook'larını güncelleyin:
Test için oda mesajı gönderme fonksiyonu:
Backend'de ekleyin:
Frontend'de dinleyici ekleyin
Test Kriterleri:
Sayfa yüklendiğinde "Joining room for video: lFZvLeMbJ_U" log'u görünmelidir
Backend konsolunda "Client X joined room for video lFZvLeMbJ_U" log'u görünmelidir
/api/test-socket/lFZvLeMbJ_U API'sine GET isteği yapıldığında, sayfada alert ile mesaj görünmelidir
Component unmount olduğunda, backend konsolunda "Client X left room for video lFZvLeMbJ_U" log'u görünmelidir
Geçiş Kriteri: Video odaları düzgün çalıştığında ve test mesajları doğru şekilde alındığında, Adım 3'e geçin.

Adım 3: Transkript Güncellemesini Socket ile Yapalım
Hedef: Bir video için transkript durum güncellemelerini socket üzerinden almak, polling ile karşılaştırmak.
Yapılacaklar:
Backend TranskriptService Güncellemesi:
Server.js'de TranscriptService oluşturulurken io nesnesini enjekte edin:
Frontend SocketService Güncellemesi:
VideoProcessingService Güncellemesi:
Test için transkript durum güncellemesi simulasyonu:
Backend'e ekleyin:
Test Kriterleri:
Sayfa yüklendiğinde socket listener'lar düzgün kurulmalıdır
/api/test-transcript/lFZvLeMbJ_U/processing API'sine GET isteği yapıldığında, UI'da "Creating transcript..." mesajı gösterilmelidir
/api/test-transcript/lFZvLeMbJ_U/completed API'sine GET isteği yapıldığında, transkript verisi görüntülenmelidir
Console'da socket ile transkript güncellemelerinin alındığı loglar görünmelidir
Geçiş Kriteri: Transkript durumu socket üzerinden başarıyla güncellendiğinde, Adım 4'e geçin.

Adım 4: Özet Güncellemesini Socket ile Yapalım
Hedef: Transkript gibi, özet durum güncellemelerini de socket üzerinden almak.
Yapılacaklar:
(Adım 3'dekine benzer şekilde, ancak özet için)
Backend SummaryService Güncellemesi
Frontend SocketService Güncellemesi
VideoProcessingService Özet Güncellemesi
Test düzeneği
Test Kriterleri ve Geçiş Kriteri: Özet durumu socket üzerinden başarıyla güncellendiğinde, Adım 5'e geçin.

Adım 5: Polling Kaldırma ve Soket Güvenilirliğini Artırma
Hedef: Polling'i tamamen kaldırmak ve soket bağlantı kesintilerine karşı önlem almak.
Yapılacaklar:
Bağlantı kesintisi yönetimi
Polling'i tamamen kaldırma
Socket yeniden bağlanma stratejisi
Test Kriterleri ve Geçiş Kriteri: Socket kesintisinde sistem düzgün çalışmaya devam ettiğinde, Adım 6'ya geçin.
Adım 6: Çoklu Ortam ve Ölçeklendirme
Hedef: Sistemi çoklu sunucu ortamında çalışacak şekilde hazırlamak.
Yapılacaklar:
Redis adapter entegrasyonu
Sticky session yapılandırması
Yük testi
Test Kriterleri ve Geçiş Kriteri: Sistem çoklu ortamda düzgün çalıştığında, Adım 7'ye geçin.
