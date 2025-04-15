// Çeviriler için basit bir TypeScript dosyası
// Tüm diller ve çevirileri burada bulunacak

// Dil tipi
type Locale = 'tr' | 'en';

// Çeviriler için interface
interface TranslationTree {
  [key: string]: string | TranslationTree;
}

// Çevirileri içeren nesne
const translations: Record<Locale, TranslationTree> = {
  tr: {
    common: {
      add: "Ekle",
      loading: "Yükleniyor...",
      loadingSummary: "Özet yükleniyor...",
      user: "Kullanıcı",
      userInitial: "K",
      views: "görüntülenme",
      signOut: "Çıkış Yap",
      signInWithGoogle: "Google ile Giriş Yap",
      justNow: "Az önce",
      timeAgo: "{count} {unit} önce",
      comingSoon: "Yakında",
      time: {
        minute: "dakika",
        hour: "saat",
        day: "gün",
        week: "hafta",
        month: "ay",
        year: "yıl"
      },
      error: "Hata",
      errors: {
        notAuthenticated: "Lütfen önce giriş yapın",
        connectionError: "Bağlantı hatası oluştu",
        unknownError: "Bilinmeyen bir hata oluştu"
      },
      back: "Geri",
      retry: "Tekrar Dene",
      share: "Paylaş",
      download: "İndir",
      watchOnYoutube: "YouTube'da İzle",
      cancel: "İptal",
      save: "Kaydet",
      delete: "Sil",
      edit: "Düzenle",
      search: "Ara...",
      siteTitle: "Veciz AI - Video Özetleme",
      loadingTranscript: "Transkript yükleniyor..."
    },
    navigation: {
      home: "Ana Sayfa",
      summaries: "Özetler",
      channels: "Kanallar"
    },
    home: {
      banner: {
        title: "Videoları Yapay Zeka ile Özetleyin",
        subtitle: "Favori kanallarınızı takip edin, günlük özetlerle hiçbir içeriği kaçırmayın"
      },
      howItWorks: {
        title: "Nasıl Çalışır?",
        steps: {
          step1: {
            title: "Hesap Oluşturun",
            description: "Google hesabınızla hızlıca kayıt olun"
          },
          step2: {
            title: "Kanal Ekleyin",
            description: "Takip etmek istediğiniz YouTube kanallarını ekleyin"
          },
          step3: {
            title: "Otomatik Takip",
            description: "Sistemimiz günde 3 kez kanalları kontrol eder ve yeni videoları tespit eder"
          },
          step4: {
            title: "Yapay Zeka Özeti",
            description: "Yeni videolar yapay zeka ile analiz edilir ve özetlenir"
          },
          step5: {
            title: "Hazır Özetler",
            description: "Özetleri hesabınızdan okuyun veya e-posta ile alın"
          }
        }
      },
      search: {
        placeholder: "YouTube video URL'sini girin",
        button: "Ara"
      },
      tabs: {
        summary: "Özet",
        summaryShort: "Özet",
        transcript: "Transkript",
        transcriptShort: "Yazı",
        listen: "Dinle",
        listenShort: "Dinle"
      },
      summary: {
        title: "Özet",
        loading: "Özet hazırlanıyor...",
        empty: "Henüz bir özet bulunmuyor",
        detailButton: "Detaylı Özeti Görüntüle",
        completedSummaries: "Tamamlanmış Özetler",
        noSummaries: "Henüz özet bulunmuyor. Bir video araması yaparak özet oluşturabilirsiniz.",
        watchVideo: "Videoyu İzle",
        modal: {
          title: "Video Detayları",
          sections: {
            overview: "Genel Bakış",
            keyPoints: "Ana Noktalar",
            quotes: "Önemli Alıntılar"
          }
        }
      },
      transcript: {
        title: "Transkript",
        empty: "Bu video için transkript bulunmuyor",
        loading: "Transkript yükleniyor...",
        detailButton: "Detayları Gör",
        modal: {
          title: "Video Transkripti"
        }
      },
      listen: {
        description: "Videoyu sesli olarak dinleyebilirsiniz",
        playButton: "Dinlemeye Başla",
        button: "Dinle"
      },
      features: {
        title: "Özellikler",
        channelTracking: {
          title: "Kanal Takibi",
          description: "Favori YouTube kanallarınızı takip edin ve yeni videolardan haberdar olun."
        },
        instantSummaries: {
          title: "Anında Özetler",
          description: "Yüklenen her yeni video için anında özet alın."
        },
        smartSummaries: {
          title: "Akıllı Özetler",
          description: "Yapay zeka ile oluşturulmuş, önemli noktaları vurgulayan özetler."
        },
        multilingual: {
          title: "Çoklu Dil Desteği",
          description: "Özetleri istediğiniz dilde okuyun ve anlayın"
        },
        keyIdeas: {
          title: "Ana Fikirler",
          description: "Videoların ana fikirlerini hızlıca kavrayın"
        },
        transcripts: {
          title: "Transkriptler",
          description: "Video içeriğini metin olarak okuyun"
        }
      },
      testimonials: {
        title: "Kullanıcı Yorumları",
        testimonials: {
          felix: {
            name: "Ahmet Yılmaz",
            role: "Ürün Tasarımcısı",
            content: "\"Bu araç, video içeriklerini tüketme şeklimi tamamen değiştirdi. Yapay zeka özetleri inanılmaz derecede doğru ve bana saatlerce zaman kazandırıyor.\""
          },
          sarah: {
            name: "Zeynep Kaya",
            role: "İçerik Üreticisi",
            content: "\"Transkript özelliği benim gibi içerik üreticileri için oyun değiştirici. Başarılı videoları analiz ederek daha iyi içerik oluşturmama yardımcı oluyor.\""
          },
          michael: {
            name: "Mehmet Demir",
            role: "Öğrenci",
            content: "\"Bir öğrenci olarak, bu araç eğitim videolarından karmaşık konuları hızlıca anlamama yardımcı oluyor. Özellikle ana fikirler özelliği çok faydalı.\""
          }
        }
      },
      processing: {
        status: "Video işleniyor...",
        timeEstimate: "Bu işlem sürece göre 3-4 dakika sürebilir",
        processingChapter: "{chapter} bölümü işleniyor",
        chapters: "bölüm",
        processingChapters: "Bölümler İşleniyor",
        chaptersCompleted: "bölüm tamamlandı",
        fetchingInfo: "Video bilgileri alınıyor...",
        creatingTranscript: "Video transkripti oluşturuluyor...",
        creatingSummary: "Özet çıkarılıyor...",
        savingResults: "Sonuçlar kaydediliyor..."
      },
      language: {
        selectTitle: "Dil Seçin",
        selectDescription: "Uygulamayı kullanmak istediğiniz dili seçin."
      },
      footer: {
        about: {
          title: "Hakkımızda",
          description: "Veciz AI, YouTube video transkriptleri ve özetleri oluşturmak için tasarlanmış yapay zeka destekli bir araçtır."
        },
        quickLinks: {
          title: "Hızlı Bağlantılar",
          home: "Ana Sayfa",
          about: "Hakkımızda"
        },
        contact: {
          title: "İletişim",
          description: "Sorularınız veya geri bildirimleriniz için bize e-posta gönderin.",
          email: "support@veciz.ai"
        }
      }
    },
    summaries: {
      title: "Video Özetlerim",
      filters: {
        all: "Tümü",
        today: "Bugün",
        week: "Bu Hafta",
        month: "Bu Ay"
      },
      language: "Dil",
      languages: {
        all: "Tümü",
        tr: "Türkçe",
        en: "İngilizce"
      },
      groups: {
        today: "Bugün",
        yesterday: "Dün",
        thisWeek: "Bu Hafta",
        thisMonth: "Bu Ay",
        older: "Daha Eski"
      },
      status: {
        read: "Okundu",
        unread: "Okunmadı"
      },
      actions: {
        markAsRead: "Okundu Olarak İşaretle",
        download: "İndir",
        share: "Paylaş",
        listen: "Dinle",
        watchOnYoutube: "YouTube'da İzle",
        delete: "Sil"
      },
      noSummaries: "Henüz özet bulunmuyor",
      feedback: {
        title: "Özeti Değerlendir",
        rating: {
          notRated: "Henüz değerlendirilmedi",
          rated: "{rating}/5 yıldız"
        },
        comment: {
          label: "Yorumunuz",
          placeholder: "Bu özet hakkında ne düşünüyorsunuz?"
        },
        submit: "Geri Bildirim Gönder",
        submitSuccess: "Değerlendirmeniz için teşekkürler!"
      },
      errors: {
        deleteFailed: "Özet silinemedi"
      },
      channels: {
        title: "Kanal",
        all: "Tüm Kanallar",
        noSummariesForChannel: "Bu kanal için seçilen filtrelerde özet bulunamadı. Filtreleri değiştirerek tekrar deneyin.",
        addChannel: "Kanal Ekle"
      }
    },
    channels: {
      info: {
        title: "YouTube Kanallarınızı Ekleyin",
        description: "Takip etmek istediğiniz YouTube kanallarını ekleyin. Kanal URL'sini veya @kullanıcıadı formatını kullanabilirsiniz.",
        steps: {
          step1: "Kanal URL'sini veya @kullanıcıadı'nı girin",
          step2: "Ekle butonuna tıklayın",
          step3: "Kanal otomatik olarak takip listesine eklenecek",
          step4: "Yeni videolar yüklendiğinde bildirim alacaksınız"
        }
      },
      title: "YouTube Kanalları",
      addChannel: "Kanal Ekle",
      urlPlaceholder: "YouTube kanal URL'sini girin",
      subscribers: "abone",
      videos: "video",
      views: "görüntülenme",
      latestVideos: "Son Videolar",
      empty: {
        title: "Henüz kanal yok",
        description: "Başlamak için ilk YouTube kanalınızı ekleyin"
      },
      language: {
        selectTitle: "Özet Dili Seçin",
        selectDescription: "Bu kanal için özetlerin hangi dilde oluşturulmasını istiyorsunuz?",
        updated: "Kanal dil tercihi güncellendi"
      },
      actions: {
        view: "Özeti Görüntüle",
        remove: "Kaldır"
      },
      channelDetails: {
        statistics: {
          subscribers: "Abone Sayısı",
          videos: "Video Sayısı",
          views: "Görüntülenme Sayısı"
        },
        back: "Kanallara Geri Dön"
      },
      features: {
        notifications: {
          title: "Bildirimler",
          description: "Yeni video yüklendiğinde anında haberdar olun"
        },
        ai: {
          title: "Yapay Zeka Özetleri",
          description: "Video içeriklerini yapay zeka ile özetleyin"
        },
        email: {
          title: "E-posta Bildirimleri",
          description: "Günlük veya haftalık özet e-postaları alın"
        }
      }
    }
  },
  en: {
    common: {
      add: "Add",
      loading: "Loading...",
      loadingSummary: "Loading summary...",
      summaryTimeout: "Summary generation timed out",
      user: "User",
      userInitial: "U",
      views: "views",
      signOut: "Sign Out",
      signInWithGoogle: "Sign in with Google",
      justNow: "Just now",
      timeAgo: "{count} {unit} ago",
      comingSoon: "Coming Soon",
      time: {
        minute: "minute | minutes",
        hour: "hour | hours",
        day: "day | days",
        week: "week | weeks",
        month: "month | months",
        year: "year | years"
      },
      errors: {
        notAuthenticated: "Please sign in first",
        connectionError: "Connection error occurred",
        unknownError: "An unknown error occurred"
      },
      back: "Back",
      retry: "Try Again",
      share: "Share",
      download: "Download",
      watchOnYoutube: "Watch on YouTube",
      cancel: "Cancel",
      save: "Save",
      delete: "Delete",
      edit: "Edit",
      search: "Search...",
      siteTitle: "Veciz AI - Video Summarization",
      loadingTranscript: "Loading transcript..."
    },
    navigation: {
      home: "Home",
      summaries: "Summaries",
      channels: "Channels"
    },
    home: {
      banner: {
        title: "Discover Videos with AI",
        subtitle: "Follow your favorite channels, never miss content with daily summaries"
      },
      howItWorks: {
        title: "How It Works",
        steps: {
          step1: {
            title: "Create Account",
            description: "Quickly sign up with your Google account"
          },
          step2: {
            title: "Add Channels",
            description: "Add YouTube channels you want to follow"
          },
          step3: {
            title: "Automatic Tracking",
            description: "Our system checks channels 3 times daily and detects new videos"
          },
          step4: {
            title: "AI Summary",
            description: "New videos are analyzed and summarized with artificial intelligence"
          },
          step5: {
            title: "Ready Summaries",
            description: "Read summaries in your account or receive them via email"
          }
        }
      },
      search: {
        placeholder: "Enter YouTube video URL",
        button: "Search"
      },
      tabs: {
        summary: "Summary",
        summaryShort: "Summary",
        transcript: "Transcript",
        transcriptShort: "Text",
        listen: "Listen",
        listenShort: "Listen"
      },
      summary: {
        title: "Summary",
        loading: "Preparing summary...",
        empty: "No summary available yet",
        detailButton: "View Detailed Summary",
        completedSummaries: "Completed Summaries",
        noSummaries: "No summaries yet. You can create one by searching for a video.",
        watchVideo: "Watch Video",
        modal: {
          title: "Video Details",
          sections: {
            overview: "Overview",
            keyPoints: "Key Points",
            quotes: "Important Quotes"
          }
        }
      },
      transcript: {
        title: "Transcript",
        empty: "No transcript available for this video",
        loading: "Loading transcript...",
        detailButton: "View Details",
        modal: {
          title: "Video Transcript"
        }
      },
      listen: {
        description: "You can listen to the video audio",
        playButton: "Start Listening",
        button: "Listen"
      },
      features: {
        title: "Features",
        channelTracking: {
          title: "Channel Tracking",
          description: "Follow your favorite YouTube channels and stay updated with new videos."
        },
        instantSummaries: {
          title: "Instant Summaries",
          description: "Get summaries instantly for each new uploaded video."
        },
        smartSummaries: {
          title: "Smart Summaries",
          description: "AI-generated summaries highlighting the most important points."
        },
        multilingual: {
          title: "Multilingual Support",
          description: "Read and understand summaries in your preferred language"
        },
        keyIdeas: {
          title: "Key Ideas",
          description: "Quickly grasp the main ideas of videos"
        },
        transcripts: {
          title: "Transcripts",
          description: "Read video content as text"
        }
      },
      testimonials: {
        title: "User Testimonials",
        testimonials: {
          felix: {
            name: "Felix Chen",
            role: "Product Designer",
            content: "\"This tool has completely transformed how I consume video content. The AI summaries are incredibly accurate and save me hours of time.\""
          },
          sarah: {
            name: "Sarah Johnson",
            role: "Content Creator",
            content: "\"The transcript feature is a game-changer for content creators like me. It helps me create better content by analyzing successful videos.\""
          },
          michael: {
            name: "Michael Torres",
            role: "Student",
            content: "\"As a student, this tool helps me quickly understand complex topics from educational videos. The key ideas feature is particularly helpful.\""
          }
        }
      },
      processing: {
        status: "Processing video...",
        timeEstimate: "This process may take a few minutes",
        processingChapter: "Processing {chapter} chapter",
        chapters: "chapter",
        processingChapters: "Processing Chapters",
        chaptersCompleted: "chapters completed",
        fetchingInfo: "Fetching video information...",
        creatingTranscript: "Creating video transcript...",
        creatingSummary: "Generating summary...",
        savingResults: "Saving results..."
      },
      language: {
        selectTitle: "Select Language",
        selectDescription: "Choose the language you want to use the application in."
      },
      footer: {
        about: {
          title: "About Us",
          description: "Veciz AI is an AI-powered tool designed to generate YouTube video transcripts and summaries."
        },
        quickLinks: {
          title: "Quick Links",
          home: "Home",
          about: "About"
        },
        contact: {
          title: "Contact",
          description: "Send us an email for any questions or feedback.",
          email: "support@veciz.ai"
        }
      }
    },
    summaries: {
      title: "My Video Summaries",
      filters: {
        all: "All Summaries",
        today: "Today",
        week: "This Week",
        month: "This Month"
      },
      language: "Language",
      languages: {
        all: "All",
        tr: "Turkish",
        en: "English"
      },
      actions: {
        markAsRead: "Mark as Read",
        markAsUnread: "Mark as Unread",
        read: "Read",
        unread: "Unread",
        download: "Download",
        share: "Share",
        listen: "Listen",
        watchOnYoutube: "Watch on YouTube",
        delete: "Delete"
      },
      status: {
        read: "Read",
        unread: "Unread"
      },
      noSummaries: "No summaries yet",
      feedback: {
        title: "Rate Summary",
        rating: {
          rated: "You rated {rating} stars",
          notRated: "Not rated yet"
        },
        comment: {
          label: "Your Comment",
          placeholder: "What do you think about this summary?"
        },
        submit: "Submit Feedback",
        submitSuccess: "Thank you for your feedback!"
      },
      errors: {
        deleteFailed: "Failed to delete summary"
      },
      channels: {
        title: "Channel",
        all: "All Channels",
        noSummariesForChannel: "No summaries found for this channel with the selected filters. Try changing the filters.",
        addChannel: "Add Channel"
      }
    },
    channels: {
      info: {
        title: "Add Your YouTube Channels",
        description: "Add the YouTube channels you want to follow. You can use the channel URL or @username format.",
        steps: {
          step1: "Enter channel URL or @username",
          step2: "Click the Add button",
          step3: "Channel will be automatically added to your follow list",
          step4: "You'll receive notifications when new videos are uploaded"
        }
      },
      title: "YouTube Channels",
      addChannel: "Add Channel",
      urlPlaceholder: "Enter YouTube channel URL",
      subscribers: "subscribers",
      videos: "videos",
      views: "views",
      latestVideos: "Latest Videos",
      empty: {
        title: "No channels yet",
        description: "Add your first YouTube channel to get started"
      },
      language: {
        selectTitle: "Select Summary Language",
        selectDescription: "Which language would you like summaries to be generated in for this channel?",
        updated: "Channel language preference updated"
      },
      actions: {
        view: "View Summary",
        remove: "Remove"
      },
      channelDetails: {
        statistics: {
          subscribers: "Subscribers",
          videos: "Videos",
          views: "Views"
        },
        back: "Back to Channels"
      },
      features: {
        notifications: {
          title: "Notifications",
          description: "Get instant notifications when new videos are uploaded"
        },
        ai: {
          title: "AI Summaries",
          description: "Summarize video content with artificial intelligence"
        },
        email: {
          title: "Email Notifications",
          description: "Receive daily or weekly digest emails"
        }
      }
    }
  }
};

// İlk başlangıç dili
let currentLocale: Locale = 'tr';

// Kullanıcı tarayıcı dilini tespit eden yardımcı fonksiyon
const detectBrowserLanguage = (): Locale => {
  const browserLang = navigator.language.split('-')[0];
  return (browserLang === 'tr' || browserLang === 'en') ? browserLang as Locale : 'tr';
};

// Kayıtlı dil tercihi veya tarayıcı dilini yükle
const loadSavedLocale = (): Locale => {
  const savedLocale = localStorage.getItem('userLocale');
  if (savedLocale === 'tr' || savedLocale === 'en') {
    return savedLocale as Locale;
  }
  return detectBrowserLanguage();
};

// Dil ayarını değiştirme fonksiyonu
export const setLocale = (locale: Locale): void => {
  currentLocale = locale;
  localStorage.setItem('userLocale', locale);
};

// İlk dil tercihi
currentLocale = loadSavedLocale();

// Çeviri alma fonksiyonu
export const t = (key: string, replacements: Record<string, string> = {}): string => {
  // Nokta notasyonu ile iç içe geçmiş anahtarları ayır
  const keys = key.split('.');
  let value: any = translations[currentLocale];
  
  // Anahtarı adım adım takip et
  for (const k of keys) {
    if (!value || typeof value[k] === 'undefined') {
      console.warn(`Translation key not found: ${key}`);
      return key; // Çeviri bulunamazsa anahtar döndür
    }
    value = value[k];
  }
  
  // Eğer sonuç bir string değilse hata ver
  if (typeof value !== 'string') {
    console.warn(`Translation value for ${key} is not a string`);
    return key;
  }
  
  // Yer değiştirmeleri uygula
  let result = value;
  Object.entries(replacements).forEach(([placeholder, replacement]) => {
    result = result.replace(`{${placeholder}}`, replacement);
  });
  
  return result;
};

// Mevcut dili al
export const getCurrentLocale = (): Locale => currentLocale;

// Kullanılabilir dilleri al
export const getAvailableLocales = (): Locale[] => Object.keys(translations) as Locale[];

// Tüm çevirileri export et (genişletmek için)
export { translations }; 