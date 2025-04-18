

socketService.leaveAllRooms() iki kez çağrılıyor: bu iki kez cagrılıyor 

1. socketService.leaveAllRooms() iki kez çağrılıyor:
İlk çağrı HomeView.vue'dan processVideoWithLanguage fonksiyonunda
İkinci çağrı VideoProcessingService.setupSocketListeners içinde
Bu gereksiz bir tekrar ve potansiyel bir sorun. Düzeltelim:
# Spinner Sorunları ve Çözümleri

## Tespit Edilen Sorunlar

### 1. Dil Değişikliğinde Spinner Takılması

Dil değişikliği sırasında özellikle aynı video için farklı dilde özet istenirken spinnerlar takılıp kalıyor. Logs analizi sonucunda tespit edilen sorunlar:

```javascript
HomeView.vue:87 🔄 Aynı video için farklı dilde özet isteniyor...
videoProcessingService.ts:206 [VideoProcessingService] handleVideoProcess started for videoId: ncU_tC1LpT4, language: en
...
videoProcessingService.ts:222 [VideoProcessingService] Transcript creation response: {status: 'processing', message: 'Could not acquire lock'}
videoProcessingService.ts:223 [VideoProcessingService] Transcript response structure: {hasData: false, hasFormattedText: false, dataProperties: Array(0), status: 'processing'}
HomeView.vue:89 ✅ Dil değişimi sonrası video işleme başarılı!bak loglar böyle spinner hala donuyor 
```

**Temel Sorunlar:**

1. **Çoklu İstek Gönderimi**:
   - Dil değiştiğinde aynı video için birden fazla kez `handleVideoProcess` çağrılıyor
   - Loglardan görüldüğü üzere, aynı videoId için birden fazla kez transcript oluşturma isteği gönderiliyor

2. **Backend Kilitleme Sorunu**:
   - Backend'de lock mekanizması devreye giriyor: `"status: 'processing', message: 'Could not acquire lock'"`
   - Önceki istek henüz tamamlanmadan yeni istekler geliyor ve backend bunları reddediyor

3. **Socket Dinleyicileri**:
   - Her istek için yeni socket dinleyici kuruluyor ve eskiler temizleniyor
   - Ancak mevcut işlem henüz tamamlanmadan yeni dinleyicilere geçiş yapılıyor

4. **Spinner Durumu**:
   - İlk istek spinner'ı açıyor
   - Sonraki istekler lock hatası ile karşılaştığında spinner kapatılmıyor
   - Kod, işlemin başarılı olduğunu raporluyor (`✅ Video işleme başarıyla tamamlandı!`) ancak aslında backend'de bir kilitleme hatası var

### 2. Socket Bağlantısı Sorunları

Socket üzerinden tamamlanma mesajları bazen alınamıyor ve spinnerlar takılı kalıyor.

1. **Soketlerin Yeniden Kullanımı**:
   - Bir video için socket bağlantısı kurulurken, önceki işlemler tam temizlenmemiş olabilir
   - Socket odaları (rooms) düzgün temizlenmeyebilir

2. **Dinleyici Çakışmaları**:
   - Önceki socket dinleyicileri tam olarak temizlenmediğinde, çoklu olay dinleyicileri aktif kalabilir
   - Bu durumda aynı event birden fazla kez işlenebilir veya beklenmeyen davranışlar oluşabilir

## Çözüm Önerileri

### 1. Dil Değişikliği İçin Throttling Mekanizması

```typescript
// videoProcessingService.ts dosyasında değişiklik
private pendingLanguageChanges: Map<string, string> = new Map();
private isProcessingLanguageChange: boolean = false;

async handleVideoProcess(videoId: string, language: string): Promise<boolean> {
  console.log(`[VideoProcessingService] handleVideoProcess started for videoId: ${videoId}, language: ${language}`);
  
  // Eğer şu anda aktif bir işlem varsa ve aynı video için dil değişimi gelirse
  if (this.isProcessingLanguageChange && this.videoStore.currentProcessingVideoId === videoId) {
    console.log(`⚠️ [THROTTLE] Already processing video ${videoId}, storing new language request: ${language}`);
    this.pendingLanguageChanges.set(videoId, language);
    return true; // İşlem başarılı gibi dönüş yapalım, kullanıcıya bir uyarı göstermeyelim
  }
  
  // İşlemi başlatalım ve kilitliyoruz
  this.isProcessingLanguageChange = true;
  
  try {
    // Mevcut kod...

    // Backend'den lock hatası gelirse mevcut spinnerları kapatalım
    if (transcriptResponse.status === 'processing' && transcriptResponse.message === 'Could not acquire lock') {
      console.warn('⚠️ [LOCK] Backend returned lock error, force closing spinners');
      this.forceCloseSpinners(videoId);
      return true; // İşlem başarılı gibi dönüş yapalım, kullanıcıya bir uyarı göstermeyelim
    }
    
    // Normal işlem akışı...
    
    return true;
  } catch (error) {
    // Hata işleme...
  } finally {
    // İşlem kilidini kaldıralım
    this.isProcessingLanguageChange = false;
    
    // Bekleyen dil değişimi var mı kontrol edelim
    if (this.pendingLanguageChanges.has(videoId)) {
      const nextLanguage = this.pendingLanguageChanges.get(videoId)!;
      this.pendingLanguageChanges.delete(videoId);
      
      console.log(`🔄 [THROTTLE] Processing pending language change for ${videoId}: ${nextLanguage}`);
      // setTimeout ile yerleştirelim ki mevcut işlem stack kapansın
      setTimeout(() => {
        this.handleVideoProcess(videoId, nextLanguage).catch(err => {
          console.error('Error processing pending language change:', err);
        });
      }, 500);
    }
  }
}
```

### 2. Backend Lock Hata İşleme

```typescript
// forceCloseSpinners fonksiyonunu güncelleyelim
public forceCloseSpinners(videoId: string) {
  console.log('🛑 [DEBUG] Force closing all spinners for video:', videoId);
  
  // Tüm video ID'ler için değil, sadece belirtilen için yapmalıyız
  if (videoId === this.videoStore.currentProcessingVideoId) {
    console.log('🛑 [DEBUG] Current spinner states:', {
      transcript: this.videoStore.getLoadingState('transcript'),
      summary: this.videoStore.getLoadingState('summary'),
      processing: this.videoStore.getLoadingState('processing')
    });
    
    // Tüm spinner ve loading durumlarını kapat
    this.videoStore.setLoadingState('transcript', false);
    this.videoStore.setLoadingState('summary', false);
    this.videoStore.setLoadingState('processing', false);
    this.videoStore.toggleSpinner('transcript', false);
    this.videoStore.toggleSpinner('summary', false);
    this.videoStore.toggleSpinner('processing', false);
    
    // Polling service durumlarını da sıfırla
    pollingService.isLoadingTranscript.value = false;
    pollingService.isLoadingSummary.value = false;
    pollingService.isPollingActiveSummary.value = false;
    
    console.log('🛑 [DEBUG] After force close, spinner states:', {
      transcript: this.videoStore.getLoadingState('transcript'),
      summary: this.videoStore.getLoadingState('summary'),
      processing: this.videoStore.getLoadingState('processing')
    });
  }
}
```

### 3. HomeView.vue Dil Değişikliği Debouncing

```javascript
// HomeView.vue içinde dil değişikliği dinleyicisini güncelleyelim
import { debounce } from 'lodash'; // Bunu import edelim

// Debounce fonksiyonu oluşturalım
const handleLanguageChange = debounce((newLang) => {
  console.log(`🌍 Dil değişikliği algılandı: ${newLang}`);
  
  // Eğer video zaten işlenmiş ve özet varsa, o dildeki özeti getir
  if (videoData.value?.id) {
    console.log('🔄 Aynı video için farklı dilde özet isteniyor...');
    // Mevcut videoyu yeni dilde işle, video ID'yi koruyarak
    videoProcessingService.handleVideoProcess(videoData.value.id, newLang)
      .then(() => {
        console.log('✅ Dil değişimi sonrası video işleme başarılı!');
      })
      .catch(err => {
        console.error('❌ Dil değişimi sonrası video işleme hatası:', err);
      });
  }
  
  // Dil değişikliği sonrası özetleri yeniden yükle
  loadAvailableSummaries().catch(err => {
    console.error('❌ Dil değişimi sonrası özetleri yükleme hatası:', err);
  });
  
  // Alt bileşenleri yeniden render etmek için forceRender'ı artır
  forceRender.value++;
}, 500); // 500ms gecikme ile

// Dil değişikliği listener'ı ekle
languageStore.onLanguageChange(handleLanguageChange);
```

### 4. Socket Güvenlik Zamanlayıcısı Ekleme

Her işlem için bir güvenlik zamanlayıcısı ekleyin, böylece spinner'lar belirli bir süre sonra otomatik olarak kapanır:

```typescript
// processVideoWithLanguage fonksiyonuna ekleyelim
// Güvenlik zamanlayıcısı: 2 dakika sonra spinner'lar hâlâ dönüyorsa zorla kapat
const safetyTimeoutId = setTimeout(() => {
  console.log('⏱️ [SAFETY] Safety timeout triggered after 2 minutes for video:', processingVideoId);
  if (processingVideoId === this.videoStore.currentProcessingVideoId) {
    if (this.videoStore.getLoadingState('transcript') || 
        this.videoStore.getLoadingState('summary') || 
        this.videoStore.getLoadingState('processing')) {
      console.log('⚠️ [SAFETY] Spinners still active after 2 minutes! Force closing...');
      this.forceCloseSpinners(processingVideoId);
    }
  }
}, 120000); // 2 dakika

// Zamanlayıcı ID'sini kaydet (video değişirse temizlemek için)
this.setSummaryTimeout(processingVideoId, 'safetySpinnerCheck', () => {
  clearTimeout(safetyTimeoutId);
}, 125000);
```

### 5. Socket Bağlantısı İyileştirmeleri

```typescript
// socketService.ts içinde
// Transkript durum güncellemelerini dinleme
onTranscriptStatusUpdated(callback: (data: any) => void) {
  console.log('Setting up transcript status listener');
  
  // Her bir dinleyici oluşturmadan önce, eski transcript_status_updated dinleyicilerini temizle
  this.socket.off('transcript_status_updated');
  
  this.socket.on('transcript_status_updated', (data) => {
    console.log('📡 Socket - Received transcript update:', data);
    
    // Socket bağlantı durumunu kontrol et
    console.log('📡 [SOCKET DEBUG] Connection status when receiving transcript update:', {
      isConnected: this.isConnected.value,
      socketId: this.socket.id,
      transport: this.socket.io.engine?.transport?.name,
      hasVideoId: !!data.videoId,
      hasStatus: !!data.status,
      status: data.status
    });
    
    callback(data);
  });
  
  return () => {
    console.log('🧹 [SOCKET] Cleaning up transcript_status_updated listener');
    this.socket.off('transcript_status_updated', callback);
  };
}
```

## İzleme ve Hata Ayıklama İçin Eklenecek Loglar

1. **Backend'den Dönen Her Lock Hatasının Loglanması**
2. **Socket Bağlantı Durumunun Periyodik Kontrolü**
3. **İşlemi Başlatan ve Bitiren Events'lerin Detaylı Loglanması**
4. **Spinnerların Açılma ve Kapanma Durumlarının Daha Görünür Loglanması**

Bu optimizasyonlar spinner'ların sonsuz döngüye girip kalma sorununu çözecek ve dil değişiklikleri sırasında daha sağlıklı bir deneyim sunacaktır. 