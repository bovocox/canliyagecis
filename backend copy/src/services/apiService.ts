import { supabaseAdmin } from '../config/supabase';
import { TranscriptService, transcriptService } from './transcriptService';
// SummaryService'i import et

export class ApiService {
  private transcriptService: TranscriptService;
  // private summaryService: SummaryService;

  constructor() {
    this.transcriptService = transcriptService;
    // this.summaryService = summaryService;
  }

  async createTranscriptFromVideo(videoId: string, language: string): Promise<any> {
    return await this.transcriptService.getOrCreateTranscript(videoId, language);
  }

  async getTranscriptStatus(videoId: string, language: string): Promise<any> {
    return await this.transcriptService.getTranscriptStatus(videoId, language);
  }

  async createSummaryFromVideo({ videoId, language }: { videoId: string, language: string }): Promise<any> {
    // return await this.summaryService.createSummary(videoId, language);
    // Geçici çözüm, ileride SummaryService eklenecek
    throw new Error("Summary service not implemented yet");
  }

  async getSummaryStatus(videoId: string, language: string): Promise<any> {
    // return await this.summaryService.getSummaryStatus(videoId, language);
    // Geçici çözüm, ileride SummaryService eklenecek
    throw new Error("Summary service not implemented yet");
  }
} 