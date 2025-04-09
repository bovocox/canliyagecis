<script setup lang="ts">
import { RouterView } from 'vue-router'
import { watch } from 'vue'
import { useLanguageStore } from './stores/languageStore'

const languageStore = useLanguageStore()

const switchLanguage = (lang: 'tr' | 'en') => {
  languageStore.setLanguage(lang)
}

// Update title when language changes
watch(
  () => languageStore.currentLocale,
  () => {
    document.title = languageStore.t('common.siteTitle')
  },
  { immediate: true }
)
</script>

<template>
  <div class="min-h-screen bg-[#f0f4ff]">
    <!-- Navigation -->
    <nav class="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-b border-gray-100 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <router-link to="/" class="flex items-center gap-2">
            <img src="/logo.svg" alt="Veciz AI" class="h-12 w-12" />
            <span class="text-2xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-transparent bg-clip-text tracking-tight">Veciz AI</span>
          </router-link>
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
          <h3 class="text-lg font-semibold mb-4">{{ languageStore.t('footer.about.title') }}</h3>
          <p class="text-gray-600">
            {{ languageStore.t('footer.about.description') }}
          </p>
        </div>
        <div>
          <h3 class="text-lg font-semibold mb-4">{{ languageStore.t('footer.quickLinks.title') }}</h3>
          <ul class="space-y-2">
            <li>
              <a href="/" class="text-accent hover:underline">{{ languageStore.t('footer.quickLinks.home') }}</a>
            </li>
          </ul>
        </div>
        <div>
          <h3 class="text-lg font-semibold mb-4">{{ languageStore.t('footer.contact.title') }}</h3>
          <p class="text-gray-600">
            {{ languageStore.t('footer.contact.description') }}
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
        :class="languageStore.currentLocale === 'tr' ? 'bg-accent text-white' : 'text-gray-600 hover:bg-gray-100'"
      >
        TR
      </button>
      <button
        @click="switchLanguage('en')"
        class="px-3 py-1.5 rounded-md text-sm font-medium"
        :class="languageStore.currentLocale === 'en' ? 'bg-accent text-white' : 'text-gray-600 hover:bg-gray-100'"
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
