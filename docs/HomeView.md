# HomeView Refactoring Planı

## Mevcut Durum

HomeView bileşeni şu anda monolitik bir yapıda ve birçok sorumluluğu üstleniyor:
- Video işlemleri
- Özet işlemleri
- Durum yönetimi
- Dil işlemleri
- API iletişimi
- UI mantığı

## Önerilen Refactoring Planı

### 1. Servis Katmanı

#### VideoService
```typescript
// services/videoService.ts
export class VideoService {
  async loadVideo(videoId: string, language: string) {...}
  async processVideo(url: string, language: string) {...}
  async getVideoInfo(videoId: string) {...}
  async getTranscript(videoId: string) {...}
  async getSummary(videoId: string) {...}
}
```

#### SummaryService
```typescript
// services/summaryService.ts
export class SummaryService {
  async loadAvailableSummaries() {...}
  async getSummaryDetails(summaryId: string) {...}
  async createSummary(videoId: string, language: string) {...}
  async saveSummary(summaryData: any) {...}
}
```

#### ProcessingStatusService
```typescript
// services/statusService.ts
export class ProcessingStatusService {
  updateStatus(step: string) {...}
  resetStatus() {...}
  getStatus() {...}
}
```

#### LanguageService
```typescript
// services/languageService.ts
export class LanguageService {
  detectLanguage(text: string) {...}
  translateContent(content: string, targetLang: string) {...}
}
```

#### ApiService
```typescript
// services/apiService.ts
export class ApiService {
  async get(endpoint: string) {...}
  async post(endpoint: string, data: any) {...}
  async put(endpoint: string, data: any) {...}
  handleError(error: any) {...}
}
```

### 2. Composables (Vue 3 Composition API)

#### useVideo
```typescript
// composables/useVideo.ts
export function useVideo() {
  const videoService = new VideoService()
  const videoData = ref(null)
  
  const loadVideo = async (id: string, lang: string) => {
    // Video yükleme mantığı
  }
  
  const processVideo = async (url: string, lang: string) => {
    // Video işleme mantığı
  }
  
  return { videoData, loadVideo, processVideo }
}
```

#### useSummary
```typescript
// composables/useSummary.ts
export function useSummary() {
  const summaryService = new SummaryService()
  const summaries = ref([])
  
  const loadSummaries = async () => {
    // Özetleri yükleme mantığı
  }
  
  const createSummary = async (videoId: string, lang: string) => {
    // Özet oluşturma mantığı
  }
  
  return { summaries, loadSummaries, createSummary }
}
```

### 3. Tip Tanımlamaları

```typescript
// types/index.ts
export interface VideoData {
  id: string
  title: string
  description: string
  thumbnail: string
  url: string
  date: string
  views: string
  duration: string
  transcript: string
  transcriptPreview: string
  summary: string
  summaryPreview: string
  formatted_text: string
  loading: boolean
  error: null | string
}

export interface SummaryData {
  id: string
  channelName: string
  videoTitle: string
  videoThumbnail: string
  summary: string
  publishedAt: string
  videoUrl: string
  language: string
  isRead: boolean
  channelAvatar: string
}

export interface ProcessingStatus {
  isProcessing: boolean
  currentStep: string
  steps: {
    FETCHING: string
    TRANSCRIBING: string
    SUMMARIZING: string
    SAVING: string
  }
}
```

### 4. Yeni HomeView Yapısı

```vue
<script setup lang="ts">
import { useVideo } from '@/composables/useVideo'
import { useSummary } from '@/composables/useSummary'
import { useProcessingStatus } from '@/composables/useProcessingStatus'
import { useLanguageStore } from '@/stores/languageStore'
import { useAuthStore } from '@/stores/auth'

// Composables
const { videoData, loadVideo, processVideo } = useVideo()
const { summaries, loadSummaries, createSummary } = useSummary()
const { status, updateStatus } = useProcessingStatus()

// Stores
const languageStore = useLanguageStore()
const authStore = useAuthStore()

// UI State
const searchQuery = ref('')
const activeTab = ref('summary')
const showDetailModal = ref(false)
const showLanguageModal = ref(false)

// Event Handlers
const handleSearch = async () => {
  await processVideo(searchQuery.value)
}

const handleLanguageChange = async (lang: string) => {
  await processVideo(videoData.value.id, lang)
}

// Lifecycle Hooks
onMounted(() => {
  loadSummaries()
  loadInitialVideo()
})
</script>
```

## Klasör Yapısı

```
src/
├── services/
│   ├── videoService.ts
│   ├── summaryService.ts
│   ├── statusService.ts
│   ├── languageService.ts
│   └── apiService.ts
├── composables/
│   ├── useVideo.ts
│   ├── useSummary.ts
│   └── useProcessingStatus.ts
├── types/
│   └── index.ts
└── views/
    └── HomeView.vue
```

## Refactoring Faydaları

1. **Tek Sorumluluk İlkesi (SRP)**
   - Her servis ve composable tek bir işe odaklanır
   - Kod daha anlaşılır ve yönetilebilir hale gelir

2. **Bakım Kolaylığı**
   - Küçük parçalar halinde kod yönetimi
   - Hata ayıklama kolaylığı
   - Değişiklik yapma kolaylığı

3. **Test Edilebilirlik**
   - Servisleri bağımsız olarak test etme imkanı
   - Birim testleri yazma kolaylığı
   - Mock ve stub kullanım kolaylığı

4. **Yeniden Kullanılabilirlik**
   - Servisleri farklı bileşenlerde kullanabilme
   - Kod tekrarını önleme
   - DRY (Don't Repeat Yourself) prensibine uygunluk

5. **Ölçeklenebilirlik**
   - Yeni özellikler ekleme kolaylığı
   - Mevcut özellikleri genişletme kolaylığı
   - Modüler yapı sayesinde kolay entegrasyon

6. **Bağımlılık Yönetimi**
   - Dependency Injection kullanımı
   - Gevşek bağlı (loosely coupled) mimari
   - Servisler arası iletişim kontrolü

## Uygulama Planı

1. **Aşama 1: Servis Katmanı Oluşturma**
   - Temel servislerin oluşturulması
   - Mevcut fonksiyonların servislere taşınması
   - Servis arayüzlerinin tanımlanması

2. **Aşama 2: Composables Oluşturma**
   - Servis kullanımını saran composable'ların yazılması
   - State management logic'in composable'lara taşınması
   - Reactive yapının kurulması

3. **Aşama 3: Tip Sisteminin Kurulması**
   - Interface tanımlamalarının yapılması
   - Type checking mekanizmalarının kurulması
   - Type safety sağlanması

4. **Aşama 4: HomeView Refactoring**
   - Bileşenin yeni yapıya göre düzenlenmesi
   - Eski kodun kaldırılması
   - Yeni yapının test edilmesi

5. **Aşama 5: Test ve Optimizasyon**
   - Birim testlerinin yazılması
   - Performans optimizasyonları
   - Kod kalitesi kontrolleri

## Sonuç

Bu refactoring planı ile HomeView bileşeni:
- Daha modüler
- Daha test edilebilir
- Daha bakımı kolay
- Daha ölçeklenebilir
bir yapıya kavuşacaktır.

Değişiklikler aşamalı olarak yapılmalı ve her aşamada testler çalıştırılarak mevcut işlevselliğin korunduğundan emin olunmalıdır. 


Geçiş planı:

Aşama 1: API Servisi
Öncelikle temel API servisini oluşturalım çünkü diğer servisler buna bağımlı olacak
services/apiService.ts oluşturulacak
HTTP istekleri buraya taşınacak
Aşama 2: Video Servisi
Video ile ilgili tüm işlemleri taşıyacağız
services/videoService.ts oluşturulacak
loadVideo, processVideo, getVideoInfo gibi fonksiyonlar buraya taşınacak
ApiService'i kullanacak
Aşama 3: Özet Servisi
Özet işlemleri için servis oluşturacağız
services/summaryService.ts oluşturulacak
loadAvailableSummaries, createSummary gibi fonksiyonlar buraya taşınacak
ApiService'i kullanacak
Aşama 4: Durum Yönetimi Servisi
İşlem durumlarını yönetecek servis
services/statusService.ts oluşturulacak
updateStatus, resetStatus gibi fonksiyonlar buraya taşınacak
Aşama 5: Dil Servisi
Dil işlemleri için servis
services/languageService.ts oluşturulacak
Dil algılama ve çeviri fonksiyonları buraya taşınacak
Aşama 6: Composables Oluşturma
Her servis için ilgili composable'ları oluşturacağız
composables/ dizini altında
Sırasıyla:
useVideo.ts
useSummary.ts
useProcessingStatus.ts
Aşama 7: Tip Tanımlamaları
types/index.ts oluşturulacak
Tüm interface'ler buraya taşınacak
Aşama 8: HomeView Temizleme
HomeView'dan taşınan kodları kaldırma
Yeni servisleri ve composable'ları entegre etme
Sadece UI mantığı kalacak
Her aşama için şu adımları izleyelim:
İlgili servis/composable dosyasını oluştur
Gerekli fonksiyonları HomeView'dan taşı
Bağımlılıkları düzenle
4. Test et
HomeView'dan taşınan kodu kaldır
Tekrar test et
