<script setup lang="ts">
import { RouterView } from 'vue-router'
import { watch, computed, ref, onMounted, onUnmounted } from 'vue'
import { useLanguageStore } from './stores/languageStore'
import { useAuthStore } from './stores/auth'
import { useRouter } from 'vue-router'
import { useVideoStore } from './stores/videoStore'
import { VideoProcessingService } from './services/videoProcessingService'

const languageStore = useLanguageStore()
const authStore = useAuthStore()
const router = useRouter()

// For spinner safety checks
let spinnerSafetyInterval: number | null = null;

// Check if user is authenticated
const isAuthenticated = computed(() => !!authStore.user)
const isMenuOpen = ref(false)

const switchLanguage = (lang: 'tr' | 'en') => {
  // Sadece dil değişikliğini gerçekleştir, asla sayfayı yenileme
  console.log(`Dil değiştiriliyor: ${lang}, Sayfa: ${router.currentRoute.value.path}`);
  
  // Summaries sayfasındaysak, özel işleme uygula
  if (router.currentRoute.value.path === '/summaries') {
    console.log('🔍 Summaries sayfasında dil değişimi - özel işlem uygulanıyor');
    
    // Önce bir event yayınla, böylece bileşen dinleyebilir
    document.dispatchEvent(new CustomEvent('pre-language-change', { detail: { lang } }));
    
    // Sonra dili değiştir
    languageStore.setLanguage(lang, false);
    
    // Sayfa yenilemesi olmadan hemen sonra bir event daha yayınla
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('post-language-change', { detail: { lang } }));
    }, 100);
  } else {
    // Diğer sayfalarda normal işlemi yap
    languageStore.setLanguage(lang, false);
  }
  
  // Önemli: Tüm komponentlerin yeniden renderlanması language store'da dil 
  // değiştiğinde otomatik olarak gerçekleşiyor
}

// Close menu when clicking outside
const closeMenu = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  const profileButton = document.querySelector('.profile-button')
  const dropdownMenu = document.querySelector('.dropdown-menu')
  
  if (!profileButton?.contains(target) && !dropdownMenu?.contains(target)) {
    isMenuOpen.value = false
  }
}

// Update title when language changes
watch(
  () => languageStore.currentLocale,
  () => {
    document.title = languageStore.t('common.siteTitle')
    console.log('Language changed globally, title updated:', document.title)
  },
  { immediate: true }
)

onMounted(() => {
  document.addEventListener('click', closeMenu)
  
  // Router afterEach hook ile her sayfa değiştiğinde dil kontrolü
  router.afterEach((to, from) => {
    console.log(`Route changed from ${from.path} to ${to.path}, language: ${languageStore.currentLocale}`);
    
    // Sayfa değiştiğinde lokalden kaydedilmiş dil varsa kontrol et
    const savedLocale = localStorage.getItem('userLocale');
    if (savedLocale && (savedLocale === 'tr' || savedLocale === 'en') && savedLocale !== languageStore.currentLocale) {
      console.warn(`Language mismatch - Saved: ${savedLocale}, Current: ${languageStore.currentLocale}. Fixing...`);
      languageStore.setLanguage(savedLocale, false);
    }
  });
  
  // Set up a global safety check for stuck spinners
  const SPINNER_CHECK_INTERVAL = 60 * 1000; // Check every minute
  const MAX_SPINNER_TIME = 5 * 60 * 1000; // 5 minutes max spinner time
  const lastSpinnerStartTimes = new Map<string, number>();
  
  spinnerSafetyInterval = window.setInterval(() => {
    const videoStore = useVideoStore();
    
    // If any spinner is active
    if (videoStore.shouldShowSpinner) {
      console.log('🔍 [Global Safety Check] Checking active spinners...');
      
      const currentTime = Date.now();
      const currentVideoId = videoStore.currentProcessingVideoId;
      
      // Record spinner start time if it's a new spinner
      if (currentVideoId && !lastSpinnerStartTimes.has(currentVideoId)) {
        lastSpinnerStartTimes.set(currentVideoId, currentTime);
        console.log(`🔄 [Global Safety Check] New spinner detected for video ${currentVideoId}`);
      }
      
      // Check all recorded spinners for timeout
      lastSpinnerStartTimes.forEach((startTime, videoId) => {
        const spinnerDuration = currentTime - startTime;
        console.log(`⏱️ [Global Safety Check] Spinner for ${videoId} has been active for ${Math.round(spinnerDuration/1000)}s`);
        
        // If spinner has been active too long
        if (spinnerDuration > MAX_SPINNER_TIME) {
          console.warn(`⚠️ [Global Safety Check] Spinner for ${videoId} has exceeded max time (${MAX_SPINNER_TIME/1000}s), force closing...`);
          
          try {
            // Create instance and force close the spinner
            const videoProcessingService = new VideoProcessingService(
              ref(videoStore.videoData), 
              ref(''), 
              ref(videoStore.processingStatus)
            );
            videoProcessingService.forceCloseSpinners(videoId);
            
            // Remove from tracked spinners
            lastSpinnerStartTimes.delete(videoId);
            
            console.log(`✅ [Global Safety Check] Successfully closed stuck spinner for ${videoId}`);
          } catch (error) {
            console.error(`❌ [Global Safety Check] Error closing spinner:`, error);
          }
        }
      });
      
      // Clean up spinners that are no longer active
      if (!videoStore.shouldShowSpinner) {
        lastSpinnerStartTimes.clear();
        console.log('🧹 [Global Safety Check] Cleared spinner tracking, no active spinners');
      }
    }
  }, SPINNER_CHECK_INTERVAL);
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
  
  // Clear the spinner safety interval
  if (spinnerSafetyInterval !== null) {
    clearInterval(spinnerSafetyInterval);
    spinnerSafetyInterval = null;
  }
})
</script>

<template>
  <div class="min-h-screen bg-[#f0f4ff]">
    <!-- Navigation -->
    <nav class="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-b border-gray-100 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <router-link to="/" class="flex items-center gap-2">
            <img src="/logo.svg" alt="Veciz" class="h-12 w-12" />
            <span class="text-2xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-transparent bg-clip-text tracking-tight">Veciz</span>
          </router-link>

          <!-- Right side navigation -->
          <div class="flex items-center gap-4">
            <!-- User Menu -->
            <div class="relative">
              <template v-if="authStore.user">
                <button
                  @click.stop="isMenuOpen = !isMenuOpen"
                  class="profile-button flex items-center gap-2 bg-white p-2 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 group border border-gray-100"
                >
                  <div class="text-right hidden sm:block">
                    <p class="text-sm font-medium text-gray-900">{{ authStore.user?.user_metadata?.full_name || languageStore.t('common.user') }}</p>
                  </div>
                  <div class="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white group-hover:bg-indigo-600 transition-colors">
                    {{ authStore.user?.user_metadata?.full_name?.[0].toUpperCase() || languageStore.t('common.userInitial') }}
                  </div>
                </button>

                <!-- Dropdown Menu -->
                <div
                  v-if="isMenuOpen"
                  class="dropdown-menu absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 z-50 border border-gray-100"
                >
                  <router-link
                    to="/summaries"
                    class="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    @click="isMenuOpen = false"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>{{ languageStore.t('navigation.summaries') }}</span>
                  </router-link>
                  <router-link
                    to="/channels"
                    class="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    @click="isMenuOpen = false"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                    <span>{{ languageStore.t('navigation.channels') }}</span>
                  </router-link>
                  <div class="border-t border-gray-100 my-1"></div>
                  <button
                    @click="authStore.logout"
                    class="flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd" />
                    </svg>
                    <span>{{ languageStore.t('common.signOut') }}</span>
                  </button>
                </div>
              </template>
              <template v-else>
                <button
                  @click="authStore.login"
                  class="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors shadow-md"
                  :disabled="authStore.loading"
                >
                  <img src="https://www.google.com/favicon.ico" alt="Google" class="w-4 h-4" />
                  <span class="text-sm font-medium">{{ languageStore.t('common.signInWithGoogle') }}</span>
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <router-view></router-view>
  </div>

  <footer class="mt-20 py-8 bg-gray-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 class="text-lg font-semibold mb-4">{{ languageStore.t('home.footer.about.title') }}</h3>
          <p class="text-gray-600">
            {{ languageStore.t('home.footer.about.description') }}
          </p>
        </div>
        <div>
          <h3 class="text-lg font-semibold mb-4">{{ languageStore.t('home.footer.quickLinks.title') }}</h3>
          <ul class="space-y-2">
            <li>
              <a href="/" class="text-accent hover:underline">{{ languageStore.t('home.footer.quickLinks.home') }}</a>
            </li>
          </ul>
        </div>
        <div>
          <h3 class="text-lg font-semibold mb-4">{{ languageStore.t('home.footer.contact.title') }}</h3>
          <p class="text-gray-600">
            {{ languageStore.t('home.footer.contact.description') }}
          </p>
        </div>
      </div>
    </div>
  </footer>

  <!-- Language Switcher -->
  <div class="fixed bottom-4 right-4 z-50">
    <div class="bg-white rounded-lg shadow-lg p-2 flex gap-2">
      <button
        @click="switchLanguage('tr')"
        class="px-3 py-1.5 rounded-md text-sm font-medium"
        :class="languageStore.currentLocale === 'tr' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'"
      >
        TR
      </button>
      <button
        @click="switchLanguage('en')"
        class="px-3 py-1.5 rounded-md text-sm font-medium"
        :class="languageStore.currentLocale === 'en' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'"
      >
        EN
      </button>
    </div>
  </div>
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
