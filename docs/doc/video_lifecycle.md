# Video İşleme Yaşam Döngüsü

## 1. İlk Yükleme (Initial Load)

### 1.1. Component Mount
```typescript
onMounted(() => {
  // Default video ID ile başla
  loadInitialVideo(videoId.value); // videoId.value = 'lFZvLeMbJ_U'
});
```

### 1.2. İlk Video İşleme
- Default video için transcript ve özet oluşturma başlar
- Polling mekanizması aktif hale gelir
- Loading durumları yönetilir

## 2. İşlem Tamamlanma (Process Completion)

### 2.1. Transcript Tamamlanma
- Transcript oluşturulur
- Polling durur
- UI güncellenir
- `isLoadingTranscript.value = false`

### 2.2. Özet Tamamlanma
- Özet oluşturulur
- Polling durur
- UI güncellenir
- `isLoadingSummary.value = false`

## 3. Bekleme Durumu (Idle State)

### 3.1. Sistem Durumu
- Aktif polling yok
- İşlem yapılmıyor
- Kaynaklar minimum kullanımda
- UI stabil durumda

### 3.2. Görüntülenen Veriler
- Video player aktif
- Transcript görünür
- Özet görünür
- Tüm butonlar aktif

## 4. Yeni Video Tetikleyicileri

### 4.1. URL Girişi
```typescript
const handleUrlSubmit = async () => {
  if (searchQuery.value) {
    showLanguageModal.value = true;
  }
};
```

### 4.2. Dil Seçimi
```typescript
const processVideoWithLanguage = async (language: string) => {
  showLanguageModal.value = false;
  // Yeni video işleme süreci başlar
};
```

## 5. Yeni Video İşleme

### 5.1. Süreç Başlatma
- Eski polling durdurulur
- Loading durumları sıfırlanır
- Yeni video ID çıkarılır
- Yeni işlem başlatılır

### 5.2. Yeni Polling
- Transcript için polling başlar
- Özet için polling başlar
- UI loading durumuna geçer

## 6. Temizlik İşlemleri

### 6.1. Component Unmount
```typescript
onUnmounted(() => {
  // Interval'ları temizle
  if (transcriptIntervalRef.value) {
    clearInterval(transcriptIntervalRef.value);
  }
  if (summaryIntervalRef.value) {
    clearInterval(summaryIntervalRef.value);
  }
});
```

### 6.2. Error Handling
```typescript
const handleError = (error: any) => {
  isLoading.value = false;
  error.value = error.message || 'An error occurred';
  // Polling durdurulur
  clearIntervals();
};
```

## 7. Performans Optimizasyonları

### 7.1. Polling Yönetimi
- Gereksiz polling engellenir
- İnterval süreleri optimize edilir
- Memory leak önlenir

### 7.2. Resource Management
- Video player kaynakları yönetilir
- Network istekleri minimize edilir
- Cache etkin kullanılır

## 8. State Management

### 8.1. Loading States
```typescript
const isLoading = ref(false);
const isLoadingTranscript = ref(false);
const isLoadingSummary = ref(false);
```

### 8.2. Error States
```typescript
const error = ref('');
const transcriptError = ref('');
const summaryError = ref('');
```

## 9. Kullanıcı Deneyimi

### 9.1. Loading İndikatörleri
- Video yüklenirken spinner
- Transcript oluşturulurken progress
- Özet oluşturulurken progress

### 9.2. Error Mesajları
- Kullanıcı dostu hata mesajları
- Retry mekanizmaları
- Yönlendirici mesajlar

## 10. Güvenlik Önlemleri

### 10.1. Input Validasyonu
- URL kontrolü
- Video ID validasyonu
- XSS koruması

### 10.2. Rate Limiting
- API istekleri sınırlandırma
- Polling frekans kontrolü
- DDoS koruması 