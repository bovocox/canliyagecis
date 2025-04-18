import { defineStore } from 'pinia'
import { ref } from 'vue'
// Vue i18n kullanımını kaldırıyoruz
// import { useI18n } from 'vue-i18n'
// import trMessages from '../locales/tr.json'
// import enMessages from '../locales/en.json'
import { t as translate, setLocale, getCurrentLocale, getAvailableLocales } from '../utils/translations'

// EventBus için basit bir implementasyon
const eventBus = {
  listeners: {} as Record<string, Set<Function>>,
  on(event: string, callback: Function): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    
    // Aynı callback'i birden fazla kez eklemeyi önle
    if (this.listeners[event].has(callback)) {
      console.log(`⚠️ Bu callback zaten '${event}' olayına eklenmiş, tekrar eklenmedi`);
      return () => this.off(event, callback);
    }
    
    this.listeners[event].add(callback);
    console.log(`✅ Event listener eklendi: ${event}, toplam: ${this.listeners[event].size}`);
    
    // Temizleme fonksiyonu döndür
    return () => this.off(event, callback);
  },
  off(event: string, callback: Function): void {
    if (!this.listeners[event]) return;
    this.listeners[event].delete(callback);
    console.log(`🗑️ Event listener silindi: ${event}, kalan: ${this.listeners[event].size}`);
  },
  emit(event: string, data?: any) {
    if (!this.listeners[event]) return;
    console.log(`📢 Event yayınlanıyor: ${event}, dinleyici sayısı: ${this.listeners[event].size}`);
    this.listeners[event].forEach(callback => callback(data));
  }
};

// Artık Messages tipini kaldırıyoruz
// type LocaleMessages = Record<string, any>
// 
// interface Messages {
//   [key: string]: LocaleMessages
// }

export const useLanguageStore = defineStore('language', () => {
  // Çeviri sisteminden mevcut dili alıyoruz
  const currentLocale = ref(getCurrentLocale())
  // Aynı değeri language referansında da tutuyoruz (uyumluluk için)
  const language = ref(getCurrentLocale())
  
  // Vue i18n artık kullanılmıyor
  // const i18n = useI18n()

  // Çeviri mesajlarını artık doğrudan kullanmıyoruz
  // const messages: Messages = {
  //   tr: trMessages as LocaleMessages,
  //   en: enMessages as LocaleMessages
  // }

  // Çeviri fonksiyonu artık doğrudan utils/translations'dan gelen t fonksiyonunu kullanıyor
  function t(key: string, replacements: Record<string, string> = {}) {
    return translate(key, replacements)
  }

  function setLanguage(lang: string, shouldReload: boolean = false) {
    // Sadece desteklenen diller için işlem yapıyoruz
    if (lang === 'tr' || lang === 'en') {
      console.log(`🌐 Dil değiştiriliyor: ${lang}, Yeniden Yükleme: ${shouldReload ? 'Evet' : 'Hayır'}`);
      console.log(`🌐 Mevcut URL:`, window.location.href);
      
      // Mevcut dili güncelliyoruz
      currentLocale.value = lang;
      language.value = lang;
      
      // Çeviri sistemindeki dili değiştiriyoruz
      setLocale(lang as 'tr' | 'en');
      
      // Kullanıcının tercihini local storage'a kaydedelim
      localStorage.setItem('userLocale', lang);
      
      console.log(`✅ Dil değiştirildi: ${lang}, currentLocale: ${currentLocale.value}, Locale in Storage: ${localStorage.getItem('userLocale')}`);
      
      // Dil değişikliği olayını yayınla
      eventBus.emit('language-changed', lang);
      
      // Refresh işlemini kaldırdık - asla sayfa yenilemesi olmayacak 
      // Bunun yerine sayfaya özel işlemler Vue bileşenlerinin içinde onLanguageChange ile yapılacak
      console.log('📢 Sayfa yenilemeden dil değişikliği uygulandı');
    } else {
      console.warn(`⚠️ Desteklenmeyen dil: ${lang}`);
    }
  }

  /**
   * Dil değişikliği olayını dinlemek için kullanılır.
   * Temizleme fonksiyonu döndürür - bileşen unmount olduğunda bu fonksiyon çağrılmalıdır.
   */
  function onLanguageChange(callback: (lang: string) => void): () => void {
    return eventBus.on('language-changed', callback);
  }

  return {
    currentLocale,
    language,
    t,
    setLanguage,
    onLanguageChange
  }
})