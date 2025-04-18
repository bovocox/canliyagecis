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

    // Get the URL hash
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const error = hashParams.get('error')
    const errorDescription = hashParams.get('error_description')

    if (error) {
      logger.error('Auth error:', { error, errorDescription })
      throw new Error(errorDescription || error)
    }

    // Let Supabase handle the auth response
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      logger.error('Supabase auth error:', sessionError)
      throw sessionError
    }

    if (session) {
      logger.info('Session found, setting user...', {
        userId: session.user.id,
        email: session.user.email
      })

      authStore.setUser(session.user)
      authStore.setSession({ access_token: session.access_token })

      // Clear URL fragments and parameters
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      )

      logger.info('User authenticated, redirecting to channels')
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