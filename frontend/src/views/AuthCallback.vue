<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { logger } from '@/utils/logger'

const router = useRouter()
const authStore = useAuthStore()

onMounted(async () => {
  try {
    logger.info('Auth callback mounted, checking session...')
    
    // Get hash fragment from URL if exists
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const accessToken = hashParams.get('access_token')
    
    if (accessToken) {
      logger.info('Found access token in URL')
    }
    
    await authStore.checkUser()
    
    if (authStore.user) {
      logger.info('User authenticated, redirecting to channels', {
        userId: authStore.user.id,
        email: authStore.user.email
      })
      router.push('/channels')
    } else {
      logger.error('No user found after auth callback')
      router.push('/')
    }
  } catch (error) {
    logger.error('Error in auth callback:', error)
    router.push('/')
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="text-center">
      <h2 class="text-2xl font-semibold mb-4">Giriş yapılıyor...</h2>
      <div class="animate-spin rounded-full h-12 w-12 border-4 border-accent border-t-transparent mx-auto"></div>
    </div>
  </div>
</template> 