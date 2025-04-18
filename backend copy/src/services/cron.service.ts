import { CronJob } from 'cron';
import { logCron } from '../utils/logger';
import { CronRepository } from '../repositories/cronRepository';
import { supabaseAdmin } from '../config/supabase';
import { TranscriptService, transcriptService } from './transcriptService';
import fs from 'fs';
import path from 'path';

interface TranscriptStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'not_found';
  error?: string;
  formatted_text?: string;
}

interface SummaryStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  content?: string;
}

export class CronService {
  private summaryCheckJob: CronJob;
  private userSummaryUpdateJob: CronJob;
  private userChannelSummaryJob: CronJob;
  private logCleanupJob: CronJob;
  private cronRepository: CronRepository;
  private transcriptService: TranscriptService;

  constructor() {
    this.cronRepository = new CronRepository();
    this.transcriptService = transcriptService;

    // Her dakika çalışacak şekilde ayarlandı (* * * * *)
    const cronPattern = '* * * * *';
    this.summaryCheckJob = new CronJob(
      cronPattern,
      this.processVideosWithoutSummary.bind(this),
      null,
      false,
      'Europe/Istanbul'
    );

    // Özet-kullanıcı ilişkilerini güncelleyen job (her dakika)
    const updatePattern = '* * * * *';
    this.userSummaryUpdateJob = new CronJob(
      updatePattern,
      async () => {
        logCron('userSummaryUpdateJob', 'info', '🔄 User summary update job started');
        await this.updateUserSummaryRelations();
        logCron('userSummaryUpdateJob', 'info', '✅ User summary update job completed');
      },
      null,
      false,
      'Europe/Istanbul'
    );

    // Her dakika kullanıcı-kanal-özet ilişkilerini güncelleyen job
    // 30 saniye farkla çalıştırıyoruz ki yük aynı anda gelmesin
    const channelSummaryPattern = '*/2 * * * *';
    this.userChannelSummaryJob = new CronJob(
      channelSummaryPattern,
      async () => {
        logCron('userChannelSummaryJob', 'info', '🔄 User-channel summary relation job started');
        await this.createUserSummaryRelations();
        logCron('userChannelSummaryJob', 'info', '✅ User-channel summary relation job completed');
      },
      null,
      false,
      'Europe/Istanbul'
    );

    // Log temizleme görevi - Her gün gece yarısı çalışır (0 0 * * *)
    const logCleanupPattern = '0 0 * * *';
    this.logCleanupJob = new CronJob(
      logCleanupPattern,
      async () => {
        logCron('logCleanupJob', 'info', '🧹 Log cleanup job started');
        await this.cleanupLogs();
        logCron('logCleanupJob', 'info', '✅ Log cleanup job completed');
      },
      null,
      false,
      'Europe/Istanbul'
    );

    console.log(`📅 Cron görevleri ayarlandı: ${cronPattern}, ${updatePattern}, ${channelSummaryPattern}, ${logCleanupPattern}`);
    logCron('constructor', 'info', `📅 Cron görevleri ayarlandı`);
  }

  // TranscriptService kullanarak transkript işlemini başlat
  private async createTranscriptFromVideo(videoId: string, language: string): Promise<TranscriptStatus> {
    logCron('createTranscriptFromVideo', 'info', `🎬 Starting transcript creation for video: ${videoId}`);
    
    try {
      const result = await this.transcriptService.getOrCreateTranscript(videoId, language);
      
      return {
        status: result.status,
        error: result.message || result.error,
        formatted_text: result.data?.formatted_text
      };
    } catch (error) {
      logCron('createTranscriptFromVideo', 'error', `Error creating transcript for video ${videoId}:`, error);
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // TranscriptService kullanarak transkript durumunu kontrol et
  private async getTranscriptStatus(videoId: string, language: string): Promise<TranscriptStatus> {
    try {
      const status = await this.transcriptService.getTranscriptStatus(videoId, language);
      
      return {
        status: status.status,
        error: status.error || status.message,
        formatted_text: status.formatted_text
      };
    } catch (error) {
      logCron('getTranscriptStatus', 'error', `Error getting transcript status for video ${videoId}:`, error);
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Özeti olmayan videoları işle
  async processVideosWithoutSummary(): Promise<void> {
    try {
      // Get videos without summaries from repository
      const videos = await this.cronRepository.getVideosWithoutSummary();
      logCron('processVideos', 'info', `Found ${videos.length} videos without summaries`);

      if (videos.length === 0) {
        logCron('processVideos', 'info', 'No videos found without summaries');
        return;
      }

      // Tüm videoları paralel olarak işle
      const processPromises = videos.map(async (video) => {
        try {
          // Kullanıcının dil tercihi (yoksa tr)
          const userLanguage = video.language || 'tr';
          
          logCron('processVideos', 'info', `Processing video: ${video.video_id} with language: ${userLanguage}`);
          
          // Create transcript with the user's preferred language
          const transcriptResponse = await this.createTranscriptFromVideo(video.video_id, userLanguage);
          logCron('processVideos', 'info', `Transcript creation started for video ${video.video_id} in ${userLanguage}`);

          // Transkript başlatıldıktan sonra diğer videolara geçebiliriz
          // Transkript durumunu kontrol etmek için ayrı bir cron job kullanılabilir
          logCron('processVideos', 'info', `Video ${video.video_id} transcript request submitted successfully in ${userLanguage}`);
        } catch (error) {
          logCron('processVideos', 'error', `Error processing video ${video.video_id}:`, error);
        }
      });

      // Tüm işlemlerin tamamlanmasını bekle
      await Promise.all(processPromises);
      logCron('processVideos', 'info', 'All video transcript requests submitted successfully');

    } catch (error) {
      logCron('processVideos', 'error', 'Error in processVideosWithoutSummary:', error);
      throw error;
    }
  }

  /**
   * channel_videos tablosunda tr_has_summary ve en_has_summary flaglerine göre
   * özet durumunu kontrol eder ve günceller
   */
  async updateUserSummaryRelations(): Promise<void> {
    try {
      logCron('updateUserSummaryRelations', 'info', 'Starting channel_videos language-based summary status update');
      
      // Türkçe özetlerin durumunu kontrol et
      await this.updateLanguageSummaries('tr');
      
      // İngilizce özetlerin durumunu kontrol et
      await this.updateLanguageSummaries('en');
      
      logCron('updateUserSummaryRelations', 'info', 'Completed channel_videos language-based summary status update');
      
    } catch (error) {
      logCron('updateUserSummaryRelations', 'error', 'Error in updateUserSummaryRelations:', error);
    }
  }

  /**
   * Belirli bir dil için özet durumunu kontrol eder ve günceller
   */
  private async updateLanguageSummaries(language: 'tr' | 'en'): Promise<void> {
    try {
      // Hangi flag alanını kontrol edeceğimizi belirle
      const flagField = language === 'tr' ? 'tr_has_summary' : 'en_has_summary';
      
      logCron('updateLanguageSummaries', 'info', `Processing ${language} summaries, using ${flagField} field`);
      
      // 1. Belirtilen dil için özeti olmayan videoları getir
      const { data: channelVideos, error: fetchError } = await supabaseAdmin
        .from('channel_videos')
        .select('video_id, channel_id')
        .eq(flagField, false);
        
      if (fetchError) {
        throw fetchError;
      }
      
      logCron('updateLanguageSummaries', 'info', `Found ${channelVideos?.length || 0} videos without ${language} summaries`);
      
      if (!channelVideos || channelVideos.length === 0) {
        logCron('updateLanguageSummaries', 'info', `No videos found without ${language} summaries to update`);
        return;
      }
      
      // 2. Her video için belirtilen dilde özet var mı kontrol et ve güncelle
      let updatedCount = 0;
      
      for (const video of channelVideos) {
        try {
          // Özet mevcut mu kontrol et - dile göre filtreleme yap
          const { data: summary, error: summaryError } = await supabaseAdmin
            .from('summaries')
            .select('id, status')
            .eq('video_id', video.video_id)
            .eq('language', language)
            .eq('status', 'completed')
            .maybeSingle();
            
          if (summaryError) {
            logCron('updateLanguageSummaries', 'error', `Error checking ${language} summary for video ${video.video_id}:`, summaryError);
            continue;
          }
          
          // Tamamlanmış özet var mı kontrol et
          if (summary && summary.id) {
            // Dinamik bir update nesnesi oluştur
            const updateData: any = {};
            updateData[flagField] = true;
            
            // channel_videos tablosunu güncelle - sadece ilgili dil flagini güncelle
            const { error: updateError } = await supabaseAdmin
              .from('channel_videos')
              .update(updateData)
              .eq('video_id', video.video_id);
              
            if (updateError) {
              logCron('updateLanguageSummaries', 'error', `Error updating ${flagField} for video ${video.video_id}:`, updateError);
              continue;
            }
            
            updatedCount++;
            logCron('updateLanguageSummaries', 'info', `Updated ${flagField}=true for video ${video.video_id}`);
          }
        } catch (error) {
          logCron('updateLanguageSummaries', 'error', `Error processing ${language} summary for video ${video.video_id}:`, error);
        }
      }
      
      logCron('updateLanguageSummaries', 'info', `Completed ${language} summaries update, updated ${updatedCount} videos`);
      
    } catch (error) {
      logCron('updateLanguageSummaries', 'error', `Error updating ${language} summaries:`, error);
    }
  }

  /**
   * Kullanıcıların eklediği kanalların videoları için dil bazlı özet ilişkilerini oluşturur
   */
  async createUserSummaryRelations(): Promise<void> {
    try {
      logCron('createUserSummaryRelations', 'info', 'Starting language-based user-channel-summary relation update');
      
      // 1. Tüm kullanıcı-kanal ilişkilerini ve dil tercihlerini al
      const { data: userChannels, error: userChannelError } = await supabaseAdmin
        .from('user_channels')
        .select('user_id, channel_id, language');
        
      if (userChannelError) {
        throw userChannelError;
      }
      
      if (!userChannels || userChannels.length === 0) {
        logCron('createUserSummaryRelations', 'info', 'No user-channel relations found');
        return;
      }
      
      logCron('createUserSummaryRelations', 'info', `Found ${userChannels.length} user-channel relations`);
      
      // İşlenen ilişki sayısını takip et
      let processedCount = 0;
      
      // 2. Her kullanıcı-kanal ilişkisi için işlem yap
      for (const userChannel of userChannels) {
        // Kullanıcının tercih ettiği dili al
        const userLanguage = userChannel.language || 'tr'; // Varsayılan dil Türkçe
        
        // Hangi flag'e bakılacağını belirle
        const flagField = userLanguage === 'tr' ? 'tr_has_summary' : 'en_has_summary';
        
        logCron('createUserSummaryRelations', 'info', 
          `Processing user ${userChannel.user_id} for channel ${userChannel.channel_id} with language ${userLanguage}`);
        
        // 2.1 Kanalın belirtilen dilde özeti olan videolarını bul
        const { data: channelVideos, error: videoError } = await supabaseAdmin
          .from('channel_videos')
          .select('video_id')
          .eq('channel_id', userChannel.channel_id)
          .eq(flagField, true);
          
        if (videoError) {
          logCron('createUserSummaryRelations', 'error', 
            `Error fetching videos with ${userLanguage} summaries for channel ${userChannel.channel_id}:`, videoError);
          continue;
        }
        
        if (!channelVideos || channelVideos.length === 0) {
          logCron('createUserSummaryRelations', 'info', 
            `No videos with ${userLanguage} summaries found for channel ${userChannel.channel_id}`);
          continue;
        }
        
        // 2.2 Her video için özet bilgisini al ve kullanıcı-özet ilişkisini kur
        for (const video of channelVideos) {
          // Videonun belirtilen dildeki özet bilgisini al
          const { data: summary, error: summaryError } = await supabaseAdmin
            .from('summaries')
            .select('id')
            .eq('video_id', video.video_id)
            .eq('language', userLanguage)
            .eq('status', 'completed')
            .maybeSingle();
            
          if (summaryError) {
            logCron('createUserSummaryRelations', 'error', 
              `Error fetching ${userLanguage} summary for video ${video.video_id}:`, summaryError);
            continue;
          }
          
          if (!summary || !summary.id) {
            logCron('createUserSummaryRelations', 'info', 
              `No completed ${userLanguage} summary found for video ${video.video_id}`);
            continue;
          }
          
          // İlişki zaten var mı kontrol et
          const { data: existingRelation, error: relationError } = await supabaseAdmin
            .from('user_summaries')
            .select('id')
            .eq('user_id', userChannel.user_id)
            .eq('summary_id', summary.id)
            .eq('video_id', video.video_id)
            .maybeSingle();
            
          if (relationError) {
            logCron('createUserSummaryRelations', 'error', `Error checking existing relation:`, relationError);
            continue;
          }
          
          // İlişki yoksa ekle
          if (!existingRelation) {
            const { error: insertError } = await supabaseAdmin
              .from('user_summaries')
              .insert({
                user_id: userChannel.user_id,
                summary_id: summary.id,
                video_id: video.video_id, 
                is_visible: true // Varsayılan olarak görünür yap
              });
              
            if (insertError) {
              logCron('createUserSummaryRelations', 'error', `Error inserting user_summary relation:`, insertError);
              continue;
            }
            
            processedCount++;
            logCron('createUserSummaryRelations', 'info', 
              `Created ${userLanguage} summary relation for user ${userChannel.user_id}, video ${video.video_id}`);
          }
        }
      }
      
      logCron('createUserSummaryRelations', 'info', `Completed user-summary relations, created ${processedCount} relations`);
      
    } catch (error) {
      logCron('createUserSummaryRelations', 'error', 'Error in createUserSummaryRelations:', error);
    }
  }

  /**
   * Log dosyalarını temizler
   * - Tüm .log uzantılı dosyaları siler (test için)
   */
  private async cleanupLogs(): Promise<void> {
    try {
      // Log dizini
      const logDir = path.join(process.cwd(), 'logs');
      
      // Log dizini yoksa oluştur
      if (!fs.existsSync(logDir)) {
        logCron('cleanupLogs', 'info', 'Log directory does not exist, creating...');
        fs.mkdirSync(logDir, { recursive: true });
        return;
      }

      // Log dosyalarını listele
      const files = fs.readdirSync(logDir);
      let deletedCount = 0;

      for (const file of files) {
        // Sadece .log uzantılı dosyaları işle
        if (!file.endsWith('.log')) {
          continue;
        }

        const filePath = path.join(logDir, file);
        
        try {
          // Dosyayı sil
          fs.unlinkSync(filePath);
          logCron('cleanupLogs', 'info', `Deleted log file: ${file}`);
          deletedCount++;
        } catch (err) {
          logCron('cleanupLogs', 'error', `Error deleting file ${file}:`, err);
        }
      }

      logCron('cleanupLogs', 'info', `Cleaned up ${deletedCount} log files`);
    } catch (error) {
      logCron('cleanupLogs', 'error', 'Error cleaning up logs:', error);
    }
  }

  public start() {
    try {
      this.summaryCheckJob.start();
      this.userSummaryUpdateJob.start();
      this.userChannelSummaryJob.start();
      this.logCleanupJob.start();
      
      // Sadece development ortamında ilk çalıştırma yapalım
      if (process.env.NODE_ENV !== 'production') {
        logCron('start', 'info', '🧪 Development modunda - Özet işlemleri hemen çalıştırılıyor...');
        
        // Development ortamında kısa aralıklarla çalıştıralım
        setTimeout(() => this.updateUserSummaryRelations(), 5000); // 5 saniye sonra
        setTimeout(() => this.createUserSummaryRelations(), 10000); // 10 saniye sonra
      } else {
        logCron('start', 'info', '🚀 Üretim modunda - Özet işlemleri zamanlanmış görevlerle çalışacak (her dakika)');
      }
      
      logCron('start', 'info', '🚀 Cron görevleri başlatıldı');
    } catch (error) {
      logCron('start', 'error', '❌ Cron görevleri başlatılamadı', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  public stop() {
    this.summaryCheckJob.stop();
    this.userSummaryUpdateJob.stop();
    this.userChannelSummaryJob.stop();
    this.logCleanupJob.stop();
    logCron('stop', 'info', '🛑 Cron görevleri durduruldu');
  }
} 