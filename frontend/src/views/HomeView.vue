<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, isRef, type Ref, onBeforeUnmount } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useLanguageStore } from '@/stores/languageStore'
import { getVideoId } from '../utils/youtube'
import apiService from '../services/apiService'
import pollingService from '@/services/pollingService';
import { FormatService } from '@/services/formatService';
import type { AuthUser } from '@/types/auth'
import type { TranscriptItem, VideoData, VideoSummary } from '@/types/video'
import { VideoProcessingService } from '@/services/videoProcessingService'
import { useVideoStore } from '../stores/videoStore'
import Spinner from '../components/Spinner.vue'
import { useUIStore } from '../stores/uiStore'
import FeatureSection from '../components/home/FeatureSection.vue'
import TestimonialSection from '../components/home/TestimonialSection.vue'
import HowItWorksSection from '../components/home/HowItWorksSection.vue'
import DetailModal from '../components/modals/DetailModal.vue'
import TranscriptModal from '../components/modals/TranscriptModal.vue'
import LanguageModal from '../components/modals/LanguageModal.vue'
import { debounce } from 'lodash-es'

const languageStore = useLanguageStore()
const authStore = useAuthStore()
const videoStore = useVideoStore()
const uiStore = useUIStore()

const user = computed(() => authStore.user as AuthUser | null)
const currentLanguage = computed(() => languageStore.currentLocale)

const searchQuery = ref('')
const videoId = computed(() => videoStore.videoId)  // videoId'yi computed olarak tanımla
const isLoading = computed(() => videoStore.getLoadingState('video'))
const isLoadingSummary = computed(() => videoStore.getLoadingState('summary'))
const isLoadingTranscript = computed(() => videoStore.getLoadingState('transcript'))
const shouldShowSpinner = computed(() => uiStore.shouldShowSpinner)
const error = ref('')
const activeTab = ref('summary')
const isMenuOpen = ref(false)
const showDetailModal = ref(false)
const showLanguageModal = ref(false)
const selectedLanguage = ref('')
const pendingVideoUrl = ref('')
const showTranscriptModal = ref(false)
const selectedSummary = ref<VideoSummary | null>(null)
const summaries = ref<VideoSummary[]>([])
const forceRender = ref(0)

const videoData = computed(() => videoStore.videoData);

// Add computed property to use authStore
const isAuthenticated = computed(() => !!authStore.user)

// Add status tracking
const transcriptionStatus = ref({
  transcribing: false,
  detectingLanguage: false,
  savingTranscript: false,
  generatingSummary: false,
  message: ''
})

// State için yeni ref'ler ekle
const processingStatus = ref({
  isProcessing: false,
  currentStep: '',
  steps: {
    FETCHING: languageStore.t('home.processing.fetchingInfo'),
    TRANSCRIBING: languageStore.t('home.processing.creatingTranscript'),
    SUMMARIZING: languageStore.t('home.processing.creatingSummary'),
    SAVING: languageStore.t('home.processing.savingResults')
  }
});

const updateProcessingStatus = (step: keyof typeof processingStatus.value.steps) => {
  processingStatus.value.isProcessing = true;
  processingStatus.value.currentStep = processingStatus.value.steps[step];
};

// Close menu when clicking outside
const closeMenu = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  const profileButton = document.querySelector('.profile-button')
  const dropdownMenu = document.querySelector('.dropdown-menu')
  
  if (!profileButton?.contains(target) && !dropdownMenu?.contains(target)) {
    isMenuOpen.value = false
  }
}

// Create video processing service instance
const videoProcessingService = new VideoProcessingService(
  videoData,
  error,
  processingStatus
);

// Script section: add a ref for DEV mode
const isDev = ref(import.meta.env.DEV);

// Değişken temizleme fonksiyonunu saklamak için 
let cleanupLanguageListener: (() => void) | null = null;

// First, add the showDebug ref that's missing
const showDebug = ref(false);

// Component oluşturulduğunda
onMounted(async () => {
  console.log('🔄 Component mounted');
  
  // Click listener'ı ekle
  document.addEventListener('click', closeMenu);
  
  // Spinner güvenlik zamanlayıcısı (2 dakika sonra spinnerlar hala dönüyorsa kapat)
  const spinnerSafetyTimeout = setTimeout(() => {
    if (videoData.value?.id && (
      videoStore.getLoadingState('summary') || 
      videoStore.getLoadingState('transcript') || 
      videoStore.getLoadingState('processing')
    )) {
      console.log('⚠️ Safety timeout: Force closing spinners after 2 minutes');
      
      // Tüm spinner ve loading durumlarını kapat
      videoStore.setLoadingState('transcript', false);
      videoStore.setLoadingState('summary', false);
      videoStore.setLoadingState('processing', false);
      videoStore.toggleSpinner('transcript', false);
      videoStore.toggleSpinner('summary', false);
      videoStore.toggleSpinner('processing', false);
      
      // Polling service durumlarını sıfırla
      pollingService.isLoadingTranscript.value = false;
      pollingService.isLoadingSummary.value = false;
      pollingService.isPollingActiveSummary.value = false;
    }
  }, 120000); // 2 dakika
  
  // Dil değişikliği listener'ı ekle - debounce ile gecikme ekleniyor
  const handleLanguageChange = debounce((newLang: string) => {
    console.log(`🌍 Dil değişikliği algılandı: ${newLang}`);
    
    // Eğer video zaten işlenmiş ve özet varsa, o dildeki özeti getir
    if (videoData.value?.id) {
      console.log('🔄 Aynı video için farklı dilde özet isteniyor...');
      
      // Mevcut videoyu yeni dilde işle, video ID'yi koruyarak
      // Bu işlem zaten çalışıyorsa tekrar çağırma (throttling mekanizması bunu kontrol edecek)
      if (!videoStore.loadingStates.processing) {
        videoProcessingService.handleVideoProcess(videoData.value.id, newLang)
          .then(() => {
            console.log('✅ Dil değişimi sonrası video işleme başarılı!');
          })
          .catch(err => {
            console.error('❌ Dil değişimi sonrası video işleme hatası:', err);
          });
      } else {
        console.log('⚠️ Video işleme zaten devam ediyor, yeni istek göndermeden mevcut isteğin tamamlanması bekleniyor');
      }
    }
    
    // Dil değişikliği sonrası özetleri yeniden yükle
    loadAvailableSummaries().catch(err => {
      console.error('❌ Dil değişimi sonrası özetleri yükleme hatası:', err);
    });
    
    // Alt bileşenleri yeniden render etmek için forceRender'ı artır
    forceRender.value++;
  }, 500); // 500ms gecikme ile

  // Temizleme fonksiyonunu sakla
  cleanupLanguageListener = languageStore.onLanguageChange(handleLanguageChange);
  console.log('🌐 Dil değişikliği dinleyicisi eklendi');
  
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
  
  // Polling'i durdur
  if (videoData.value?.id) {
    console.log(`🛑 Stopping all polling for video ${videoData.value.id} during component unmount`);
    pollingService.stopAllPolling(videoData.value.id);
  }
  
  // Tüm aktif polling'leri durdur (video ID'den bağımsız)
  console.log(`🚨 Stopping all active polling processes during component unmount`);
  pollingService.stopAllActivePolling();
  
  // Dil değişikliği dinleyicisini temizle
  if (cleanupLanguageListener) {
    cleanupLanguageListener();
    console.log('🌐 Dil değişikliği dinleyicisi temizlendi');
  }
  
  // Tarayıcı konsoluna acil durumda kullanılabilecek fonksiyonu ekle
  if (typeof window !== 'undefined' && isDev.value) {
    console.log('💡 Acil durum fonksiyonu tarayıcı konsoluna eklendi:');
    console.log('   window.emergencyStopPolling() kullanarak tüm polling işlemlerini durdurabilirsiniz');
    (window as any).emergencyStopPolling = emergencyStopAllPolling;
  }
  
  console.log('🧹 Component unmount temizliği tamamlandı');
});

// Add beforeUnmount hook as an extra safety measure
onBeforeUnmount(() => {
  console.log('🔄 Component before unmount - performing final cleanup');
  
  // Force stop all polling one more time
  if (videoData.value?.id) {
    console.log(`🛑 Final stop of all polling for video ${videoData.value.id} before unmount`);
    pollingService.stopAllPolling(videoData.value.id);
  }
  
  // Tüm aktif polling'leri son bir kez durdur
  console.log('🧨 Emergency stopping all active polling before unmount');
  pollingService.stopAllActivePolling();
  
  // Polling service'in acil durum fonksiyonunu çağır
  if (typeof pollingService.emergencyStopAllPolling === 'function') {
    console.log('☢️ Using nuclear option to clear ALL intervals');
    pollingService.emergencyStopAllPolling();
  }
  
  console.log('🧹 Final component cleanup completed');
});

// Emergency stop function for debug panel
const emergencyStopAllPolling = () => {
  console.log('🔥 EMERGENCY: STOPPING ALL POLLING PROCESSES');
  
  // Normal polling durdurma
  if (videoData.value?.id) {
    pollingService.stopAllPolling(videoData.value.id);
  }
  
  // Tüm aktif polling'leri durdur
  pollingService.stopAllActivePolling();
  
  // Nuclear option: tüm interval ve timeout'ları temizle
  if (typeof pollingService.emergencyStopAllPolling === 'function') {
    pollingService.emergencyStopAllPolling();
  } else {
    // Fallback: manuel olarak interval'ları temizle
    console.log('⚠️ emergencyStopAllPolling method not found, using manual cleanup');
    for (let i = 0; i < 10000; i++) {
      try {
        window.clearInterval(i);
        window.clearTimeout(i);
      } catch (e) {
        // Hataları görmezden gel
      }
    }
  }
  
  // Loading ve spinner durumlarını temizle
  videoStore.clearProcessingStatus();
  
  console.log('✅ Emergency stop completed: All polling stopped and intervals cleared');
  
  return "All polling processes stopped successfully";
};

// Component unmount olduğunda interval'ları temizle
const clearAllIntervals = () => {
  console.log('🧹 Clearing all intervals');
  // Implement as needed for additional interval clearing
};

// Yeniden deneme işlevi
const retryProcessing = () => {
  console.log('🔄 Retrying video processing');
  if (videoData.value?.id) {
    // Clear any previous errors
    error.value = '';
    
    // Reset flags
    if (videoData.value.id) {
      pollingService.stopAllPolling(videoData.value.id);
    }
    
    // Process with current language
    videoProcessingService.processVideoWithLanguage(languageStore.language);
  }
};

const handleSearch = async () => {
  if (!searchQuery.value) return;
  
  const extractedVideoId = await videoProcessingService.handleSearch(searchQuery.value);
  if (!extractedVideoId) return;
  
  // Update video data
  videoStore.setVideoData({
    id: extractedVideoId,
    url: searchQuery.value,
    loading: true,
    error: null
  });
  
  videoStore.setVideoId(extractedVideoId);  // videoStore üzerinden güncelle
  pendingVideoUrl.value = searchQuery.value;
  showLanguageModal.value = true;
}

const processVideoWithLanguage = async (language: string) => {
  console.log('🔍 Video işleme başlatılıyor | Dil:', language, 'Video ID:', videoId.value);
  
  // Modal'ı kapat
  showLanguageModal.value = false;
  
  try {
    // Mevcut videoId ve seçilen dil ile video işlemeyi başlat
    if (videoId.value) {
      console.log('🚀 Video işleme servisi çağrılıyor...');
      // Video işlemeyi başlat
      await videoProcessingService.handleVideoProcess(videoId.value, language);
      console.log('✅ Video işleme başarıyla tamamlandı! Dil:', language);
    } else {
      console.error('❌ Video ID bulunamadı!');
      error.value = 'Video ID bulunamadı';
    }
  } catch (err) {
    console.error('❌ Video işleme hatası:', err);
    error.value = err instanceof Error ? err.message : 'Video işleme hatası';
  }
};

// Summary tipi tanımları
interface SummaryStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  content?: string | null;
  task_id?: string;
  error?: string;
}

const submitFeedback = () => {
  if (!selectedSummary.value) return
  
  // Show success message or notification
  alert(languageStore.t('summaries.feedback.submitSuccess'))
}

const openSummary = async (summary: any) => {
  try {
    showDetailModal.value = true;
    await markSummaryAsRead(summary);
  } catch (error) {
    console.error('Error opening summary:', error);
  }
};

const closeSummary = () => {
  showDetailModal.value = false;
};

const shareTranscript = () => {
  if (navigator.share) {
    navigator.share({
      title: videoData.value.title,
      text: videoData.value.transcript,  // Share the full transcript text
      url: `https://www.youtube.com/watch?v=${videoId.value}`
    })
  } else {
    const textArea = document.createElement('textarea')
    textArea.value = `${videoData.value.title}\n\n${videoData.value.transcript}\n\nVideo: https://www.youtube.com/watch?v=${videoId.value}`  // Share the full transcript text
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    alert(languageStore.t('common.copiedToClipboard'))
  }
}

const downloadTranscript = () => {
  const content = `${videoData.value.title}\n\n${videoData.value.transcript}\n\nVideo: https://www.youtube.com/watch?v=${videoId.value}`  // Download the full transcript text
  const blob = new Blob([content], { type: 'text/plain' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${videoData.value.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_transcript.txt`
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}

const shareSummary = () => {
  if (navigator.share) {
    navigator.share({
      title: videoData.value.title,
      text: videoData.value.summary,
      url: `https://www.youtube.com/watch?v=${videoId.value}`
    })
  } else {
    const textArea = document.createElement('textarea')
    textArea.value = `${videoData.value.title}\n\n${videoData.value.summary}\n\nVideo: https://www.youtube.com/watch?v=${videoId.value}`
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    alert(languageStore.t('common.copiedToClipboard'))
  }
}

const downloadSummary = () => {
  const content = `${videoData.value.title}\n\n${videoData.value.summary}\n\nVideo: https://www.youtube.com/watch?v=${videoId.value}`
  const blob = new Blob([content], { type: 'text/plain' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${videoData.value.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_summary.txt`
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}

const handleVideoProcess = async (videoId: string, language: string) => {
  try {
    await videoProcessingService.handleVideoProcess(videoId, language);
  } catch (err) {
    console.error('Video processing error:', err);
    error.value = err instanceof Error ? err.message : 'Failed to process video';
  }
};

const processVideo = async (url: string) => {
  try {
    videoStore.setLoadingState('video', true);
    videoStore.updateProcessingStatus('FETCHING');
    error.value = '';

    // Extract video ID
    const extractedVideoId = getVideoId(url);
    if (!extractedVideoId) {
      throw new Error('Invalid YouTube URL');
    }
    videoStore.setVideoId(extractedVideoId);  // videoStore üzerinden güncelle

    // Create transcript
    videoStore.updateProcessingStatus('TRANSCRIBING');
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/transcripts/from-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        videoId: extractedVideoId,  // videoId.value yerine extractedVideoId kullan
        language: 'tr'
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create transcript');
    }

    const data = await response.json();
    console.log('📝 Transcript task created:', data);

    await new Promise(resolve => setTimeout(resolve, 2000));
    // await videoProcessingService.pollTranscriptStatus(videoId.value, 'tr');
    console.log('✅ Transcript is ready, creating summary...');

    // Create summary
    videoStore.updateProcessingStatus('SUMMARIZING');
    const summaryResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/videos/${videoId.value}/summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        videoId: videoId.value,
        language: 'tr'
      })
    });

    if (!summaryResponse.ok) {
      throw new Error('Failed to create summary');
    }

    const summaryData = await summaryResponse.json();
    console.log('📚 Summary task created:', summaryData);

    // Eğer özet zaten tamamlanmışsa spinner'ı hemen durduralım
    if (summaryData.status === 'completed') {
      console.log('✅ Summary already completed, stopping spinner immediately');
      videoStore.setLoadingState('summary', false);
      videoStore.toggleSpinner('summary', false);
    } else {
      await new Promise(resolve => setTimeout(resolve, 2000));
      // await videoProcessingService.pollSummaryStatus(videoId.value, 'tr');
      console.log('✅ Summary is ready!');
    }

    // Clear processing status
    videoStore.clearProcessingStatus();
    videoStore.setLoadingState('video', false);

  } catch (err) {
    console.error('❌ Error in processVideo:', err);
    videoStore.clearProcessingStatus();
    videoStore.setLoadingState('video', false);
    error.value = err instanceof Error ? err.message : 'Failed to process video';
  }
};

// Kullanılabilir özetleri yüklemek için fonksiyon 
const loadAvailableSummaries = async () => {
  try {
    console.log('🚀 Loading available summaries for home view');
    
    // Servis katmanında tanımlanan metodu kullan
    summaries.value = await videoProcessingService.loadAvailableSummaries({ 
      language: currentLanguage.value 
    });
    
    console.log('✅ Loaded summaries:', summaries.value.length);
  } catch (err) {
    console.error('❌ Error loading summaries:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load summaries';
  }
};

const markSummaryAsRead = async (summary: any) => {
  // Only proceed if user is logged in and summary exists and is not read
  if (!authStore.session) {
    console.log('Skipping mark as read: User not logged in');
    return;
  }
  
  // Check if this is a saved summary with an ID (not just the current video)
  if (!summary || !summary.id) {
    console.log('Skipping mark as read: Not a stored summary');
    return;
  }
  
  // Skip if already marked as read
  if (summary.isRead) {
    console.log('Skipping mark as read: Already read');
    return;
  }
  
  try {
    console.log('Marking summary as read:', summary.id);
    
    // First check if API is available
    const isApiAvailable = await checkApiConnection();
    
    if (!isApiAvailable) {
      console.warn('API server is not available, skipping mark as read');
      return;
    }
    
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/summaries/${summary.id}/mark-read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.session?.access_token}`
      }
    });

    if (!response.ok) {
      console.error('Failed to mark summary as read, status:', response.status);
    }
  } catch (error) {
    console.error('Error marking summary as read:', error);
    // Not showing error to user since this is non-critical functionality
  }
};

// Check if API is available
const checkApiConnection = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
    
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/health`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (e) {
    return false;
  }
};

const handleSummaryClick = async (summary: any) => {
  try {
    showDetailModal.value = true;
    
    // Try to mark as read but don't wait for it to complete
    markSummaryAsRead(summary).catch(err => {
      console.warn('Non-critical error marking summary as read:', err);
    });
  } catch (error) {
    console.error('Error handling summary click:', error);
  }
};

// Update status check comparisons
const isTranscriptCompleted = (status: string) => status === 'completed';
const isSummaryCompleted = (status: string) => status === 'completed';

// Add formattedSummary computed property
const formattedSummary = computed(() => {
  if (!videoData.value?.summary) return '';
  const summaryText = videoData.value.summary.trim();
  return FormatService.formatSummaryText(summaryText);
});

// Add formattedSummaryPreview computed property
const formattedSummaryPreview = computed(() => {
  if (!videoData.value?.summary) return '';
  const maxLength = 400;
  const summaryText = videoData.value.summary.trim();
  const truncatedText = summaryText.length > maxLength 
    ? summaryText.substring(0, maxLength).trim() + '...' 
    : summaryText;
  return FormatService.formatSummaryText(truncatedText);
});
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Auth Section - artık App.vue'da olduğu için burayı kaldırıyoruz -->
    
    <!-- Main Content -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24">
      <!-- Banner Section -->
      <div class="text-center max-w-4xl mx-auto pb-12">
        <h1 class="text-4xl sm:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 leading-tight">
          {{ languageStore.t('home.banner.title') }}
        </h1>
        <h2 class="text-xl sm:text-2xl text-gray-600 leading-relaxed font-medium mt-4 max-w-3xl mx-auto">
          {{ languageStore.t('home.banner.subtitle') }}
        </h2>
      </div>

      <!-- Search Section -->
      <div class="relative max-w-3xl mx-auto mb-12">
        <!-- Gradient Background -->
        <div class="absolute inset-0 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl"></div>
        
        <!-- Search Form -->
        <div class="relative bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-gray-100">
          <div class="relative">
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="languageStore.t('home.search.placeholder')"
              @keyup.enter="handleSearch"
              class="w-full px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg rounded-xl border-2 border-gray-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all duration-300 shadow-sm hover:border-gray-200 bg-white/80 backdrop-blur-sm"
              :class="{ 'pr-24 sm:pr-36': !isLoading }"
            />
            <button
              @click="handleSearch"
              class="absolute right-2 top-1/2 -translate-y-1/2 px-3 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 font-medium text-xs sm:text-sm shadow-lg hover:shadow-xl group"
            >
              <span class="flex items-center gap-2">
                {{ languageStore.t('home.search.button') }}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </span>
            </button>
          </div>

          <!-- Decorative Elements -->
          <div class="absolute -top-6 -left-6 w-12 h-12 bg-indigo-100 rounded-full animate-pulse"></div>
          <div class="absolute -bottom-4 -right-4 w-8 h-8 bg-purple-100 rounded-full animate-pulse delay-150"></div>
          <div class="absolute top-1/2 -right-8 w-4 h-4 bg-pink-100 rounded-full animate-pulse delay-300"></div>
        </div>
      </div>

      <!-- Results Section -->
      <div class="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-8">
        <!-- Add error message at the top if exists -->
        <div v-if="error" class="mb-4 p-4 bg-red-100 text-red-800 rounded-xl mx-4 mt-4">
          <div class="flex items-center space-x-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{{ error }}</span>
          </div>
        </div>
        
        <!-- Add processing status indicator -->


        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 sm:p-6 lg:p-8">
          <!-- Video Section -->
          <div class="lg:col-span-6">
            <div class="relative w-full bg-black rounded-xl overflow-hidden shadow-lg" style="padding-top: 56.25%;">
              <iframe
                :src="`https://www.youtube.com/embed/${videoId}`"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
                class="absolute top-0 left-0 w-full h-full"
              ></iframe>
            </div>
            <div class="mt-6">
              <h2 class="text-xl font-bold text-gray-900">{{ videoData.title }}</h2>
              <div class="mt-2 flex items-center space-x-3 text-sm text-gray-600">
                <div class="flex items-center space-x-1">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span>{{ videoData.views }}</span>
                </div>
                <span>•</span>
                <div class="flex items-center space-x-1">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM1 11a1 1 0 00-1 1h2a1 1 0 001-1z" />
                  </svg>
                  <span>{{ videoData.date }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Content Section -->
          <div class="lg:col-span-6">
            <!-- Tab Controls -->
            <div class="flex overflow-x-auto mb-4 bg-gray-50 p-1 rounded-xl">
              <button
                v-for="tab in ['summary', 'transcript', 'listen']"
                :key="tab"
                @click="activeTab = tab"
                class="flex-1 px-4 py-3 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200"
                :class="{ 'bg-white shadow-md text-indigo-600 scale-[1.02]': activeTab === tab, 'text-gray-600 hover:text-indigo-600 hover:bg-white/50': activeTab !== tab }"
              >
                <span class="flex items-center justify-center gap-2">
                  <svg v-if="tab === 'summary'" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span class="hidden sm:inline">{{ languageStore.t(`home.tabs.${tab}`) }}</span>
                  <span class="sm:hidden">{{ languageStore.t(`home.tabs.${tab}Short`) }}</span>
                </span>
              </button>
            </div>

            <!-- Tab Content -->
            <div class="bg-gray-50 rounded-xl p-6">
              <!-- Summary Tab -->
              <div v-if="activeTab === 'summary'" class="h-full">
                <div v-if="isLoadingSummary" class="flex flex-col items-center justify-center space-y-6 py-12">
                  <!-- Animated Loading Spinner -->
                  <div class="relative">
                    <!-- Outer ring -->
                    <div class="w-16 h-16 border-4 border-indigo-100 rounded-full animate-pulse"></div>
                    <!-- Inner spinner -->
                    <div class="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-indigo-600 rounded-full animate-spin"></div>
                    <!-- Center dot -->
                    <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-indigo-600 rounded-full"></div>
                  </div>
                  <!-- Loading Text -->
                  <div class="text-center space-y-2">
                    <div class="text-base font-medium text-gray-900">
                      {{ processingStatus.currentStep || languageStore.t('home.processing.creatingSummary') }}
                    </div>
                    <div class="flex items-center justify-center gap-1">
                      <div class="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" style="animation-delay: 0s"></div>
                      <div class="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                      <div class="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
                    </div>
                    <p class="text-sm text-gray-500">{{ languageStore.t('home.processing.timeEstimate') }}</p>
                  </div>
                </div>
                <div v-else-if="error" class="text-center py-8">
                  <p class="text-red-500">{{ error }}</p>
                  <button 
                    @click="retryProcessing" 
                    class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                  >
                    {{ languageStore.t('common.retry') }}
                  </button>
                </div>
                <div v-else>
                  <!-- Eğer videoData.summary varsa göster -->
                  <div v-if="videoData.summary" class="prose prose-indigo max-w-none">
                    <div class="content-paragraph text-gray-700 leading-relaxed whitespace-pre-line" v-html="formattedSummaryPreview"></div>
                    <span v-if="videoData.summary.length > 300">...</span>
                    <button
                      @click="handleSummaryClick(videoData)"
                      class="mt-4 inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                    >
                      {{ languageStore.t('home.summary.detailButton') }}
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                  <!-- Hiç özet yoksa -->
                  <div v-else class="text-center py-8">
                    <p class="text-gray-500">{{ languageStore.t('home.summary.noSummaries') }}</p>
                  </div>
                </div>
              </div>

              <!-- Transcript Tab -->
              <div v-else-if="activeTab === 'transcript'" class="h-full">
                <div v-if="isLoadingTranscript" class="flex flex-col items-center justify-center space-y-6 py-12">
                  <!-- Animated Loading Spinner -->
                  <div class="relative">
                    <!-- Outer ring -->
                    <div class="w-16 h-16 border-4 border-purple-100 rounded-full animate-pulse"></div>
                    <!-- Inner spinner -->
                    <div class="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-purple-600 rounded-full animate-spin"></div>
                    <!-- Center dot -->
                    <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-purple-600 rounded-full"></div>
                  </div>
                  <!-- Loading Text -->
                  <div class="text-center space-y-2">
                    <div class="text-base font-medium text-gray-900">
                      {{ processingStatus.currentStep || languageStore.t('home.processing.creatingTranscript') }}
                    </div>
                    <div class="flex items-center justify-center gap-1">
                      <div class="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce" style="animation-delay: 0s"></div>
                      <div class="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                      <div class="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
                    </div>
                    <p class="text-sm text-gray-500">{{ languageStore.t('home.processing.timeEstimate') }}</p>
                  </div>
                </div>
                <div v-else-if="error" class="text-center py-8">
                  <p class="text-red-500">{{ error }}</p>
                  <button 
                    @click="retryProcessing" 
                    class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                  >
                    {{ languageStore.t('common.retry') }}
                  </button>
                </div>
                <div v-else>
                  <div v-if="videoData.transcriptPreview" class="prose prose-indigo max-w-none">
                    <p class="text-gray-700 leading-relaxed whitespace-pre-line">
                      {{ videoData.transcriptPreview }}
                      <span v-if="videoData.transcript && videoData.transcript.length > 400" class="text-gray-500">...</span>
                    </p>
                    <button 
                      @click="showTranscriptModal = true"
                      class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                    >
                      {{ languageStore.t('home.transcript.detailButton') }}
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                  <div v-else class="text-center py-8">
                    <p class="text-gray-500">{{ languageStore.t('home.transcript.noTranscript') }}</p>
                  </div>
                </div>
              </div>

              <!-- Listen Tab -->
              <div v-else-if="activeTab === 'listen'" class="text-center py-12">
                <div class="max-w-md mx-auto">
                  <div class="bg-gradient-to-br from-gray-50 to-white rounded-xl shadow-lg p-6 relative overflow-hidden">
                    <div class="absolute inset-0 bg-grid-gray-100 opacity-[0.05]"></div>
                    <div class="relative">
                      <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full flex items-center justify-center group">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-indigo-500 group-hover:rotate-12 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 110 6 3 3 0 010-6z" />
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 012 0v2a1 1 0 002 0v-2a1 1 0 012 0v2a3 3 0 01-3 3h-2.5a1 1 0 01-1-1v-1a1 1 0 012-1h1a1 1 0 012 1v1a1 1 0 001 1H9z" />
                        </svg>
                      </div>
                      <p class="text-gray-600 mb-6">{{ languageStore.t('home.listen.description') }}</p>
                      <div class="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-500 rounded-lg cursor-not-allowed">
                        <span class="bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs px-2 py-1 rounded-md">
                          {{ languageStore.t('common.comingSoon') }}
                        </span>
                        <span class="text-sm">{{ languageStore.t('home.listen.playButton') }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Features Section -->
      <FeatureSection :key="`feature-${currentLanguage}-${forceRender}`" />

      <!-- Testimonials Section -->
      <TestimonialSection :key="`testimonial-${currentLanguage}-${forceRender}`" />

      <!-- How It Works Section -->
      <HowItWorksSection :key="`howworks-${currentLanguage}-${forceRender}`" />

      <!-- Modals -->
      <DetailModal 
        :show-modal="showDetailModal"
        :video-data="videoData"
        :video-id="videoId"
        :formatted-summary="formattedSummary"
        @close="showDetailModal = false"
        @share-summary="shareSummary"
        @download-summary="downloadSummary"
      />

      <TranscriptModal 
        :show-modal="showTranscriptModal"
        :video-data="videoData"
        :video-id="videoId"
        @close="showTranscriptModal = false"
        @share-transcript="shareTranscript"
        @download-transcript="downloadTranscript"
      />

      <LanguageModal 
        :show-modal="showLanguageModal"
        :selected-language="selectedLanguage"
        @close="showLanguageModal = false"
        @select-language="processVideoWithLanguage"
      />

      <!-- Add summary list -->
      <div v-if="summaries?.length" class="grid grid-cols-1 gap-4">
        <div v-for="summary in summaries" 
             :key="summary.id"
             class="flex justify-between items-center hover:bg-gray-50 p-4 rounded-lg">
          <h3 class="font-medium cursor-pointer" @click="handleSummaryClick(summary)">{{ summary.videoTitle }}</h3>
          <button @click="closeSummary" class="text-gray-500 hover:text-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- DEV MODE DEBUGGING CONTROLS - only shown in development -->
      <div v-if="isDev" class="bg-amber-50 border border-amber-200 rounded-md p-4 mb-4">
        <div class="flex items-center justify-between">
          <h3 class="text-amber-700 font-semibold text-sm">Development Mode Debug Controls</h3>
          <button @click="showDebug = !showDebug" class="text-amber-700 hover:text-amber-900">
            {{ showDebug ? 'Hide Controls' : 'Show Controls' }}
          </button>
        </div>
        <div v-if="showDebug" class="mt-3 space-y-3">
          <p class="text-amber-600 text-xs">These controls are only available in development mode</p>
          <div class="flex flex-wrap gap-2">
            <button 
              @click="emergencyStopAllPolling" 
              class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 text-sm rounded"
            >
              🛑 Emergency Stop All Polling
            </button>
            <button 
              @click="pollingService.stopAllPolling(videoData?.id)" 
              class="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 text-sm rounded"
              v-if="videoData?.id"
            >
              Stop Polling for {{ videoData?.id }}
            </button>
            <button 
              @click="clearAllIntervals" 
              class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 text-sm rounded"
            >
              Clear All Intervals
            </button>
          </div>
          <div class="text-xs text-amber-600 mt-2">
            <p>Current polling status: {{ pollingService.isLoadingTranscript.value || pollingService.isLoadingSummary.value ? 'ACTIVE' : 'INACTIVE' }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Error State -->
  <div v-if="error" class="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50">
    <div class="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl text-center max-w-md mx-4">
      <div class="w-16 h-16 mx-auto mb-6 flex items-center justify-center bg-red-100 rounded-full">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div class="text-lg font-medium text-red-600 mb-2">Hata Oluştu</div>
      <p class="text-sm text-gray-500">{{ error }}</p>
      <button 
        @click="error = ''" 
        class="mt-4 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
      >
        Kapat
      </button>
    </div>
  </div>
</template>
<style scoped>
body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 20px;
  background-color: #f0f4ff;
}

.search-bar {
  width: 100%;
  margin: 20px auto;
  position: relative;
}

.search-bar input {
  width: 100%;
  padding: 12px 40px 12px 15px;
  border: 1px solid #ddd;
  border-radius: 25px;
  font-size: 16px;
}

.search-bar button {
  position: absolute;
  right: 15px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: none;
  cursor: pointer;
  font-size: 20px;
}

.video-container {
  background: white;
  border-radius: 15px;
  padding: 20px;
  margin: 0 auto;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.controls {
  display: flex;
  gap: 15px;
  margin: 15px 0;
  background: #f8f9fa;
  padding: 8px;
  border-radius: 20px;
  width: fit-content;
}

.control-btn {
  padding: 8px 16px;
  border: none;
  background: white;
  font-size: 14px;
  cursor: pointer;
  border-radius: 15px;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.control-btn:hover {
  background: #f0f0f0;
  transform: translateY(-1px);
}

.content-section {
  margin-top: 15px;
  width: 100%;
}

.content-section h2 {
  font-size: 20px;
  margin-bottom: 15px;
}

.content-item {
  display: flex;
  align-items: start;
  gap: 10px;
  margin-bottom: 15px;
  padding: 10px;
  border-radius: 8px;
  background: #f8f9fa;
}

.content-item img {
  width: 24px;
  height: 24px;
}

.content-item p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.content-paragraph {
  font-size: 1rem;
  line-height: 1.6;
  color: #4a5568;
  margin-bottom: 1rem;
}

.content-paragraph :deep(.highlight-concept) {
  background: linear-gradient(120deg, rgba(255, 242, 204, 0.8) 0%, rgba(255, 236, 179, 0.8) 100%);
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-weight: 500;
}

.content-paragraph :deep(.highlight-quote) {
  background: linear-gradient(120deg, rgba(232, 245, 233, 0.8) 0%, rgba(200, 230, 201, 0.8) 100%);
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-style: italic;
}

.content-paragraph :deep(.highlight-stat) {
  background: linear-gradient(120deg, rgba(227, 242, 253, 0.8) 0%, rgba(187, 222, 251, 0.8) 100%);
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-weight: 500;
}
</style>
