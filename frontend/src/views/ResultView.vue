<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const videoId = route.params.videoId as string
const isLoading = ref(true)
const error = ref('')

// Mock data for now
const videoData = ref({
  title: 'Sample Video Title',
  views: '1.2M views',
  date: 'Jan 1, 2024',
  summary: 'This is a sample summary of the video content. It will be replaced with actual data from the API.',
  keyPoints: [
    'Key point 1: Important information from the video',
    'Key point 2: Another significant point',
    'Key point 3: Final key takeaway'
  ],
  transcript: [
    { time: '0:00', text: 'Introduction to the topic' },
    { time: '1:30', text: 'Main discussion points' },
    { time: '5:45', text: 'Conclusion and summary' }
  ]
})

onMounted(async () => {
  try {
    // TODO: Fetch actual data from API
    await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate API call
    isLoading.value = false
  } catch (e) {
    error.value = 'Failed to load video data'
    isLoading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div v-if="isLoading" class="text-center py-12">
        <div class="text-2xl">Loading...</div>
      </div>

      <div v-else-if="error" class="text-center py-12">
        <div class="text-red-500">{{ error }}</div>
      </div>

      <div v-else>
        <!-- Video Embed -->
        <div class="aspect-w-16 aspect-h-9 mb-8">
          <iframe
            :src="`https://www.youtube.com/embed/${videoId}`"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            class="w-full h-full rounded-lg"
          ></iframe>
        </div>

        <!-- Video Info -->
        <div class="mb-8">
          <h1 class="text-2xl font-bold mb-2">{{ videoData.title }}</h1>
          <div class="text-gray-600 dark:text-gray-400">
            {{ videoData.views }} • {{ videoData.date }}
          </div>
        </div>

        <!-- Summary -->
        <div class="mb-8">
          <h2 class="text-xl font-semibold mb-4">Summary</h2>
          <p class="text-gray-800 dark:text-gray-200">
            {{ videoData.summary }}
          </p>
        </div>

        <!-- Key Points -->
        <div class="mb-8">
          <h2 class="text-xl font-semibold mb-4">Key Points</h2>
          <ul class="space-y-2">
            <li
              v-for="(point, index) in videoData.keyPoints"
              :key="index"
              class="text-gray-800 dark:text-gray-200"
            >
              {{ point }}
            </li>
          </ul>
        </div>

        <!-- Transcript -->
        <div>
          <h2 class="text-xl font-semibold mb-4">Transcript</h2>
          <div class="space-y-4">
            <div
              v-for="(item, index) in videoData.transcript"
              :key="index"
              class="flex"
            >
              <div class="w-20 flex-shrink-0 text-gray-500">
                {{ item.time }}
              </div>
              <div class="text-gray-800 dark:text-gray-200">
                {{ item.text }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template> 