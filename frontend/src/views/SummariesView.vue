<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useLanguageStore } from '../stores/languageStore'
import { useAuthStore } from '../stores/auth'
import { getVideoId } from '../utils/youtube'
import { useRouter } from 'vue-router'
import { supabase } from '../config/supabase'
import { FormatService } from '../services/formatService'

interface Summary {
  id: string; // ID from user_summaries table
  summary_id: string; // ID from summaries table
  video_id: string;
  content: string;
  status: string;
  created_at: string;
  language: string;
  video_title: string;
  video_thumbnail: string;
  video_url: string;
  channel_name: string;
  channel_id: string;
  is_read: boolean;
}

type VideoSummary = Summary;

const languageStore = useLanguageStore()
const authStore = useAuthStore()
const activeTab = ref('all') // all, today, week, month
const selectedLanguage = ref('all') // all, tr, en
const selectedSummary = ref<VideoSummary | null>(null)
const isMenuOpen = ref(false)
const error = ref('')

const summaries = ref<Summary[]>([])
const isLoading = ref(false)

const router = useRouter()

// Computed properties for filtered summaries
const filteredSummaries = computed(() => {
  if (!Array.isArray(summaries.value)) {
    console.warn('❗ Summaries is not an array:', summaries.value);
    return [];
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay()) // Haftanın başlangıcı (Pazar)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  return summaries.value
    .filter(summary => {
      // Null veya undefined kontrolü
      if (!summary) return false;

      // First filter by date
      const summaryDate = new Date(summary.created_at)
      let dateMatches = true
      
      switch (activeTab.value) {
        case 'today':
          dateMatches = summaryDate >= today
          break
        case 'week':
          dateMatches = summaryDate >= weekStart
          break
        case 'month':
          dateMatches = summaryDate >= monthStart
          break
        default:
          dateMatches = true
      }

      // Then filter by language
      const languageMatches = selectedLanguage.value === 'all' || summary.language === selectedLanguage.value

      return dateMatches && languageMatches
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) // En yeni özetler üstte
})

// Template için computed property
const hasNoSummaries = computed(() => {
  return filteredSummaries.value.length === 0
})

const fetchSummaries = async () => {
  isLoading.value = true;
  error.value = '';
  try {
    const token = await supabase.auth.getSession();
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/summaries`, {
      headers: {
        'Authorization': `Bearer ${token.data.session?.access_token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch summaries');
    }

    const data = await response.json();
    console.log('API Response:', data); // Debug log

    summaries.value = data.map((item: any) => {
      console.log('Processing item:', item); // Debug log
      return {
        id: item.id, // user_summaries table ID
        summary_id: item.summary_id,
        video_id: item.video_id,
        content: item.content,
        status: item.status,
        created_at: item.created_at,
        language: item.language,
        video_title: item.video_title,
        video_thumbnail: item.video_thumbnail,
        video_url: item.video_url,
        channel_name: item.channel_name,
        channel_id: item.channel_id,
        is_read: Boolean(item.is_read) // Convert to boolean
      };
    });

    console.log('Mapped summaries:', summaries.value); // Debug log
  } catch (err) {
    console.error('Error fetching summaries:', err);
    error.value = 'Failed to load summaries. Please try again later.';
  } finally {
    isLoading.value = false;
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

onMounted(() => {
  console.log('Component mounted, loading summaries...')
  fetchSummaries()
  document.addEventListener('click', closeMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
})

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const truncateSummary = (text: string) => {
  if (!text) return '';
  
  // Temizleme işlemi yapmadan önce debug log
  console.log('Özet başlangıç karakterleri (temizleme öncesi):', text.slice(0, 10));
  
  // Tüm HTML etiketlerini temizleyerek düz metni al
  const plainText = text.replace(/<[^>]+>/g, '');
  
  // Encoded HTML karakterlerini temizle
  const cleanText = plainText.replace(/&lt;|&gt;|&amp;|&quot;|&#39;/g, '');
  
  // Debug log
  console.log('Özet başlangıç karakterleri (temizleme sonrası):', cleanText.slice(0, 10));
  
  // İçeriği temizle ve ilk birkaç cümleyi al
  const cleanedContent = cleanText.trim();
  const sentences = cleanedContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
  let preview = sentences.slice(0, 2).join('. ');
  
  // Eğer çok uzunsa, kısalt
  if (preview.length > 150) {
    preview = preview.substring(0, 150) + '...';
  }
  
  // Son kez kontrol et - başında geçersiz karakter kalmasın
  preview = preview.replace(/^[\u0000-\u001F\u007F-\u009F\uFFFD]+/, '').trim();
  
  // Sadece metin döndür, emoji kullanma
  return `${preview}${sentences.length > 2 ? '...' : '.'}`;
};

const openSummary = (summary: Summary) => {
  selectedSummary.value = summary;
}

const closeSummary = () => {
  selectedSummary.value = null;
}

const getEmbedUrl = (url: string): string | undefined => {
  const videoId = getVideoId(url)
  return videoId ? `https://www.youtube.com/embed/${videoId}` : undefined
}

const formattedSummary = computed(() => {
  if (!selectedSummary.value?.content) return '';
  
  let content = selectedSummary.value.content;
  
  // Özel karakter sorunlarının tespiti için debug log
  console.log('Ham metin (ilk 200 karakter):', content.slice(0, 200));
  
  // Sadece içeriği formatla
  const formattedContent = FormatService.formatSummaryText(content);
  
  // İşleme sonucunu göster
  console.log('İşlenmiş içerikten örnek:', formattedContent.slice(0, 200));
  
  // Sadece formatlı içeriği dön, kaynak footer'ı ekleme
  return formattedContent;
});

// Download and Share Functions
const downloadSummary = () => {
  if (!selectedSummary.value) return;

  const summaryText = `
${selectedSummary.value.video_title}
${selectedSummary.value.channel_name}
${formatDate(selectedSummary.value.created_at)}

${selectedSummary.value.content}

Video URL: ${selectedSummary.value.video_url}
Generated by VecizAI
  `.trim();

  const blob = new Blob([summaryText], { type: 'text/plain' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${selectedSummary.value.video_title.slice(0, 50)}_summary.txt`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

const shareSummary = async () => {
  if (!selectedSummary.value) return;

  const shareData = {
    title: selectedSummary.value.video_title,
    text: `${selectedSummary.value.video_title}\n\n${truncateSummary(selectedSummary.value.content)}\n\nGenerated by VecizAI`,
    url: selectedSummary.value.video_url
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(`${shareData.title}\n\n${shareData.text}\n\n${shareData.url}`);
      // TODO: Show a toast notification that the content was copied
    }
  } catch (err) {
    console.error('Error sharing:', err);
  }
};

// Feedback Section
const selectedRating = ref(0)
const feedbackComment = ref('')

const submitFeedback = async () => {
  if (!selectedSummary.value) return;
  
  try {
    console.log('Submitting feedback:', {
      rating: selectedRating.value,
      comment: feedbackComment.value
    });

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    if (!token) {
      console.error('No auth token found');
      throw new Error('Authentication required');
    }

    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/summaries/${selectedSummary.value.id}/feedback`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rating: selectedRating.value,
        comment: feedbackComment.value
      })
    });

    if (!response.ok) {
      throw new Error('Failed to submit feedback');
    }

    // Show success message
    alert(languageStore.t('summaries.feedback.submitSuccess'));
  } catch (error) {
    console.error('Error submitting feedback:', error);
    alert(languageStore.t('errors.feedbackFailed'));
  }
}

const showModal = ref(false)

const handleSummaryClick = (summary: Summary) => {
  selectedSummary.value = summary;
  showModal.value = true;
  
  // Mark as read when opening
  if (!summary.is_read) {
    markSummaryAsRead(summary.id);
  }
}

// Mark summary as read
const markSummaryAsRead = async (summaryId: string) => {
  try {
    const token = await supabase.auth.getSession();
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/summaries/${summaryId}/read`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token.data.session?.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ is_read: true })
    });

    if (!response.ok) {
      throw new Error('Failed to mark summary as read');
    }
    
    // Update local state
    if (summaries.value) {
      const index = summaries.value.findIndex(s => s.id === summaryId);
      if (index !== -1) {
        summaries.value[index].is_read = true;
      }
    }
  } catch (error) {
    console.error('Error marking summary as read:', error);
  }
};

const validateSummary = (summary: Summary) => {
  return summary.id && summary.video_title && summary.content;
};

const shareOnTwitter = (summary: Summary) => {
  const text = `${summary.video_title}\n\n${summary.content}\n\nWatch on YouTube: ${summary.video_url}`;
  const encodedText = encodeURIComponent(text);
  window.open(`https://twitter.com/intent/tweet?text=${encodedText}`, '_blank');
};

const shareOnLinkedIn = (summary: Summary) => {
  const text = `${summary.video_title}\n\n${summary.content}`;
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(summary.video_url);
  window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}&summary=${encodedText}`, '_blank');
};
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-gray-50 to-white pt-20 pb-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Main Content -->
      <div class="bg-white rounded-2xl shadow-lg p-4 sm:p-6 lg:p-8">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <h1 class="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-transparent bg-clip-text">
            {{ languageStore.t('summaries.title') }}
          </h1>

          <!-- Navigation Tabs -->
          <div class="flex items-center gap-2 bg-gradient-to-br from-gray-50/80 to-white/80 p-1.5 rounded-xl backdrop-blur-sm border border-gray-100/50 shadow-sm">
            <router-link
              to="/channels"
              class="flex items-center gap-2 px-4 py-2.5 text-gray-600 hover:text-indigo-600 transition-all duration-300 text-sm rounded-lg hover:bg-white relative group/nav overflow-hidden"
            >
              <span class="absolute inset-0 bg-gradient-to-r from-indigo-50 to-purple-50 opacity-0 group-hover/nav:opacity-100 transition-opacity"></span>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 relative text-indigo-500 group-hover/nav:rotate-6 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="relative font-medium">{{ languageStore.t('navigation.channels') }}</span>
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

        <!-- Filter Tabs -->
        <div class="flex flex-wrap gap-2 sm:gap-4 mb-6">
          <!-- Time Filter Buttons -->
          <div class="flex flex-wrap gap-1.5 sm:gap-2">
            <button
              v-for="tab in ['all', 'today', 'week', 'month']"
              :key="tab"
              @click="activeTab = tab"
              class="px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-all duration-300 relative group/filter overflow-hidden"
              :class="[
                activeTab === tab
                  ? 'text-white shadow-md'
                  : 'text-gray-600 hover:text-indigo-600 bg-gray-50 hover:bg-white'
              ]"
            >
              <span 
                v-if="activeTab === tab" 
                class="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600"
              ></span>
              <span 
                v-else
                class="absolute inset-0 bg-gradient-to-r from-indigo-50 to-purple-50 opacity-0 group-hover/filter:opacity-100 transition-opacity"
              ></span>
              <span class="relative">{{ languageStore.t(`summaries.filters.${tab}`) }}</span>
            </button>
          </div>

          <!-- Language Filter -->
          <div class="flex items-center gap-1.5 sm:gap-2">
            <span class="text-xs sm:text-sm text-gray-500">{{ languageStore.t('summaries.language') }}:</span>
            <div class="flex gap-1 bg-gray-50 p-1 rounded-lg">
              <button
                v-for="lang in ['all', 'tr', 'en']"
                :key="lang"
                @click="selectedLanguage = lang"
                class="px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-300 relative group/lang"
                :class="[
                  selectedLanguage === lang
                    ? 'text-white bg-gradient-to-r from-indigo-600 to-purple-600 shadow-sm'
                    : 'text-gray-600 hover:text-indigo-600 hover:bg-white'
                ]"
              >
                {{ languageStore.t(`summaries.languages.${lang}`) }}
              </button>
            </div>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading" class="text-center py-12">
          <div class="w-16 h-16 mx-auto mb-4 relative">
            <div class="absolute inset-0 rounded-full border-t-2 border-b-2 border-indigo-500 animate-spin"></div>
            <div class="absolute inset-2 rounded-full border-t-2 border-b-2 border-purple-500 animate-spin"></div>
            <div class="absolute inset-4 rounded-full border-t-2 border-b-2 border-pink-500 animate-spin"></div>
          </div>
          <p class="mt-4 text-gray-600 animate-pulse">{{ languageStore.t('common.loading') }}</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-12">
          <div class="bg-red-50 p-4 rounded-xl">
            <p class="text-red-600">{{ error }}</p>
          </div>
        </div>

        <!-- Summaries Grid -->
        <div v-else-if="filteredSummaries.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="summary in filteredSummaries" 
               :key="summary.id"
               @click="handleSummaryClick(summary)"
               class="group bg-gradient-to-br from-white to-gray-50/50 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 cursor-pointer">
            <!-- Summary Header -->
            <div class="relative pb-[56.25%]">
              <img 
                :src="summary.video_thumbnail"
                :alt="summary.video_title"
                class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity"></div>
              <div class="absolute bottom-0 left-0 right-0 p-4">
                <h3 class="text-lg font-semibold text-white line-clamp-2 drop-shadow-sm group-hover:text-indigo-200 transition-colors">
                  {{ summary.video_title }}
                </h3>
              </div>
            </div>

            <!-- Summary Info -->
            <div class="p-4">
              <div class="flex flex-col gap-4">
                <!-- Channel Info -->
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center text-indigo-600 font-medium group-hover:scale-110 transition-transform">
                    {{ summary.channel_name?.[0]?.toUpperCase() || '?' }}
                  </div>
                  <div>
                    <p class="text-sm font-medium text-gray-900">{{ summary.channel_name }}</p>
                    <p class="text-xs text-gray-500">{{ formatDate(summary.created_at) }}</p>
                  </div>
                </div>

                <!-- Summary Preview -->
                <p class="text-sm text-gray-600 line-clamp-3">
                  {{ truncateSummary(summary.content || '') }}
                </p>

                <!-- Status Tags -->
                <div class="flex flex-wrap gap-2">
                  <span class="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-800 rounded-lg">
                    {{ summary.language?.toUpperCase() || 'N/A' }}
                  </span>
                  <span 
                    class="px-2 py-1 text-xs font-medium rounded-lg"
                    :class="summary.is_read ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'"
                  >
                    {{ summary.is_read ? languageStore.t('summaries.status.read') : languageStore.t('summaries.status.unread') }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- No Summaries After Filtering -->
        <div v-else class="text-center py-12">
          <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full flex items-center justify-center group">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-indigo-500 group-hover:rotate-12 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 class="mt-4 text-lg font-medium bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
            {{ languageStore.t('summaries.noSummaries') }}
          </h3>
        </div>
      </div>
    </div>

    <!-- Summary Modal -->
    <div
      v-if="selectedSummary"
      class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]"
      @click.self="closeSummary"
    >
      <div
        class="bg-white rounded-xl shadow-lg w-full max-h-[90vh] overflow-y-auto mx-auto relative"
        style="max-width: min(90vw, 640px);"
        @click.stop
      >
        <div class="p-4 sm:p-6">
          <!-- Header -->
          <div class="flex items-center justify-between gap-4 mb-4 sticky top-0 bg-white z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 border-b border-gray-100">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent font-medium">
                {{ selectedSummary.channel_name[0].toUpperCase() }}
              </div>
              <div>
                <h3 class="font-semibold text-gray-900">{{ selectedSummary.channel_name }}</h3>
                <p class="text-sm text-gray-500">{{ formatDate(selectedSummary.created_at) }}</p>
              </div>
            </div>
            <button
              @click="closeSummary"
              class="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Video Player -->
          <div 
            class="mb-6 rounded-lg overflow-hidden bg-gray-100 mx-auto" 
            style="max-width: min(100%, 480px); aspect-ratio: 16/10;"
          >
            <iframe
              v-if="selectedSummary?.video_url && getEmbedUrl(selectedSummary.video_url)"
              :src="getEmbedUrl(selectedSummary.video_url)"
              class="w-full h-full"
              title="YouTube video player"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>

          <!-- Video Title -->
          <h2 class="text-lg sm:text-xl font-bold text-gray-900 mb-4">{{ selectedSummary.video_title }}</h2>

          <!-- Summary Content -->
          <div class="bg-gray-50 rounded-lg p-4 mb-6">
            <div class="prose prose-sm sm:prose max-w-none">
              <div class="summary-content" v-html="formattedSummary"></div>
            </div>
          </div>

          <!-- Download and Share Buttons -->
          <div class="flex flex-wrap gap-4 mb-6">
            <!-- Download Button -->
            <button
              @click="downloadSummary"
              class="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 group"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 group-hover:-translate-y-0.5 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
              <span>{{ languageStore.t('summaries.actions.download') }}</span>
            </button>

            <!-- Share Button -->
            <button
              @click="shareSummary"
              class="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-all duration-300 group"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 group-hover:rotate-12 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
              </svg>
              <span>{{ languageStore.t('summaries.actions.share') }}</span>
            </button>
          </div>

          <!-- Feedback Section -->
          <div class="feedback-section mt-4 p-4 bg-gray-50 rounded-lg">
            <h3 class="text-lg font-semibold mb-3">{{ languageStore.t('summaries.feedback.title') }}</h3>
            
            <!-- Rating -->
            <div class="mb-4">
              <p class="text-sm text-gray-600 mb-2">
                {{ selectedRating > 0 
                  ? languageStore.t('summaries.feedback.rating.rated').replace('{rating}', String(selectedRating))
                  : languageStore.t('summaries.feedback.rating.notRated')
                }}
              </p>
              <div class="flex gap-1">
                <button
                  v-for="i in 5"
                  :key="i"
                  @click="selectedRating = i"
                  class="text-2xl"
                  :class="i <= selectedRating ? 'text-yellow-400' : 'text-gray-300'"
                >
                  ★
                </button>
              </div>
            </div>

            <!-- Comment -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-1">
                {{ languageStore.t('summaries.feedback.comment.label') }}
              </label>
              <textarea
                v-model="feedbackComment"
                rows="3"
                class="w-full p-2 border rounded-md"
                :placeholder="languageStore.t('summaries.feedback.comment.placeholder')"
              ></textarea>
            </div>

            <!-- Submit Button -->
            <button
              @click="submitFeedback"
              class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              {{ languageStore.t('summaries.feedback.submit') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.summary-content {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  color: #374151;
}

.summary-plain-text {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  color: #374151;
  font-size: 1rem;
}

.summary-plain-text strong {
  color: #4338ca;
  font-weight: 600;
}

.summary-plain-text a {
  color: #2563eb;
  text-decoration: underline;
}

.summary-content p {
  margin-bottom: 1rem;
}

.summary-content h1, 
.summary-content h2, 
.summary-content h3 {
  font-weight: 600;
  margin-top: 1.5rem;
  margin-bottom: 1rem;
  color: #111827;
}

.summary-content h1 { font-size: 1.5rem; }
.summary-content h2 { font-size: 1.25rem; }
.summary-content h3 { font-size: 1.125rem; }

.summary-content strong {
  color: #4338ca;
  font-weight: 600;
}

.summary-content em {
  color: #0369a1;
  font-style: italic;
}

/* Emojiler için animasyon */
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

/* Yeni CSS Sınıfları */
.summary-content .section-heading {
  background: linear-gradient(90deg, rgba(67, 56, 202, 0.07), transparent);
  border-left: 3px solid #4338ca;
  padding: 0.5rem;
  margin: 1rem 0;
  border-radius: 0.25rem;
}

.summary-content .section-heading-text {
  font-size: 1.1em;
  font-weight: 700;
  color: #4338ca;
  text-transform: uppercase;
  display: flex;
  align-items: center;
}

.summary-content .section-emoji {
  font-size: 1.4em;
  margin-right: 0.4rem;
  display: inline-block;
  animation: pulse 2s infinite ease-in-out;
}

.summary-content .bullet-item {
  display: flex;
  margin-bottom: 0.75rem;
}

.summary-content .simple-bullet {
  margin-bottom: 0.75rem;
  padding-left: 1.5rem;
  position: relative;
}

.summary-content .simple-bullet:before {
  content: "•";
  position: absolute;
  left: 0.5rem;
  color: #4f46e5;
  font-weight: bold;
}

.summary-content .bullet-emoji {
  font-size: 1.2em;
  min-width: 1.5rem;
  margin-right: 0.5rem;
}

.summary-content .bullet-content {
  flex: 1;
}

.summary-content .subsection-heading {
  font-weight: 600;
  font-size: 1.1em;
  margin-top: 1.25rem;
  margin-bottom: 0.75rem;
  color: #4f46e5;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 0.25rem;
}

.summary-content .quote-highlight {
  font-style: italic;
  color: #0369a1;
  background-color: #e0f2fe;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
}

.summary-content .highlight-critical {
  background-color: #fee2e2;
  color: #b91c1c;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  font-weight: 600;
}

.summary-content .highlight-concept {
  background-color: #e0e7ff;
  color: #4338ca;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  font-weight: 600;
}

.summary-content .highlight-advice {
  background-color: #d1fae5;
  color: #047857;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  font-weight: 600;
}

.summary-content .highlight-warning {
  background-color: #fef3c7;
  color: #92400e;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  font-weight: 600;
}

.summary-content .highlight-default {
  font-weight: 600;
  color: #4338ca;
}

.summary-content .stat-highlight {
  font-weight: 700;
  color: #0891b2;
  background-color: #cffafe;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
}

.summary-content .section-divider {
  border-top: 1px dashed #d1d5db;
  margin: 1.5rem 0;
  height: 0;
}

.summary-content .conclusion-box {
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #4f46e5;
  padding: 1rem;
  margin: 1.5rem 0;
  border-radius: 0.375rem;
}

.summary-content .conclusion-heading {
  font-weight: 600;
  color: #4f46e5;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
}

.summary-content .conclusion-emoji {
  font-size: 1.25em;
  margin-right: 0.5rem;
}

.summary-content .conclusion-text {
  margin: 0;
}

.summary-content .connector-text {
  color: #4f46e5;
  font-weight: 600;
}

.summary-content .note-box,
.summary-content .tip-box,
.summary-content .warning-box {
  padding: 0.75rem;
  margin: 1rem 0;
  border-radius: 0.25rem;
}

.summary-content .note-box {
  background-color: #e4e4e7;
  border-left: 4px solid #71717a;
}

.summary-content .tip-box {
  background-color: #dbeafe;
  border-left: 4px solid #3b82f6;
}

.summary-content .warning-box {
  background-color: #fee2e2;
  border-left: 4px solid #ef4444;
}

.summary-content .note-heading,
.summary-content .tip-heading,
.summary-content .warning-heading {
  font-weight: 600;
  margin-bottom: 0.25rem;
  display: flex;
  align-items: center;
}

.summary-content .tip-heading {
  color: #2563eb;
}

.summary-content .warning-heading {
  color: #b91c1c;
}

.summary-content .note-emoji,
.summary-content .tip-emoji,
.summary-content .warning-emoji {
  font-size: 1.1em;
  margin-right: 0.5rem;
}

.summary-content .note-content,
.summary-content .tip-content,
.summary-content .warning-content {
  margin: 0;
}

/* Yeni eklenen highlight stilleri */
.summary-plain-text .highlight-concept {
  background-color: #e0e7ff;
  color: #4338ca;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  font-weight: 600;
  transition: all 0.2s ease;
}

.summary-plain-text .highlight-concept:hover {
  background-color: #c7d2fe;
  transform: translateY(-1px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.summary-plain-text .stat-highlight {
  font-weight: 700;
  color: #0891b2;
  background-color: #cffafe;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  transition: all 0.2s ease;
}

.summary-plain-text .stat-highlight:hover {
  background-color: #a5f3fc;
  transform: translateY(-1px);
}

.summary-plain-text .quote-highlight {
  font-style: italic;
  color: #0369a1;
  background-color: #e0f2fe;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  border-left: 2px solid #0369a1;
  margin: 0 0.25rem;
  transition: all 0.2s ease;
}

.summary-plain-text .quote-highlight:hover {
  background-color: #bae6fd;
}

.summary-plain-text .highlight-warning {
  background-color: #fef3c7;
  color: #92400e;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  font-weight: 600;
  border-left: 2px solid #d97706;
  transition: all 0.2s ease;
}

.summary-plain-text .highlight-warning:hover {
  background-color: #fde68a;
}

.summary-plain-text .highlight-advice {
  background-color: #d1fae5;
  color: #047857;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  font-weight: 600;
  border-left: 2px solid #059669;
  transition: all 0.2s ease;
}

.summary-plain-text .highlight-advice:hover {
  background-color: #a7f3d0;
}

.summary-plain-text .simple-bullet {
  margin-bottom: 0.75rem;
  padding-left: 1.5rem;
  position: relative;
}

.summary-plain-text .simple-bullet:before {
  content: "•";
  position: absolute;
  left: 0.5rem;
  color: #4f46e5;
  font-weight: bold;
}

/* Bölüm Başlıkları */
.summary-plain-text .section-heading {
  background: linear-gradient(90deg, rgba(67, 56, 202, 0.07), transparent);
  border-left: 3px solid #4338ca;
  padding: 0.75rem 0.5rem;
  margin: 1.5rem 0 1rem 0;
  border-radius: 0.25rem;
  transition: all 0.2s ease;
}

.summary-plain-text .section-heading:hover {
  background: linear-gradient(90deg, rgba(67, 56, 202, 0.12), rgba(99, 102, 241, 0.05));
  transform: translateX(2px);
}

.summary-plain-text .section-heading-text {
  font-size: 1.1em;
  font-weight: 700;
  color: #4338ca;
  display: flex;
  align-items: center;
}

.summary-plain-text .section-emoji {
  font-size: 1.4em;
  margin-right: 0.6rem;
  display: inline-block;
  animation: pulse 2s infinite ease-in-out;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
</style> 