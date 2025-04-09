import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import trMessages from '../locales/tr.json'
import enMessages from '../locales/en.json'

type LocaleMessages = Record<string, any>

type Messages = {
  [key: string]: LocaleMessages
}

export const useLanguageStore = defineStore('language', () => {
  const currentLocale = ref('tr')
  const language = ref('tr')
  const i18n = useI18n()

  const messages: Messages = {
    tr: trMessages as LocaleMessages,
    en: enMessages as LocaleMessages
  }

  function t(key: string) {
    // Öncelikle Vue i18n'i kullanmayı deneyelim
    const i18nMessage = i18n.t(key)
    
    // Eğer Vue i18n bir mesaj döndürmezse (key ile aynıysa), 
    // kendi implementasyonumuzu kullanalım
    if (i18nMessage !== key) {
      return i18nMessage
    }
    
    const keys = key.split('.')
    let result: any = messages[currentLocale.value]
    for (const k of keys) {
      if (result[k] === undefined) {
        console.warn(`Translation key not found: ${key}`)
        return key
      }
      result = result[k]
    }
    return result
  }

  function setLanguage(lang: string) {
    currentLocale.value = lang
    language.value = lang
    
    // Vue i18n'i de güncelleyelim
    i18n.locale.value = lang
    
    // Kullanıcının tercihini local storage'a kaydedelim
    localStorage.setItem('userLocale', lang)
  }

  return {
    currentLocale,
    language,
    messages,
    t,
    setLanguage
  }
})