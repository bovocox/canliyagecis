import apiService from './apiService';
import { ref } from 'vue';
import type { TranscriptResponse, SummaryResponse, ProcessingStatus } from './apiService';

export class PollingService {
  private transcriptIntervals: Map<string, number> = new Map();
  private summaryIntervals: Map<string, number> = new Map();
  private readonly TRANSCRIPT_INTERVAL = 3000; // 3 seconds
  private readonly SUMMARY_INTERVAL = 5000; // 5 seconds
  private readonly MAX_TRANSCRIPT_ATTEMPTS = 60; // 3 minutes (3s * 60)

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

    console.log('🔄 Setting up transcript polling interval');

    const intervalId = window.setInterval(async () => {
      console.log('📡 Polling transcript...', { attempts, maxAttempts: this.MAX_TRANSCRIPT_ATTEMPTS });

      if (attempts >= this.MAX_TRANSCRIPT_ATTEMPTS) {
        console.log('⚠️ Transcript polling max attempts reached');
        this.stopTranscriptPolling(videoId);
        this.isLoadingTranscript.value = false;
        this.error.value = 'Transkript oluşturma zaman aşımına uğradı.';
        callbacks.onError?.(new Error('Transcript timeout'));
        return;
      }

      try {
        const status = await apiService.getTranscriptStatus(videoId, language);
        console.log('📊 Polling result:', status);

        if (status?.status === 'completed') {
          console.log('✅ Transcript completed');
          this.stopTranscriptPolling(videoId);
          this.isLoadingTranscript.value = false;
          const response = await this.convertToTranscriptResponse(status);
          callbacks.onTranscriptComplete?.(response);

          // Start summary polling after transcript is complete
          this.startSummaryPolling(videoId, language, callbacks);
        }

        attempts++;
      } catch (error) {
        console.error('❌ Transcript polling error:', error);
        this.error.value = error instanceof Error ? error.message : 'Transkript alınırken bir hata oluştu';
        callbacks.onError?.(error instanceof Error ? error : new Error('Transcript polling failed'));
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
    const MAX_SUMMARY_ATTEMPTS = 60; // 5 dakika (5s * 60)
    
    this.isLoadingSummary.value = true;
    this.isPollingActiveSummary.value = true;
    console.log('🔄 Setting up summary polling interval');

    const intervalId = window.setInterval(async () => {
      try {
        if (attempts >= MAX_SUMMARY_ATTEMPTS) {
          console.log('⚠️ Summary polling max attempts reached');
          this.stopSummaryPolling(videoId);
          this.isLoadingSummary.value = false;
          this.error.value = 'Özet oluşturma zaman aşımına uğradı.';
          callbacks.onError?.(new Error('Summary timeout'));
          return;
        }

        const status = await apiService.getSummaryStatus(videoId, language);
        console.log('📊 Summary polling result:', status);

        if (status?.status === 'completed') {
          console.log('✅ Summary completed');
          this.stopSummaryPolling(videoId);
          this.isLoadingSummary.value = false;
          const response = await this.convertToSummaryResponse(status);
          callbacks.onSummaryComplete?.(response);
        } else if (status?.status === 'failed' || status?.status === 'error') {
          console.error('❌ Summary failed:', status.error);
          this.stopSummaryPolling(videoId);
          this.isLoadingSummary.value = false;
          this.error.value = status.error || 'Özet oluşturma başarısız oldu.';
          callbacks.onError?.(new Error(status.error || 'Summary failed'));
        }

        attempts++;
      } catch (error) {
        console.error('❌ Summary polling error:', error);
        this.error.value = error instanceof Error ? error.message : 'Özet alınırken bir hata oluştu';
        callbacks.onError?.(error instanceof Error ? error : new Error('Summary polling failed'));
        this.stopSummaryPolling(videoId);
      }
    }, this.SUMMARY_INTERVAL);

    this.summaryIntervals.set(videoId, intervalId);
  }

  /**
   * Stop transcript polling
   */
  stopTranscriptPolling(videoId: string) {
    const intervalId = this.transcriptIntervals.get(videoId);
    if (intervalId) {
      window.clearInterval(intervalId);
      this.transcriptIntervals.delete(videoId);
      this.isLoadingTranscript.value = false;
    }
  }

  /**
   * Stop summary polling
   */
  stopSummaryPolling(videoId: string) {
    const intervalId = this.summaryIntervals.get(videoId);
    if (intervalId) {
      window.clearInterval(intervalId);
      this.summaryIntervals.delete(videoId);
      this.isLoadingSummary.value = false;
      this.isPollingActiveSummary.value = false;
    }
  }

  /**
   * Stop all polling
   */
  stopAllPolling(videoId: string) {
    this.stopTranscriptPolling(videoId);
    this.stopSummaryPolling(videoId);
  }

  /**
   * Stop all polling for all video IDs
   */
  stopAllActivePolling() {
    // Tüm transcript polling'lerini durdur
    for (const videoId of this.transcriptIntervals.keys()) {
      this.stopTranscriptPolling(videoId);
    }
    
    // Tüm summary polling'lerini durdur
    for (const videoId of this.summaryIntervals.keys()) {
      this.stopSummaryPolling(videoId);
    }
    
    console.log('🧹 All active polling processes have been stopped');
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
export default new PollingService(); 