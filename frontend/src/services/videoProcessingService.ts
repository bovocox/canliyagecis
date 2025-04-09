import { ref } from 'vue'
import type { VideoData, VideoSummary } from '@/types/video'
import { getVideoId } from '@/utils/youtube'
import pollingService from './pollingService'
import type { Ref } from 'vue'
import { useVideoStore } from '@/stores/videoStore'
import apiService from './apiService'
import type { ProcessingStatus, SummaryResponse, TranscriptResponse } from './apiService'
import socketService from '@/services/socketService'
import { useUIStore } from '@/stores/uiStore'

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

export class VideoProcessingService {
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
  private videoStore: ReturnType<typeof useVideoStore>
  private uiStore: ReturnType<typeof useUIStore>
  private socketService: typeof socketService
  // Aktif işlemin ID'sini takip etmek için
  private currentProcessingVideoId: Ref<string> = ref('')
  // Socket dinleyici temizleme fonksiyonları
  private transcriptUnsubscribe: (() => void) | null = null;
  private summaryUnsubscribe: (() => void) | null = null;
  // Özet için aktif zamanlayıcılar - yeni
  private summaryTimeouts: Map<string, number> = new Map();

  constructor(
    videoData: Ref<VideoData>,
    error: Ref<string>,
    processingStatus: Ref<any>
  ) {
    this.videoData = videoData
    this.error = error
    this.processingStatus = processingStatus
    this.videoStore = useVideoStore()
    this.uiStore = useUIStore()
    this.socketService = socketService
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
      
      // Önceki polling işlemlerini durdur
      pollingService.stopAllPolling(videoId);

      // Aktif işlem ID'sini güncelle
      this.currentProcessingVideoId.value = videoId;

      // Yeni polling işlemini başlat
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
    
    try {
      // Önceki polling işlemlerini durdur - tüm video ID'leri için
      pollingService.stopAllActivePolling();

      /* POLLING KODU COMMENT YAPILDI
      // Polling'i başlat
      pollingService.startPolling(processingVideoId, language, {
        onTranscriptComplete: (transcript) => {
          // Sadece güncel işlem için sonuçları kabul et
          if (processingVideoId !== this.currentProcessingVideoId.value) {
            console.log('🚫 Ignoring transcript result for outdated video ID:', processingVideoId);
            return;
          }
          
          console.log('✅ Transcript completed:', transcript);
          if (transcript.formatted_text) {
            this.videoData.value.formatted_text = transcript.formatted_text;
            this.videoData.value.transcript = transcript.formatted_text;
            this.videoData.value.transcriptPreview = transcript.formatted_text.substring(0, 400);
            this.videoStore.setLoadingState('transcript', false);
            this.videoStore.toggleSpinner('transcript', false);
          }
        },
        onSummaryComplete: (summary) => {
          // Sadece güncel işlem için sonuçları kabul et
          if (processingVideoId !== this.currentProcessingVideoId.value) {
            console.log('🚫 Ignoring summary result for outdated video ID:', processingVideoId);
            return;
          }
          
          console.log('✅ Summary completed:', summary);
          if (summary.content) {
            this.videoData.value.summary = summary.content;
            this.videoData.value.summaryPreview = summary.content.substring(0, 400);
            this.videoStore.setLoadingState('summary', false);
            this.videoStore.setLoadingState('processing', false);
            this.videoStore.toggleSpinner('summary', false);
            this.videoStore.toggleSpinner('processing', false);
          }
        },
        onError: (err: Error) => {
          // Sadece güncel işlem için hataları kabul et
          if (processingVideoId !== this.currentProcessingVideoId.value) {
            console.log('🚫 Ignoring error for outdated video ID:', processingVideoId);
            return;
          }
          
          console.error('❌ Polling error:', err);
          this.error.value = err.message;
          this.videoStore.setLoadingState('transcript', false);
          this.videoStore.setLoadingState('summary', false);
          this.videoStore.setLoadingState('processing', false);
          this.videoStore.toggleSpinner('transcript', false);
          this.videoStore.toggleSpinner('summary', false);
          this.videoStore.toggleSpinner('processing', false);
        }
      });
      */
      
      // Socket yapısı üzerinden işlemleri başlat
      socketService.joinVideoRoom(processingVideoId);
      this.setupSocketListeners(processingVideoId);
      
      // Transkript oluşturma isteği gönder
      console.log(`Starting transcript creation for video: ${processingVideoId}`);
      await apiService.createTranscriptFromVideo({ videoId: processingVideoId, language });
      
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
    
    // Aktif işlem ID'sini güncelle
    this.currentProcessingVideoId.value = extractedVideoId;
    console.log('📌 Setting new active video ID:', extractedVideoId);
    
    // Önceki polling işlemlerini durdur
    pollingService.stopAllActivePolling();
    
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

  /* POLLING METODLARI COMMENT YAPILDI
  async pollTranscriptStatus(videoId: string, language: string): Promise<ProcessingStatus> {
    try {
      // Bu işlem aktif işlem değilse, çalışmayı durdur
      if (videoId !== this.currentProcessingVideoId.value) {
        console.log('🚫 Ignoring poll transcript status for outdated video ID:', videoId);
        throw new Error('Canceled - video request changed');
      }
      
      this.videoStore.setLoadingState('transcript', true);
      const status = await apiService.getTranscriptStatus(videoId, language);
      
      if (status.error) {
        this.videoStore.setLoadingState('transcript', false);
        throw new Error(status.error);
      }

      if (status.status !== 'completed') {
        throw new Error('Transcript not ready');
      }

      // Başarılı durumda loading state'i kapatma (bu HomeView içinde yapılıyor)
      return status;
    } catch (err) {
      console.error('Failed to check transcript status:', err);
      if (err instanceof Error && err.message === 'Transcript not ready') {
        // Bu normal bir durum, loading state devam etmeli
      } else {
        // Gerçek bir hata oluştuğunda loading state'i kapat
        this.videoStore.setLoadingState('transcript', false);
      }
      throw err;
    }
  }

  async pollSummaryStatus(videoId: string, language: string): Promise<ProcessingStatus> {
    try {
      // Bu işlem aktif işlem değilse, çalışmayı durdur
      if (videoId !== this.currentProcessingVideoId.value) {
        console.log('🚫 Ignoring poll summary status for outdated video ID:', videoId);
        throw new Error('Canceled - video request changed');
      }
      
      this.videoStore.setLoadingState('summary', true);
      const status = await apiService.getSummaryStatus(videoId, language);
      
      if (status.error) {
        this.videoStore.setLoadingState('summary', false);
        throw new Error(status.error);
      }

      if (status.status !== 'completed') {
        throw new Error('Summary not ready');
      }

      // Başarılı durumda loading state'i kapatma (bu HomeView içinde yapılıyor)
      return status;
    } catch (err) {
      console.error('Failed to check summary status:', err);
      if (err instanceof Error && err.message === 'Summary not ready') {
        // Bu normal bir durum, loading state devam etmeli
      } else {
        // Gerçek bir hata oluştuğunda loading state'i kapat
        this.videoStore.setLoadingState('summary', false);
      }
      throw err;
    }
  }
  */

  updateProcessingStatus(step: keyof typeof this.processingStatus.value.steps) {
    this.processingStatus.value.isProcessing = true;
    this.processingStatus.value.currentStep = this.processingStatus.value.steps[step];
  }

  async handleVideoProcess(videoId: string, language: string): Promise<boolean> {
    console.log(`[VideoProcessingService] handleVideoProcess started for videoId: ${videoId}, language: ${language}`);
    try {
      // Set the current processing video ID to track it
      this.videoStore.setCurrentProcessingVideoId(videoId);
      
      // Set the loading states
      this.videoStore.setIsVideoProcessing(true);
      this.videoStore.setLoadingState('transcript', true);
      this.videoStore.setLoadingState('summary', true);
      
      // Önceki polling işlemlerini durdur
      pollingService.stopAllActivePolling();
      
      // Socket odalarına katıl
      socketService.joinVideoRoom(videoId);
      
      // Socket dinleyicilerini temizle ve yeniden kur
      this.setupSocketListeners(videoId);
      
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
      
      // Force update the loading state directly based on the response
      if (transcriptResponse.status === 'completed') {
        console.log(`[VideoProcessingService] Transcript completed, turning off loading states directly`);
        this.videoStore.setLoadingState('transcript', false);
        this.videoStore.toggleSpinner('transcript', false);
        pollingService.isLoadingTranscript.value = false;
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
            status: 'completed',
            video_id: videoId
          });
          
          // Now create a summary since transcript is ready
          console.log(`[VideoProcessingService] Creating summary for videoId: ${videoId}`);
          const summaryResponse = await this.createSummary(videoId, language);
          console.log(`[VideoProcessingService] Summary creation response:`, summaryResponse);
          
          // If summary is already completed, handle it directly
          if (summaryResponse.status === 'completed') {
            const content = summaryResponse.content || 
                           ((summaryResponse as any).data && (summaryResponse as any).data.content);
            
            if (content) {
              console.log(`[VideoProcessingService] Found content, handling summary completion`);
              
              // Özet içeriğini ayarla
              this.videoData.value.summary = content;
              this.videoData.value.summaryPreview = content.substring(0, 250) + '...';
              
              // Tüm spinner ve loading durumlarını kapat
              this.videoStore.setLoadingState('summary', false);
              this.videoStore.toggleSpinner('summary', false);
              this.videoStore.setLoadingState('processing', false);
              this.videoStore.toggleSpinner('processing', false);
              
              // PollingService durumlarını sıfırla
              pollingService.isLoadingSummary.value = false;
              pollingService.isPollingActiveSummary.value = false;
              
              console.log(`[VideoProcessingService] Summary content set and loading states stopped`);
            }
          }
        } else {
          console.log(`[VideoProcessingService] Transcript completed but no formatted text found`);
        }
      }
      
      // Check if we're still processing the same video ID
      if (videoId !== this.videoStore.currentProcessingVideoId) {
        console.log(`[VideoProcessingService] Video ID changed, stopping processing`);
        return false;
      }
      
      /*
      // Socket bağlantısı yoksa veya bağlantı kesilirse polling'e geri dönüşü başlat
      if (!socketService.isConnected.value) {
        console.log('⚠️ Socket not connected, starting polling as fallback');
        this.startPollingFallback(videoId, language);
      } else {
        // Bağlantı durumunu izle, bağlantı koparsa polling'e geri dön
        const disconnectListener = () => {
          console.log('⚠️ Socket disconnected, starting polling as fallback');
          this.startPollingFallback(videoId, language);
        };
        
        socketService.socket.on('disconnect', disconnectListener);
        
        // İşlem tamamlandığında veya iptal edildiğinde dinleyiciyi temizle
        setTimeout(() => {
          socketService.socket.off('disconnect', disconnectListener);
        }, 300000); // 5 dakika sonra otomatik temizle
      }
      */
      
      return true;
    } catch (error) {
      console.error(`[VideoProcessingService] Error in handleVideoProcess:`, error);
      
      // Only clear processing states if we're still processing the same video
      if (videoId === this.videoStore.currentProcessingVideoId) {
        this.videoStore.setLoadingState('transcript', false);
        this.videoStore.setLoadingState('summary', false);
        this.videoStore.setIsVideoProcessing(false);
      }
      
      throw error;
    }
  }
  
  /**
   * Socket bağlantısı olmadığında veya koptuğunda polling ile durumu kontrol etme
   */
  /* POLLING FALLBACK COMMENT YAPILDI
  private startPollingFallback(videoId: string, language: string) {
    console.log('📡 Starting polling fallback for videoId:', videoId);
    
    pollingService.startPolling(videoId, language, {
      onTranscriptComplete: (transcript) => this.handleTranscriptComplete(transcript),
      onSummaryComplete: (summary) => this.handleSummaryComplete(summary),
      onError: (err) => this.handlePollingError(err)
    });
  }
  */
  
  // Socket dinleyicileri kuracak metod
  private setupSocketListeners(videoId: string): void {
    console.log(`📡 Setting up socket listeners for video ${videoId}`);
    
    // Önce varsa eski dinleyicileri temizle
    if (this.transcriptUnsubscribe) {
      console.log('🧹 Cleaning up previous transcript listener');
      this.transcriptUnsubscribe();
      this.transcriptUnsubscribe = null;
    }
    
    if (this.summaryUnsubscribe) {
      console.log('🧹 Cleaning up previous summary listener');
      this.summaryUnsubscribe();
      this.summaryUnsubscribe = null;
    }
    
    // Önce socket odasından ayrıl, sonra yeniden katıl (temiz başlangıç için)
    socketService.leaveAllRooms(); // Bu metod eklenmeli (socketService.ts'ye)
    socketService.joinVideoRoom(videoId);
    
    // Transkript güncellemelerini dinle
    const transcriptUnsubscribe = socketService.onTranscriptStatusUpdated((data) => {
      console.log('📡 Socket - Transcript update received:', data);
      
      // Only process updates for the current video
      if (data.videoId !== videoId) {
        console.log(`⚠️ Ignoring transcript update for ${data.videoId}, current videoId is ${videoId}`);
        return;
      }
      
      // Detaylı log ekle
      console.log(`📡 Processing transcript update for ${data.videoId}, status: ${data.status}`);
      
      if (data.status === 'completed' && data.formatted_text) {
        this.handleTranscriptComplete({
          formatted_text: data.formatted_text,
          video_id: data.videoId,
          language: data.language || 'tr',
          status: data.status
        });
      } else if (data.status === 'processing') {
        // Update the UI to show the processing status
        this.processingStatus.value.currentStep = data.message || 'Transcribing video...';
      } else if (data.status === 'failed') {
        this.handlePollingError(new Error(data.error || 'Transcript failed'));
        this.videoStore.setLoadingState('transcript', false);
      }
    });
    
    // Özet güncellemelerini dinle - güçlendirilmiş sürüm
    const summaryUnsubscribe = socketService.onSummaryStatusUpdated((data) => {
      console.log('📡 Socket - Summary update received:', JSON.stringify(data, null, 2));
      console.log('📡 Socket - Summary update tipo:', typeof data);
      console.log('📡 Socket - Summary update keys:', Object.keys(data));
      console.log('📡 Socket - Summary update videoId:', data.videoId);
      console.log('📡 Socket - Summary update status:', data.status);
      console.log('📡 Socket - Has content:', !!data.content);
      console.log('📡 Socket - Content substring:', data.content ? data.content.substring(0, 50) + '...' : 'No content');
      console.log('📡 Socket - Current spinner state:', this.videoStore.getLoadingState('summary'));
      
      // Only process updates for the current video
      if (data.videoId !== videoId) {
        console.log(`⚠️ Ignoring summary update for ${data.videoId}, current videoId is ${videoId}`);
        return;
      }
      
      // Detaylı log ekle
      console.log(`📡 Processing summary update for ${data.videoId}, status: ${data.status}, content exists: ${!!data.content}`);
      
      if (data.status === 'completed') {
        console.log(`📡 Summary completed for ${data.videoId}, processing...`);
        
        // ÖNEMLİ: Özet tamamlandığında, aktif zamanlayıcıları iptal et
        this.clearSummaryTimeouts(data.videoId);
        console.log('🔥 ÖZET TAMAMLANDI SOCKET ÜZERİNDEN - TÜM ZAMANLAYICILAR İPTAL EDİLDİ');
        
        // Özet içeriğini UI'a aktar ve spinner'ı kapat - transcript yaklaşımına benzer şekilde
        if (data.content) {
          // Doğrudan özet verilerini uygula - forcefullyStopSummaryLoading çağırmadan
          console.log(`✅ Setting summary content: ${data.content.substring(0, 50)}...`);
          
          // Özet içeriğini ayarla
          this.videoData.value.summary = data.content;
          this.videoData.value.summaryPreview = data.content.substring(0, 250) + '...';
          
          // Spinner'ları kapat
          this.videoStore.setLoadingState('summary', false);
          this.videoStore.toggleSpinner('summary', false);
          this.videoStore.setLoadingState('processing', false);
          this.videoStore.toggleSpinner('processing', false);
          
          // Polling service durumlarını sıfırla
          pollingService.isLoadingSummary.value = false;
          pollingService.isPollingActiveSummary.value = false;
          
          console.log(`📡 Summary loaded and displayed for ${data.videoId}`);
          console.log('🔥 ÖZET İÇERİĞİ AYARLANDI VE SPINNERLAR KAPATILDI');
        } else {
          console.warn(`⚠️ Summary completed but no content for ${data.videoId}`);
          this.videoStore.setLoadingState('summary', false);
          this.videoStore.toggleSpinner('summary', false);
          this.videoStore.setLoadingState('processing', false);
          this.videoStore.toggleSpinner('processing', false);
        }
      } else if (data.status === 'processing') {
        // Update the UI to show the processing status
        this.processingStatus.value.currentStep = data.message || 'Creating summary...';
      } else if (data.status === 'failed') {
        // Hata durumunda da zamanlayıcıları temizle
        this.clearSummaryTimeouts(data.videoId);
        
        this.handlePollingError(new Error(data.error || 'Summary failed'));
        // Sadece spinner'ları kapat
        this.videoStore.setLoadingState('summary', false);
        this.videoStore.toggleSpinner('summary', false);
        this.videoStore.setLoadingState('processing', false);
        this.videoStore.toggleSpinner('processing', false);
      }
    });
    
    // Yeni dinleyicileri kaydet
    this.transcriptUnsubscribe = transcriptUnsubscribe;
    this.summaryUnsubscribe = summaryUnsubscribe;
    
    console.log(`📡 Socket listeners setup completed for video ${videoId}`);
  }
  
  // Yeni metod: Bir video ID'sine ait tüm zamanlayıcıları temizle
  private clearSummaryTimeouts(videoId: string): void {
    // Bu videoyla ilişkili tüm zamanlayıcıları bul ve temizle
    const timeoutIdsToRemove: string[] = [];
    
    this.summaryTimeouts.forEach((timeoutId, key) => {
      if (key.startsWith(`${videoId}:`)) {
        console.log(`🧹 Clearing timeout for ${key}`);
        clearTimeout(timeoutId);
        timeoutIdsToRemove.push(key);
      }
    });
    
    // Temizlenen zamanlayıcıları Map'ten kaldır
    timeoutIdsToRemove.forEach(key => {
      this.summaryTimeouts.delete(key);
    });
    
    console.log(`🧹 Cleared ${timeoutIdsToRemove.length} timeouts for video ${videoId}`);
  }
  
  // Zamanlayıcıyı ayarla ve kaydet - yeni yardımcı metod
  private setSummaryTimeout(videoId: string, timeoutType: string, callback: () => void, delay: number): void {
    const timeoutKey = `${videoId}:${timeoutType}`;
    
    // Önce varsa eski zamanlayıcıyı temizle
    if (this.summaryTimeouts.has(timeoutKey)) {
      clearTimeout(this.summaryTimeouts.get(timeoutKey));
    }
    
    // Yeni zamanlayıcıyı ayarla ve kaydet
    const timeoutId = window.setTimeout(() => {
      // Zamanlayıcı çalıştığında kayıttan kaldır
      this.summaryTimeouts.delete(timeoutKey);
      // Callback'i çalıştır
      callback();
    }, delay);
    
    // Zamanlayıcıyı kaydet
    this.summaryTimeouts.set(timeoutKey, timeoutId);
    
    console.log(`⏱️ Set ${timeoutType} timeout for ${videoId} with delay ${delay}ms`);
  }
  
  private handleTranscriptComplete(transcript: any) {
    // Sadece güncel işlem için sonuçları kabul et
    if (transcript.video_id !== this.videoStore.currentProcessingVideoId) {
      console.log('🚫 Ignoring transcript result for outdated video ID:', transcript.video_id);
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
      
      // Transcript spinner'larını kapat - Bu kısım zaten doğru çalışıyor
      this.videoStore.setLoadingState('transcript', false);
      this.videoStore.toggleSpinner('transcript', false);
      pollingService.isLoadingTranscript.value = false;
      
      console.log('🔄 Transcript loading state cleared');
      
      // Transkript tamamlandıktan sonra özet oluşturmayı başlat
      console.log(`Automatically starting summary process for video ${transcript.video_id} in language ${transcript.language || 'tr'}`);
      
      // Kontrol: Özet zaten tamamlanmış mı?
      if (this.videoData.value.summary) {
        console.log('⚠️ Summary already exists, preventing duplicate summary creation');
        // Özet zaten varsa işlem yapma, spinner'lar zaten kapalı olmalı
        return;
      }
      
      // Özet oluşturma isteği gönder - sadece bir kez
      const videoId = transcript.video_id;
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
      
      // Özet durumunu kontrol et, eğer zaten bir işlem varsa tekrarlamayı önle
      apiService.getSummaryStatus(videoId, language)
        .then(status => {
          if (status.status === 'processing' || status.status === 'pending') {
            console.log('⚠️ Summary already in progress, not sending duplicate request');
            
            // 30 saniye sonra özet durumunu kontrol et
            this.setSummaryTimeout(videoId, 'inProgress', () => {
              if (this.videoStore.getLoadingState('summary') && 
                  this.videoStore.currentProcessingVideoId === videoId) {
                
                // Özet durumunu kontrol et
                apiService.getSummaryStatus(videoId, language)
                  .then(finalStatus => {
                    if (finalStatus.status === 'completed' && finalStatus.content) {
                      // Özetin tamamlandığını ve içeriği bulduğumuzu bildiriyoruz
                      console.log('✅ Found completed summary after timeout check');
                      
                      // İçeriği ayarla ve spinner'ları kapat
                      this.videoData.value.summary = finalStatus.content;
                      this.videoData.value.summaryPreview = finalStatus.content.substring(0, 250) + '...';
                      this.videoStore.setLoadingState('summary', false);
                      this.videoStore.toggleSpinner('summary', false);
                      this.videoStore.setLoadingState('processing', false);
                      this.videoStore.toggleSpinner('processing', false);
                    } else {
                      // Spinner'ları kapat
                      this.videoStore.setLoadingState('summary', false);
                      this.videoStore.toggleSpinner('summary', false);
                      this.videoStore.setLoadingState('processing', false);
                      this.videoStore.toggleSpinner('processing', false);
                    }
                  })
                  .catch(error => {
                    console.error('❌ Error in delayed summary status check:', error);
                    // Hata durumunda spinner'ları kapat
                    this.videoStore.setLoadingState('summary', false);
                    this.videoStore.toggleSpinner('summary', false);
                    this.videoStore.setLoadingState('processing', false);
                    this.videoStore.toggleSpinner('processing', false);
                  });
              }
            }, 30000); // 30 saniye sonra kontrol et
            
            return;
          }
          
          // Tamamlanmış bir özet var mı kontrol et
          if (status.status === 'completed' && status.content) {
            console.log('✅ Summary already completed on backend, updating UI directly');
            // Özet zaten tamamlanmış, UI'ı doğrudan güncelle
            this.videoData.value.summary = status.content;
            this.videoData.value.summaryPreview = status.content.substring(0, 250) + '...';
            
            // Spinner'ları kapat
            this.videoStore.setLoadingState('summary', false);
            this.videoStore.toggleSpinner('summary', false);
            this.videoStore.setLoadingState('processing', false);
            this.videoStore.toggleSpinner('processing', false);
            
            return;
          }
          
          // Özetin henüz başlatılmadığından eminiz, şimdi başlatabiliriz
          apiService.createSummaryFromVideo({ videoId, language })
            .then(response => {
              console.log('Summary creation request sent:', response);
              
              // Eğer API çağrısı sonucunda özet direkt olarak completed durumundaysa
              // (cache'de veya DB'de varsa) spinner'ı elle durduralım
              if (response.status === 'completed') {
                console.log('📡 API returned completed summary immediately');
                
                // Store'daki spinner ve loading durumlarını doğrudan kapat
                this.videoStore.setLoadingState('summary', false);
                this.videoStore.toggleSpinner('summary', false);
                this.videoStore.setLoadingState('processing', false);
                this.videoStore.toggleSpinner('processing', false);
                
                // Polling service durumlarını sıfırla
                pollingService.isLoadingSummary.value = false;
                pollingService.isPollingActiveSummary.value = false;
                
                // Özet içeriğini ayarla
                this.videoData.value.summary = response.content || '';
                if (response.content) {
                  this.videoData.value.summaryPreview = response.content.substring(0, 250) + '...';
                }
                
                console.log('📡 All summary spinners and loading states forcefully stopped');
              } else if (response.status === 'pending' || response.status === 'processing') {
                console.log('📡 API returned pending/processing summary - ensuring socket listeners are active');
                
                // Socket dinleyicilerinin aktif olduğundan emin olalım
                this.setupSocketListeners(transcript.video_id);
                
                // Emniyet için, 45 saniye sonra özet durumunu kontrol et
                this.setSummaryTimeout(videoId, 'safetyCheck', () => {
                  if (this.videoStore.getLoadingState('summary') && 
                      this.videoStore.currentProcessingVideoId === videoId) {
                    
                    // Özet durumunu kontrol et
                    apiService.getSummaryStatus(videoId, language)
                      .then(finalStatus => {
                        if (finalStatus.status === 'completed' && finalStatus.content) {
                          // Özetin tamamlandığını ve içeriği bulduğumuzu bildiriyoruz
                          console.log('✅ Found completed summary after safety timeout');
                          
                          // İçeriği ayarla ve spinner'ları kapat
                          this.videoData.value.summary = finalStatus.content;
                          this.videoData.value.summaryPreview = finalStatus.content.substring(0, 250) + '...';
                          this.videoStore.setLoadingState('summary', false);
                          this.videoStore.toggleSpinner('summary', false);
                          this.videoStore.setLoadingState('processing', false);
                          this.videoStore.toggleSpinner('processing', false);
                        } else {
                          // Spinner'ları kapat
                          this.videoStore.setLoadingState('summary', false);
                          this.videoStore.toggleSpinner('summary', false);
                          this.videoStore.setLoadingState('processing', false);
                          this.videoStore.toggleSpinner('processing', false);
                        }
                      })
                      .catch(error => {
                        console.error('❌ Error in safety timeout check:', error);
                        // Hata durumunda spinner'ları kapat
                        this.videoStore.setLoadingState('summary', false);
                        this.videoStore.toggleSpinner('summary', false);
                        this.videoStore.setLoadingState('processing', false);
                        this.videoStore.toggleSpinner('processing', false);
                      });
                  }
                }, 45000); // 45 saniye sonra kontrol et
              }
            })
            .catch(error => {
              console.error('Error starting summary process:', error);
              // Hata durumunda loading state'leri kapatalım
              this.videoStore.setLoadingState('summary', false);
              this.videoStore.toggleSpinner('summary', false);
              this.videoStore.setLoadingState('processing', false);
              this.videoStore.toggleSpinner('processing', false);
            });
        })
        .catch(error => {
          console.error('Error checking summary status:', error);
          // Hata durumunda spinner'ları kapat
          this.videoStore.setLoadingState('summary', false);
          this.videoStore.toggleSpinner('summary', false);
          this.videoStore.setLoadingState('processing', false);
          this.videoStore.toggleSpinner('processing', false);
        });
    }
  }
  
  private handleSummaryComplete(summary: any): void {
    console.log('🔄 Summary completed:', summary);
    
    // Only accept updates for the current processing video
    if (summary.video_id !== this.videoStore.currentProcessingVideoId) {
      console.log(`⚠️ Received summary update for ${summary.video_id} but current video is ${this.videoStore.currentProcessingVideoId}`);
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
    
    // Spinner'ları kapat - forcefullyStopSummaryLoading kullanmadan
    this.videoStore.setLoadingState('summary', false);
    this.videoStore.toggleSpinner('summary', false);
    this.videoStore.setLoadingState('processing', false);
    this.videoStore.toggleSpinner('processing', false);
    
    // PollingService durumlarını sıfırla
    pollingService.isLoadingSummary.value = false;
    pollingService.isPollingActiveSummary.value = false;
    
    console.log('🎉 Summary processing completed for video:', summary.video_id);
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

  async createTranscript(videoId: string, language: string): Promise<TranscriptResponse> {
    try {
      console.log(`[VideoProcessingService] Creating transcript for videoId: ${videoId}, language: ${language}`);
      return await apiService.createTranscriptFromVideo({ videoId, language });
    } catch (error) {
      console.error(`[VideoProcessingService] Error creating transcript:`, error);
      throw error;
    }
  }

  async checkTranscriptStatus(transcriptId: string): Promise<ProcessingStatus> {
    try {
      console.log(`[VideoProcessingService] Checking transcript status for id: ${transcriptId}`);
      /* POLLING METODU COMMENT YAPILDI
      const status = await this.pollTranscriptStatus(transcriptId, 'en'); // 'en' is default, but should be dynamic
      */
      const status = await apiService.getTranscriptStatus(transcriptId, 'en');
      return status;
    } catch (error) {
      console.error(`[VideoProcessingService] Error checking transcript status:`, error);
      throw error;
    }
  }

  async createSummary(transcriptId: string, language: string): Promise<SummaryResponse> {
    try {
      console.log(`[VideoProcessingService] Creating summary for transcript id: ${transcriptId}, language: ${language}`);
      return await apiService.createSummaryFromVideo({ videoId: transcriptId, language });
    } catch (error) {
      console.error(`[VideoProcessingService] Error creating summary:`, error);
      throw error;
    }
  }

  async checkSummaryStatus(summaryId: string): Promise<ProcessingStatus> {
    try {
      console.log(`[VideoProcessingService] Checking summary status for id: ${summaryId}`);
      /* POLLING METODU COMMENT YAPILDI
      const status = await this.pollSummaryStatus(summaryId, 'en'); // 'en' is default, but should be dynamic
      */
      const status = await apiService.getSummaryStatus(summaryId, 'en');
      return status;
    } catch (error) {
      console.error(`[VideoProcessingService] Error checking summary status:`, error);
      throw error;
    }
  }
} 