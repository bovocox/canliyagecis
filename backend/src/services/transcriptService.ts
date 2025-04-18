import { Transcript, TranscriptStatus } from '../types/transcript';
import DatabaseService from './databaseService';
import cacheService from './cacheService';
import logger from '../utils/logger';
import { supabase } from '../config/supabase';
import queueService from '../services/queueService';
import { YoutubeTranscript } from 'youtube-transcript';
import { v4 as uuidv4 } from 'uuid';
import { systemLogger } from '../utils/logger';
import { redis } from '../config/redis';
import translationService from './translationService';
// Notification service has been removed
// import { notifyTranscriptCompleted, notifyTranscriptError } from './notificationService';

export class TranscriptService {
  private databaseService: DatabaseService;
  private readonly lockTTL = 30; // 30 seconds lock

  constructor() {
    this.databaseService = new DatabaseService();
  }

  /**
   * İşlem için lock alır
   */
  private async acquireLock(key: string): Promise<boolean> {
    const lockKey = `lock:transcript:${key}`;
    const locked = await redis.set(lockKey, '1', 'EX', this.lockTTL, 'NX');
    return !!locked;
  }

  /**
   * Lock'u serbest bırakır
   */
  private async releaseLock(key: string): Promise<void> {
    const lockKey = `lock:transcript:${key}`;
    await redis.del(lockKey);
  }

  /**
   * İşlemin kilitli olup olmadığını kontrol eder
   */
  private async isLocked(key: string): Promise<boolean> {
    const lockKey = `lock:transcript:${key}`;
    const exists = await redis.exists(lockKey);
    return exists === 1;
  }

  async getTranscript(videoId: string, language: string, forceRestart: boolean = false): Promise<Transcript | null> {
    try {
      logger.info('Transkript getirme işlemi başlatıldı', {
        videoId,
        language,
        function: 'TranscriptService.getTranscript'
      });

      // 1. Cache kontrolü
      const cachedTranscript = await cacheService.getTranscript(videoId, language);
      if (cachedTranscript && cachedTranscript.status === TranscriptStatus.COMPLETED && !forceRestart) {
        logger.info('Transkript cache\'den alındı', {
          videoId,
          language,
          function: 'TranscriptService.getTranscript'
        });
        return cachedTranscript;
      }

      // 2. DB'den getir
      const existingTranscript = await this.databaseService.getRawTranscript(videoId, language);
      if (existingTranscript && existingTranscript.status === TranscriptStatus.COMPLETED && !forceRestart) {
        // Cache'e ekle
        await cacheService.setTranscript(videoId, language, existingTranscript);
        logger.info('Transkript veritabanından alındı', {
          videoId,
          language,
          function: 'TranscriptService.getTranscript'
        });
        return existingTranscript;
      }

      // 3. İstenen dilde transkript bulunamadı, alternatif dillere bakacağız
      logger.info('İstenen dilde transkript bulunamadı, alternatif dillere bakılıyor', {
        videoId,
        requestedLanguage: language,
        function: 'TranscriptService.getTranscript'
      });

      // Alternatif diller - HER ZAMAN önce TR sonra EN (istenen dil hariç)
      const alternativeLanguages = ['tr', 'en'].filter(lang => lang !== language);
      
      logger.info('Alternatif diller sırasıyla kontrol edilecek', {
        videoId,
        alternativeLanguages,
        function: 'TranscriptService.getTranscript'
      });
      
      let sourceTranscript = null;
      let sourceLanguage = '';

      // Alternatif dillerden birinde transkript var mı kontrol et
      for (const altLang of alternativeLanguages) {
        // Önce cache'de kontrol et
        const altCachedTranscript = await cacheService.getTranscript(videoId, altLang);
        if (altCachedTranscript && altCachedTranscript.status === TranscriptStatus.COMPLETED) {
          sourceTranscript = altCachedTranscript;
          sourceLanguage = altLang;
          logger.info('Alternatif dilde transkript cache\'den bulundu', {
            videoId,
            altLang,
            function: 'TranscriptService.getTranscript'
          });
          break;
        }

        // Veritabanında kontrol et
        const altDbTranscript = await this.databaseService.getRawTranscript(videoId, altLang);
        if (altDbTranscript && altDbTranscript.status === TranscriptStatus.COMPLETED) {
          sourceTranscript = altDbTranscript;
          sourceLanguage = altLang;
          // Cache'e ekle
          await cacheService.setTranscript(videoId, altLang, altDbTranscript);
          logger.info('Alternatif dilde transkript veritabanından bulundu', {
            videoId,
            altLang,
            function: 'TranscriptService.getTranscript'
          });
          break;
        }

        // Veritabanında ve cache'de de yoksa YouTube'dan getirmeyi dene
        try {
          logger.info('Alternatif dilde YouTube\'dan transkript getiriliyor', {
            videoId,
            altLang,
            function: 'TranscriptService.getTranscript'
          });
          
          const youtubeTranscript = await YoutubeTranscript.fetchTranscript(videoId, { lang: altLang });
          
          if (youtubeTranscript && youtubeTranscript.length > 0) {
            // YouTube transkriptini formatlı metne dönüştür
            const formattedText = youtubeTranscript
              .map(segment => segment.text)
              .join(' ');
            
            // Yeni transkript oluştur
            const newAltTranscript: Transcript = {
              id: parseInt(`${Date.now()}`),
              video_id: videoId,
              language: altLang,
              formatted_text: formattedText,
              status: TranscriptStatus.COMPLETED,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              source: 'youtube'
            };
            
            // Alternatif dildeki transkripti kaydet
            await this.saveTranscript(videoId, altLang, newAltTranscript);
            
            sourceTranscript = newAltTranscript;
            sourceLanguage = altLang;
            
            logger.info('Alternatif dilde YouTube\'dan transkript alındı ve kaydedildi', {
              videoId,
              altLang,
              function: 'TranscriptService.getTranscript'
            });
            break;
          }
        } catch (ytError) {
          logger.warn('YouTube\'dan alternatif dilde transkript alma hatası', {
            error: ytError instanceof Error ? ytError.message : 'Unknown error',
            videoId,
            altLang,
            function: 'TranscriptService.getTranscript'
          });
          // Bu dilde bulunamadı, bir sonraki alternatif dili dene
          continue;
        }
      }

      // Çevirilebilecek bir transkript bulunamadı
      if (!sourceTranscript) {
        logger.info('Hiçbir dilde transkript bulunamadı', {
          videoId,
          language,
          function: 'TranscriptService.getTranscript'
        });
        return null;
      }

      // 4. Kaynak transkripti hedef dile çevir
      logger.info('Transkript çevirisi başlatılıyor', {
        videoId,
        sourceLanguage,
        targetLanguage: language,
        function: 'TranscriptService.getTranscript'
      });

      try {
        // Önce translationService'in çalışıp çalışmadığını kontrol et
        if (!translationService || typeof translationService.translateTranscript !== 'function') {
          logger.error('TranslationService modülü bulunamadı veya translateTranscript metodu yok', {
            videoId,
            sourceLanguage,
            targetLanguage: language,
            function: 'TranscriptService.getTranscript',
            translationServiceExists: !!translationService,
            methods: translationService ? Object.keys(translationService) : []
          });
          throw new Error('Translation service not available');
        }

        logger.info('TranslationService çeviri işlemine geçiliyor', {
          videoId,
          sourceLanguage,
          targetLanguage: language,
          textLength: sourceTranscript.formatted_text?.length || 0,
          function: 'TranscriptService.getTranscript',
          sample: sourceTranscript.formatted_text?.substring(0, 50)
        });
        
        // Transkripti çevir
        const translatedText = await translationService.translateTranscript(
          sourceTranscript.formatted_text || '',
          sourceLanguage,
          language
        );

        logger.info('Çeviri işlemi tamamlandı, sonuç kontrolü', {
          videoId,
          sourceLanguage,
          targetLanguage: language,
          inputLength: sourceTranscript.formatted_text?.length || 0, 
          outputLength: translatedText?.length || 0,
          translated_sample: translatedText?.substring(0, 50) || 'Empty result',
          function: 'TranscriptService.getTranscript'
        });

        // Çevrilmiş transkripti hazırla
        const translatedTranscript: Transcript = {
          id: parseInt(`${Date.now()}`),
          video_id: videoId,
          language: language,
          formatted_text: translatedText,
          status: TranscriptStatus.COMPLETED,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source: sourceLanguage
        };

        // Çevrilmiş transkripti kaydet
        await this.saveTranscript(videoId, language, translatedTranscript);

        logger.info('Transkript çevirisi başarıyla tamamlandı ve kaydedildi', {
          videoId,
          sourceLanguage,
          targetLanguage: language,
          function: 'TranscriptService.getTranscript'
        });

        return translatedTranscript;
      } catch (translationError) {
        logger.error('Transkript çeviri hatası', {
          error: translationError instanceof Error ? translationError.message : 'Unknown error',
          videoId,
          sourceLanguage,
          targetLanguage: language,
          function: 'TranscriptService.getTranscript'
        });
        return null;
      }
    } catch (error) {
      logger.error('Transkript getirme hatası', {
        error: error instanceof Error ? error.message : 'Unknown error',
        videoId,
        language,
        function: 'TranscriptService.getTranscript'
      });
      throw error;
    }
  }

  async saveTranscript(videoId: string, language: string, data: any): Promise<void> {
    try {
      logger.info('Transkript kaydetme işlemi başlatıldı', {
        videoId,
        language,
        function: 'TranscriptService.saveTranscript'
      });

      // 1. DB'ye kaydet
      await this.databaseService.saveRawTranscript(videoId, language, data);

      // 2. Cache'i güncelle
      await cacheService.setTranscript(videoId, language, data);

      logger.info('Transkript başarıyla kaydedildi', {
        videoId,
        language,
        function: 'TranscriptService.saveTranscript'
      });
    } catch (error) {
      logger.error('Transkript kaydetme hatası', {
        error: error instanceof Error ? error.message : 'Unknown error',
        videoId,
        language,
        function: 'TranscriptService.saveTranscript'
      });
      throw error;
    }
  }

  async invalidateTranscript(videoId: string, language: string): Promise<void> {
    try {
      await cacheService.invalidateTranscript(videoId, language);
    } catch (error) {
      logger.error('Error invalidating transcript cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        videoId,
        language,
        function: 'TranscriptService.invalidateTranscript'
      });
    }
  }

  /**
   * Video için transkript oluşturur veya varsa getirir
   */
  async getOrCreateTranscript(videoId: string, language: string, forceRestart: boolean = false): Promise<any> {
    const lockKey = `${videoId}:${language}`;

    try {
      // İşlem zaten devam ediyor mu kontrol et
      if (await this.isLocked(lockKey)) {
        logger.info('Transkript işlemi zaten devam ediyor', {
          videoId,
          language,
          function: 'TranscriptService.getOrCreateTranscript'
        });
        return {
          status: 'processing',
          message: 'Transcript is already being processed'
        };
      }

      // Lock al
      const locked = await this.acquireLock(lockKey);
      if (!locked) {
        return {
          status: 'processing',
          message: 'Could not acquire lock'
        };
      }

      logger.info('Transkript getirme/oluşturma işlemi başlatıldı', {
        videoId,
        language,
        forceRestart,
        function: 'TranscriptService.getOrCreateTranscript'
      });

      // 1. Cache'den kontrol et
      const cachedTranscript = await cacheService.getTranscript(videoId, language);
      if (cachedTranscript && cachedTranscript.status === TranscriptStatus.COMPLETED && !forceRestart) {
        return {
          status: 'completed',
          data: cachedTranscript
        };
      }

      // 2. DB'den kontrol et
      const existingTranscript = await this.databaseService.getRawTranscript(videoId, language);

      if (existingTranscript) {
        if (existingTranscript.status === TranscriptStatus.COMPLETED && !forceRestart) {
          await cacheService.setTranscript(videoId, language, existingTranscript);
          return {
            status: 'completed',
            data: existingTranscript
          };
        }

        if (existingTranscript.status === 'failed' || forceRestart) {
          await this.restartTranscript(existingTranscript.id, videoId, language);
          return {
            status: 'pending',
            message: 'Transcript restarted'
          };
        }

        return {
          status: existingTranscript.status,
          message: `Transcript is ${existingTranscript.status}`
        };
      }

      // 3. İstenen dilde transkript yok, alternatif dilleri kontrol edelim
      const alternativeLanguages = ['tr', 'en'].filter(lang => lang !== language);
      let alternativeTranscript = null;
      let alternativeLanguage = '';

      for (const altLang of alternativeLanguages) {
        // Alternatif dilde transkript var mı kontrol et
        const altTranscript = await this.databaseService.getRawTranscript(videoId, altLang);
        if (altTranscript && altTranscript.status === TranscriptStatus.COMPLETED) {
          alternativeTranscript = altTranscript;
          alternativeLanguage = altLang;
          
          logger.info('Alternatif dilde mevcut transkript bulundu, çeviri yapılacak', {
            videoId,
            sourceLanguage: altLang,
            targetLanguage: language,
            function: 'TranscriptService.getOrCreateTranscript'
          });
          
          // Alternatif dildeki transkripti çevir
          try {
            // TranslationService kontrol
            if (!translationService || typeof translationService.translateTranscript !== 'function') {
              logger.error('TranslationService modülü bulunamadı veya translateTranscript metodu yok', {
                videoId,
                sourceLanguage: altLang,
                targetLanguage: language,
                function: 'TranscriptService.getOrCreateTranscript',
                translationServiceExists: !!translationService,
                methods: translationService ? Object.keys(translationService) : []
              });
              throw new Error('Translation service not available');
            }

            logger.info('Alternatif dildeki transkript çeviri işlemi başlatılıyor', {
              videoId,
              sourceLanguage: altLang,
              targetLanguage: language,
              textLength: altTranscript.formatted_text?.length || 0,
              function: 'TranscriptService.getOrCreateTranscript',
              sample: altTranscript.formatted_text?.substring(0, 50) || 'No text'
            });
            
            const translatedText = await translationService.translateTranscript(
              altTranscript.formatted_text || '',
              altLang,
              language
            );
            
            logger.info('Alternatif dil çeviri işlemi tamamlandı, sonuç kontrolü', {
              videoId,
              sourceLanguage: altLang,
              targetLanguage: language,
              inputLength: altTranscript.formatted_text?.length || 0, 
              outputLength: translatedText?.length || 0,
              translated_sample: translatedText?.substring(0, 50) || 'Empty result',
              function: 'TranscriptService.getOrCreateTranscript'
            });

            // Çevrilmiş transkripti oluştur
            const translatedTranscript: Transcript = {
              id: parseInt(`${Date.now()}`),
              video_id: videoId,
              language: language,
              formatted_text: translatedText,
              status: TranscriptStatus.COMPLETED,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              source: altLang
            };
            
            // Çevrilmiş transkripti kaydet
            await this.saveTranscript(videoId, language, translatedTranscript);
            
            logger.info('Alternatif dildeki transkript çevrildi ve kaydedildi', {
              videoId,
              sourceLanguage: altLang,
              targetLanguage: language,
              function: 'TranscriptService.getOrCreateTranscript'
            });
            
            return {
              status: 'completed',
              data: translatedTranscript
            };
          } catch (translationError) {
            logger.error('Çeviri hatası', {
              error: translationError instanceof Error ? translationError.message : 'Unknown error',
              videoId,
              sourceLanguage: altLang,
              targetLanguage: language,
              function: 'TranscriptService.getOrCreateTranscript'
            });
            // Çeviri başarısız oldu, yeni transkript oluşturmaya devam et
          }
          
          break;
        }
      }
      
      // 4. Yeni transkript oluştur
      const newTranscript = await this.createAndQueueTranscript(videoId, language);
      
      return {
        status: 'pending',
        transcript_id: newTranscript.id,
        message: 'Transcript creation started'
      };
    } catch (error) {
      logger.error('Transkript getirme/oluşturma hatası', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        videoId,
        language,
        function: 'TranscriptService.getOrCreateTranscript'
      });
      throw error;
    } finally {
      // Her durumda lock'u serbest bırak
      await this.releaseLock(lockKey);
    }
  }

  /**
   * Transkripti yeniden başlatır
   */
  private async restartTranscript(transcriptId: string, videoId: string, language: string): Promise<void> {
    const { error } = await supabase
      .from('transcripts')
      .update({
        status: 'pending',
        error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', transcriptId);

    if (error) {
      throw error;
    }

    await queueService.addToQueue({
      type: 'transcript',
      data: {
        videoId,
        language,
        transcriptId
      }
    });
  }

  /**
   * Yeni transkript oluşturur ve kuyruğa ekler
   */
  private async createAndQueueTranscript(videoId: string, language: string, useWhisper: boolean = false): Promise<any> {
    let source = useWhisper ? 'whisper' : 'youtube';

    try {
      // Önce video kaydının var olup olmadığını kontrol et
      const { data: video, error: videoError } = await supabase
        .from('videos')
        .select('video_id')
        .eq('video_id', videoId)
        .single();

      if (videoError || !video) {
        // Video kaydı yoksa oluştur
        const { data: newVideo, error: createVideoError } = await supabase
          .from('videos')
          .insert({
            video_id: videoId,
            title: 'Loading...',
            channel_id: 'unknown',
            channel_title: 'Unknown Channel',
            published_at: new Date().toISOString(),
            description: 'Loading...',
            thumbnail_url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            available_languages: [],
            status: 'pending'
          })
          .select()
          .single();

        if (createVideoError) {
          logger.error('Video oluşturma hatası', {
            error: createVideoError.message,
            videoId,
            function: 'TranscriptService.createAndQueueTranscript'
          });
          throw new Error('Failed to create video record');
        }
      }

      // Yeni transkript kaydı oluştur
      const { data: newTranscript, error } = await supabase
        .from('transcripts')
        .insert({
          video_id: videoId,
          language,
          status: 'pending',
          source,
          segments: [],
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        logger.error('Transkript oluşturma hatası', {
          error: error.message,
          videoId,
          language,
          function: 'TranscriptService.createAndQueueTranscript'
        });
        throw error;
      }

      if (!newTranscript || !newTranscript.id) {
        throw new Error('Transkript oluşturulamadı: ID alınamadı');
      }

      // Queue'ya ekle
      try {
        await queueService.addToQueue({
          type: 'transcript',
          data: {
            videoId,
            language,
            transcriptId: newTranscript.id,
            useWhisper
          }
        });
      } catch (queueError) {
        logger.error('Transkript kuyruğa eklenirken hata oluştu', {
          error: queueError instanceof Error ? queueError.message : 'Unknown error',
          transcriptId: newTranscript.id,
          videoId,
          language,
          function: 'TranscriptService.createAndQueueTranscript'
        });
        
        // Kuyruğa eklenemezse transkripti güncelle
        await supabase
          .from('transcripts')
          .update({
            status: 'error',
            error: 'Failed to add to queue',
            updated_at: new Date().toISOString()
          })
          .eq('id', newTranscript.id);
        
        throw queueError;
      }

      return newTranscript;
    } catch (error) {
      logger.error('Transkript oluşturma/kuyruğa ekleme hatası', {
        error: error instanceof Error ? error.message : 'Unknown error',
        videoId,
        language,
        function: 'TranscriptService.createAndQueueTranscript'
      });
      throw error;
    }
  }

  /**
   * Transkript durumunu kontrol eder
   */
  async getTranscriptStatus(videoId: string, language: string): Promise<any> {
    // Cache'den kontrol et
    const cachedTranscript = await cacheService.getTranscript(videoId, language);
    if (cachedTranscript && cachedTranscript.status === 'completed') {
      const statusData = {
        status: cachedTranscript.status,
        formatted_text: cachedTranscript.formatted_text,
        error: null,
        created_at: cachedTranscript.created_at,
        updated_at: cachedTranscript.updated_at
      };
      
      return statusData;
    }

    // DB'den kontrol et
    const transcript = await this.databaseService.getRawTranscript(videoId, language);
    if (!transcript) {
      return {
        status: 'not_found',
        message: 'No transcript found'
      };
    }

    if (transcript.status === 'completed') {
      await cacheService.setTranscript(videoId, language, transcript);
    }

    const statusData = {
      status: transcript.status,
      formatted_text: transcript.formatted_text,
      error: transcript.error || null,
      created_at: transcript.created_at,
      updated_at: transcript.updated_at
    };
    
    return statusData;
  }

  /**
   * Transkripti günceller
   */
  async updateTranscript(videoId: string, language: string, transcriptData: Partial<Transcript>): Promise<any> {
    const { data, error } = await supabase
      .from('transcripts')
      .update(transcriptData)
      .eq('video_id', videoId)
      .eq('language', language)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('Transcript not found');

    // Cache'i güncelle
    await cacheService.setTranscript(videoId, language, data);
    
    return data;
  }

  /**
   * Transkripti siler
   */
  async deleteTranscript(videoId: string, language: string): Promise<void> {
    const { error } = await supabase
      .from('transcripts')
      .delete()
      .eq('video_id', videoId)
      .eq('language', language);

    if (error) throw error;

    // Cache'den sil
    await cacheService.invalidateTranscript(videoId, language);
  }

  /**
   * Transkript tamamlandı olarak işaretler
   */
  async markTranscriptCompleted(transcriptId: string, formattedText: string): Promise<void> {
    const { data: transcript, error } = await supabase
      .from('transcripts')
      .update({
        formatted_text: formattedText,
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', transcriptId)
      .select('*')
      .single();

    if (error) throw error;
    if (!transcript) throw new Error('Transcript not found');

    await cacheService.setTranscript(transcript.video_id, transcript.language, transcript);
    
    // YENİ: Redis Pub/Sub üzerinden bildirim gönder
    try {
      // Redis Pub/Sub üzerinden bildirim gönder
      // await notifyTranscriptCompleted(transcript.video_id, {
      //   formatted_text: formattedText,
      //   id: transcript.id,
      //   transcript_id: transcript.id,
      //   language: transcript.language
      // });
      logger.info(`🚀 Redis Pub/Sub transcript completed notification sent for video ${transcript.video_id}`);
    } catch (notifyError) {
      logger.error(`❌ Redis Pub/Sub transcript notification failed: ${notifyError}`, {
        videoId: transcript.video_id,
        transcriptId: transcript.id
      });
      // Bildirim gönderilemedi ama transkript başarıyla işlendi, sadece log yazıyoruz
    }
  }

  /**
   * Video için mevcut altyazı dillerini test eder
   */
  async testSubtitleLanguages(videoId: string): Promise<any> {
    const languages = ['en', 'en-US', 'en-GB', 'tr', 'tr-TR', 'es', 'fr', 'de', 'auto'];
    const availableLanguages = [];
    const results = {
      videoId,
      manualSubtitles: [] as string[],
      autoSubtitles: [] as string[],
      allAvailableLanguages: [] as string[],
      transcriptSamples: {} as Record<string, any>
    };

    for (const lang of languages) {
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });
        if (transcript && transcript.length > 0) {
          availableLanguages.push(lang);
          results.autoSubtitles.push(lang);
          results.transcriptSamples[lang] = transcript.slice(0, 3);
        }
      } catch (e) {
        continue;
      }
    }

    results.allAvailableLanguages = [...new Set(availableLanguages)];
    return results;
  }
}

export const transcriptService = new TranscriptService();
export default transcriptService; 