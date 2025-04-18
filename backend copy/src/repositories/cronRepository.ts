import { supabase, supabaseAdmin } from '../config/supabase';
import logger from '../utils/logger';

export class CronError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError: any
  ) {
    super(message);
    this.name = 'CronError';
  }
}

interface VideoData {
  video_id: string;
  channel_id: string;
  created_at: string;
  tr_has_summary?: boolean | null;
  en_has_summary?: boolean | null;
  channels: {
    id: string;
    user_channels: Array<{
      user_id: string;
      language: string;
    }>;
  };
}

export interface VideoWithoutSummary {
  video_id: string;
  channel_id: string;
  user_id: string;
  language: string;
  tr_has_summary?: boolean | null;
  en_has_summary?: boolean | null;
}

export class CronRepository {
  async getVideosWithoutSummary(): Promise<VideoWithoutSummary[]> {
    try {
      logger.info('CronRepository.getVideosWithoutSummary - Sorgu başlatılıyor');

      // Supabase bağlantısını kontrol et
      logger.info('Supabase config:', {
        url: process.env.SUPABASE_URL,
        hasAnonKey: !!process.env.SUPABASE_ANON_KEY,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_KEY
      });

      // Admin client ile sorgu yap - artık hem tr_has_summary hem de en_has_summary alanlarını sorguya dahil ediyoruz
      const { data, error } = await supabaseAdmin
        .from('channel_videos')
        .select(`
          video_id,
          channel_id,
          tr_has_summary,
          en_has_summary,
          channels (
            id,
            user_channels (
              user_id,
              language
            )
          )
        `)
        .or('tr_has_summary.is.false,en_has_summary.is.false')
        .order('created_at', { ascending: true })
        .limit(10);

      logger.info('CronRepository.getVideosWithoutSummary - SQL Sorgu sonucu:', {
        hasError: !!error,
        dataLength: data?.length || 0,
        firstItem: data?.[0],
        error: error ? {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        } : null,
        allData: data
      });

      if (error) {
        logger.error('CronRepository.getVideosWithoutSummary - Hata:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        throw new CronError('Error fetching videos', error.code, error);
      }

      if (!data) {
        logger.info('CronRepository.getVideosWithoutSummary - Veri bulunamadı');
        return [];
      }

      // Transform data to match VideoWithoutSummary interface
      const transformedData: VideoWithoutSummary[] = (data as unknown as VideoData[])
        .map(item => {
          // O kanal için kullanıcı-dil tercihlerini al (bunlar birden fazla olabilir)
          const userChannels = item.channels?.user_channels || [];
          
          // Her kanal-kullanıcı ilişkisi için bir video işleme kaydı oluşturuyoruz
          // Böylece farklı kullanıcıların farklı dil tercihlerine göre özetler oluşturabiliriz
          return userChannels.map(uc => ({
            video_id: item.video_id,
            channel_id: item.channel_id,
            user_id: uc.user_id,
            language: uc.language || 'tr',
            tr_has_summary: item.tr_has_summary,
            en_has_summary: item.en_has_summary
          }));
        })
        // İç içe dizileri düzleştirme (flatMap)
        .flat()
        // Kullanıcının dil tercihine göre filtreleme yapalım
        // Yani kullanıcının dil tercihine göre ilgili flag'in false olduğu kayıtları alalım
        .filter(item => {
          const isTargetLangTR = item.language === 'tr';
          // Kullanıcının tercih ettiği dil flag'i false ise bu kaydı işlememiz gerekir
          return isTargetLangTR ? item.tr_has_summary === false : item.en_has_summary === false;
        });

      logger.info('CronRepository.getVideosWithoutSummary - Başarılı:', {
        count: transformedData.length,
        data: transformedData
      });

      return transformedData;
    } catch (error) {
      if (error instanceof CronError) {
        throw error;
      }
      logger.error('CronRepository.getVideosWithoutSummary - Beklenmeyen Hata:', {
        error: error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack
        } : error
      });
      throw new CronError('Unexpected error while fetching videos', 'UNKNOWN', error);
    }
  }
} 