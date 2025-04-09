<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useLanguageStore } from '../stores/languageStore'
import { logger } from '../utils/logger'
import { API_CONFIG } from '../config/api'
import { useRouter } from 'vue-router'

const languageStore = useLanguageStore()
const authStore = useAuthStore()
const newChannel = ref('')
const isMenuOpen = ref(false)
const isLoading = ref(false)
const error = ref('')
const router = useRouter()
const selectedChannel = ref<any | null>(null)
const tempChannelUrl = ref('') // Kanal URL'sini geçici olarak saklamak için

// Dil seçim modalı için eklenen state
const showLanguageModal = ref(false)
const addedChannelId = ref('') // Eklenen kanalın ID'sini saklamak için

interface Video {
  video_id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  view_count: number;
  published_at: string;
  channel_id: string;
  channel_title: string;
  comment_count: string;
  like_count: string;
  duration: string;
  status: string | null;
}

interface ChannelVideo {
  id: string;
  channel_id: string;
  video_id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  published_at: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  duration: string;
  channel_title: string;
  created_at: string;
  updated_at: string;
  has_summary: boolean;
}

interface Channel {
  id: string;
  title: string;
  description: string;
  subscriber_count: number;
  video_count: number;
  language?: string;
  thumbnail_url: string;
  created_at: string;
  updated_at: string;
  channel_videos?: ChannelVideo[];
}

const channels = ref<Channel[]>([])

// Format large numbers
const formatNumber = (num: number) => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

// Format date with full details
const formatDate = (dateString: string) => {
  if (!dateString) return '';
  
  return new Date(dateString).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Format relative time
const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  }

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit)
    if (interval >= 1) {
      const timeKey = `common.time.${unit}.${interval === 1 ? 'singular' : 'plural'}`
      return languageStore.t(timeKey)
    }
  }

  return languageStore.t('common.justNow')
}

const loadChannels = async () => {
  try {
    const sessionToken = authStore.getSession()?.access_token;
    if (!sessionToken) {
      console.error('No session token found');
      return;
    }

    isLoading.value = true;

    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/channels`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Backend raw response:', JSON.stringify(data, null, 2));
    
    // Kanalları ekleme tarihine göre sırala (en yeni en üstte)
    channels.value = data.sort((a: Channel, b: Channel) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    
    // Her kanal için detaylı log
    channels.value.forEach(channel => {
      console.log(`Channel ${channel.title} details:`, {
        id: channel.id,
        videoCount: channel.video_count,
        channelVideosArray: channel.channel_videos,
        channelVideosLength: channel.channel_videos?.length || 0,
        latestVideo: channel.channel_videos?.[0],
        latestVideoPublishDate: channel.channel_videos?.[0]?.published_at
      });
    });

  } catch (error) {
    console.error('Error loading channels:', error);
  } finally {
    isLoading.value = false;
  }
};

const addChannel = async () => {
  if (!newChannel.value) return;
  
  // İşlem başlamadan önce yükleme durumunu etkinleştir
  isLoading.value = true;
  error.value = '';
  
  try {
    // Kanal sayısı kontrolü
    if (channels.value.length >= 3) {
      error.value = 'Sistem geliştirme aşamasında olduğundan en fazla 3 kanal eklenebilir.';
      isLoading.value = false;
      return;
    }

    const sessionToken = authStore.getSession()?.access_token;
    if (!sessionToken) {
      console.error('No authentication token found');
      isLoading.value = false;
      return;
    }

    tempChannelUrl.value = newChannel.value;
    const channelUrl = newChannel.value;
    
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      },
      body: JSON.stringify({ channelUrl })
    });

    if (!response.ok) {
      if (response.status === 401) {
        await authStore.logout();
        router.push('/');
        return;
      }
      
      // API yanıtından hata mesajını al
      const errorData = await response.json().catch(() => ({}));
      
      // HTTP durum kodlarına göre daha spesifik hata mesajları
      if (response.status === 400) {
        error.value = languageStore.t('channels.errors.invalidUrl');
      } else if (response.status === 409) {
        error.value = languageStore.t('channels.errors.channelExists');
      } else if (response.status === 404) {
        error.value = languageStore.t('channels.errors.channelNotFound');
      } else {
        // API'den gelen mesajı veya genel hata mesajını kullan
        error.value = errorData.message || languageStore.t('channels.errors.addFailed');
      }
      
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const newChannelData = await response.json();
    
    // Kanal başarıyla eklendi, şimdi dil seçme modalını göster
    addedChannelId.value = newChannelData.id;
    newChannel.value = '';
    error.value = '';
    
    // Dil seçme modalını göster
    showLanguageModal.value = true;
    
    // Not: Kanalı channels listesine hemen ekleme, dil seçiminden sonra yapılacak
  } catch (err: any) {
    console.error('Error adding channel:', err);
    logger.error('Error adding channel:', { component: 'ChannelsView', method: 'addChannel', error: err });
    
    // Eğer hata mesajı zaten ayarlanmadıysa genel hata mesajını kullan
    if (!error.value) {
      error.value = languageStore.t('channels.errors.addFailed');
    }
  } finally {
    // İşlem tamamlandığında yükleme durumunu kapat
    isLoading.value = false;
  }
};

// Dil seçimi sonrası kanal için dil güncellemesi
const updateChannelLanguage = async (language: string) => {
  try {
    // Modal'ı kapat
    showLanguageModal.value = false;
    
    if (!addedChannelId.value) {
      console.error('No channel ID found for language update');
      return;
    }
    
    isLoading.value = true;
    const sessionToken = authStore.getSession()?.access_token;
    
    if (!sessionToken) {
      console.error('No authentication token found');
      return;
    }
    
    // Kanalın dil tercihini güncelle
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/channels/${addedChannelId.value}/language`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      },
      body: JSON.stringify({ language })
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        await authStore.logout();
        router.push('/');
        return;
      }
      
      console.error('Error updating channel language:', response.statusText);
      // Burada kanalları yine de yükleyelim, dil ayarı ikincil önemde
    }
    
    // Kanalları yeniden yükle
    await loadChannels();
    
  } catch (err) {
    console.error('Error updating channel language:', err);
    logger.error('Error updating channel language:', { 
      component: 'ChannelsView', 
      method: 'updateChannelLanguage', 
      error: err,
      channelId: addedChannelId.value
    });
    
    // Hata olsa bile kanalları yeniden yükle
    await loadChannels();
  } finally {
    isLoading.value = false;
  }
};

// Dil modalını kapatma işlemi - kanalı varsayılan dille ekler
const closeLanguageModal = async () => {
  showLanguageModal.value = false;
  
  // Varsayılan olarak kullanıcının seçtiği dili kullan
  await updateChannelLanguage(languageStore.language);
};

const removeChannel = async (channelId: string) => {
  try {
    const sessionToken = authStore.getSession()?.access_token;
    if (!sessionToken) {
      console.error('No authentication token found');
      return;
    }

    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/channels/${channelId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${sessionToken}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid
        await authStore.logout();
        router.push('/');
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    channels.value = channels.value.filter(channel => channel.id !== channelId);
  } catch (error) {
    console.error('Error removing channel:', error);
    logger.error('Error removing channel:', { component: 'ChannelsView', method: 'removeChannel', error });
    // Show error message to user
  }
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

// Add a function to extract video ID from URL
const getVideoId = (url: string): string => {
  if (!url) return '';
  
  // Handle different URL formats
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com')) {
      // Regular youtube.com URL
      const searchParams = new URLSearchParams(urlObj.search);
      const videoId = searchParams.get('v');
      if (videoId) return videoId;
    } else if (urlObj.hostname === 'youtu.be') {
      // Short youtu.be URL
      return urlObj.pathname.slice(1);
    }
  } catch (e) {
    logger.error('Error parsing video URL:', { url, error: e });
  }
  
  // Fallback to regex for other formats
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : '';
}

onMounted(async () => {
  await authStore.checkUser()
  await loadChannels()
  document.addEventListener('click', closeMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-gray-50 to-white">
    <!-- Auth Section -->
    <div class="fixed top-0 right-0 p-4 z-50">
      <template v-if="authStore.user">
        <div class="relative">
          <button
            @click.stop="isMenuOpen = !isMenuOpen"
            class="profile-button flex items-center gap-2 bg-white p-2 sm:p-3 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 group border border-gray-100"
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
              to="/"
              class="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              @click="isMenuOpen = false"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
              <span>{{ languageStore.t('navigation.home') }}</span>
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
        </div>
      </template>
      <template v-else>
        <button
          @click="authStore.login"
          class="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm"
          :disabled="authStore.loading"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" class="w-4 h-4" />
          <span class="text-sm font-medium">{{ languageStore.t('common.signInWithGoogle') }}</span>
        </button>
      </template>
    </div>

    <!-- Main Content -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20">
      <!-- Info Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <div class="bg-gradient-to-br from-white to-indigo-50/50 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-4 sm:p-6 border border-indigo-100 group">
          <div class="flex items-start gap-3 sm:gap-4">
            <div class="p-3 bg-gradient-to-br from-indigo-500/10 to-indigo-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 sm:h-7 w-6 sm:w-7 text-indigo-500 group-hover:rotate-12 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 mb-1 text-base sm:text-lg group-hover:text-indigo-600 transition-colors">{{ languageStore.t('channels.features.notifications.title') }}</h3>
              <p class="text-sm text-gray-600">{{ languageStore.t('channels.features.notifications.description') }}</p>
            </div>
          </div>
        </div>

        <div class="bg-gradient-to-br from-white to-purple-50/50 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-4 sm:p-6 border border-purple-100 group">
          <div class="flex items-start gap-3 sm:gap-4">
            <div class="p-3 bg-gradient-to-br from-purple-500/10 to-purple-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 sm:h-7 w-6 sm:w-7 text-purple-500 group-hover:rotate-12 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 mb-1 text-base sm:text-lg group-hover:text-purple-600 transition-colors">{{ languageStore.t('channels.features.ai.title') }}</h3>
              <p class="text-sm text-gray-600">{{ languageStore.t('channels.features.ai.description') }}</p>
            </div>
          </div>
        </div>

        <div class="bg-gradient-to-br from-white to-pink-50/50 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-4 sm:p-6 border border-pink-100 group">
          <div class="flex items-start gap-3 sm:gap-4">
            <div class="p-3 bg-gradient-to-br from-pink-500/10 to-pink-500/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 sm:h-7 w-6 sm:w-7 text-pink-500 group-hover:rotate-12 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 mb-1 text-base sm:text-lg group-hover:text-pink-600 transition-colors">{{ languageStore.t('channels.features.email.title') }}</h3>
              <p class="text-sm text-gray-600">{{ languageStore.t('channels.features.email.description') }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-lg p-4 sm:p-6 lg:p-8">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <h1 class="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-transparent bg-clip-text">{{ languageStore.t('channels.title') }}</h1>
          
          <!-- Navigation Tabs -->
          <div class="flex items-center gap-2 bg-gradient-to-br from-gray-50/80 to-white/80 p-1.5 rounded-xl backdrop-blur-sm border border-gray-100/50 shadow-sm">
            <router-link
              to="/summaries"
              class="flex items-center gap-2 px-4 py-2.5 text-gray-600 hover:text-indigo-600 transition-all duration-300 text-sm rounded-lg hover:bg-white relative group/nav overflow-hidden"
            >
              <span class="absolute inset-0 bg-gradient-to-r from-indigo-50 to-purple-50 opacity-0 group-hover/nav:opacity-100 transition-opacity"></span>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 relative text-indigo-500 group-hover/nav:rotate-6 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span class="relative font-medium">{{ languageStore.t('navigation.summaries') }}</span>
            </router-link>
            <router-link
              to="/"
              class="flex items-center gap-2 px-4 py-2.5 text-gray-600 hover:text-indigo-600 transition-all duration-300 text-sm rounded-lg hover:bg-white relative group/nav overflow-hidden"
            >
              <span class="absolute inset-0 bg-gradient-to-r from-indigo-50 to-purple-50 opacity-0 group-hover/nav:opacity-100 transition-opacity"></span>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 relative text-purple-500 group-hover/nav:rotate-6 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
              <span class="relative font-medium">{{ languageStore.t('navigation.home') }}</span>
            </router-link>
          </div>
        </div>
        
        <!-- Add Channel Form -->
        <div class="bg-gradient-to-br from-gray-50 to-white rounded-xl shadow-lg p-4 sm:p-6 mb-6 border border-gray-100/50 relative overflow-hidden">
          <div class="absolute inset-0 bg-grid-gray-100 opacity-[0.05]"></div>
          <div class="relative flex flex-col items-center">
            <h2 class="text-lg font-semibold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent mb-4">{{ languageStore.t('channels.addChannel') }}</h2>
            <form @submit.prevent="addChannel" class="flex flex-col sm:flex-row items-start gap-3 w-full max-w-2xl">
              <div class="flex-1 w-full">
                <input
                  v-model="newChannel"
                  type="text"
                  :placeholder="languageStore.t('channels.urlPlaceholder')"
                  class="w-full rounded-xl border-2 border-gray-200 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 text-sm px-4 py-3 bg-white hover:border-gray-300 transition-colors"
                  :disabled="isLoading"
                />
                <p v-if="error" class="mt-2 text-sm text-red-600 text-center">{{ error }}</p>
              </div>
              <button
                type="submit"
                class="whitespace-nowrap px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm font-medium rounded-xl hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 transition-all duration-300 relative overflow-hidden group sm:w-auto w-full"
                :disabled="isLoading || !newChannel"
              >
                <span class="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.3)_50%,transparent_75%)] bg-[length:250%_250%] animate-shimmer opacity-0 group-hover:opacity-100"></span>
                <span class="relative flex items-center justify-center gap-2">
                  <svg v-if="isLoading" class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {{ languageStore.t('channels.addChannel') }}
                </span>
              </button>
            </form>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading && !channels.length" class="text-center py-12">
          <div class="w-16 h-16 mx-auto mb-4 relative">
            <div class="absolute inset-0 rounded-full border-t-2 border-b-2 border-indigo-500 animate-spin"></div>
            <div class="absolute inset-2 rounded-full border-t-2 border-b-2 border-purple-500 animate-spin"></div>
            <div class="absolute inset-4 rounded-full border-t-2 border-b-2 border-pink-500 animate-spin"></div>
          </div>
          <p class="mt-4 text-gray-600 animate-pulse">{{ languageStore.t('common.loading') }}</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="!channels.length" class="text-center py-12">
          <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full flex items-center justify-center group">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-indigo-500 group-hover:rotate-12 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 class="mt-4 text-lg font-medium bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">{{ languageStore.t('channels.empty.title') }}</h3>
          <p class="mt-1 text-gray-500">{{ languageStore.t('channels.empty.description') }}</p>
        </div>

        <!-- Channels Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div v-for="channel in channels" 
               :key="channel.id"
               class="group bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden border border-gray-100/50 relative transform hover:-translate-y-1">
            
            <!-- Channel Header with Gradient Overlay -->
            <div class="relative aspect-video">
              <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10"></div>
              <img 
                :src="channel.thumbnail_url || '/default-channel.jpg'"
                :alt="channel.title"
                class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-in-out"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent"></div>
              
              <!-- Channel Language Badge -->
              <div class="absolute top-4 left-4 px-2.5 py-1.5 bg-white/90 backdrop-blur-sm rounded-full text-xs font-semibold text-indigo-700 shadow-sm">
                {{ channel.language === 'tr' ? '🇹🇷 Türkçe' : '🇬🇧 English' }}
              </div>
              
              <!-- Channel Stats -->
              <div class="absolute top-4 right-4 flex items-center gap-3">
                <div class="flex items-center gap-1.5 bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full text-white/90 shadow-md">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                  </svg>
                  <span class="text-sm font-medium">{{ formatNumber(channel.subscriber_count || 0) }}</span>
                </div>
                <div class="flex items-center gap-1.5 bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full text-white/90 shadow-md">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                  </svg>
                  <span class="text-sm font-medium">{{ formatNumber(channel.video_count || 0) }}</span>
                </div>
              </div>
              
              <!-- Channel Title -->
              <div class="absolute bottom-0 left-0 right-0 p-6">
                <h3 class="text-2xl font-bold text-white mb-2 line-clamp-2 group-hover:scale-[1.02] transition-transform">{{ channel.title }}</h3>
                <p class="text-sm text-white/90 line-clamp-2">{{ channel.description }}</p>
              </div>
            </div>

            <!-- Latest Video Preview -->
            <div v-if="channel.channel_videos && channel.channel_videos.length > 0" class="p-4 border-t border-gray-100">
              <p class="text-xs uppercase text-gray-500 font-medium mb-2">{{ languageStore.t('channels.latestVideos') }}</p>
              <div class="flex items-start gap-3">
                <div class="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden">
                  <img 
                    :src="channel.channel_videos[0].thumbnail_url || `https://img.youtube.com/vi/${channel.channel_videos[0].video_id}/mqdefault.jpg`"
                    alt="Latest video"
                    class="w-full h-full object-cover"
                  />
                </div>
                <div class="flex-1">
                  <h4 class="text-sm font-medium text-gray-800 line-clamp-2 mb-1">{{ channel.channel_videos[0].title || 'New Video' }}</h4>
                  <p class="text-xs text-gray-500">{{ formatDate(channel.channel_videos[0].published_at) }}</p>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="p-4 border-t border-gray-100 flex items-center justify-between">
              <router-link 
                :to="`/channels/${channel.id}`"
                class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-sm hover:shadow group/btn"
              >
                <span>{{ languageStore.t('channels.actions.view') }}</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transform group-hover/btn:translate-x-0.5 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                </svg>
              </router-link>
              
              <button
                @click.stop="removeChannel(channel.id)"
                class="flex items-center gap-1 px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
                <span>{{ languageStore.t('channels.actions.remove') }}</span>
              </button>
            </div>
          </div>
        </div>
        
        <!-- Language Selection Modal -->
        <div v-if="showLanguageModal" 
             class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
             @click.self="closeLanguageModal">
          <div class="bg-white rounded-xl w-full max-w-sm mx-4 p-4 sm:p-6">
            <h2 class="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-4">
              {{ languageStore.t('channels.language.selectTitle') }}
            </h2>
            <p class="text-sm text-gray-600 mb-4 sm:mb-6">
              {{ languageStore.t('channels.language.selectDescription') }}
            </p>
            <div class="flex flex-col gap-3">
              <button
                @click="updateChannelLanguage('tr')"
                class="flex items-center gap-3 p-4 rounded-xl border-2 hover:border-indigo-500 transition-colors"
                :class="{ 'border-indigo-500 bg-indigo-50': languageStore.language === 'tr', 'border-gray-200': languageStore.language !== 'tr' }"
              >
                <span class="text-2xl">🇹🇷</span>
                <span class="text-base font-medium">Türkçe</span>
              </button>
              <button
                @click="updateChannelLanguage('en')"
                class="flex items-center gap-3 p-4 rounded-xl border-2 hover:border-indigo-500 transition-colors"
                :class="{ 'border-indigo-500 bg-indigo-50': languageStore.language === 'en', 'border-gray-200': languageStore.language !== 'en' }"
              >
                <span class="text-2xl">🇬🇧</span>
                <span class="text-base font-medium">English</span>
              </button>
            </div>
            <button
              @click="closeLanguageModal"
              class="mt-4 sm:mt-6 w-full px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-50"
            >
              {{ languageStore.t('common.cancel') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ... existing styles ... */
</style> 