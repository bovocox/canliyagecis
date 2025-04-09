import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import AuthCallback from '../views/AuthCallback.vue'
import ChannelsView from '../views/ChannelsView.vue'
import SummariesView from '../views/SummariesView.vue'
import ChannelDetailView from '../views/ChannelDetailView.vue'
import { useAuthStore } from '@/stores/auth'
import { logger } from '@/utils/logger'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: AuthCallback
    },
    {
      path: '/channels',
      name: 'channels',
      component: ChannelsView,
      meta: { requiresAuth: true }
    },
    {
      path: '/summaries',
      name: 'summaries',
      component: SummariesView,
      meta: { requiresAuth: true }
    },
    {
      path: '/channels/:id',
      name: 'channelDetail',
      component: ChannelDetailView,
      meta: { requiresAuth: true }
    }
  ]
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  
  logger.info('Route navigation:', {
    to: to.path,
    from: from.path,
    requiresAuth: to.meta.requiresAuth
  })

  // Auth callback route'unu her zaman izin ver
  if (to.name === 'auth-callback') {
    logger.info('Allowing auth callback route')
    next()
    return
  }

  // Protected route'lar için auth kontrolü
  if (to.meta.requiresAuth) {
    logger.info('Protected route, checking auth...')
    await authStore.checkUser()
    
    if (!authStore.user) {
      logger.info('No authenticated user, redirecting to home')
      next('/')
      return
    }
  }
  
  next()
})

export default router 