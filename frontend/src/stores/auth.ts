import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, Provider } from '@supabase/supabase-js'
import { supabase } from '../config/supabase'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(false)
  const error = ref<Error | null>(null)
  const session = ref<{ access_token: string } | null>(null)

  const isAuthenticated = computed(() => !!user.value)

  function setUser(newUser: User | null) {
    user.value = newUser
  }

  function setSession(newSession: { access_token: string } | null) {
    session.value = newSession
  }

  function setLoading(value: boolean) {
    loading.value = value
  }

  function setError(value: Error | null) {
    error.value = value
  }

  // Get current session
  function getSession() {
    return session.value
  }

  async function login() {
    try {
      loading.value = true
      error.value = null
      
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (signInError) throw signInError
      
    } catch (err) {
      error.value = err as Error
      console.error('Login error:', err)
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      loading.value = true
      error.value = null
      
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError

      user.value = null
      session.value = null
    } catch (err) {
      error.value = err as Error
      console.error('Logout error:', err)
    } finally {
      loading.value = false
    }
  }

  async function checkUser() {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (currentSession) {
        setUser(currentSession.user)
        setSession({ access_token: currentSession.access_token })
        return true
      }
      
      return false
    } catch (err) {
      console.error('Error checking user:', err)
      return false
    }
  }

  async function initializeAuth() {
    try {
      await checkUser()
    } catch (err) {
      console.error('Error initializing auth:', err)
    }
  }

  return {
    user,
    loading,
    error,
    session,
    isAuthenticated,
    setUser,
    setSession,
    setLoading,
    setError,
    login,
    logout,
    initializeAuth,
    checkUser,
    getSession
  }
}) 