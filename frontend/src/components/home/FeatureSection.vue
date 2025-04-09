<script setup lang="ts">
import { useLanguageStore } from '../../stores/languageStore';

const languageStore = useLanguageStore();
</script>

<template>
  <div class="py-12 sm:py-16 bg-gradient-to-b from-gray-50 to-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-12">
        <h2 class="text-3xl sm:text-4xl font-bold text-gray-900">{{ languageStore.t('home.features.title') }}</h2>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        <!-- Channel Tracking -->
        <div class="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 relative overflow-hidden group">
          <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-bl-[100%] -z-10 group-hover:scale-150 transition-transform duration-500"></div>
          <div class="flex flex-col items-center text-center gap-4">
            <div class="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white transform group-hover:rotate-12 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 110 6 3 3 0 010-6z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-900">{{ languageStore.t('home.features.channelTracking.title') }}</h3>
            <p class="text-gray-600">{{ languageStore.t('home.features.channelTracking.description') }}</p>
          </div>
        </div>

        <!-- Instant Summaries -->
        <div class="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 relative overflow-hidden group">
          <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-100 to-pink-100 rounded-bl-[100%] -z-10 group-hover:scale-150 transition-transform duration-500"></div>
          <div class="flex flex-col items-center text-center gap-4">
            <div class="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white transform group-hover:rotate-12 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-900">{{ languageStore.t('home.features.instantSummaries.title') }}</h3>
            <p class="text-gray-600">{{ languageStore.t('home.features.instantSummaries.description') }}</p>
          </div>
        </div>

        <!-- Smart Summaries -->
        <div class="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 relative overflow-hidden group">
          <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-pink-100 to-rose-100 rounded-bl-[100%] -z-10 group-hover:scale-150 transition-transform duration-500"></div>
          <div class="flex flex-col items-center text-center gap-4">
            <div class="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center text-white transform group-hover:rotate-12 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-900">{{ languageStore.t('home.features.smartSummaries.title') }}</h3>
            <p class="text-gray-600">{{ languageStore.t('home.features.smartSummaries.description') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template> 