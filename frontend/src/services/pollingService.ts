import apiService from './apiService';
import { ref } from 'vue';
import type { TranscriptResponse, SummaryResponse, ProcessingStatus } from './apiService';

export class PollingService {
  private transcriptIntervals: Map<string, number> = new Map();
  private summaryIntervals: Map<string, number> = new Map();
  private isPollingActive: Map<string, boolean> = new Map(); // Track polling status per videoId
  private readonly TRANSCRIPT_INTERVAL = 3000; // 3 seconds
  private readonly SUMMARY_INTERVAL = 3000; // 3 seconds
  private readonly MAX_TRANSCRIPT_ATTEMPTS = 20; // 1 minute (3s * 20)
  private readonly MAX_SUMMARY_ATTEMPTS = 20; // 1 minute (3s * 20)

  // State refs
  public isLoadingTranscript = ref(false);
  public isLoadingSummary = ref(false);
  public isPollingActiveSummary = ref(false);
  public error = ref('');

  /**
   * Start polling for both transcript and summary
   */
  startPolling(videoId: string, language: string = 'en', callbacks: {
    onTranscriptComplete?: (transcript: TranscriptResponse) => void,
    onSummaryComplete?: (summary: SummaryResponse) => void,
    onError?: (error: Error) => void
  } = {}) {
    console.log(`🔄 startPolling called for videoId: ${videoId}, language: ${language}`);
    
    // İlk olarak mevcut polling'leri temizle
    this.stopAllPolling(videoId);
    
    // Polling başladığını kaydet
    this.isPollingActive.set(videoId, true);
    
    // Transkript polling'i başlat
    this.startTranscriptPolling(videoId, language, callbacks);
  }

  /**
   * Start polling for transcript
   */
  private startTranscriptPolling(videoId: string, language: string, callbacks: {
    onTranscriptComplete?: (transcript: TranscriptResponse) => void,
    onSummaryComplete?: (summary: SummaryResponse) => void,
    onError?: (error: Error) => void
  }) {
    let attempts = 0;
    this.isLoadingTranscript.value = true;
    this.error.value = '';

    console.log(`🔄 Setting up transcript polling interval for videoId: ${videoId}`);
    
    // Mevcut transcript interval'ını temizle
    this.stopTranscriptPolling(videoId);

    const intervalId = window.setInterval(async () => {
      // Polling aktif değilse, interval'ı durdur
      if (!this.isPollingActive.get(videoId)) {
        console.log(`⏹️ Transcript polling stopped because polling is not active for videoId: ${videoId}`);
        this.stopTranscriptPolling(videoId);
        return;
      }
      
      console.log(`📡 Polling transcript for videoId: ${videoId}...`, { attempts, maxAttempts: this.MAX_TRANSCRIPT_ATTEMPTS });

      if (attempts >= this.MAX_TRANSCRIPT_ATTEMPTS) {
        console.log(`⚠️ Transcript polling max attempts reached for videoId: ${videoId}`);
        this.stopTranscriptPolling(videoId);
        this.isLoadingTranscript.value = false;
        this.error.value = 'Transkript oluşturma zaman aşımına uğradı.';
        callbacks.onError?.(new Error('Transcript timeout'));
        return;
      }

      try {
        const status = await apiService.getTranscriptStatus(videoId, language);
        console.log(`📊 Transcript polling result for videoId: ${videoId}:`, status);

        if (status?.status === 'completed') {
          console.log(`✅ Transcript completed for videoId: ${videoId}`);
          this.stopTranscriptPolling(videoId);
          this.isLoadingTranscript.value = false;
          const response = await this.convertToTranscriptResponse(status);
          callbacks.onTranscriptComplete?.(response);

          // Start summary polling after transcript is complete
          this.startSummaryPolling(videoId, language, callbacks);
        }

        attempts++;
      } catch (error) {
        console.error(`❌ Transcript polling error for videoId: ${videoId}:`, error);
        this.error.value = error instanceof Error ? error.message : 'Transkript alınırken bir hata oluştu';
        callbacks.onError?.(error instanceof Error ? error : new Error('Transcript polling failed'));
        // Hata durumunda da polling'i durdur
        this.stopTranscriptPolling(videoId);
      }
    }, this.TRANSCRIPT_INTERVAL);

    this.transcriptIntervals.set(videoId, intervalId);
  }

  /**
   * Start polling for summary
   */
  private startSummaryPolling(videoId: string, language: string, callbacks: {
    onSummaryComplete?: (summary: SummaryResponse) => void,
    onError?: (error: Error) => void
  }) {
    let attempts = 0;
    
    this.isLoadingSummary.value = true;
    this.isPollingActiveSummary.value = true;
    console.log(`🔄 Setting up summary polling interval for videoId: ${videoId}`);
    
    // Mevcut summary interval'ını temizle
    this.stopSummaryPolling(videoId);

    const intervalId = window.setInterval(async () => {
      // Polling aktif değilse, interval'ı durdur
      if (!this.isPollingActive.get(videoId)) {
        console.log(`⏹️ Summary polling stopped because polling is not active for videoId: ${videoId}`);
        this.stopSummaryPolling(videoId);
        return;
      }
      
      console.log(`📡 Polling summary for videoId: ${videoId}...`, { attempts, maxAttempts: this.MAX_SUMMARY_ATTEMPTS });
      
      try {
        if (attempts >= this.MAX_SUMMARY_ATTEMPTS) {
          console.log(`⚠️ Summary polling max attempts reached for videoId: ${videoId}`);
          this.stopSummaryPolling(videoId);
          this.isLoadingSummary.value = false;
          this.error.value = 'Özet oluşturma zaman aşımına uğradı.';
          callbacks.onError?.(new Error('Summary timeout'));
          return;
        }

        const status = await apiService.getSummaryStatus(videoId, language);
        console.log(`📊 Summary polling result for videoId: ${videoId}:`, status);

        if (status?.status === 'completed') {
          console.log(`✅ Summary completed for videoId: ${videoId}`);
          this.stopSummaryPolling(videoId);
          this.stopAllPolling(videoId); // Emin olmak için tüm polling'leri durdur
          this.isLoadingSummary.value = false;
          this.isPollingActiveSummary.value = false;
          
          const response = await this.convertToSummaryResponse(status);
          callbacks.onSummaryComplete?.(response);
        } else if (status?.status === 'failed' || status?.status === 'error') {
          console.error(`❌ Summary failed for videoId: ${videoId}:`, status.error);
          this.stopSummaryPolling(videoId);
          this.stopAllPolling(videoId); // Emin olmak için tüm polling'leri durdur
          this.isLoadingSummary.value = false;
          this.isPollingActiveSummary.value = false;
          this.error.value = status.error || 'Özet oluşturma başarısız oldu.';
          callbacks.onError?.(new Error(status.error || 'Summary failed'));
        }

        attempts++;
      } catch (error) {
        console.error(`❌ Summary polling error for videoId: ${videoId}:`, error);
        this.error.value = error instanceof Error ? error.message : 'Özet alınırken bir hata oluştu';
        callbacks.onError?.(error instanceof Error ? error : new Error('Summary polling failed'));
        this.stopSummaryPolling(videoId);
        this.stopAllPolling(videoId); // Emin olmak için tüm polling'leri durdur
      }
    }, this.SUMMARY_INTERVAL);

    this.summaryIntervals.set(videoId, intervalId);
  }

  /**
   * Stop transcript polling
   */
  stopTranscriptPolling(videoId: string) {
    console.log(`⏹️ Stopping transcript polling for videoId: ${videoId}`);
    const intervalId = this.transcriptIntervals.get(videoId);
    if (intervalId) {
      try {
        window.clearInterval(intervalId);
        console.log(`✅ Transcript interval cleared for videoId: ${videoId}`);
      } catch (error) {
        console.error(`❌ Error clearing transcript interval for videoId: ${videoId}:`, error);
      }
      this.transcriptIntervals.delete(videoId);
      this.isLoadingTranscript.value = false;
    }
  }

  /**
   * Stop summary polling
   */
  stopSummaryPolling(videoId: string) {
    console.log(`⏹️ Stopping summary polling for videoId: ${videoId}`);
    const intervalId = this.summaryIntervals.get(videoId);
    if (intervalId) {
      try {
        window.clearInterval(intervalId);
        console.log(`✅ Summary interval cleared for videoId: ${videoId}`);
      } catch (error) {
        console.error(`❌ Error clearing summary interval for videoId: ${videoId}:`, error);
      }
      this.summaryIntervals.delete(videoId);
      this.isLoadingSummary.value = false;
      this.isPollingActiveSummary.value = false;
    }
  }

  /**
   * Stop all polling for a specific video ID
   */
  stopAllPolling(videoId: string) {
    console.log(`⏹️ Stopping all polling for videoId: ${videoId}`);
    
    // Polling durumunu güncelle
    this.isPollingActive.set(videoId, false);
    
    // Trankript polling'i durdur
    this.stopTranscriptPolling(videoId);
    
    // Özet polling'i durdur
    this.stopSummaryPolling(videoId);
    
    // Tüm durum değişkenlerini sıfırla
    this.isLoadingTranscript.value = false;
    this.isLoadingSummary.value = false;
    this.isPollingActiveSummary.value = false;
    
    console.log(`✅ All polling stopped for videoId: ${videoId}`);
  }

  /**
   * Stop all polling for all video IDs
   */
  stopAllActivePolling() {
    console.log(`⏹️ Stopping all active polling for all videos`);
    
    // Tüm transcript polling'lerini durdur
    for (const videoId of this.transcriptIntervals.keys()) {
      this.stopTranscriptPolling(videoId);
    }
    
    // Tüm summary polling'lerini durdur
    for (const videoId of this.summaryIntervals.keys()) {
      this.stopSummaryPolling(videoId);
    }
    
    // Tüm videoların polling durumunu güncelle
    for (const videoId of this.isPollingActive.keys()) {
      this.isPollingActive.set(videoId, false);
    }
    
    // Tüm durum değişkenlerini sıfırla
    this.isLoadingTranscript.value = false;
    this.isLoadingSummary.value = false;
    this.isPollingActiveSummary.value = false;
    
    console.log('🧹 All active polling processes have been stopped');
  }

  /**
   * Nuclear option: Acil durumlarda tüm interval'ları temizler
   * Bu fonksiyon tarayıcıda window.pollingServiceEmergencyStop() ile çağrılabilir
   */
  emergencyStopAllPolling() {
    console.log('☢️ EMERGENCY: Stopping ALL intervals up to ID 10000');
    
    // Her interval ID'si için clearInterval çağır (10000'e kadar)
    for (let i = 0; i < 10000; i++) {
      try {
        window.clearInterval(i);
        window.clearTimeout(i);
      } catch (error) {
        // Hataları görmezden gel
      }
    }
    
    // Maps'leri temizle
    this.transcriptIntervals.clear();
    this.summaryIntervals.clear();
    this.isPollingActive.clear();
    
    // Durum değişkenlerini sıfırla
    this.isLoadingTranscript.value = false;
    this.isLoadingSummary.value = false;
    this.isPollingActiveSummary.value = false;
    this.error.value = '';
    
    console.log('☢️ EMERGENCY STOP COMPLETED: All intervals have been cleared');
  }
  
  /**
   * Checks if polling is active for a specific video ID
   */
  isPollingActiveForVideo(videoId: string): boolean {
    return this.isPollingActive.get(videoId) === true;
  }
  
  /**
   * Checks if any polling is active
   */
  isAnyPollingActive(): boolean {
    return this.isLoadingTranscript.value || this.isLoadingSummary.value;
  }

  private async convertToTranscriptResponse(status: ProcessingStatus): Promise<TranscriptResponse> {
    if (status.status === 'not_found') {
      return {
        status: 'pending',
        task_id: undefined
      };
    }
    return {
      status: status.status,
      task_id: status.task_id,
      formatted_text: status.formatted_text,
      error: status.error
    };
  }

  private async convertToSummaryResponse(status: ProcessingStatus): Promise<SummaryResponse> {
    if (status.status === 'not_found') {
      return {
        status: 'pending',
        task_id: undefined
      };
    }
    return {
      status: status.status,
      task_id: status.task_id,
      content: status.content,
      error: status.error
    };
  }
}

// Export default instance
const pollingService = new PollingService();

// Tarayıcıda acil durumlar için global fonksiyon olarak ekle
if (typeof window !== 'undefined') {
  (window as any).pollingServiceEmergencyStop = () => {
    pollingService.emergencyStopAllPolling();
  };
}

export default pollingService; 