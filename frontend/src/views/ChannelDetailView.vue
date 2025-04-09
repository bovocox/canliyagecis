<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useLanguageStore } from '../stores/languageStore'
import { API_CONFIG } from '../config/api'
import { logger } from '../utils/logger'

interface ChannelDetails {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  subscriber_count: number;
  video_count: number;
  view_count: number;
  language?: string;
  last_checked?: string;
  created_at: string;
  updated_at: string;
  channel_videos: Array<{
    id: string;
    video_id: string;
    channel_id: string;
    title: string;
    description: string;
    thumbnail_url: string;
    published_at: string;
    view_count: number;
    like_count: number;
    comment_count: number;
    duration: string;
    channel_title: string;
  }>;
}

const route = useRoute()
const authStore = useAuthStore()
const languageStore = useLanguageStore()

const channelDetails = ref<ChannelDetails | null>(null)
const isLoading = ref(false)
const error = ref('')

const formatNumber = (num: number | undefined | null): string => {
  if (num === undefined || num === null) return '0';
  
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

const formatRelativeTime = (dateString: string): string => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return languageStore.t('common.justNow');
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} ${languageStore.t('common.time.minute')} ${languageStore.t('common.timeAgo')}`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} ${languageStore.t('common.time.hour')} ${languageStore.t('common.timeAgo')}`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays} ${languageStore.t('common.time.day')} ${languageStore.t('common.timeAgo')}`;
  }
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} ${languageStore.t('common.time.month')} ${languageStore.t('common.timeAgo')}`;
  }
  
  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears} ${languageStore.t('common.time.year')} ${languageStore.t('common.timeAgo')}`;
}

const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  
  return new Date(dateString).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

const loadChannelDetails = async () => {
  try {
    if (!authStore.session?.access_token) {
      error.value = languageStore.t('common.errors.notAuthenticated')
      logger.error('No access token available')
      return
    }

    isLoading.value = true
    error.value = ''
    
    logger.info('Loading channel details', { 
      channelId: route.params.id,
      url: `${API_CONFIG.baseUrl}/api/channels/${route.params.id}`
    })

    const response = await fetch(`${API_CONFIG.baseUrl}/api/channels/${route.params.id}`, {
      headers: {
        'Authorization': `Bearer ${authStore.session.access_token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      logger.error('Failed to load channel details:', { 
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        channelId: route.params.id
      })
      throw new Error(errorData?.message || languageStore.t('channels.errors.loadFailed'))
    }

    const data = await response.json()
    channelDetails.value = data
    logger.info('Channel details loaded successfully:', { 
      channelId: route.params.id,
      title: data.title,
      hasLatestVideos: !!data.channel_videos?.length
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load channel details'
    logger.error('Error loading channel details:', {
      error: err instanceof Error ? {
        message: err.message,
        stack: err.stack
      } : 'Unknown error',
      channelId: route.params.id
    })
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadChannelDetails()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 pt-20 pb-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Loading State -->
      <div v-if="isLoading" class="text-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
        <p class="mt-4 text-gray-600">{{ languageStore.t('common.loading') }}</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-12">
        <div class="bg-red-50 p-4 rounded-lg">
          <p class="text-red-600">{{ error }}</p>
          <button 
            @click="loadChannelDetails" 
            class="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            {{ languageStore.t('common.retry') }}
          </button>
        </div>
      </div>

      <!-- Content -->
      <template v-else-if="channelDetails">
        <!-- Back Button -->
        <div class="mb-6">
          <router-link 
            to="/channels" 
            class="inline-flex items-center text-gray-600 hover:text-indigo-600 bg-white px-4 py-2 rounded-lg shadow-sm transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" />
            </svg>
            {{ languageStore.t('channels.channelDetails.back') }}
          </router-link>
        </div>

        <!-- Channel Header -->
        <div class="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div class="flex flex-col items-center text-center mb-6">
            <div class="mb-4">
              <img 
                :src="channelDetails.thumbnail_url" 
                :alt="channelDetails.title"
                class="w-32 h-32 rounded-full object-cover ring-4 ring-gray-100 shadow-md"
              >
            </div>
            <h1 class="text-2xl font-bold text-gray-900 mb-2">{{ channelDetails.title }}</h1>
            <p class="text-gray-500 max-w-2xl mb-6">{{ channelDetails.description }}</p>
            
            <div class="flex flex-wrap justify-center gap-8">
              <div class="text-center">
                <p class="text-2xl font-bold text-gray-900">{{ formatNumber(channelDetails.subscriber_count) }}</p>
                <p class="text-sm text-gray-500">{{ languageStore.t('channels.channelDetails.statistics.subscribers') }}</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-gray-900">{{ formatNumber(channelDetails.video_count) }}</p>
                <p class="text-sm text-gray-500">{{ languageStore.t('channels.channelDetails.statistics.videos') }}</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-gray-900">{{ formatNumber(channelDetails.view_count) }}</p>
                <p class="text-sm text-gray-500">{{ languageStore.t('channels.channelDetails.statistics.views') }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Latest Videos -->
        <div class="bg-white rounded-lg shadow-sm p-6">
          <h2 class="text-xl font-semibold text-gray-900 mb-6">{{ languageStore.t('channels.channelDetails.latestVideos') }}</h2>
          <div v-if="channelDetails.channel_videos?.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <a 
              v-for="video in channelDetails.channel_videos" 
              :key="video.id"
              :href="`https://youtube.com/watch?v=${video.video_id}`"
              target="_blank"
              rel="noopener noreferrer"
              class="block group"
            >
              <div class="aspect-w-16 aspect-h-9 rounded-lg overflow-hidden bg-gray-100">
                <img 
                  :src="video.thumbnail_url || `https://img.youtube.com/vi/${video.video_id}/maxresdefault.jpg`"
                  :alt="video.title"
                  class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-200"
                  @error="(e) => { const img = e.target as HTMLImageElement; img.src = `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg` }"
                >
              </div>
              <h3 class="mt-2 text-sm font-medium text-gray-900 group-hover:text-indigo-600 line-clamp-2">
                {{ video.title }}
              </h3>
              <div class="mt-1 flex items-center gap-2 text-sm text-gray-500">
                <span>{{ formatNumber(video.view_count) }} {{ languageStore.t('common.views') }}</span>
                <span>•</span>
                <span>{{ formatDate(video.published_at) }}</span>
              </div>
            </a>
          </div>
          <div v-else class="text-center py-8">
            <p class="text-gray-500">{{ languageStore.t('channels.channelDetails.noVideos') }}</p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template> 