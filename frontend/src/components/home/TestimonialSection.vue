<script setup lang="ts">
import { useLanguageStore } from '../../stores/languageStore';

const languageStore = useLanguageStore();

// Referanslar için veri modeli (ileride API'den gelebilir)
const testimonials = [
  {
    id: 1,
    name: 'Felix Chen',
    role: 'Product Designer',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    content: '"This tool has completely transformed how I consume video content. The AI summaries are incredibly accurate and save me hours of time."',
    color: 'from-indigo-500 to-purple-600'
  },
  {
    id: 2,
    name: 'Sarah Johnson',
    role: 'Content Creator',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
    content: '"The transcript feature is a game-changer for content creators like me. It helps me create better content by analyzing successful videos."',
    color: 'from-fuchsia-500 to-pink-600'
  },
  {
    id: 3,
    name: 'Michael Torres',
    role: 'Student',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael',
    content: '"As a student, this tool helps me quickly understand complex topics from educational videos. The key ideas feature is particularly helpful."',
    color: 'from-cyan-500 to-blue-600'
  }
];
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