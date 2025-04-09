<script setup lang="ts">
import { useLanguageStore } from '../../stores/languageStore';

const languageStore = useLanguageStore();

defineProps<{
  showModal: boolean;
  selectedLanguage: string;
}>();

const emit = defineEmits<{
  'close': [];
  'select-language': [language: string];
}>();

const closeModal = () => {
  emit('close');
};

const selectLanguage = (language: string) => {
  emit('select-language', language);
};
</script>

<template>
  <div v-if="showModal" 
       class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
       @click.self="closeModal">
    <div class="bg-white rounded-xl w-full max-w-sm mx-4 p-4 sm:p-6">
      <h2 class="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-4">
        {{ languageStore.t('home.language.selectTitle') }}
      </h2>
      <p class="text-sm text-gray-600 mb-4 sm:mb-6">
        {{ languageStore.t('home.language.selectDescription') }}
      </p>
      <div class="flex flex-col gap-3">
        <button
          @click="selectLanguage('tr')"
          class="flex items-center gap-3 p-4 rounded-xl border-2 hover:border-indigo-500 transition-colors"
          :class="{ 'border-indigo-500 bg-indigo-50': selectedLanguage === 'tr', 'border-gray-200': selectedLanguage !== 'tr' }"
        >
          <span class="text-2xl">🇹🇷</span>
          <span class="text-base font-medium">Türkçe</span>
        </button>
        <button
          @click="selectLanguage('en')"
          class="flex items-center gap-3 p-4 rounded-xl border-2 hover:border-indigo-500 transition-colors"
          :class="{ 'border-indigo-500 bg-indigo-50': selectedLanguage === 'en', 'border-gray-200': selectedLanguage !== 'en' }"
        >
          <span class="text-2xl">🇬🇧</span>
          <span class="text-base font-medium">English</span>
        </button>
      </div>
      <button
        @click="closeModal"
        class="mt-4 sm:mt-6 w-full px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-50"
      >
        {{ languageStore.t('common.cancel') }}
      </button>
    </div>
  </div>
</template> 