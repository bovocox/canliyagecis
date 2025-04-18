import { ref, watch, nextTick } from 'vue'
import type { Ref } from 'vue'
import type { VideoData, VideoSummary } from '@/types/video'
import { getVideoId } from '@/utils/youtube'
import { useVideoStore } from '@/stores/videoStore'
import apiService, { type ApiResponse, type TranscriptResponse, type SummaryResponse, type VideoInfo } from './apiService'
import { useUIStore } from '@/stores/uiStore'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import type { IEvent } from '../types/eventTypes'
import { Event } from '../utils/Event'
import { useLanguageStore } from '@/stores/languageStore'
import { normalizeVideoId, getTextPreview } from '../utils/helpers'
import { loadingStateManager } from './loadingStateManager'
import pollingService from './pollingService'

// Genişletilmiş yanıt tipleri
interface ExtendedTranscriptResponse extends TranscriptResponse {
  formatted_text?: string;
}

// Genişletilmiş SummaryResponse tipi
interface ExtendedSummaryResponse extends SummaryResponse {
  id?: string;
  channel_name?: string;
  channel_avatar?: string;
  video_title?: string;
  video_thumbnail?: string;
  created_at?: string;
  video_url?: string;
  is_read?: boolean;
  language?: string;
}

// Extended API response interfaces to handle both direct and nested formats
interface ApiResponseWithData<T> {
  status: string;
  data?: T;
  [key: string]: any;
}

// Bildirim yardımcı fonksiyonları
function notifyError(message: string) {
  ElMessage({
    message,
    type: 'error',
    duration: 5000
  })
}

function notifyWarning(message: string) {
  ElMessage({
    message,
    type: 'warning',
    duration: 5000
  })
}

// Interface definitions for processing state tracking
interface VideoProcessingInfo {
  language: string;
  startTime: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

interface TranscriptEventPayload {
  videoId: string;
  status: string;
  transcript?: TranscriptResponse;
  error?: Error;
}

interface SummaryEventPayload {
  videoId: string;
  status: string;
  summary?: SummaryResponse;
  error?: Error;
}

export class VideoProcessingService {
  private static instance: VideoProcessingService | null = null;
  
  private videoData: Ref<VideoData>
  private error: Ref<string>
  private processingStatus: Ref<{
    isProcessing: boolean;
    currentStep: string;
    steps: {
      FETCHING: string;
      TRANSCRIBING: string;
      SUMMARIZING: string;
      SAVING: string;
    };
  }>
  
  // Store'ları lazy initialization için önbellek değişkenleri
  private _videoStore: ReturnType<typeof useVideoStore> | null = null;
  private _uiStore: ReturnType<typeof useUIStore> | null = null;
  private _languageStore: ReturnType<typeof useLanguageStore> | null = null;
  
  // Getter metodları - store'lara erişim gerektiğinde çağrılır
  private get videoStore(): ReturnType<typeof useVideoStore> {
    if (!this._videoStore) {
      this._videoStore = useVideoStore();
    }
    return this._videoStore;
  }
  
  private get uiStore(): ReturnType<typeof useUIStore> {
    if (!this._uiStore) {
      this._uiStore = useUIStore();
    }
    return this._uiStore;
  }
  
  private get languageStore(): ReturnType<typeof useLanguageStore> {
    if (!this._languageStore) {
      this._languageStore = useLanguageStore();
    }
    return this._languageStore;
  }
  
  // Aktif işlemin ID'sini takip etmek için
  private currentProcessingVideoId: Ref<string> = ref('')
  
  // Temizleme fonksiyonları
  private transcriptUnsubscribe: (() => void) | null = null;
  private summaryUnsubscribe: (() => void) | null = null;
  
  // Özet için aktif zamanlayıcılar
  private summaryTimeouts: Map<string, number> = new Map();

  // Maps to track video processing states
  private processingVideos: Map<string, VideoProcessingInfo> = new Map();
  private pendingLanguageChanges: Map<string, string> = new Map();
  private languageChangeThrottleTimers: Map<string, NodeJS.Timeout> = new Map();
  private isProcessingLanguageChange: boolean = false;
  
  // Event emitters
  private transcriptEvents = new Event<TranscriptEventPayload>();
  private summaryEvents = new Event<SummaryEventPayload>();

  // Durum referansları - artık loadingStateManager'a taşındı
  private get transcriptState() { return loadingStateManager.getTranscriptState().value; }
  private get summaryState() { return loadingStateManager.getSummaryState().value; }
  private get videoState() { return loadingStateManager.getVideoState().value; }

  // Event nesneleri
  private transcriptUpdated: IEvent<TranscriptEventPayload> = new Event<TranscriptEventPayload>();
  private summaryUpdated: IEvent<SummaryEventPayload> = new Event<SummaryEventPayload>();
  
  // Loading durumları - artık loadingStateManager'a taşındı
  private get transcriptLoading() { return loadingStateManager.getTranscriptLoading(); }
  private get summaryLoading() { return loadingStateManager.getSummaryLoading(); }
  
  // Hata durumları - artık loadingStateManager'a taşındı
  private get transcriptError() { return loadingStateManager.getTranscriptError(); }
  private get summaryError() { return loadingStateManager.getSummaryError(); }
  private set transcriptError(value: string | null) { loadingStateManager.setTranscriptError(value); }
  private set summaryError(value: string | null) { loadingStateManager.setSummaryError(value); }

  constructor(
    videoData: Ref<VideoData>,
    error: Ref<string>,
    processingStatus: Ref<any>
  ) {
    this.videoData = videoData;
    this.error = error;
    this.processingStatus = processingStatus;
    
    // Store'ları constructor'da direkt başlatmak yerine,
    // getter metodları aracılığıyla lazy olarak başlatacağız
    
    // Global event listener ekle - spinner bildirimini dinle
    window.addEventListener('veciz:force-close-spinners', ((event: CustomEvent) => {
      const { videoId } = event.detail;
      console.log(`🔔 [VideoProcessingService] Force close spinners event received for video: ${videoId}`);
      this.forceCloseSpinners(videoId);
    }) as EventListener);
    
    console.log('🚀 VideoProcessingService initialized');
  }

  async loadInitialVideo(videoId: string, userId: string | undefined) {
    try {
      console.log('🎬 Loading video:', { videoId, userId });
      this.videoStore.setLoadingState('video', true);
      this.videoStore.toggleSpinner('video', true);

      // Default video için dil her zaman 'en' olacak
      const language = 'en';
      console.log('🌍 Using language:', language);
      
      // Video bilgilerini ayarla
      this.videoData.value = {
        ...this.videoData.value,
        id: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        loading: true,
        error: null
      };

      // Aktif işlem ID'sini güncelle
      this.currentProcessingVideoId.value = videoId;

      // Yeni işlemi başlat
      await this.processVideoWithLanguage(language);

      console.log('✅ Initial video load completed');
    } catch (err) {
      console.error('❌ Error in loadInitialVideo:', {
        error: err,
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
        videoId,
        userId
      });
      this.error.value = err instanceof Error ? err.message : 'Failed to load video';
      
      // Hata durumunda video durumunu güncelle
      this.videoData.value = {
        ...this.videoData.value,
        loading: false,
        error: this.error.value
      };
    } finally {
      this.videoStore.setLoadingState('video', false);
      this.videoStore.toggleSpinner('video', false);
    }
  }

  async processVideoWithLanguage(language: string) {
    console.log('🎬 Processing video with language:', language);
    
    // İşlenmekte olan video ID'sini kaydet
    const processingVideoId = this.videoData.value.id;
    
    // Aktif işlem ID'sini güncelle
    this.currentProcessingVideoId.value = processingVideoId;
    console.log('📌 Current processing video ID set to:', processingVideoId);
    
    // Reset transcript and summary data
    this.videoData.value.transcript = '';
    this.videoData.value.transcriptPreview = '';
    this.videoData.value.summary = '';
    this.videoData.value.summaryPreview = '';
    this.videoData.value.formatted_text = '';
    
    // İlk yükleme durumlarını ayarla
    this.videoStore.setLoadingState('summary', true);
    this.videoStore.setLoadingState('transcript', true);
    this.videoStore.setLoadingState('processing', true);
    this.videoStore.toggleSpinner('summary', true);
    this.videoStore.toggleSpinner('transcript', true);
    this.videoStore.toggleSpinner('processing', true);
    
    // Güvenlik zamanlayıcısı: 2 dakika sonra spinner'lar hâlâ dönüyorsa zorla kapat
    const safetyTimeoutId = setTimeout(() => {
      console.log('⏱️ [SAFETY] Safety timeout triggered after 2 minutes for video:', processingVideoId);
      if (processingVideoId === this.videoStore.currentProcessingVideoId) {
        if (this.videoStore.getLoadingState('transcript') || 
            this.videoStore.getLoadingState('summary') || 
            this.videoStore.getLoadingState('processing')) {
          console.log('⚠️ [SAFETY] Spinners still active after 2 minutes! Force closing...');
          this.forceCloseSpinners(processingVideoId);
        }
      }
    }, 120000); // 2 dakika
    
    // Zamanlayıcı ID'sini kaydet (video değişirse temizlemek için)
    this.setSummaryTimeout(processingVideoId, 'safetySpinnerCheck', () => {
      clearTimeout(safetyTimeoutId);
    }, 125000);
    
    try {
      // Polling mekanizması kurulacak
      console.log(`📡 [VideoProcessingService] Processing for video: ${processingVideoId}`);
      // API tabanlı polling yaklaşımı için yer tutucu
      this.setupRealTimeUpdates(processingVideoId);
      
      // Transkript oluşturma isteği gönder
      console.log(`Starting transcript creation for video: ${processingVideoId}`);
      await this.createTranscript(processingVideoId, language);
      
    } catch (e) {
      if (processingVideoId !== this.currentProcessingVideoId.value) {
        console.log('🚫 Ignoring error for outdated video ID:', processingVideoId);
        return;
      }
      
      console.error('❌ Error in processVideoWithLanguage:', e);
      this.error.value = e instanceof Error ? e.message : 'Video işlenirken beklenmeyen hata oluştu.';
      this.videoStore.setLoadingState('transcript', false);
      this.videoStore.setLoadingState('summary', false);
      this.videoStore.setLoadingState('processing', false);
      this.videoStore.toggleSpinner('transcript', false);
      this.videoStore.toggleSpinner('summary', false);
      this.videoStore.toggleSpinner('processing', false);
    }
  }

  async handleSearch(searchQuery: string): Promise<string | null> {
    console.log('Search started with query:', searchQuery);
    if (!searchQuery) return null;
    
    // URL'den video ID'sini çıkar
    const extractedVideoId = getVideoId(searchQuery);
    if (!extractedVideoId) {
      this.error.value = 'Invalid YouTube URL';
      return null;
    }
    
    // Aktif işlem ID'sini güncelle (videoStore üzerinden)
    this.videoStore.setCurrentProcessingVideoId(extractedVideoId);
    console.log('📌 Setting new active video ID:', extractedVideoId);
    
    // Video bilgilerini güncelle
    this.videoData.value = {
      ...this.videoData.value,
      id: extractedVideoId,
      url: searchQuery,
      loading: true,
      error: null,
      // Eski içeriği temizle
      transcript: '',
      transcriptPreview: '',
      summary: '',
      summaryPreview: '',
      formatted_text: ''
    };
    
    this.videoStore.setLoadingState('video', true);
    this.videoStore.toggleSpinner('video', true);
    
    return extractedVideoId;
  }

  updateProcessingStatus(step: keyof typeof this.processingStatus.value.steps) {
    this.processingStatus.value.isProcessing = true;
    this.processingStatus.value.currentStep = this.processingStatus.value.steps[step];
  }

  async handleVideoProcess(videoId: string, language: string): Promise<boolean> {
    console.log(`[VideoProcessingService] handleVideoProcess started for videoId: ${videoId}, language: ${language}`);
    
    // Eğer şu anda aktif bir işlem varsa ve aynı video için dil değişimi gelirse
    if (this.isProcessingLanguageChange && this.videoStore.currentProcessingVideoId === videoId) {
      console.log(`⚠️ [THROTTLE] Already processing video ${videoId}, storing new language request: ${language}`);
      // Bekleyen dil değişim isteğini kaydet (öncekini varsa üzerine yaz)
      this.pendingLanguageChanges.set(videoId, language);
      return true; // İşlem başarılı gibi dönüş yapalım, kullanıcıya bir uyarı göstermeyelim
    }
    
    // İşlemi başlatalım ve kilitliyoruz
    this.isProcessingLanguageChange = true;
    
    try {
      // Set the current processing video ID to track it
      this.videoStore.setCurrentProcessingVideoId(videoId);
      
      // Set the loading states
      this.videoStore.setIsVideoProcessing(true);
      this.videoStore.setLoadingState('transcript', true);
      this.videoStore.setLoadingState('summary', true);
      
      // Polling mekanizmasını kullan
      this.setupRealTimeUpdates(videoId);
      
      // Temiz başlangıç için önceki verileri temizle
      this.videoData.value.transcript = '';
      this.videoData.value.transcriptPreview = '';
      this.videoData.value.summary = '';
      this.videoData.value.summaryPreview = '';
      this.videoData.value.formatted_text = '';
      
      console.log(`[VideoProcessingService] Creating transcript for videoId: ${videoId}`);
      const transcriptResponse = await this.createTranscript(videoId, language);
      console.log(`[VideoProcessingService] Transcript creation response:`, transcriptResponse);
      
      // Log the structure of the response for debugging
      console.log(`[VideoProcessingService] Transcript response structure:`, {
        hasData: !!(transcriptResponse as any).data,
        hasFormattedText: !!transcriptResponse.formatted_text,
        dataProperties: (transcriptResponse as any).data ? Object.keys((transcriptResponse as any).data) : [],
        status: transcriptResponse.status
      });
      
      // Backend'den lock hatası gelirse mevcut spinnerları kapatalım
      if (transcriptResponse.status === 'processing' && 
          (transcriptResponse.message === 'Could not acquire lock' || 
           transcriptResponse.message?.includes('lock'))) {
        console.warn('⚠️ [LOCK] Backend returned lock error, force closing spinners');
        this.forceCloseSpinners(videoId);
        
        // 5 saniye sonra durumu tekrar kontrol et
        setTimeout(() => {
          apiService.getTranscriptStatus(videoId, language)
            .then(status => {
              if (status.status === 'completed') {
                // İşlem başka bir istek tarafından tamamlanmış, UI'ı güncelle
                this.handleTranscriptComplete({
                  formatted_text: status.formatted_text,
                  video_id: videoId,
                  language: language,
                  status: 'completed'
                });
              }
            })
            .catch(err => console.error('Error checking transcript after lock:', err));
        }, 5000);
        
        return true; // İşlem başarılı gibi dönüş yapalım, kullanıcıya bir uyarı göstermeyelim
      }
      
      // If transcript is already completed, handle it directly
      // Check both formats - direct formatted_text or data.formatted_text
      if (transcriptResponse.status === 'completed') {
        const formattedText = transcriptResponse.formatted_text || 
                             ((transcriptResponse as any).data && (transcriptResponse as any).data.formatted_text);
        
        if (formattedText) {
          console.log(`[VideoProcessingService] Found formatted text, handling transcript completion`);
          this.handleTranscriptComplete({
            formatted_text: formattedText,
            video_id: videoId,
            language: language,
            status: 'completed'
          });
        }
        
        // If the transcript is completed, start the summary process
        console.log(`[VideoProcessingService] Starting summary process for completed transcript`);
        // Find the transcript_id from the response
        const transcriptId = transcriptResponse.id || 
                           ((transcriptResponse as any).data && (transcriptResponse as any).data.id) ||
                           transcriptResponse.transcript_id || 
                           ((transcriptResponse as any).data && (transcriptResponse as any).data.transcript_id);
        
        // Güvenlik kontrolü: transcript_id eksikse, log yazdır ve spinner'ları kapat
        if (!transcriptId) {
          console.error(`[VideoProcessingService] ERROR: No transcript_id found in response:`, transcriptResponse);
          console.log(`[VideoProcessingService] Closing summary spinners due to missing transcript_id`);
          
          // Spinner'ları kapat
          this.videoStore.setLoadingState('summary', false);
          this.videoStore.toggleSpinner('summary', false);
          this.videoStore.setLoadingState('processing', false);
          this.videoStore.toggleSpinner('processing', false);
          
          // 10 saniye sonra bir kontrol daha yap
          setTimeout(() => {
            // Eğer hala spinnerlar dönüyorsa, zorla kapat
            if (this.videoStore.getLoadingState('summary') || this.videoStore.getLoadingState('processing')) {
              console.log(`[VideoProcessingService] Force closing spinners after 10 seconds`);
              this.forceCloseSpinners(videoId);
            }
          }, 10000);
          
          return true;
        }
        
        if (transcriptId) {
          console.log(`[VideoProcessingService] Creating summary for transcript ID: ${transcriptId}`);
          try {
            const summaryResponse = await this.createSummary(videoId, language, false, transcriptId);
            
            // Log the summary response structure
            console.log(`[VideoProcessingService] Summary creation response:`, summaryResponse);
            
            // Handle the summary response similar to transcript
            if (summaryResponse.status === 'completed' && ((summaryResponse as any).data?.content || summaryResponse.content)) {
              this.handleSummaryComplete({
                content: (summaryResponse as any).data?.content || summaryResponse.content,
                videoId: videoId,
                language: language,
                status: 'completed'
              });
            }
          } catch (error) {
            console.error('Error creating summary:', error);
            
            // Özel hata işleme: "Waiting for transcript completion" hatasını ele al
            if (error instanceof Error && error.message.includes('Waiting for transcript completion')) {
              console.log('⏱️ [RETRY] Transcript is still processing on the backend, will retry in 5 seconds');
              
              // Spinner'ları sabit tutuyoruz, bu bir backend senkronizasyon sorunu
              
              // Tekrar sayısını takip edecek bir değişken tanımlıyoruz
              const maxRetries = 4;
              let currentRetry = 0;
              
              const attemptSummaryCreation = () => {
                currentRetry++;
                console.log(`⏱️ [RETRY ${currentRetry}/${maxRetries}] Attempting to create summary again after delay`);
                
                // Tekrar özet oluşturmayı dene
                this.createSummary(videoId, language, false, transcriptId)
                  .then(summaryResponse => {
                    if (summaryResponse.status === 'completed' && summaryResponse.content) {
                      // Başarılı olursa özeti işle
                      console.log('✅ [RETRY SUCCESS] Summary creation succeeded on retry');
                      this.handleSummaryComplete({
                        content: summaryResponse.content,
                        videoId: videoId,
                        language: language,
                        status: 'completed'
                      });
                    } else if (currentRetry < maxRetries) {
                      // Başarısız olursa ve daha deneme hakkımız varsa, tekrar dene
                      console.log(`⏱️ [RETRY] Summary creation still pending, will retry again (${currentRetry}/${maxRetries})`);
                      setTimeout(attemptSummaryCreation, 5000);
                    } else {
                      // Tüm denemeler başarısız olduysa, spinner'ları kapat
                      console.warn('⚠️ [RETRY EXHAUSTED] Summary creation still failing after max retries, closing spinners');
                      this.videoStore.setLoadingState('summary', false);
                      this.videoStore.toggleSpinner('summary', false);
                      this.videoStore.setLoadingState('processing', false);
                      this.videoStore.toggleSpinner('processing', false);
                    }
                  })
                  .catch(retryError => {
                    if (retryError instanceof Error && 
                        retryError.message.includes('Waiting for transcript completion') && 
                        currentRetry < maxRetries) {
                      // Hala transcript bekleniyorsa ve deneme hakkımız varsa, tekrar dene
                      console.log(`⏱️ [RETRY] Still waiting for transcript, will retry again (${currentRetry}/${maxRetries})`);
                      setTimeout(attemptSummaryCreation, 5000);
                    } else {
                      // Farklı bir hata veya tüm denemeler başarısız olduysa, spinner'ları kapat
                      console.error('❌ [RETRY] Error in summary retry:', retryError);
                      this.videoStore.setLoadingState('summary', false);
                      this.videoStore.toggleSpinner('summary', false);
                      this.videoStore.setLoadingState('processing', false);
                      this.videoStore.toggleSpinner('processing', false);
                    }
                  });
              };
              
              // İlk denemeyi başlat
              setTimeout(attemptSummaryCreation, 5000);
            } else {
              // Eğer "Waiting for transcript completion" hatası değilse, spinner'ları kapat
              console.error('❌ Error creating summary, closing spinners:', error);
              this.videoStore.setLoadingState('summary', false);
              this.videoStore.toggleSpinner('summary', false);
              this.videoStore.setLoadingState('processing', false);
              this.videoStore.toggleSpinner('processing', false);
            }
          }
        } else {
          console.warn(`[VideoProcessingService] No transcript_id found, cannot create summary`);
          // Transcript ID yoksa spinner'ları kapat
          this.videoStore.setLoadingState('summary', false);
          this.videoStore.toggleSpinner('summary', false);
          this.videoStore.setLoadingState('processing', false);
          this.videoStore.toggleSpinner('processing', false);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error in handleVideoProcess:', error);
      if (videoId === this.videoStore.currentProcessingVideoId) {
        this.videoStore.setLoadingState('transcript', false);
        this.videoStore.setLoadingState('summary', false);
        this.videoStore.setLoadingState('processing', false);
        this.videoStore.toggleSpinner('transcript', false);
        this.videoStore.toggleSpinner('summary', false);
        this.videoStore.toggleSpinner('processing', false);
      }
      return false;
    } finally {
      // İşlem kilidini kaldıralım
      this.isProcessingLanguageChange = false;
      
      // Bekleyen dil değişimi var mı kontrol edelim
      if (this.pendingLanguageChanges.has(videoId)) {
        const nextLanguage = this.pendingLanguageChanges.get(videoId)!;
        this.pendingLanguageChanges.delete(videoId);
        
        console.log(`🔄 [THROTTLE] Processing pending language change for ${videoId}: ${nextLanguage}`);
        // setTimeout ile yerleştirelim ki mevcut işlem stack kapansın
        setTimeout(() => {
          this.handleVideoProcess(videoId, nextLanguage).catch(err => {
            console.error('Error processing pending language change:', err);
          });
        }, 500);
      }
    }
  }
  
  /**
   * Gerçek zamanlı güncellemeler için polling mekanizmasını kurar
   */
  private setupRealTimeUpdates(videoId: string): void {
    // Polling mekanizması kuruluyorum
    console.log(`📡 [VideoProcessingService] Setting up polling for video ${videoId}`);
    
    // Önceki polling varsa temizle
    if (this.transcriptUnsubscribe) {
      console.log('🧹 Cleaning up previous polling subscription');
      this.transcriptUnsubscribe();
      this.transcriptUnsubscribe = null;
    }
    
    // Mevcut language'i al
    const currentLanguage = this.languageStore.currentLocale || 'tr';
    console.log(`📣 Setting up polling with language: ${currentLanguage}`);
    
    // Polling başlat - Singleton instance kullanarak
    pollingService.startPolling(videoId, currentLanguage, {
      onTranscriptComplete: (transcript) => {
        console.log('✅ Transcript complete from polling:', transcript);
        this.handleTranscriptComplete({
          video_id: videoId,
          formatted_text: transcript.formatted_text,
          status: 'completed',
          language: currentLanguage // Dil bilgisini ekleyelim
        });
      },
      onSummaryComplete: (summary) => {
        console.log('✅ Summary complete from polling:', summary);
        this.handleSummaryComplete({
          videoId: videoId,
          content: summary.content,
          status: 'completed',
          language: currentLanguage // Dil bilgisini ekleyelim
        });
        
        // Özet tamamlandığında kesinlikle polling'i durdur
        console.log('🛑 Summary is complete, ensuring polling is stopped');
        pollingService.stopAllPolling(videoId);
        
        // Temizleme fonksiyonunu çağır
        if (this.transcriptUnsubscribe) {
          this.transcriptUnsubscribe();
          this.transcriptUnsubscribe = null;
          console.log('🧹 Cleaned up polling subscription after summary completion');
        }
      },
      onError: (error) => {
        console.error('❌ Polling error:', error);
        this.handlePollingError(error);
        
        // Hata durumunda da polling'i temizle
        pollingService.stopAllPolling(videoId);
      }
    });
    
    // Acil durum kontrolü: 10 dakika sonra polling hala aktifse durdur
    const emergencyTimeoutId = window.setTimeout(() => {
      if (pollingService.isAnyPollingActive()) {
        console.warn(`⚠️ Emergency timeout: Polling for ${videoId} is still active after 10 minutes`);
        pollingService.stopAllPolling(videoId);
      }
    }, 10 * 60 * 1000); // 10 dakika
    
    // Sayfa kapatıldığında cleanup yapacak event listener ekle
    const handleUnload = () => {
      console.log('📢 Page unload detected, stopping all polling');
      pollingService.stopAllPolling(videoId);
      window.clearTimeout(emergencyTimeoutId);
    };
    
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('unload', handleUnload);
    
    // Temizleme fonksiyonunu kaydet
    this.transcriptUnsubscribe = () => {
      console.log(`🧹 [VideoProcessingService] Stopping polling for video ${videoId}`);
      pollingService.stopAllPolling(videoId);
      window.clearTimeout(emergencyTimeoutId);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }
  
  private handleTranscriptComplete(transcript: any) {
    // Extract video ID from different possible formats
    const transcriptVideoId = transcript.video_id || transcript.videoId || (transcript.data && (transcript.data.video_id || transcript.data.videoId));
    
    // Normalize for comparison
    const normalizedTranscriptId = normalizeVideoId(transcriptVideoId || '');
    const normalizedCurrentId = normalizeVideoId(this.videoStore.currentProcessingVideoId);
    
    // Sadece güncel işlem için sonuçları kabul et
    if (normalizedTranscriptId !== normalizedCurrentId) {
      console.log(`🚫 Ignoring transcript result for outdated video ID: ${transcriptVideoId || 'undefined'} vs ${this.videoStore.currentProcessingVideoId}`);
      console.log(`   Normalized IDs: ${normalizedTranscriptId} vs ${normalizedCurrentId}`);
      return;
    }
    
    console.log('✅ Transcript completed:', transcript);
    if (transcript.formatted_text) {
      // Aynı transcript içeriğini tekrar tekrar ayarlamayı önle
      if (this.videoData.value.formatted_text === transcript.formatted_text) {
        console.log('⚠️ Same transcript content already set, preventing reprocessing');
        return;
      }
      
      this.videoData.value.formatted_text = transcript.formatted_text;
      this.videoData.value.transcript = transcript.formatted_text;
      this.videoData.value.transcriptPreview = transcript.formatted_text.substring(0, 400);
      
      // Transcript spinner'larını kapat
      this.videoStore.setLoadingState('transcript', false);
      this.videoStore.toggleSpinner('transcript', false);
      
      console.log('🔄 Transcript loading state cleared');
      
      // Transkript tamamlandıktan sonra özet oluşturmayı başlat
      console.log(`Automatically starting summary process for video ${transcriptVideoId} in language ${transcript.language || 'tr'}`);
      
      // Kontrol: Özet zaten tamamlanmış mı?
      if (this.videoData.value.summary) {
        console.log('⚠️ Summary already exists, preventing duplicate summary creation');
        // Özet zaten varsa işlem yapma, spinner'lar zaten kapalı olmalı
        return;
      }
      
      // Özet oluşturma isteği gönder - sadece bir kez
      const videoId = transcriptVideoId;
      // Sabit dil değeri kullan
      const language = transcript.language || 'tr';
      
      // Özet zaten işleniyor mu kontrol et
      if (this.videoStore.getLoadingState('summary')) {
        console.log('⚠️ Summary already processing, preventing duplicate summary creation');
        
        // 40 saniye sonra özet durumunu kontrol edelim, eğer hala bekliyorsa alalım
        this.setSummaryTimeout(videoId, 'alreadyProcessing', () => {
          if (this.videoStore.getLoadingState('summary') && 
              this.videoStore.currentProcessingVideoId === videoId) {
            
            // Özet durumunu kontrol et
            apiService.getSummaryStatus(videoId, language)
              .then(status => {
                if (status.status === 'completed' && status.content) {
                  // Özetin tamamlandığını ve içeriği bulduğumuzu bildiriyoruz
                  console.log('✅ Found completed summary after timeout check');
                  
                  // İçeriği ayarla ve spinner'ları kapat
                  this.videoData.value.summary = status.content;
                  this.videoData.value.summaryPreview = status.content.substring(0, 250) + '...';
                  this.videoStore.setLoadingState('summary', false);
                  this.videoStore.toggleSpinner('summary', false);
                  this.videoStore.setLoadingState('processing', false);
                  this.videoStore.toggleSpinner('processing', false);
                }
              })
              .catch(error => {
                console.error('❌ Error checking summary status after timeout:', error);
                // Hata durumunda spinner'ları kapat
                this.videoStore.setLoadingState('summary', false);
                this.videoStore.toggleSpinner('summary', false);
                this.videoStore.setLoadingState('processing', false);
                this.videoStore.toggleSpinner('processing', false);
              });
          }
        }, 40000); // 40 saniye sonra kontrol et
        
        return;
      }
      
      // Diğer kodlar...
    }
  }
  
  private handleSummaryComplete(summary: any): void {
    console.log('🔄 Summary completed:', summary);
    
    // Extract videoId from different possible formats
    const summaryVideoId = summary.video_id || summary.videoId || (summary.data && (summary.data.video_id || summary.data.videoId));
    
    // Only accept updates for the current processing video
    const normalizedSummaryId = normalizeVideoId(summaryVideoId || '');
    const normalizedCurrentId = normalizeVideoId(this.videoStore.currentProcessingVideoId);
    
    if (normalizedSummaryId !== normalizedCurrentId) {
      console.log(`⚠️ Received summary update for ${summaryVideoId || 'undefined'} but current video is ${this.videoStore.currentProcessingVideoId}`);
      console.log(`   Normalized IDs: ${normalizedSummaryId} vs ${normalizedCurrentId}`);
      return;
    }
    
    // Ensure content exists before trying to update it
    if (!summary.content) {
      console.warn('⚠️ Summary is marked as completed but has no content!');
      // Spinner'ları kapat ama içerik olmadığı için uyarı göster
      this.videoStore.setLoadingState('summary', false);
      this.videoStore.toggleSpinner('summary', false);
      this.videoStore.setLoadingState('processing', false);
      this.videoStore.toggleSpinner('processing', false);
      return;
    }
    
    // Update content data
    console.log(`✅ Setting summary content in handleSummaryComplete: ${summary.content.substring(0, 50)}...`);
    this.videoData.value.summary = summary.content;
    this.videoData.value.summaryPreview = summary.content.substring(0, 250) + '...';
    
    // Update processing status
    this.processingStatus.value.currentStep = this.processingStatus.value.steps.SUMMARIZING;
    this.processingStatus.value.isProcessing = false;
    
    // Spinner'ları kapat
    this.videoStore.setLoadingState('summary', false);
    this.videoStore.toggleSpinner('summary', false);
    this.videoStore.setLoadingState('processing', false);
    this.videoStore.toggleSpinner('processing', false);
    
    console.log('🎉 Summary processing completed for video:', summaryVideoId);
  }
  
  private handlePollingError(err: Error) {
    console.error('❌ Processing error:', err);
    this.error.value = err.message;
    this.videoStore.setLoadingState('transcript', false);
    this.videoStore.setLoadingState('summary', false);
    this.videoStore.setIsVideoProcessing(false);
  }

  async loadAvailableSummaries(params: { language?: string, limit?: number } = {}): Promise<VideoSummary[]> {
    try {
      console.log('📚 Loading available summaries with params:', params);
      
      const response = await apiService.getAvailableSummaries(params) as ExtendedSummaryResponse[];
      
      if (response && Array.isArray(response)) {
        console.log('✅ Successfully loaded summaries:', response.length);
        return response.map(summary => ({
          id: summary.id || '',
          channelName: summary.channel_name || '',
          channelAvatar: summary.channel_avatar || '',
          videoTitle: summary.video_title || '',
          videoThumbnail: summary.video_thumbnail || '',
          summary: summary.content || '',
          publishedAt: summary.created_at || new Date().toISOString(),
          videoUrl: summary.video_url || '',
          isRead: Boolean(summary.is_read),
          language: summary.language || 'tr'
        }));
      } else {
        console.log('ℹ️ No summaries found');
        return [];
      }
    } catch (err) {
      console.error('❌ Error loading summaries:', err);
      throw err;
    }
  }

  async createTranscript(videoId: string, language: string, isPublic = false): Promise<TranscriptResponse> {
    try {
      console.log(`[VideoProcessingService] Creating transcript for video ${videoId}`)
      loadingStateManager.updateLoadingState('transcript', 'loading')

      const response = await apiService.createTranscriptFromVideo({
        videoId,
        language
      })

      console.log(`[VideoProcessingService] Transcript creation response:`, response)

      if (response.status === 'completed' && response.formatted_text) {
        loadingStateManager.updateLoadingState('transcript', 'loaded', {
          status: 'completed',
          formatted_text: response.formatted_text
        })
        return response
      } else if (response.status === 'error' && response.error === 'Locked by another process') {
        notifyWarning('Bu video için transkript şu anda başka bir işlem tarafından oluşturuluyor. Lütfen biraz sonra tekrar deneyin.')
        loadingStateManager.updateLoadingState('transcript', 'error', {
          status: 'error',
          error: 'Bu video için transkript şu anda kilitli. Lütfen daha sonra tekrar deneyin.'
        })
        return {
          status: 'error',
          error: 'Locked by another process'
        }
      } else {
        // Pending veya Processing durumları için polling mekanizması kurulacak
        loadingStateManager.updateLoadingState('transcript', 'loading', {
          status: response.status,
          task_id: response.task_id
        })
        
        // Güvenlik kontrolü: Eğer polling güncellemesi gelmediyse, belirli aralıklarla status kontrolü yap
        if (response.status === 'processing' || response.status === 'pending') {
          this.setSummaryTimeout(videoId, 'transcriptStatusCheck', async () => {
            // Eğer hala bu videoyu işliyorsak ve transcript yükleme durumu hala aktifse
            if (videoId === this.videoStore.currentProcessingVideoId && 
                this.videoStore.getLoadingState('transcript')) {
              console.log(`⏱️ [SAFETY] Checking transcript status after timeout for video: ${videoId}`);
              
              try {
                const status = await apiService.getTranscriptStatus(videoId, language);
                console.log(`⏱️ [SAFETY] Transcript status check result:`, status);
                
                if (status.status === 'completed' && status.formatted_text) {
                  console.log(`✅ [SAFETY] Found completed transcript after timeout check`);
                  
                  // Transcript datayı güncelle
                  this.handleTranscriptComplete({
                    formatted_text: status.formatted_text,
                    video_id: videoId,
                    language: language,
                    status: 'completed'
                  });
                }
              } catch (error) {
                console.error(`❌ [SAFETY] Error checking transcript status:`, error);
              }
            }
          }, 30000); // 30 saniye sonra kontrol et
        }
        
        return response
      }
    } catch (error) {
      console.error('[VideoProcessingService] Error creating transcript:', error)
      const errorMessage = error instanceof Error ? error.message : 'Transkript oluşturulurken bir hata oluştu'
      notifyError(errorMessage)
      
      loadingStateManager.updateLoadingState('transcript', 'error', {
        status: 'error',
        error: errorMessage
      })
      
      return {
        status: 'error',
        error: errorMessage
      }
    }
  }

  // Özet API
  async createSummary(videoId: string, language: string, isPublic = false, transcriptId?: string): Promise<SummaryResponse> {
    console.log(`[VideoProcessingService] Creating summary for video ${videoId}${transcriptId ? ', transcript: ' + transcriptId : ''}`);
    
    try {
      // Eğer transcriptId verilmişse, bunu ayrı bir parametre olarak gönder
      const params: any = {
        videoId,
        language,
        is_public: isPublic
      };
      
      // Eğer transcript_id parametresi verilmişse, API çağrısına ekle
      if (transcriptId) {
        params.transcript_id = transcriptId;
      }
      
      const response = await apiService.createSummaryFromVideo(params);
      
      // Log başarılı yanıt
      console.log(`[VideoProcessingService] Summary creation response from API:`, response);
      
      return response;
    } catch (error) {
      console.error('[VideoProcessingService] Error creating summary:', error);
      
      // Hata yanıtını oluştur
      const errorResponse: SummaryResponse = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error creating summary'
      };
      
      // Özet yükleme durumunu güncelle - error
      loadingStateManager.updateLoadingState('summary', 'error', errorResponse);
      
      throw error;
    }
  }

  // Yükleme durumunu güncelle (spinnerları kontrol et)
  private updateLoadingState<T>(type: 'transcript' | 'summary' | 'video', state: 'loading' | 'loaded' | 'error', data?: any) {
    loadingStateManager.updateLoadingState(type, state, data);
  }

  // Tüm spinnerları zorla kapatmak için metod
  public forceCloseSpinners(videoId?: string): void {
    loadingStateManager.forceCloseSpinners(videoId);
  }

  /**
   * Debug video processing state and attempt recovery if needed
   * @param videoId The video ID to debug
   * @param attemptRecovery Whether to attempt recovery from stuck states
   */
  public async debugVideoState(videoId: string, attemptRecovery: boolean = false): Promise<void> {
    console.log(`🔎 [VideoProcessingService] Debugging video state for ${videoId}, recovery: ${attemptRecovery}`);
    
    // Log current state
    console.log(`Current state:`, {
      currentProcessingVideoId: this.videoStore.currentProcessingVideoId,
      transcriptLoading: this.transcriptState.loading,
      summaryLoading: this.summaryState.loading,
      storeStates: {
        transcript: this.videoStore.getLoadingState('transcript'),
        summary: this.videoStore.getLoadingState('summary'),
        processing: this.videoStore.getLoadingState('processing')
      },
      spinnerStates: {
        transcript: this.videoStore.spinnerStates.transcript,
        summary: this.videoStore.spinnerStates.summary,
        processing: this.videoStore.spinnerStates.processing
      }
    });
    
    // Check timeouts
    const timeoutKeys = Array.from(this.summaryTimeouts.keys());
    console.log(`Active timeouts: ${timeoutKeys.length}`);
    timeoutKeys.forEach(key => {
      console.log(`• Timeout: ${key}`);
    });
    
    try {
      // Check backend status
      if (attemptRecovery) {
        console.log(`📡 [VideoProcessingService] Checking backend status for recovery...`);
        
        // Get language
        const language = this.languageStore.currentLocale || 'tr';
        
        // Check transcript and summary status
        const transcriptStatus = await apiService.getTranscriptStatus(videoId, language);
        const summaryStatus = await apiService.getSummaryStatus(videoId, language);
        
        console.log(`Backend transcript status:`, transcriptStatus);
        console.log(`Backend summary status:`, summaryStatus);
        
        // Detect discrepancies and fix them
        let needsFix = false;
        
        // Case 1: Backend shows transcript complete but UI still loading
        if (transcriptStatus.status === 'completed' && 
           (this.transcriptState.loading || this.videoStore.getLoadingState('transcript'))) {
          console.log(`⚠️ Found discrepancy: Transcript is complete on backend but still loading in UI`);
          needsFix = true;
          
          // Fetch latest transcript
          try {
            await this.fetchLatestTranscript(videoId);
            // Force close transcript spinner
            loadingStateManager.updateLoadingState('transcript', 'loaded');
            this.videoStore.setLoadingState('transcript', false);
            this.videoStore.toggleSpinner('transcript', false);
          } catch (err) {
            console.error(`Error fetching latest transcript:`, err);
          }
        }
        
        // Case 2: Backend shows summary complete but UI still loading
        if (summaryStatus.status === 'completed' && 
           (this.summaryState.loading || this.videoStore.getLoadingState('summary'))) {
          console.log(`⚠️ Found discrepancy: Summary is complete on backend but still loading in UI`);
          needsFix = true;
          
          // Fetch latest summary
          try {
            await this.fetchLatestSummary(videoId);
            // Force close summary spinner
            loadingStateManager.updateLoadingState('summary', 'loaded');
            this.videoStore.setLoadingState('summary', false);
            this.videoStore.toggleSpinner('summary', false);
          } catch (err) {
            console.error(`Error fetching latest summary:`, err);
          }
        }
        
        // Case 3: Both are complete but processing flag is still active
        if (transcriptStatus.status === 'completed' && summaryStatus.status === 'completed' &&
            this.videoStore.loadingStates.processing) {
          console.log(`⚠️ Found discrepancy: Both transcript and summary are complete, but processing flag is still active`);
          needsFix = true;
          
          // Reset processing flag
          this.videoStore.setIsVideoProcessing(false);
          this.videoStore.clearProcessingStatus();
        }
        
        // Case 4: Backend shows error but UI still loading
        if ((transcriptStatus.status === 'error' || transcriptStatus.status === 'failed' ||
             summaryStatus.status === 'error' || summaryStatus.status === 'failed') &&
            (this.transcriptState.loading || this.summaryState.loading ||
             this.videoStore.getLoadingState('transcript') || this.videoStore.getLoadingState('summary'))) {
          console.log(`⚠️ Found discrepancy: Backend shows error but UI still loading`);
          needsFix = true;
        }
        
        // If any issues found, force close spinners as last resort
        if (needsFix) {
          console.log(`🔧 Fixing detected issues by force closing spinners`);
          this.forceCloseSpinners(videoId);
        } else {
          console.log(`✅ No issues detected with spinners for ${videoId}`);
        }
      }
      
      // Return final state after fixes
      console.log(`Final state after debug:`, {
        transcriptLoading: this.transcriptState.loading,
        summaryLoading: this.summaryState.loading,
        storeStates: {
          transcript: this.videoStore.getLoadingState('transcript'),
          summary: this.videoStore.getLoadingState('summary'),
          processing: this.videoStore.getLoadingState('processing')
        }
      });
    } catch (error) {
      console.error(`❌ Error during debug:`, error);
      
      if (attemptRecovery) {
        // Force close spinners in case of error
        console.log(`🚨 Error during recovery, force closing spinners`);
        this.forceCloseSpinners(videoId);
      }
    }
  }

  /**
   * Gets a preview of text with limited characters
   * @param text The text to get preview from
   * @param maxLength Maximum length of the preview
   * @returns Shortened text with ellipsis if needed
   */
  private getTextPreview(text: string, maxLength: number = 250): string {
    return getTextPreview(text, maxLength);
  }

  /**
   * Fetches the latest transcript for a video
   * @param videoId The video ID to fetch transcript for
   */
  private async fetchLatestTranscript(videoId: string): Promise<void> {
    console.log(`Fetching latest transcript for video ${videoId}`);
    try {
      const response = await apiService.getTranscript(videoId);
      // Use type assertion to bypass the strict type checking
      if (response && ((response.status as string) === 'completed' || (response.status as string) === 'success')) {
        // Handle successful transcript fetch
        this.handleTranscriptComplete(response);
      }
    } catch (error) {
      console.error(`Error fetching latest transcript: ${error}`);
    }
  }

  /**
   * Fetches the latest summary for a video
   * @param videoId The video ID to fetch summary for
   */
  private async fetchLatestSummary(videoId: string): Promise<void> {
    console.log(`Fetching latest summary for video ${videoId}`);
    try {
      const response = await apiService.getSummary(videoId);
      // Use type assertion to bypass the strict type checking
      if (response && ((response.status as string) === 'completed' || (response.status as string) === 'success')) {
        // Handle successful summary fetch
        this.handleSummaryComplete(response);
      }
    } catch (error) {
      console.error(`Error fetching latest summary: ${error}`);
    }
  }

  // Yeni metod: Bir video ID'sine ait tüm zamanlayıcıları temizle
  private clearSummaryTimeouts(videoId: string): void {
    loadingStateManager.clearTimeouts(videoId);
  }
  
  // Zamanlayıcıyı ayarla ve kaydet - yeni yardımcı metod
  private setSummaryTimeout(videoId: string, timeoutType: string, callback: () => void, delay: number): void {
    loadingStateManager.setTimeout(videoId, timeoutType, callback, delay);
  }
} 