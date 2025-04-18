import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import { useAuthStore } from './stores/auth'

// Element Plus bileşenlerini import ediyoruz
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

// Artık i18n yapılandırmasını kullanmayacağız
// const savedLocale = localStorage.getItem('userLocale') || 'tr'
// const detectBrowserLanguage = () => {
//   const browserLang = navigator.language.split('-')[0]
//   
//   if (['tr', 'en'].includes(browserLang)) {
//     return browserLang
//   }
//   
//   return 'tr'
// }
// const initialLocale = savedLocale || detectBrowserLanguage()
// 
// const i18n = createI18n({
//   legacy: false,
//   locale: initialLocale,
//   fallbackLocale: 'en',
//   messages: {
//     en,
//     tr
//   }
// })

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
// app.use(i18n) // i18n eklentisini kaldırıyoruz
app.use(ElementPlus) // Element Plus'ı uygulamaya ekliyoruz

// Initialize auth store
const authStore = useAuthStore()
authStore.initializeAuth()

app.mount('#app')
