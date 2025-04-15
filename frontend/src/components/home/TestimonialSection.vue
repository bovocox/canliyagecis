<script setup lang="ts">
import { useLanguageStore } from '../../stores/languageStore';
import { computed } from 'vue';

const languageStore = useLanguageStore();

// Referanslar için veri modeli - computed olarak tanımlıyoruz
const testimonials = computed(() => [
  {
    id: 1,
    name: languageStore.t('home.testimonials.testimonials.felix.name'),
    role: languageStore.t('home.testimonials.testimonials.felix.role'),
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    content: languageStore.t('home.testimonials.testimonials.felix.content'),
    color: 'from-indigo-500 to-purple-600'
  },
  {
    id: 2,
    name: languageStore.t('home.testimonials.testimonials.sarah.name'),
    role: languageStore.t('home.testimonials.testimonials.sarah.role'),
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
    content: languageStore.t('home.testimonials.testimonials.sarah.content'),
    color: 'from-fuchsia-500 to-pink-600'
  },
  {
    id: 3,
    name: languageStore.t('home.testimonials.testimonials.michael.name'),
    role: languageStore.t('home.testimonials.testimonials.michael.role'),
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael',
    content: languageStore.t('home.testimonials.testimonials.michael.content'),
    color: 'from-cyan-500 to-blue-600'
  }
]);
</script>

<template>
  <div class="py-16 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-12">
        <h2 class="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">{{ languageStore.t('home.testimonials.title') }}</h2>
        <div class="w-24 h-1 bg-gradient-to-r from-indigo-500 to-purple-600 mx-auto rounded-full"></div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <!-- Testimonial Cards -->
        <div 
          v-for="testimonial in testimonials" 
          :key="testimonial.id"
          class="bg-gray-50 rounded-2xl p-8 relative"
        >
          <div 
            class="absolute -top-4 -right-4 w-8 h-8 bg-gradient-to-br rounded-full flex items-center justify-center shadow-lg"
            :class="testimonial.color"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div class="flex items-center gap-4 mb-6">
            <img :src="testimonial.avatar" :alt="testimonial.name" class="w-12 h-12 rounded-full ring-4 ring-white" />
            <div>
              <h3 class="font-semibold text-gray-900">{{ testimonial.name }}</h3>
              <p class="text-sm text-gray-600">{{ testimonial.role }}</p>
            </div>
          </div>
          <p class="text-gray-600 italic">{{ testimonial.content }}</p>
        </div>
      </div>
    </div>
  </div>
</template> 