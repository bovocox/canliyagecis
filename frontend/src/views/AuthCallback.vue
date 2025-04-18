<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { logger } from '@/utils/logger'
import { supabase } from '../config/supabase'

const router = useRouter()
const authStore = useAuthStore()

onMounted(async () => {
  try {
    logger.info('Auth callback mounted, checking session...')
    
    // Handle the OAuth callback
    const { data, error } = await supabase.auth.getSession()
    
    if (error) {
      throw error
    }
    
    if (data?.session) {
      logger.info('Session found, setting user...')
      authStore.setUser(data.session.user)
      authStore.setSession({ access_token: data.session.access_token })
      
      logger.info('User authenticated, redirecting to channels', {
        userId: data.session.user.id,
        email: data.session.user.email
      })
      router.push('/channels')
    } else {
      logger.error('No session found after auth callback')
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