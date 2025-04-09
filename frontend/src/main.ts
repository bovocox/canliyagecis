import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import tr from './locales/tr.json'
import { useAuthStore } from './stores/auth'

// Kullanıcının dil tercihini yerel depolamadan alıyoruz
const savedLocale = localStorage.getItem('userLocale') || 'tr'

// Tarayıcı dilini algılama (isteğe bağlı)
const detectBrowserLanguage = () => {
  const browserLang = navigator.language.split('-')[0] // 'tr-TR' gibi bir değerden sadece 'tr' kısmını alıyoruz
  
  // Sadece desteklenen dilleri kontrol ediyoruz
  if (['tr', 'en'].includes(browserLang)) {
    return browserLang
  }
  
  return 'tr' // Varsayılan dil
}

// Dil tercihi yerel depolamada yoksa tarayıcı dilini kullan
const initialLocale = savedLocale || detectBrowserLanguage()

const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages: {
    en,
    tr
  }
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(i18n)

// Initialize auth store
const authStore = useAuthStore()
authStore.initializeAuth()

app.mount('#app')
