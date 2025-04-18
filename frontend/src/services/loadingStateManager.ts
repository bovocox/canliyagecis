import { ref } from 'vue';
import type { Ref } from 'vue';
import { useVideoStore } from '@/stores/videoStore';
import { ElMessage } from 'element-plus';

// Yükleme durumu tipi
export interface LoadingState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

/**
 * Yükleme durumları ve spinner'ları yöneten servis
 */
export class LoadingStateManager {
  // Doğrudan sınıf özelliği olarak videoStore'u tanımlamak yerine
  // bir getter metodu kullanarak lazy initialization uygulayalım
  private _videoStore: ReturnType<typeof useVideoStore> | null = null;
  
  // Getter metodu - videoStore'a erişim gerektiğinde çağrılır
  private get videoStore(): ReturnType<typeof useVideoStore> {
    if (!this._videoStore) {
      this._videoStore = useVideoStore();
    }
    return this._videoStore;
  }
  
  private transcriptState = ref<LoadingState<any>>({
    loading: false,
    error: null,
    data: null
  });
  private summaryState = ref<LoadingState<any>>({
    loading: false,
    error: null,
    data: null
  });
  private videoState = ref<LoadingState<any>>({
    loading: false,
    error: null,
    data: null
  });
  private timeouts: Record<string, NodeJS.Timeout> = {};
  
  constructor() {
    // İşlem devam ederken gösterilecek error, loading vb. durumlar için
    this.transcriptState.value.loading = false;
    this.summaryState.value.loading = false;
    this.transcriptState.value.error = null;
    this.summaryState.value.error = null;
  }

  /**
   * Yükleme durumunu günceller
   * @param type Yükleme türü (transcript, summary, video)
   * @param state Durum (loading, loaded, error)
   * @param data İlgili veri
   */
  updateLoadingState<T>(
    type: 'transcript' | 'summary' | 'video',
    state: 'loading' | 'loaded' | 'error',
    data: T | null = null,
    error: string | null = null,
    videoId?: string
  ): void {
    let currentState;
    
    if (type === 'transcript') {
      currentState = this.transcriptState;
    } else if (type === 'summary') {
      currentState = this.summaryState;
    } else {
      currentState = this.videoState;
    }
    
    console.log(`[${type}] State update: ${state}, Video ID: ${videoId || 'N/A'}`);
    console.log(`[${type}] Current state:`, currentState.value);
    
    if (state === 'loading') {
      currentState.value = {
        ...currentState.value,
        loading: true,
        error: null
      };
    } else if (state === 'loaded') {
      currentState.value = {
        loading: false,
        error: null,
        data
      };
    } else if (state === 'error') {
      currentState.value = {
        ...currentState.value,
        loading: false,
        error: error || 'Bir hata oluştu'
      };
    }
    
    console.log(`[${type}] Updated state:`, currentState.value);
  }

  /**
   * Belirtilen video ID için tüm spinner'ları zorla kapatır
   * @param videoId Video ID (belirtilmezse tüm spinner'lar kapatılır)
   */
  forceCloseSpinners(videoId?: string): void {
    console.log(`Force closing spinners. Video ID: ${videoId || 'all'}`);
    console.log('Current transcript state:', this.transcriptState.value);
    console.log('Current summary state:', this.summaryState.value);
    
    // Tüm spinner ve loading durumlarını temizle
    if (videoId) {
      // Belirli bir video için spinner'ları kapat
      // 1. State objeleri kontrolü
      if (
        this.transcriptState.value.loading &&
        this.transcriptState.value.data &&
        'id' in this.transcriptState.value.data &&
        this.transcriptState.value.data.id === videoId
      ) {
        this.transcriptState.value.loading = false;
      }
      
      if (
        this.summaryState.value.loading &&
        this.summaryState.value.data &&
        'id' in this.summaryState.value.data &&
        this.summaryState.value.data.id === videoId
      ) {
        this.summaryState.value.loading = false;
      }
      
      // 2. VideoStore durumlarını temizle
      if (this.videoStore) {
        if (this.videoStore.currentProcessingVideoId === videoId) {
          this.videoStore.setLoadingState('transcript', false);
          this.videoStore.setLoadingState('summary', false);
          this.videoStore.setLoadingState('processing', false);
          this.videoStore.toggleSpinner('transcript', false);
          this.videoStore.toggleSpinner('summary', false);
          this.videoStore.toggleSpinner('processing', false);
          
          // İşlem durumunu temizle
          this.videoStore.clearProcessingStatus();
        }
      }
    } else {
      // Tüm spinner'ları kapat
      this.transcriptState.value.loading = false;
      this.summaryState.value.loading = false;
      this.videoState.value.loading = false;
      
      // Tüm VideoStore spinner durumlarını kapat
      if (this.videoStore) {
        this.videoStore.setLoadingState('transcript', false);
        this.videoStore.setLoadingState('summary', false);
        this.videoStore.setLoadingState('processing', false);
        this.videoStore.setLoadingState('video', false);
        this.videoStore.toggleSpinner('transcript', false);
        this.videoStore.toggleSpinner('summary', false);
        this.videoStore.toggleSpinner('processing', false);
        this.videoStore.toggleSpinner('video', false);
        
        // İşlem durumunu temizle
        this.videoStore.clearProcessingStatus();
      }
    }
    
    // Tüm zamanlamaları temizle
    this.clearTimeouts(videoId);
    
    // Durumu logla
    console.log('Updated transcript state:', this.transcriptState.value);
    console.log('Updated summary state:', this.summaryState.value);
    
    // Nihai durumların doğrulamasını yap
    setTimeout(() => {
      console.log('Final state check after force close:',
        this.transcriptState.value.loading ? 'Transcript still loading!' : 'Transcript closed',
        this.summaryState.value.loading ? 'Summary still loading!' : 'Summary closed');
      
      // Son bir kontrol - hala yükleniyor olarak işaretlenmişse tekrar kapanmaya zorla
      if (this.transcriptState.value.loading || this.summaryState.value.loading) {
        console.log('⚠️ States still show loading after force close, applying direct update');
        this.transcriptState.value.loading = false;
        this.summaryState.value.loading = false;
      }
    }, 100);
  }

  /**
   * Zamanlayıcı ayarlar
   * @param videoId Video ID
   * @param timeoutType Zamanlayıcı tipi (tanımlama için kullanılır)
   * @param callback Zamanlayıcı tamamlandığında çağrılacak fonksiyon
   * @param ms Gecikme süresi (ms)
   */
  setTimeout(videoId: string, timeoutType: string, callback: () => void, ms: number): void {
    // Var olan zamanlayıcıyı temizle (aynı tip için)
    const timeoutKey = `${videoId}_${timeoutType}`;
    
    if (this.timeouts[timeoutKey]) {
      clearTimeout(this.timeouts[timeoutKey]);
      delete this.timeouts[timeoutKey];
    }
    
    // Yeni zaman aşımı oluştur
    this.timeouts[timeoutKey] = setTimeout(() => {
      callback();
      delete this.timeouts[timeoutKey];
    }, ms);
  }

  /**
   * Bir video ID'sine ait tüm zamanlayıcıları temizler
   * @param videoId Video ID
   */
  clearTimeouts(videoId?: string): void {
    if (videoId) {
      // Belirli bir video için tüm zamanlayıcıları temizle
      const keysToDelete: string[] = [];
      
      Object.keys(this.timeouts).forEach(key => {
        if (key.startsWith(`${videoId}_`)) {
          clearTimeout(this.timeouts[key]);
          keysToDelete.push(key);
        }
      });
      
      keysToDelete.forEach(key => delete this.timeouts[key]);
    } else {
      // Tüm zaman aşımlarını temizle
      Object.keys(this.timeouts).forEach(key => {
        clearTimeout(this.timeouts[key]);
      });
      
      // Objeyi temizle
      this.timeouts = {};
    }
  }

  /**
   * Hata mesajı gösterir
   * @param message Hata mesajı
   */
  notifyError(message: string, duration: number = 3000): void {
    ElMessage({
      message,
      type: 'error',
      duration,
      showClose: true
    });
  }

  /**
   * Uyarı mesajı gösterir
   * @param message Uyarı mesajı
   */
  notifyWarning(message: string, duration: number = 3000): void {
    ElMessage({
      message,
      type: 'warning',
      duration,
      showClose: true
    });
  }

  /**
   * Transcript state'ini döndürür
   */
  getTranscriptState(): Ref<LoadingState<any>> {
    return this.transcriptState;
  }

  /**
   * Summary state'ini döndürür
   */
  getSummaryState(): Ref<LoadingState<any>> {
    return this.summaryState;
  }

  /**
   * Video state'ini döndürür
   */
  getVideoState(): Ref<LoadingState<any>> {
    return this.videoState;
  }

  /**
   * Transcript loading değerini döndürür
   */
  getTranscriptLoading(): boolean {
    return this.transcriptState.value.loading;
  }

  /**
   * Summary loading değerini döndürür
   */
  getSummaryLoading(): boolean {
    return this.summaryState.value.loading;
  }

  /**
   * Transcript error değerini döndürür
   */
  getTranscriptError(): string | null {
    return this.transcriptState.value.error;
  }

  /**
   * Summary error değerini döndürür
   */
  getSummaryError(): string | null {
    return this.summaryState.value.error;
  }

  /**
   * Transcript error değerini ayarlar
   */
  setTranscriptError(value: string | null): void {
    this.transcriptState.value.error = value;
  }

  /**
   * Summary error değerini ayarlar
   */
  setSummaryError(value: string | null): void {
    this.summaryState.value.error = value;
  }
}

// Singleton instance
export const loadingStateManager = new LoadingStateManager(); 