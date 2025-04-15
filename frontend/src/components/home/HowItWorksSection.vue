<script setup lang="ts">
import { useLanguageStore } from '../../stores/languageStore';
import { computed } from 'vue';

const languageStore = useLanguageStore();

// Steps data'yı computed property olarak tanımlayalım, böylece dil değiştiğinde reaktif olarak güncellenecek
const steps = computed(() => [
  {
    id: 1,
    step: 1,
    title: languageStore.t('home.howItWorks.steps.step1.title'),
    description: languageStore.t('home.howItWorks.steps.step1.description'),
    color: 'from-indigo-500 to-purple-500',
    bgColor: 'from-indigo-100 to-purple-100'
  },
  {
    id: 2,
    step: 2,
    title: languageStore.t('home.howItWorks.steps.step2.title'),
    description: languageStore.t('home.howItWorks.steps.step2.description'),
    color: 'from-purple-500 to-pink-500',
    bgColor: 'from-purple-100 to-pink-100'
  },
  {
    id: 3,
    step: 3,
    title: languageStore.t('home.howItWorks.steps.step3.title'),
    description: languageStore.t('home.howItWorks.steps.step3.description'),
    color: 'from-pink-500 to-rose-500',
    bgColor: 'from-pink-100 to-rose-100'
  },
  {
    id: 4,
    step: 4,
    title: languageStore.t('home.howItWorks.steps.step4.title'),
    description: languageStore.t('home.howItWorks.steps.step4.description'),
    color: 'from-rose-500 to-orange-500',
    bgColor: 'from-rose-100 to-orange-100'
  },
  {
    id: 5,
    step: 5,
    title: languageStore.t('home.howItWorks.steps.step5.title'),
    description: languageStore.t('home.howItWorks.steps.step5.description'),
    color: 'from-orange-500 to-yellow-500',
    bgColor: 'from-orange-100 to-yellow-100'
  }
]);
</script>

<template>
  <div class="max-w-7xl mx-auto mb-16 px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-12">
      <h2 class="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
        {{ languageStore.t('home.howItWorks.title') }}
      </h2>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
      <div 
        v-for="step in steps" 
        :key="step.id"
        class="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 relative overflow-hidden group"
      >
        <div 
          class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br rounded-bl-[100%] -z-10 group-hover:scale-150 transition-transform duration-500"
          :class="step.bgColor"
        ></div>
        <div class="flex flex-col items-center text-center gap-4">
          <div 
            class="w-12 h-12 bg-gradient-to-br rounded-xl flex items-center justify-center text-white transform group-hover:rotate-12 transition-transform"
            :class="step.color"
          >
            {{ step.step }}
          </div>
          <h3 class="text-lg font-semibold text-gray-900">{{ step.title }}</h3>
          <p class="text-gray-600">{{ step.description }}</p>
        </div>
      </div>
    </div>
  </div>
</template> 