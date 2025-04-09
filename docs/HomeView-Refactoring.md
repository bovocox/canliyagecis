# HomeView Refactoring Plan

## Mevcut Durum

HomeView şu anda aşağıdaki sorumlulukları içermektedir:
- Video işleme mantığı
- State yönetimi
- UI işlevleri
- Tip tanımlamaları
- Event handling

## Refactoring Hedefleri

1. Single Responsibility Principle'a uygun hale getirmek
2. Kod tekrarını önlemek
3. Bakımı ve test edilebilirliği artırmak
4. Component'i daha sade ve anlaşılır hale getirmek

## Taşınacak Yapılar

### 1. Tip Tanımlamaları (`types/`)

#### `types/video.ts`
```typescript
interface TranscriptItem {
  time: string;
  text: string;
}

interface VideoData {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  url: string;
  date: string;
  views: string;
  duration: string;
  transcript: string;
  transcriptPreview: string;
  summary: string;
  summaryPreview: string;
  formatted_text: string;
  loading: boolean;
  error: string | null;
}

interface VideoSummary {
  id: string;
  channelName: string;
  channelAvatar: string;
  videoTitle: string;
  videoThumbnail: string;
  summary: string;
  publishedAt: string;
  videoUrl: string;
  isRead: boolean;
  language: string;
}
```

#### `types/auth.ts`
```typescript
interface AuthUser extends User {
  user_metadata: {
    full_name: string;
  };
}
```

### 2. Video İşleme Servisi (`services/videoProcessingService.ts`)

Taşınacak fonksiyonlar:
- `loadInitialVideo`
- `processVideoWithLanguage`
- `handleSearch`

### 3. State Yönetimi (`stores/`)

#### `stores/videoStore.ts`
```typescript
// Video ile ilgili state'ler
- videoData
- summaries
- transcriptionStatus
- processingStatus
- isLoadingSummary
- isLoadingTranscript
```

#### `stores/uiStore.ts`
```typescript
// UI ile ilgili state'ler
- isLoading
- error
- activeTab
- isMenuOpen
- showDetailModal
- showLanguageModal
- showTranscriptModal
```

### 4. UI Composables (`composables/`)

#### `composables/useUI.ts`
```typescript
// UI işlevleri
- closeMenu
- updateProcessingStatus
```

## Yeni HomeView Yapısı

Refactoring sonrası HomeView:
- Sadece gerekli store ve composable'ları import edecek
- Template renderingden sorumlu olacak
- Basit event handler'ları içerecek
- Karmaşık iş mantığı içermeyecek

## Refactoring Adımları

1. Tip tanımlamalarının taşınması
2. Video işleme servisinin oluşturulması
3. Store'ların oluşturulması
4. Composable'ların oluşturulması
5. HomeView'in sadeleştirilmesi

## Test Stratejisi

Her bir modülün taşınmasından sonra:
1. Fonksiyonellik testleri
2. Unit testler
3. Integration testler

## Dikkat Edilecek Noktalar

1. Bağımlılıkların doğru yönetilmesi
2. Geriye dönük uyumluluk
3. Type safety'nin korunması
4. Error handling mekanizmalarının korunması

## Loading State ve Spinner Refactoring

### 1. Mevcut Durum Analizi

#### 1.1. Loading State'lerin Dağılımı
```typescript
// VideoStore içinde
- isLoadingSummary: boolean
- isLoadingTranscript: boolean
- processingStatus.isProcessing: boolean

// UIStore içinde
- isLoading: boolean
```

#### 1.2. Spinner Kullanım Noktaları
- Video yükleme sırasında
- Özet oluşturulurken
- Transkript oluşturulurken
- Genel işlem sırasında

### 2. Yapılacaklar Listesi

#### 2.1. VideoStore İyileştirmeleri

1. **Loading State'lerin Birleştirilmesi**
   ```typescript
   // Yeni yapı
   const loadingStates = ref({
     video: false,
     summary: false,
     transcript: false,
     processing: false
   })
   ```

2. **Spinner State'lerinin Eklenmesi**
   ```typescript
   const spinnerStates = ref({
     showVideoSpinner: false,
     showSummarySpinner: false,
     showTranscriptSpinner: false,
     showProcessingSpinner: false
   })
   ```

3. **Yeni Actions'ların Eklenmesi**
   ```typescript
   // Loading state yönetimi için
   function setLoadingState(type: 'video' | 'summary' | 'transcript' | 'processing', value: boolean)
   function getLoadingState(type: 'video' | 'summary' | 'transcript' | 'processing')
   
   // Spinner yönetimi için
   function toggleSpinner(type: 'video' | 'summary' | 'transcript' | 'processing', show: boolean)
   ```

4. **Computed Properties Eklenmesi**
   ```typescript
   const isLoading = computed(() => {
     return Object.values(loadingStates.value).some(state => state)
   })
   
   const shouldShowSpinner = computed(() => {
     return Object.values(spinnerStates.value).some(state => state)
   })
   ```

#### 2.2. HomeView Değişiklikleri

1. **Template Kısmından Spinner Kontrollerinin Kaldırılması**
   ```vue
   <!-- Eski -->
   <Spinner v-if="isLoading" />
   
   <!-- Yeni -->
   <Spinner v-if="videoStore.shouldShowSpinner" />
   ```

2. **Loading State Referanslarının Güncellenmesi**
   ```typescript
   // Eski
   const isLoading = ref(false)
   
   // Yeni
   const isLoading = computed(() => videoStore.isLoading)
   ```

3. **Event Handler'ların Güncellenmesi**
   ```typescript
   // Eski
   function handleVideoProcess() {
     isLoading.value = true
     // ...
   }
   
   // Yeni
   function handleVideoProcess() {
     videoStore.setLoadingState('video', true)
     // ...
   }
   ```

#### 2.3. UIStore Değişiklikleri

1. **Loading State'in Kaldırılması**
   ```typescript
   // Eski
   const isLoading = ref(false)
   
   // Yeni - Kaldırılacak
   ```

2. **Loading İlgili Actions'ların Kaldırılması**
   ```typescript
   // Eski
   function setLoading(status: boolean)
   
   // Yeni - Kaldırılacak
   ```

### 3. Uygulama Sırası

1. **VideoStore Güncellemeleri**
   - [ ] Yeni state'lerin eklenmesi
   - [ ] Actions'ların eklenmesi
   - [ ] Computed properties'lerin eklenmesi
   - [ ] Test edilmesi

2. **HomeView Güncellemeleri**
   - [ ] Template'deki spinner kontrollerinin güncellenmesi
   - [ ] Loading state referanslarının güncellenmesi
   - [ ] Event handler'ların güncellenmesi
   - [ ] Test edilmesi

3. **UIStore Güncellemeleri**
   - [ ] Loading state'in kaldırılması
   - [ ] Loading actions'ların kaldırılması
   - [ ] Test edilmesi

4. **Entegrasyon Testleri**
   - [ ] Loading state'lerin doğru çalıştığının kontrolü
   - [ ] Spinner'ların doğru gösterildiğinin kontrolü
   - [ ] State değişikliklerinin doğru yönetildiğinin kontrolü

### 4. Kontrol Listesi

- [ ] Tüm loading state'ler VideoStore'a taşındı mı?
- [ ] Spinner kontrolleri merkezi hale getirildi mi?
- [ ] Eski loading state referansları kaldırıldı mı?
- [ ] Yeni yapı test edildi mi?
- [ ] Performans etkisi kontrol edildi mi?
- [ ] Kullanıcı deneyimi korundu mu?

### 5. Dikkat Edilecek Noktalar

1. **State Senkronizasyonu**
   - Loading state'lerin birbiriyle uyumlu olması
   - State değişikliklerinin doğru sırayla yapılması

2. **Performans**
   - Gereksiz render'ların önlenmesi
   - State değişikliklerinin optimize edilmesi

3. **Error Handling**
   - Hata durumlarında loading state'lerin sıfırlanması
   - Kullanıcıya uygun geri bildirim verilmesi

4. **Kullanıcı Deneyimi**
   - Spinner'ların doğru zamanlarda gösterilmesi
   - Loading durumlarının anlaşılır olması 



   Uygulama Sırası ve Adımlar
1. VideoStore Güncellemeleri
1.1. Loading State'lerin Birleştirilmesi
[ ] loadingStates ref'ini ekle
[ ] setLoadingState ve getLoadingState actions'larını ekle
[ ] Test et
1.2. Spinner State'lerinin Eklenmesi
[ ] spinnerStates ref'ini ekle
[ ] toggleSpinner action'ını ekle
[ ] Test et
1.3. Computed Properties Eklenmesi
[ ] isLoading computed property'sini ekle
[ ] shouldShowSpinner computed property'sini ekle
[ ] Test et
2. HomeView Güncellemeleri
2.1. Template Güncellemeleri
[ ] Spinner kontrollerini VideoStore'a bağla
[ ] Loading state referanslarını güncelle
[ ] Test et


2.2. Event Handler Güncellemeleri
[ ] handleVideoProcess fonksiyonunu güncelle
[ ] Diğer loading state kullanan fonksiyonları güncelle
[ ] Test et

ilk olarak, HomeView.vue dosyasındaki event handler'ları inceleyelim. Şu ana kadar gördüğüm kadarıyla şu event handler'lar var:
handleSearch
processVideoWithLanguage
handleVideoProcess
pollTranscriptStatus
pollSummaryStatus

3. UIStore Güncellemeleri
3.1. Loading State Kaldırma
[ ] isLoading ref'ini kaldır
[ ] setLoading action'ını kaldır
[ ] Test et



pollTranscriptStatus
pollSummaryStatus

handleVideoProcess


<think>
Kullanıcı, daha önce yaptığım analizi özet halinde tek yazıda görmek istiyor. handleVideoProcess fonksiyonunu videoProcessingService.ts dosyasına taşıma planımızı özetlemeliyim. Şimdi bu özeti hazırlayacağım.
</think>
handleVideoProcess Fonksiyonu Taşıma Planı
1. Mevcut Durum
Fonksiyon HomeView.vue içinde tanımlanmış
API çağrıları yapıyor (transcript ve summary oluşturma)
Loading state'leri yönetiyor
Processing status'ları güncelliyor
Hata durumlarını yönetiyor
2. Taşınacak Yapı
}
3. HomeView'daki Yeni Kullanım
;
4. Taşınmanın Faydaları
UI katmanından iş mantığının ayrılması (SRP)
Kod tekrarının önlenmesi
Farklı URL'lerde çakışma durumlarının çözülmesi
Daha kolay test edilebilirlik
Bakımı daha kolay kod yapısı
5. Gereken Değişiklikler
videoProcessingService.ts dosyasına yeni fonksiyon eklenmesi
HomeView'daki fonksiyonun güncellenmesi
Eski processVideo fonksiyonunun kaldırılması
Tüm bağımlılıkların ve referansların güncellenmesi

processVideo (veya tamamen kaldırılabilir)
loadAvailableSummaries
markSummaryAsRead
checkApiConnection



VideoProcessingService'e taşınabilecek fonksiyonları belirledim. HomeView.vue'daki aşağıdaki fonksiyonlar VideoProcessingService'e taşınabilir:
processVideo: Bu fonksiyon videoyu işlemek için kullanılıyor ve API çağrıları içeriyor. VideoProcessingService içindeki handleVideoProcess fonksiyonunun alternatifi gibi görünüyor, birleştirilebilirler.
checkApiConnection: API bağlantısını kontrol etmek için kullanılan bir yardımcı fonksiyon. Bu tür temel API kontrolleri servis katmanına taşınabilir.
markSummaryAsRead: Özet işaretleme fonksiyonu, belki bir SummaryService veya VideoProcessingService içinde olabilir.
Paylaşım ve indirme fonksiyonları:
shareTranscript
downloadTranscript
shareSummary
downloadSummary
Bu fonksiyonlar bir ShareService veya ExportService'e taşınabilir.
Ayrıca, bazı yardımcı fonksiyonların da taşınmasını düşünebiliriz:
updateProcessingStatus: Zaten VideoProcessingService'de benzer bir fonksiyon var, birleştirilebilirler.
handleVideoProcess: Bu fonksiyon şu anda videoProcessingService'i çağırıyor, belki daha fazla mantık eklenecekse servis içerisine taşınabilir.
loadAvailableSummaries: Zaten videoProcessingService'de bir loadAvailableSummaries metodu var, bunu kullanıyor. Bu fonksiyon da tamamen servis içine taşınabilir.
Taşınmaması gerekenler:
Kullanıcı arayüzüyle doğrudan ilgili fonksiyonlar taşınmamalı:
closeMenu
closeSummary
openSummary
handleSummaryClick
retryProcessing
Computed property'ler taşınmamalı:
formattedSummary
formattedSummaryPreview
Lifecycle hook'lar taşınmamalı:
onMounted
onUnmounted
onBeforeUnmount
Önerilen Yapılandırma:
VideoProcessingService:
processVideo
handleVideoProcess
checkApiConnection
loadAvailableSummaries
updateProcessingStatus
Yeni bir SummaryService oluşturulabilir:
markSummaryAsRead
Yeni bir ShareService oluşturulabilir:
shareTranscript
downloadTranscript
shareSummary
downloadSummary
Bu şekilde, her servis kendi sorumluluğuna sahip olacak ve Single Responsibility Principle'a daha uygun bir yapı kurulmuş olacaktır.

