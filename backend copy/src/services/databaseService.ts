import { Summary } from '../types/summary';
import { supabase, supabaseAdmin } from '../config/supabase';
import logger from '../utils/logger';
import { Pool } from 'pg';
import { env } from '../config/env';
import { v4 as uuidv4 } from 'uuid';
import cacheService from './cacheService';

interface SupabaseSummary {
  id: string;
  video_id: string;
  content: string;
  status: string;
  created_at: string;
  language: string;
}

interface SupabaseVideo {
  title: string;
  thumbnail_url: string;
  channel_title: string;
}

interface SupabaseSummaryWithVideo {
  id: string;
  video_id: string;
  content: string;
  status: string;
  created_at: string;
  language: string;
  videos: SupabaseVideo;
}

interface SupabaseUserSummary {
  summaries: SupabaseSummary;
  videos: SupabaseVideo;
}

class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      },
      // Extended pool configuration
      max: 20,                    // Maximum 20 connections (about 2 per worker)
      idleTimeoutMillis: 30000,   // Idle connections are closed after 30 seconds
      connectionTimeoutMillis: 10000, // Connection timeout is 10 seconds
      allowExitOnIdle: false      // Clean up connections when shutting down
    });

    // Tüm havuz olaylarını dinle
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', {
        error: err.message,
        function: 'DatabaseService.constructor'
      });
    });

    this.pool.on('connect', () => {
      logger.debug('New database connection established', {
        function: 'DatabaseService.constructor'
      });
    });

    this.pool.on('acquire', () => {
      logger.debug('Database client acquired from pool', {
        function: 'DatabaseService.constructor',
        poolSize: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      });
    });

    this.pool.on('remove', () => {
      logger.debug('Database client removed from pool', {
        function: 'DatabaseService.constructor',
        poolSize: this.pool.totalCount,
        idleCount: this.pool.idleCount
      });
    });
  }

  /**
   * Özeti veritabanından getirir
   */
  async getRawSummary(videoId: string, language: string): Promise<Summary | null> {
    try {
      // Parametreleri kontrol et
      if (!videoId || !language) {
        logger.error('Geçersiz parametreler', { videoId, language });
        throw new Error('Invalid parameters: videoId and language are required');
      }

      // 1. Önce önbellekten kontrol et
      const cachedSummary = await cacheService.getSummary(videoId, language);
      if (cachedSummary) {
        logger.info('Özet önbellekten alındı', { 
          videoId, 
          language,
          status: cachedSummary.status,
          id: cachedSummary.id
        });
        return cachedSummary;
      }

      // 2. Önbellekte yoksa DB'den al
      logger.info('DB\'den özet getiriliyor', { 
        videoId, 
        language,
        query: {
          video_id: videoId,
          language: language
        }
      });

      // DB sorgusu
      const { data: allData, error: allError } = await supabaseAdmin
        .from('summaries')
        .select('*')
        .eq('video_id', videoId)
        .eq('language', language)
        .order('created_at', { ascending: false });

      if (allError) {
        logger.error('Özet DB sorgusunda hata (tüm kayıtlar)', { 
          error: allError, 
          videoId, 
          language,
          query: {
            video_id: videoId,
            language: language
          }
        });
        throw allError;
      }

      // 2. Bulunan kayıtları detaylı logla
      logger.info('DB\'de bulunan özet kayıtları', {
        videoId,
        language,
        count: allData?.length || 0,
        records: allData?.map(d => ({
          id: d.id,
          status: d.status,
          created_at: d.created_at,
          language: d.language,
          video_id: d.video_id,
          error: d.error
        })) || []
      });

      // 3. En son kaydı al
      if (!allData || allData.length === 0) {
        logger.info('Özet DB\'de bulunamadı', { 
          videoId, 
          language,
          totalRecords: 0,
          query: {
            video_id: videoId,
            language: language
          }
        });
        return null;
      }

      const latestRecord = allData[0];

      // 4. DB'den alınan veriyi önbelleğe kaydet
      await cacheService.setSummary(videoId, language, latestRecord);
      logger.info('Özet DB\'den alınıp önbelleğe kaydedildi', {
        videoId,
        language,
        status: latestRecord.status,
        id: latestRecord.id
      });

      logger.info('Özet bulundu', {
        videoId,
        language,
        status: latestRecord.status,
        created_at: latestRecord.created_at,
        record: {
          id: latestRecord.id,
          status: latestRecord.status,
          language: latestRecord.language,
          video_id: latestRecord.video_id,
          created_at: latestRecord.created_at,
          error: latestRecord.error
        }
      });

      return latestRecord as Summary;
    } catch (error: any) {
      logger.error('DB\'den özet getirme hatası', { 
        error: error.message,
        videoId,
        language,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Yeni bir özet kaydı oluşturur veya varsa günceller
   */
  async createRawSummary(summary: Partial<Summary>): Promise<Summary> {
    try {
      logger.info('DB\'de özet oluşturuluyor', { videoId: summary.video_id, language: summary.language });

      // 1. Önce mevcut kaydı kontrol et
      const existingSummary = await this.getRawSummary(summary.video_id!, summary.language!);
      
      if (existingSummary) {
        logger.info('Mevcut özet bulundu', {
          videoId: summary.video_id,
          language: summary.language,
          status: existingSummary.status,
          id: existingSummary.id,
          created_at: existingSummary.created_at
        });

        // Status'a göre işlem yap
        switch (existingSummary.status) {
          case 'pending': {
            // Pending durumunda timeout kontrolü yap
            const createdDate = new Date(existingSummary.created_at);
            const now = new Date();
            const diffInMinutes = (now.getTime() - createdDate.getTime()) / (1000 * 60);

            if (diffInMinutes > 30) { // 30 dakikadan eski ise
              logger.info('Pending durumundaki özet timeout oldu, yeni kayıt oluşturuluyor', {
                videoId: summary.video_id,
                language: summary.language,
                id: existingSummary.id,
                created_at: existingSummary.created_at,
                diffInMinutes
              });
              break;
            }

            // Timeout olmamışsa mevcut kaydı kullan
            logger.info('Pending durumundaki özet kullanılıyor', {
              videoId: summary.video_id,
              language: summary.language,
              id: existingSummary.id,
              created_at: existingSummary.created_at,
              diffInMinutes
            });
            return existingSummary;
          }

          case 'processing': {
            // Processing durumunda timeout kontrolü yap
            const createdDate = new Date(existingSummary.created_at);
            const now = new Date();
            const diffInMinutes = (now.getTime() - createdDate.getTime()) / (1000 * 60);

            if (diffInMinutes > 30) { // 30 dakikadan eski ise
              logger.info('Processing durumundaki özet timeout oldu, yeni kayıt oluşturuluyor', {
                videoId: summary.video_id,
                language: summary.language,
                id: existingSummary.id,
                created_at: existingSummary.created_at,
                diffInMinutes
              });
              break;
            }

            // Timeout olmamışsa hata fırlat
            logger.error('Özet zaten işleniyor', {
              videoId: summary.video_id,
              language: summary.language,
              id: existingSummary.id,
              created_at: existingSummary.created_at,
              diffInMinutes
            });
            throw new Error('Summary is already being processed');
          }

          case 'failed':
            // Failed durumunda yeni kayıt oluştur
            logger.info('Failed durumundaki özet için yeni kayıt oluşturuluyor', {
              videoId: summary.video_id,
              language: summary.language,
              id: existingSummary.id,
              created_at: existingSummary.created_at
            });
            break;

          case 'completed':
            // Completed durumunda mevcut kaydı döndür
            logger.info('Completed durumundaki özet kullanılıyor', {
              videoId: summary.video_id,
              language: summary.language,
              id: existingSummary.id,
              created_at: existingSummary.created_at
            });
            return existingSummary;

          default:
            // Bilinmeyen durumda yeni kayıt oluştur
            logger.warn('Bilinmeyen durum, yeni kayıt oluşturuluyor', {
              videoId: summary.video_id,
              language: summary.language,
              status: existingSummary.status,
              id: existingSummary.id,
              created_at: existingSummary.created_at
            });
        }
      }

      // 2. Yeni kayıt oluştur
      const summaryData = {
        id: summary.id,
        video_id: summary.video_id,
        source: summary.source || 'api',
        content: summary.content || '',
        language: summary.language,
        status: summary.status || 'pending',
        error: summary.error || null,
        created_at: summary.created_at || new Date(),
        updated_at: summary.updated_at || new Date(),
        is_public: summary.is_public || false
      };

      // 3. Önce tekrar kontrol et (race condition'ı önlemek için)
      const doubleCheckSummary = await this.getRawSummary(summary.video_id!, summary.language!);
      if (doubleCheckSummary) {
        logger.info('Race condition tespit edildi, mevcut özet kullanılıyor', {
          videoId: summary.video_id,
          language: summary.language,
          status: doubleCheckSummary.status,
          id: doubleCheckSummary.id,
          created_at: doubleCheckSummary.created_at
        });
        return doubleCheckSummary;
      }

      // 4. Yeni kaydı oluştur
      const { data, error } = await supabaseAdmin
        .from('summaries')
        .insert([summaryData])
        .select()
        .single();

      if (error) {
        // 5. Eğer unique constraint hatası alındıysa, tekrar kontrol et
        if (error.code === '23505') {
          logger.info('Unique constraint hatası alındı, mevcut kaydı kontrol ediyorum', {
            videoId: summary.video_id,
            language: summary.language,
            error: error.message
          });
          const finalCheckSummary = await this.getRawSummary(summary.video_id!, summary.language!);
          if (finalCheckSummary) {
            logger.info('Unique constraint hatası sonrası mevcut kayıt bulundu', {
              videoId: summary.video_id,
              language: summary.language,
              status: finalCheckSummary.status,
              id: finalCheckSummary.id,
              created_at: finalCheckSummary.created_at
            });
            return finalCheckSummary;
          }
        }
        logger.error('createRawSummary Özet oluşturma hatası', { 
          error,
          videoId: summary.video_id,
          language: summary.language
        });
        throw error;
      }

      logger.info('Yeni özet kaydı oluşturuldu', {
        videoId: summary.video_id,
        language: summary.language,
        status: data.status,
        id: data.id,
        created_at: data.created_at
      });

      // Yeni oluşturulan özeti önbelleğe kaydet
      await cacheService.setSummary(data.video_id, data.language, data);
      logger.info('Yeni özet önbelleğe kaydedildi', {
        videoId: data.video_id,
        language: data.language,
        id: data.id
      });

      return data as Summary;
    } catch (error: any) {
      logger.error('createRawSummary DB\'de özet oluşturma hatası', { 
        error: error.message,
        videoId: summary.video_id,
        language: summary.language,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Mevcut bir özeti günceller
   */
  async updateRawSummary(summaryId: string, updates: Partial<Summary>): Promise<void> {
    try {
      logger.info('DB\'de özet güncelleniyor', { summaryId });

      // Veri içindeki videoId ve language bilgisini alalım (önbellek için gerekli)
      let videoId: string | undefined = updates.video_id;
      let language: string | undefined = updates.language;

      // Eğer bu bilgiler updates içinde yoksa, özeti ID ile çekip alalım
      if (!videoId || !language) {
        const { data: summary, error } = await supabaseAdmin
          .from('summaries')
          .select('video_id, language')
          .eq('id', summaryId)
          .single();

        if (error) {
          logger.error('Özet bilgilerini alma hatası', { error, summaryId });
        } else if (summary) {
          videoId = summary.video_id;
          language = summary.language;
        }
      }

      // Özeti güncelle
      const { error } = await supabaseAdmin
        .from('summaries')
        .update(updates)
        .eq('id', summaryId);

      if (error) {
        logger.error('Özet güncelleme hatası', { error, summaryId });
        throw error;
      }

      // Özet başarıyla güncellendiyse ve videoId/language bilgileri varsa önbelleği invalide et
      if (videoId && language) {
        await cacheService.invalidateSummary(videoId, language);
        logger.info('Özet güncellendi ve önbellek invalidate edildi', { 
          summaryId, 
          videoId, 
          language 
        });
      } else {
        logger.info('Özet güncellendi (önbellek invalidate edilemedi - video_id/language bilinmiyor)', { 
          summaryId
        });
      }
    } catch (error: any) {
      logger.error('DB\'de özet güncelleme hatası', { error: error.message });
      throw error;
    }
  }

  /**
   * Transkript verisini getirir
   */
  async getRawTranscript(videoId: string, language: string): Promise<any> {
    try {
      // 1. Önce önbellekten kontrol et
      const cachedTranscript = await cacheService.getTranscript(videoId, language);
      if (cachedTranscript) {
        logger.info('Transkript önbellekten alındı', { videoId, language });
        return cachedTranscript;
      }

      // 2. Önbellekte yoksa DB'den al
      logger.info('DB\'den transkript getiriliyor', { videoId, language });

      // Transkript verisini doğrudan tek bir sorgu ile, sıralı şekilde getir
      const { data, error } = await supabase
        .from('transcripts')
        .select('*')
        .eq('video_id', videoId)
        .eq('language', language)
        .order('created_at', { ascending: false })
        .limit(1);

      // Eğer veri bulunamazsa veya hata oluşursa null döndür
      if (error || !data || data.length === 0) {
        logger.info('Transkript bulunamadı', { videoId, language });
        return null;
      }

      // En son kaydı al
      const transcript = data[0];
      
      // Bulunan veriyi önbelleğe kaydet
      await cacheService.setTranscript(videoId, language, transcript);
      logger.info('Transkript DB\'den alınıp önbelleğe kaydedildi', { 
        videoId, 
        language, 
        id: transcript.id,
        status: transcript.status
      });
      
      return transcript;
    } catch (error) {
      logger.error('DB\'den transkript getirme hatası', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        videoId, 
        language
      });
      throw error;
    }
  }

  /**
   * Transkript verisini kaydeder
   */
  async saveRawTranscript(videoId: string, language: string, data: any): Promise<void> {
    try {
      logger.info('DB\'ye transkript kaydediliyor', { videoId, language });

      const transcriptData = {
        video_id: videoId,
        language,
        ...data,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('transcripts')
        .upsert(transcriptData);

      if (error) {
        throw error;
      }

      // Veritabanına kaydettikten sonra önbelleği güncelle
      await cacheService.setTranscript(videoId, language, transcriptData);
      logger.info('Transkript DB\'ye ve önbelleğe kaydedildi', { videoId, language });
      
    } catch (error) {
      logger.error('DB\'ye transkript kaydetme hatası', {
        error: error instanceof Error ? error.message : 'Unknown error',
        videoId,
        language
      });
      throw error;
    }
  }

  /**
   * Kullanıcı özet ilişkisi oluşturur
   */
  async createUserSummary(summaryId: string, userId: string): Promise<void> {
    try {
      logger.info('DB\'de kullanıcı-özet ilişkisi oluşturuluyor', { summaryId, userId });

      const { error } = await supabaseAdmin
        .from('user_summaries')
        .insert([{
          user_id: userId,
          summary_id: summaryId,
          created_at: new Date()
        }]);

      if (error) {
        logger.warn('Kullanıcı-özet ilişkisi oluşturma hatası', { error });
      }
    } catch (error: any) {
      logger.error('DB\'de kullanıcı-özet ilişkisi oluşturma hatası', { error: error.message });
      // Don't throw error here, as this is not critical
    }
  }

  /**
   * Kullanıcının özetlerini getirir
   * @param userId Kullanıcı ID'si
   */
  async getUserSummaries(userId: string) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_summaries')
        .select(`
          *,
          summaries!user_summaries_summary_id_fkey (
            id,
            video_id,
            content,
            status,
            created_at,
            language,
            videos!inner (
              video_id,
              title,
              thumbnail_url,
              channel_id,
              channel_title
            )
          )
        `)
        .eq('user_id', userId)
        .eq('is_visible', true)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data.map(item => {
        const videoId = item.summaries?.videos?.video_id;
        return {
          id: item.id,
          summary_id: item.summaries?.id,
          video_id: videoId,
          content: item.summaries?.content,
          status: item.summaries?.status,
          created_at: item.summaries?.created_at,
          language: item.summaries?.language,
          video_title: item.summaries?.videos?.title,
          video_thumbnail: item.summaries?.videos?.thumbnail_url,
          video_url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
          channel_name: item.summaries?.videos?.channel_title,
          channel_id: item.summaries?.videos?.channel_id,
          is_read: item.is_read || false
        };
      }).filter(item => item.summary_id);
    } catch (error) {
      logger.error('Error getting user summaries:', error);
      throw error;
    }
  }

  /**
   * Herkese açık özetleri getirir
   * @param language Dil filtresi
   * @param limit Maksimum özet sayısı
   */
  async getRawPublicSummaries(language: string, limit: number) {
    try {
      const { data, error } = await supabaseAdmin
        .from('summaries')
        .select('*')
        .eq('language', language)
        .eq('is_public', true)
        .limit(limit);

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Error getting public summaries:', error);
      throw error;
    }
  }

  /**
   * Kullanıcı aktivitelerini getirir
   */
  async getUserActivities(userId: string): Promise<any[]> {
    try {
      logger.info('DB\'den kullanıcı aktiviteleri getiriliyor', { userId });

      const query = `
        SELECT * FROM user_activities 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT 10
      `;
      const result = await this.pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      logger.error('DB\'den kullanıcı aktiviteleri getirme hatası', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      throw error;
    }
  }

  /**
   * Popüler videoları getirir
   */
  async getPopularVideos(): Promise<any[]> {
    try {
      logger.info('DB\'den popüler videolar getiriliyor');

      const query = `
        SELECT v.*, COUNT(t.id) as transcript_count 
        FROM videos v 
        LEFT JOIN transcripts t ON v.id = t.video_id 
        GROUP BY v.id 
        ORDER BY transcript_count DESC, v.created_at DESC 
        LIMIT 10
      `;
      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      logger.error('DB\'den popüler videoları getirme hatası', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Kullanıcı özetinin okundu durumunu günceller
   * @param userSummaryId Kullanıcı özet ID'si
   * @param userId Kullanıcı ID'si
   * @param isRead Okundu durumu
   */
  async updateUserSummaryReadStatus(userSummaryId: string, userId: string, isRead: boolean): Promise<void> {
    try {
      logger.info('DB\'de özet okundu durumu güncelleniyor', {
        userSummaryId,
        userId,
        isRead
      });

      const { error } = await supabaseAdmin
        .from('user_summaries')
        .update({ is_read: isRead })
        .eq('id', userSummaryId)
        .eq('user_id', userId);

      if (error) {
        logger.error('Özet okundu durumu güncelleme hatası', {
          error,
          userSummaryId,
          userId
        });
        throw error;
      }

      logger.info('Özet okundu durumu güncellendi', {
        userSummaryId,
        userId,
        isRead
      });
    } catch (error) {
      logger.error('DB\'de özet okundu durumu güncelleme hatası', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userSummaryId,
        userId
      });
      throw error;
    }
  }

  /**
   * Özet için değerlendirme ve yorumu kaydeder
   * @param userSummaryId Kullanıcı özet ID'si
   * @param userId Kullanıcı ID'si
   * @param rating Değerlendirme puanı (1-5)
   * @param comment Yorum metni
   */
  async saveSummaryFeedback(userSummaryId: string, userId: string, rating: number, comment?: string): Promise<void> {
    try {
      logger.info('DB\'de özet değerlendirmesi kaydediliyor', {
        userSummaryId,
        userId,
        rating
      });

      // Önce user_summaries tablosundan summary_id'yi alalım
      const { data: userSummary, error: userSummaryError } = await supabaseAdmin
        .from('user_summaries')
        .select('summary_id')
        .eq('id', userSummaryId)
        .eq('user_id', userId)
        .single();

      if (userSummaryError) {
        logger.error('Kullanıcı özeti bulunamadı', {
          error: userSummaryError,
          userSummaryId,
          userId
        });
        throw userSummaryError;
      }

      // Şimdi feedback tablosuna kayıt oluşturalım
      // Önce bu kullanıcının bu özet için daha önce geri bildirim gönderip göndermediğini kontrol edelim
      const { data: existingFeedback, error: existingFeedbackError } = await supabaseAdmin
        .from('feedback')
        .select('id')
        .eq('user_id', userId)
        .eq('summary_id', userSummary.summary_id)
        .single();

      let error;

      if (!existingFeedbackError && existingFeedback) {
        // Kullanıcı daha önce bu özet için geri bildirim göndermişse, mevcut kaydı güncelleyelim
        const { error: updateError } = await supabaseAdmin
          .from('feedback')
          .update({
            rating,
            comment,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingFeedback.id);
        
        error = updateError;
      } else {
        // Yeni bir geri bildirim kaydı oluşturalım
        const { error: insertError } = await supabaseAdmin
          .from('feedback')
          .insert({ 
            id: uuidv4(), // Benzersiz bir id oluştur
            user_id: userId,
            summary_id: userSummary.summary_id,
            rating,
            comment,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        
        error = insertError;
      }

      if (error) {
        logger.error('Özet değerlendirmesi kaydetme hatası', {
          error,
          userSummaryId,
          userId
        });
        throw error;
      }

      logger.info('Özet değerlendirmesi kaydedildi', {
        userSummaryId,
        userId,
        rating
      });
    } catch (error) {
      logger.error('DB\'de özet değerlendirmesi kaydetme hatası', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userSummaryId,
        userId
      });
      throw error;
    }
  }

  /**
   * Özet için verilen değerlendirmeyi getirir
   * @param userSummaryId Kullanıcı özet ID'si
   * @param userId Kullanıcı ID'si
   * @returns Değerlendirme bilgileri
   */
  async getFeedback(userSummaryId: string, userId: string): Promise<any> {
    try {
      logger.info('DB\'den özet değerlendirmesi getiriliyor', {
        userSummaryId,
        userId
      });

      // Önce user_summaries tablosundan summary_id'yi alalım
      const { data: userSummary, error: userSummaryError } = await supabaseAdmin
        .from('user_summaries')
        .select('summary_id')
        .eq('id', userSummaryId)
        .eq('user_id', userId)
        .single();

      if (userSummaryError) {
        logger.error('Kullanıcı özeti bulunamadı', {
          error: userSummaryError,
          userSummaryId,
          userId
        });
        throw userSummaryError;
      }

      // Feedback tablosundan değerlendirme bilgilerini getirelim
      const { data: feedback, error } = await supabaseAdmin
        .from('feedback')
        .select('rating, comment, created_at, updated_at')
        .eq('user_id', userId)
        .eq('summary_id', userSummary.summary_id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116: Veri bulunamadı hatası
        logger.error('Özet değerlendirmesi getirme hatası', {
          error,
          userSummaryId,
          userId
        });
        throw error;
      }

      logger.info('Özet değerlendirmesi getirildi', {
        userSummaryId,
        userId,
        hasFeedback: !!feedback
      });

      return feedback || { rating: 0, comment: '' };
    } catch (error) {
      logger.error('DB\'den özet değerlendirmesi getirme hatası', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userSummaryId,
        userId
      });
      throw error;
    }
  }

  async getRecentSummaries(limit: number = 4): Promise<any[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('summaries')
        .select(`
          id,
          video_id,
          content,
          status,
          created_at,
          language,
          videos (
            title,
            thumbnail_url,
            channel_title
          )
        `)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Error getting recent summaries', {
          error: error.message,
          function: 'DatabaseService.getRecentSummaries'
        });
        throw error;
      }

      return data || [];
    } catch (error: any) {
      logger.error('Error in getRecentSummaries', {
        error: error.message,
        function: 'DatabaseService.getRecentSummaries'
      });
      throw error;
    }
  }
}

export default DatabaseService; 