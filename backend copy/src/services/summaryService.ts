import { ChapterInfo, ContentType, Summary } from '../types/summary';
import GeminiService from './geminiService';
import DatabaseService from './databaseService';
import PromptManager from './promptManager';
import LanguageDetector from './languageDetector';
import cacheService from './cacheService';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { redis } from '../config/redis';
import { supabase, supabaseAdmin } from '../config/supabase';
import queueService from './queueService';
// Notification service has been removed
// import { notifySummaryCompleted, notifySummaryError, notifySummaryStarted } from './notificationService';

const SUMMARY_TIMEOUT = 15 * 60 * 1000; // 15 dakika

interface SummaryRequest {
  videoId: string;
  language: string;
  transcriptId?: string;
  summaryId?: string;
  userId?: string;
  useWhisper?: boolean;
  isPublic?: boolean;
  reprocess?: boolean;
}

export class SummaryService {
  private geminiService: GeminiService;
  private databaseService: DatabaseService;
  private promptManager: PromptManager;
  private languageDetector: LanguageDetector;
  private readonly lockTTL = 30; // 30 seconds lock

  constructor() {
    this.geminiService = new GeminiService();
    this.databaseService = new DatabaseService();
    this.promptManager = new PromptManager();
    this.languageDetector = new LanguageDetector();
  }

  /**
   * İşlem için lock alır
   */
  private async acquireLock(key: string): Promise<boolean> {
    const lockKey = `lock:summary:${key}`;
    const locked = await redis.set(lockKey, '1', 'EX', this.lockTTL, 'NX');
    return !!locked;
  }

  /**
   * Lock'u serbest bırakır
   */
  private async releaseLock(key: string): Promise<void> {
    const lockKey = `lock:summary:${key}`;
    await redis.del(lockKey);
  }

  /**
   * İşlemin kilitli olup olmadığını kontrol eder
   */
  private async isLocked(key: string): Promise<boolean> {
    const lockKey = `lock:summary:${key}`;
    const exists = await redis.exists(lockKey);
    return exists === 1;
  }

  /**
   * Belirtilen video için özet oluşturur veya varsa getirir
   * @param videoId YouTube video ID'si
   * @param language İstenen özet dili
   * @param userId Kullanıcı ID'si (opsiyonel)
   * @param fromCron Zamanlanmış görevden mi çağrıldı
   */
  async generateSummary(
    videoId: string,
    language: string,
    transcriptId?: string,
    summaryId?: string,
    userId?: string,
    useWhisper: boolean = false,
    isPublic: boolean = false,
    reprocess: boolean = false
  ): Promise<Summary> {
    try {
      logger.info('Özet yaratma isteği alındı', { 
        videoId, 
        language,
        transcriptId,
        function: 'SummaryService.generateSummary'
      });

      // Cache'te varsa kontrol et
      const cachedSummary = await cacheService.getSummary(videoId, language);
      if (cachedSummary && cachedSummary.status === 'completed' && !reprocess) {
        logger.info('Cache hit: Completed summary found in cache', { videoId, language });
        return cachedSummary;
      }

      // 2. DB'de var mı kontrol et
      const existingSummary = await this.databaseService.getRawSummary(videoId, language);
            
      // İşlemin başladığını bildir (Redis aracılığıyla)
      // await notifySummaryStarted(videoId);
      
      // 3. Status'a göre işlem yapma
      if (existingSummary) {
        logger.info('Existing summary found in DB with status:', { 
          videoId, 
          language,
          status: existingSummary.status 
        });
        
        switch (existingSummary.status) {
          case 'completed':
            // Tamamlanmış özeti cache'e ekle ve döndür
            await cacheService.setSummary(videoId, language, existingSummary);
            return existingSummary;
            
          case 'pending':
          case 'failed':
            // Pending veya failed durumundaki özeti yeniden işleme al
            logger.info('Pending/failed summary found, restarting', { 
              videoId, 
              language,
              status: existingSummary.status
            });
            
            // Durumu güncelle
            await this.databaseService.updateRawSummary(existingSummary.id, {
              status: 'pending',
              error: undefined,
              updated_at: new Date()
            });
            
            // Queue'ya ekle
            await queueService.addToQueue({
              type: 'summary',
              data: {
                videoId,
                language,
                summaryId: existingSummary.id,
                transcriptId: transcriptId,
                userId,
                reprocess: true
              }
            });
            return existingSummary;
            
          case 'processing':
            // İşlem devam ediyor, müdahale etme
            logger.info('Summary is already being processed', { videoId, language });
            return existingSummary;
        }
      }

      // 4. Özet yoksa yeni oluştur
      // Get transcript to ensure it exists
      const transcript = await this.databaseService.getRawTranscript(videoId, language);
      if (!transcript || transcript.status !== 'completed') {
        throw new Error('Transcript not found or not completed');
      }

      // Create new summary record
      const summaryId = uuidv4();
      logger.info('Creating new summary', {
        videoId,
        language,
        summaryId,
        function: 'SummaryService.generateSummary'
      });

      // Create initial summary record
      const summary = {
        id: summaryId,
        video_id: videoId,
        language,
        status: 'pending',
        source: 'gemini',
        created_at: new Date(),
        updated_at: new Date()
      };

      // Save to database
      logger.info('DB\'de özet oluşturuluyor', {
        videoId,
        language
      });

      const { data: newSummary, error } = await supabaseAdmin
        .from('summaries')
        .insert(summary)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Add to queue
      await queueService.addToQueue({
        type: 'summary',
        data: {
          videoId,
          language,
          summaryId,
          transcriptId: transcript.id,
          userId,
          useWhisper,
          isPublic
        }
      });

      return newSummary;
    } catch (error) {
      logger.error('generateSummary Özet oluşturma hatası', {
        error: error instanceof Error ? error.message : 'Unknown error',
        videoId,
        language,
        function: 'SummaryService.generateSummary'
      });
      throw error;
    }
  }

  /**
   * Özet oluşturma işlemini gerçekleştirir
   * @param videoId Video ID'si
   * @param language Dil kodu
   * @param summaryId Özet ID'si
   */
  async processSummary(videoId: string, language: string, summaryId: string): Promise<{ content: string }> {
    logger.info(`Özet işleme başlatılıyor`, {
      videoId,
      language,
      summaryId,
      serviceName: 'SummaryService.processSummary'
    });
    
    try {
      // Get transcript
      logger.info(`Transkript alınıyor`, { videoId, language });
      const transcript = await this.databaseService.getRawTranscript(videoId, language);
      if (!transcript) {
        logger.error(`Transkript bulunamadı`, { videoId, language });
        throw new Error('Transcript not found');
      }
      
      // Transkript nesnesinin detaylı loglama
      logger.info(`Transkript nesnesini inceliyorum`, { 
        videoId, 
        language,
        transcriptId: transcript.id,
        availableFields: Object.keys(transcript),
        hasFormattedText: !!transcript.formatted_text
      });
      
      // Transkript çevrilmiş mi kontrol et
      if (transcript.source_language && transcript.source_language !== language) {
        logger.info(`Bu transkript ${transcript.source_language} dilinden ${language} diline çevrilmiş`, {
          videoId,
          originalLanguage: transcript.source_language,
          targetLanguage: language,
          function: 'SummaryService.processSummary'
        });
      }
      
      // Transkript nesnesinin formatted_text alanı kontrolü
      if (!transcript.formatted_text) {
        logger.error(`Transkript nesnesi içinde 'formatted_text' alanı bulunamadı`, { 
          videoId, 
          language,
          transcriptFields: Object.keys(transcript)
        });
        throw new Error('Formatted text not found in transcript');
      }

      logger.info(`Transkript alındı`, { 
        videoId, 
        language, 
        transcriptLength: transcript.formatted_text.length 
      });

      // Detect content type - hata alınırsa 'general' türünü kullan
      let contentType = 'general';
      try {
        logger.info(`İçerik kategorisi tespiti devre dışı, genel prompt kullanılıyor`, { videoId });
        // contentType = await this.promptManager.categorizeContent(transcript.text);
        // logger.info(`İçerik türü: ${contentType}`, { videoId, contentType });
      } catch (error) {
        logger.warn(`İçerik türü belirlenemedi, genel tür kullanılıyor`, { 
          videoId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }

      let summaryText = '';
      let retryCount = 0;
      const maxRetries = 3;
      let lastError = null;

      // For large transcripts, use chunking
      if (transcript.formatted_text.length > 29900) {
        logger.info(`Büyük transkript tespit edildi, parçalama yöntemi kullanılıyor`, { 
          videoId, 
          transcriptLength: transcript.formatted_text.length 
        });
        
        const chunks = this.chunkText(transcript.formatted_text);
        logger.info(`Transkript ${chunks.length} parçaya bölündü`, { 
          videoId, 
          chunkCount: chunks.length 
        });
        
        // Parçalar için özetleme işlemi - her bir parça için yeniden deneme mekanizması
        const summaries = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          logger.info(`${i+1}/${chunks.length} nolu parça işleniyor`, { 
            videoId, 
            chunkIndex: i,
            chunkSize: chunk.length 
          });
          
          // Her bir parça için yeniden deneme döngüsü
          retryCount = 0;
          let chunkSummary = '';
          
          while (retryCount < maxRetries) {
            try {
              let prompt;
              if (retryCount === 0) {
                // İlk denemede özel chunk promptu kullan
                prompt = await this.promptManager.getChunkPrompt(language, contentType, i === 0);
              } else {
                // Yeniden denemelerde daha basit prompt kullan
                prompt = `Bu video transkript parçasını ${language} dilinde kısaca özetle. İçeriği kategorilere ayırmadan, içeriğin gerçek doğasına uygun, anlaşılır, tarafsız bir özet oluştur:

${chunk}`;
              }
              
              logger.debug(`Prompt alındı (deneme ${retryCount + 1}/${maxRetries})`, { promptLength: prompt.length });
              
              chunkSummary = await this.geminiService.generateSummary(chunk, prompt);
              logger.info(`${i+1}/${chunks.length} nolu parça özeti oluşturuldu (deneme ${retryCount + 1})`, { 
                videoId, 
                chunkIndex: i,
                summaryLength: chunkSummary.length 
              });
              
              // Başarılı olursa döngüden çık
              break;
            } catch (error) {
              retryCount++;
              lastError = error;
              logger.warn(`Parça özeti oluşturma hatası (${i+1}/${chunks.length}), deneme ${retryCount}/${maxRetries}`, {
                videoId,
                chunkIndex: i,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
              
              if (retryCount >= maxRetries) {
                logger.error(`Maksimum deneme sayısına ulaşıldı, parça özeti oluşturulamadı`, {
                  videoId,
                  chunkIndex: i
                });
                // Tüm denemeler başarısız olursa, bu parça için basit bir özet ekle
                chunkSummary = `[Bu bölüm için özet oluşturulamadı.]`;
              }
            }
          }
          
          summaries.push(chunkSummary);
        }
        
        // Birleştirilmiş özetleri son bir kez işle
        const combinedSummary = summaries.join('\n\n');
        const finalPrompt = await this.promptManager.getFinalPrompt(language);
        summaryText = await this.geminiService.generateSummary(combinedSummary, finalPrompt);
        
        logger.info(`Tüm parça özetleri birleştirildi ve son format uygulandı`, { 
          videoId, 
          totalSummaryLength: summaryText.length 
        });
        
      } else {
        // For smaller transcripts - yeniden deneme mekanizması
        logger.info(`Tek seferde özet oluşturma kullanılıyor`, { 
          videoId, 
          transcriptLength: transcript.formatted_text.length 
        });
        
        retryCount = 0;
        
        while (retryCount < maxRetries && !summaryText) {
          try {
            let prompt;
            if (retryCount === 0) {
              // İlk denemede normal prompt kullan
              prompt = await this.promptManager.getPrompt(language, contentType);
            } else {
              // Yeniden denemelerde daha basit prompt kullan
              prompt = `Bu video transkriptini ${language} dilinde kısaca özetle. İçeriği kategorilere ayırmadan, içeriğin gerçek doğasına uygun, anlaşılır, tarafsız bir özet oluştur:

${transcript.formatted_text}`;
            }
            
            logger.debug(`Prompt alındı (deneme ${retryCount + 1}/${maxRetries})`, { promptLength: prompt.length });
            
            summaryText = await this.geminiService.generateSummary(transcript.formatted_text, prompt);
            logger.info(`Özet oluşturuldu (deneme ${retryCount + 1})`, { 
              videoId, 
              summaryLength: summaryText.length 
            });
          } catch (error) {
            retryCount++;
            lastError = error;
            logger.warn(`processSummary Özet oluşturma hatası, deneme ${retryCount}/${maxRetries}`, {
              videoId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            if (retryCount >= maxRetries) {
              logger.error(`Maksimum deneme sayısına ulaşıldı, özet oluşturulamadı`, { videoId });
              throw new Error(`Failed to generate summary after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        }
      }
      
      // Özet oluşturulduysa formatla
      if (summaryText) {
        logger.info(`Özet formatlanıyor`, { videoId });
        summaryText = this.formatSummary(summaryText);
        logger.info(`Özet formatlandı`, { 
          videoId, 
          formattedLength: summaryText.length 
        });
      }

      // Validate language
      logger.info(`Özet dili doğrulanıyor`, { videoId, expectedLanguage: language });
      const detectedLanguage = await this.languageDetector.detectLanguage(summaryText);
      if (detectedLanguage !== language) {
        logger.warn(`Uyarı: Oluşturulan özet dili (${detectedLanguage}) istenen dil ile eşleşmiyor (${language})`, {
          videoId,
          detectedLanguage,
          requestedLanguage: language
        });
      } else {
        logger.info(`Özet dili doğrulandı: ${language}`, { videoId });
      }

      logger.info(`Özet işleme tamamlandı`, {
        videoId,
        language,
        summaryId,
        contentLength: summaryText.length
      });
      
      return {
        content: summaryText
      };

    } catch (error: any) {
      logger.error(`Özet işlemede hata`, {
        videoId,
        language,
        summaryId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  private formatSummary(text: string): string {
    logger.debug(`Özet formatlanıyor`, { textLength: text.length });
    try {
      // Split into paragraphs
      const paragraphs = text.split('\n\n').filter(p => p.trim());
      logger.debug(`${paragraphs.length} paragraf bulundu`, { paragraphCount: paragraphs.length });
      
      // Format each paragraph with markdown
      const formattedParagraphs = paragraphs.map(p => {
        // Check if it's a heading (starts with #)
        if (p.startsWith('#')) {
          return p;
        }
        // Add paragraph markdown
        return `\n${p}\n`;
      });

      const result = formattedParagraphs.join('\n');
      logger.debug(`Özet formatlandı`, { 
        originalLength: text.length, 
        formattedLength: result.length 
      });
      
      return result;
    } catch (error: any) {
      logger.error(`Özet formatlanırken hata oluştu`, { error: error.message });
      // Format hatasında orijinal metni döndür
      return text;
    }
  }

  /**
   * Özetin belirtilen dilde olup olmadığını doğrular
   * @param summary Özet metni
   * @param targetLanguage Hedef dil
   */
  async validateLanguageOutput(summary: string, targetLanguage: string): Promise<boolean> {
    try {
      // TODO: Implement language validation logic
      const detectedLanguage = await this.detectLanguage(summary);
      return detectedLanguage.toLowerCase() === targetLanguage.toLowerCase();
    } catch (error: any) {
      logger.error(`Error validating language: ${error}`);
      return false;
    }
  }

  /**
   * Metnin dilini tespit eder
   * @param text İncelenecek metin
   */
  async detectLanguage(text: string): Promise<string> {
    try {
      // TODO: Implement language detection logic
      return "en"; // Default to English for now
    } catch (error: any) {
      logger.error(`Error detecting language: ${error}`);
      throw new Error(`Failed to detect language: ${error.message}`);
    }
  }

  /**
   * Metni hedef dile çevirir
   * @param text Çevrilecek metin
   * @param targetLanguage Hedef dil
   */
  async translateText(text: string, targetLanguage: string): Promise<string> {
    try {
      // TODO: Implement translation logic
      return text; // Return original text for now
    } catch (error: any) {
      logger.error(`Error translating text: ${error}`);
      throw new Error(`Failed to translate text: ${error.message}`);
    }
  }

  /**
   * Videonun bölümlerini çıkarır ve özetler
   * @param transcript Transkript verileri
   * @param videoId Video ID'si
   * @deprecated Kullanım dışı - Bunun yerine chunkText metodunu kullanın
   */
  /*
  async extractChapters(transcript: any, videoId: string): Promise<ChapterInfo[]> {
    try {
      // TODO: Implement chapter extraction logic
      return []; // Return empty array for now
    } catch (error: any) {
      logger.error(`Error extracting chapters: ${error}`);
      throw new Error(`Failed to extract chapters: ${error.message}`);
    }
  }
  */

  /**
   * Metni belirli boyutta parçalara böler
   * @param text Bölünecek metin
   * @param maxChunkSize Maksimum parça boyutu
   */
  private chunkText(text: string, maxChunkSize: number = 29900): string[] {
    logger.debug(`Metin parçalanıyor`, { textLength: text.length, maxChunkSize });
    try {
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      logger.debug(`${sentences.length} cümle bulundu`, { sentenceCount: sentences.length });
      
      const chunks: string[] = [];
      let currentChunk = '';

      for (const sentence of sentences) {
        if ((currentChunk + sentence).length <= maxChunkSize) {
          currentChunk += sentence;
        } else {
          if (currentChunk) chunks.push(currentChunk.trim());
          currentChunk = sentence;
        }
      }

      if (currentChunk) chunks.push(currentChunk.trim());
      
      logger.debug(`Metin ${chunks.length} parçaya bölündü`, { 
        chunkCount: chunks.length,
        averageChunkSize: text.length / chunks.length
      });
      
      return chunks;
    } catch (error: any) {
      logger.error(`Metin parçalanırken hata`, { error: error.message });
      // Hata durumunda tüm metni tek parça olarak döndür
      return [text];
    }
  }

  /**
   * Metni anlamlı parçalara böler
   * @param text Bölünecek metin
   * @param chunkSize Hedef parça boyutu
   * @deprecated Kullanım dışı - Bunun yerine chunkText metodunu kullanın
   */
  /*
  private createSmartChunks(text: string, chunkSize: number): string[] {
    try {
      // Simple implementation - split by sentences and group into chunks
      const sentences = text.split(/(?<=[.!?])\s+/);
      const chunks: string[] = [];
      let currentChunk = "";

      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length <= chunkSize) {
          currentChunk += (currentChunk ? " " : "") + sentence;
        } else {
          chunks.push(currentChunk);
          currentChunk = sentence;
        }
      }

      if (currentChunk) {
        chunks.push(currentChunk);
      }

      return chunks;
    } catch (error: any) {
      logger.error(`Error creating chunks: ${error}`);
      return [text]; // Return the original text as a single chunk
    }
  }
  */

  async createSummaryWithTimeout(videoId: string, language: string): Promise<Summary> {
    try {
      // Timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Özet oluşturma işlemi zaman aşımına uğradı. Lütfen daha sonra tekrar deneyin.'));
        }, SUMMARY_TIMEOUT);
      });

      // Summary creation promise
      const summaryPromise = this.generateSummary(videoId, language);

      // Race between timeout and summary creation
      const summary = await Promise.race([summaryPromise, timeoutPromise]) as Summary;
      return summary;
    } catch (error) {
      logger.error('Error in createSummary', { error, videoId, language });
      throw error;
    }
  }

  /**
   * Verilen video ID ve dil için mevcut özet kontrolü yapar
   * @param videoId Video ID
   * @param language Dil kodu
   * @returns Özet varsa döner, yoksa null döner
   */
  async checkExistingSummary(videoId: string, language: string): Promise<Summary | null> {
    try {
      logger.info('Mevcut özet kontrolü yapılıyor', {
        videoId,
        language,
        function: 'SummaryService.checkExistingSummary'
      });

      // 1. Redis cache'de kontrol et
      const cachedSummary = await cacheService.getSummary(videoId, language);
      if (cachedSummary && cachedSummary.status === 'completed') {
        logger.info('Tamamlanmış özet cache\'de bulundu', {
          videoId,
          language,
          function: 'SummaryService.checkExistingSummary'
        });
        return cachedSummary;
      }

      // 2. DB'de kontrol et
      const dbSummary = await this.databaseService.getRawSummary(videoId, language);
      if (dbSummary && dbSummary.status === 'completed') {
        logger.info('Tamamlanmış özet DB\'de bulundu', {
          videoId,
          language,
          function: 'SummaryService.checkExistingSummary'
        });
        // Cache'e ekle ve döndür
        await cacheService.setSummary(videoId, language, dbSummary);
        return dbSummary;
      }

      // 3. Eğer işlenmekte olan bir özet varsa onu döndür
      if (dbSummary && ['processing', 'pending'].includes(dbSummary.status)) {
        logger.info('İşlenmekte olan özet bulundu', {
          videoId,
          language,
          status: dbSummary.status,
          function: 'SummaryService.checkExistingSummary'
        });
        return dbSummary;
      }

      logger.info('Mevcut özet bulunamadı', {
        videoId,
        language,
        function: 'SummaryService.checkExistingSummary'
      });
      return null;

    } catch (error) {
      logger.error('Özet kontrolünde hata', {
        error: error instanceof Error ? error.message : 'Unknown error',
        videoId,
        language,
        function: 'SummaryService.checkExistingSummary'
      });
      return null;
    }
  }

  /**
   * Transkript tamamlandığında özet oluşturma işlemini yönetir
   * @param videoId Video ID
   * @param language Dil kodu
   */
  async handleTranscriptCompletion(videoId: string, language: string, userId: string): Promise<void> {
    try {
      logger.info('Transkript tamamlandı, özet işlemi başlatılıyor', {
        videoId,
        language,
        function: 'SummaryService.handleTranscriptCompletion'
      });

      // Transkriptin dilini kontrol et
      const transcript = await this.databaseService.getRawTranscript(videoId, language);
      if (!transcript) {
        logger.error('Transkript bulunamadı, özet oluşturulamıyor', {
          videoId,
          language,
          function: 'SummaryService.handleTranscriptCompletion'
        });
        throw new Error(`Transcript not found for videoId: ${videoId}, language: ${language}`);
      }
      
      // Çevrilmiş transkript kontrolü
      if (transcript.source_language && transcript.source_language !== language) {
        logger.info(`Özet oluşturmak için kullanılacak transkript ${transcript.source_language} dilinden ${language} diline çevrilmiş`, {
          videoId,
          originalLanguage: transcript.source_language,
          targetLanguage: language,
          function: 'SummaryService.handleTranscriptCompletion'
        });
      }

      // Mevcut özet kontrolü
      const existingSummary = await this.checkExistingSummary(videoId, language);
      
      if (!existingSummary) {
        logger.info('Mevcut özet bulunamadı, yeni özet oluşturuluyor', {
          videoId,
          language,
          function: 'SummaryService.handleTranscriptCompletion'
        });

        // Yeni özet oluştur
        const { data: newSummary, error } = await supabaseAdmin
          .from('summaries')
          .insert({
            video_id: videoId,
            language,
            status: 'pending',
            source: 'gemini',
            content: '', // Boş string olarak başlat
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          logger.error('handleTranscriptCompletion Özet oluşturma hatası', {
            error,
            videoId,
            language,
            function: 'SummaryService.handleTranscriptCompletion'
          });
          throw error;
        }

        // Queue'ya ekle
        await queueService.addToQueue({
          type: 'summary',
          data: {
            videoId,
            language,
            summaryId: newSummary.id,
            transcriptId: transcript.id,
            userId,
            reprocess: true
          }
        });

      } else {
        logger.info('Bu video için özet zaten mevcut', {
          videoId,
          language,
          summaryStatus: existingSummary.status,
          function: 'SummaryService.handleTranscriptCompletion'
        });

        // Eğer özet failed durumunda ise yeniden dene
        if (existingSummary.status === 'failed') {
          logger.info('Failed durumundaki özet için yeniden deneme yapılıyor', {
            videoId,
            language,
            function: 'SummaryService.handleTranscriptCompletion'
          });
          
          await this.updateSummary(existingSummary.id, {
            status: 'pending',
            error: undefined,
            source: 'gemini',
            content: '' // Boş string olarak güncelle
          });

          await queueService.addToQueue({
            type: 'summary',
            data: {
              videoId,
              language,
              summaryId: existingSummary.id,
              transcriptId: transcript.id,
              userId,
              reprocess: true
            }
          });
        }
      }
    } catch (error) {
      logger.error('Özet oluşturma işleminde hata', {
        error: error instanceof Error ? error.message : 'Unknown error',
        videoId,
        language,
        function: 'SummaryService.handleTranscriptCompletion'
      });
      throw error;
    }
  }

  async getSummary(videoId: string, language: string): Promise<Summary | null> {
    try {
        logger.info('Özet getirme işlemi başlatıldı', {
            videoId,
            language,
            function: 'SummaryService.getSummary'
        });

        // 1. Cache kontrolü
        const cachedSummary = await cacheService.getSummary(videoId, language);
        if (cachedSummary && cachedSummary.status === 'completed') {
            logger.info('Özet cache\'den alındı', {
                videoId,
                language,
                function: 'SummaryService.getSummary'
            });
            return cachedSummary;
        }

        // 2. DB'den getir
        const summary = await this.databaseService.getRawSummary(videoId, language);
        if (!summary) {
            return null;
        }

        // 3. Tamamlanmış özeti cache'e ekle
        if (summary.status === 'completed') {
            await cacheService.setSummary(videoId, language, summary);
        }

        // 4. formatted_content alanını ekle
        summary.formatted_content = summary.content;

        return summary;
    } catch (error) {
        logger.error('Özet getirme hatası', {
            error: error instanceof Error ? error.message : 'Unknown error',
            videoId,
            language,
            function: 'SummaryService.getSummary'
        });
        throw error;
    }
  }

  /**
   * Özeti bulur veya oluşturur - race condition'ları önler
   * @param videoId Video ID'si
   * @param language Dil kodu
   */
  async findOrCreateSummary(videoId: string, language: string): Promise<Summary> {
    const lockKey = `summary:${videoId}:${language}`;

    try {
      // 1. Önce cache'de kontrol et
      const cachedSummary = await cacheService.getSummary(videoId, language);
      if (cachedSummary && cachedSummary.status === 'completed') {
        logger.info('Özet cache\'den alındı, DB kontrolü yapılıyor', {
          videoId,
          language,
          function: 'SummaryService.findOrCreateSummary'
        });

        // Cache'de bulunan özetin DB'de olup olmadığını kontrol et
        const dbSummary = await this.databaseService.getRawSummary(videoId, language);
        if (!dbSummary) {
          logger.info('Cache\'de bulunan özet DB\'de yok, DB\'ye kaydediliyor', {
            videoId,
            language,
            function: 'SummaryService.findOrCreateSummary'
          });

          // Cache'deki özeti DB'ye kaydet
          const { data: newSummary, error } = await supabaseAdmin
            .from('summaries')
            .insert(cachedSummary)
            .select()
            .single();

          if (error) {
            logger.error('Cache\'deki özet DB\'ye kaydedilirken hata oluştu', {
              error,
              videoId,
              language,
              function: 'SummaryService.findOrCreateSummary'
            });
            throw error;
          }

          return newSummary;
        }

        return cachedSummary;
      }

      // 2. DB'de kontrol et
      const existingSummary = await this.databaseService.getRawSummary(videoId, language);
      if (existingSummary) {
        logger.info('Özet DB\'den alındı', {
          videoId,
          language,
          status: existingSummary.status,
          function: 'SummaryService.findOrCreateSummary'
        });

        // Eğer özet tamamlanmışsa cache'e ekle
        if (existingSummary.status === 'completed') {
          await cacheService.setSummary(videoId, language, existingSummary);
        }

        return existingSummary;
      }

      // 3. Lock al
      const locked = await this.acquireLock(lockKey);
      if (!locked) {
        logger.info('Lock alınamadı, kısa bir süre beklenip tekrar denenecek', {
          videoId,
          language,
          function: 'SummaryService.findOrCreateSummary'
        });

        // Lock alınamadıysa, başka bir işlem özeti oluşturuyor olabilir
        // Kısa bir süre bekleyip tekrar kontrol et
        await new Promise(resolve => setTimeout(resolve, 1000));
        const summary = await this.databaseService.getRawSummary(videoId, language);
        if (summary) {
          return summary;
        }
        throw new Error('Could not acquire lock for summary creation');
      }

      try {
        // 4. Lock aldıktan sonra tekrar kontrol et (double-check)
        const summary = await this.databaseService.getRawSummary(videoId, language);
        if (summary) {
          return summary;
        }

        // 5. Transkript kontrolü
        const transcript = await this.databaseService.getRawTranscript(videoId, language);
        if (!transcript || transcript.status !== 'completed') {
          throw new Error('Transcript not found or not completed');
        }

        // 6. Yeni özet oluştur
        const summaryId = uuidv4();
        const newSummary: Partial<Summary> = {
          id: summaryId,
          video_id: videoId,
          language,
          status: 'pending',
          source: 'gemini',
          content: '',
          created_at: new Date(),
          updated_at: new Date()
        };

        logger.info('Yeni özet oluşturuluyor', {
          videoId,
          language,
          summaryId,
          function: 'SummaryService.findOrCreateSummary'
        });

        // 7. DB'ye kaydet
        const createdSummary = await this.databaseService.createRawSummary(newSummary);

        logger.info('Yeni özet oluşturuldu', {
          videoId,
          language,
          summaryId: createdSummary.id,
          function: 'SummaryService.findOrCreateSummary'
        });

        return createdSummary;
      } finally {
        // Her durumda lock'u serbest bırak
        await this.releaseLock(lockKey);
      }
    } catch (error) {
      logger.error('Özet bulma/oluşturma hatası', {
        error: error instanceof Error ? error.message : 'Unknown error',
        videoId,
        language,
        function: 'SummaryService.findOrCreateSummary'
      });
      throw error;
    }
  }

  /**
   * Özet durumunu kontrol eder
   */
  async getSummaryStatus(videoId: string, language: string): Promise<any> {
    const summary = await this.getSummary(videoId, language);
    
    if (!summary) {
      return {
        status: 'not_found',
        message: 'No summary found'
      };
    }

    const statusData = {
      status: summary.status,
      error: summary.error || null,
      content: summary.content,
      data: summary.status === 'completed' ? summary : null
    };
    
    // Only send Redis notifications for processing status or for completed/failed if not already sent
    if (summary.status === 'processing') {
      // Always send processing updates
      // await notifySummaryStarted(videoId);
    } else if (summary.status === 'completed' || summary.status === 'failed') {
      // For completed or failed, check if update was already sent
      const updateSentKey = `veciz:notification:summary_update_sent:${summary.id}`;
      const updateSent = await redis.get(updateSentKey);
      
      if (!updateSent) {
        // await notifySummaryCompleted(videoId, {
        //   content: summary.content,
        //   id: summary.id,
        //   summary_id: summary.id,
        //   language: summary.language
        // });
        logger.info(`🚀 Redis Pub/Sub summary completed notification sent for video ${videoId}`);
      } else {
        logger.info('Mükerrer bildirim önlendi (getSummaryStatus)', {
          summaryId: summary.id,
          videoId,
          function: 'SummaryService.getSummaryStatus'
        });
      }
    } else {
      // Always send updates for pending or other statuses
      // await notifySummaryStarted(videoId);
    }
    
    return statusData;
  }

  async updateSummary(summaryId: string, updates: Partial<Summary>): Promise<void> {
    try {
        logger.info('Özet güncelleme işlemi başlatıldı', {
            summaryId,
            function: 'SummaryService.updateSummary'
        });

        // 1. DB'de güncelle
        await this.databaseService.updateRawSummary(summaryId, {
            ...updates,
            updated_at: new Date()
        });

        // 2. Eğer özet tamamlandıysa cache'i güncelle
        if (updates.status === 'completed' || updates.status === 'failed') {
            const summary = await this.databaseService.getRawSummary(updates.video_id!, updates.language!);
            if (summary) {
                if (updates.status === 'completed') {
                    await cacheService.setSummary(summary.video_id, summary.language, summary);
                    
                    // YENİ: Redis Pub/Sub üzerinden bildirim gönder
                    // try {
                    //     await notifySummaryCompleted(summary.video_id, {
                    //         content: summary.content,
                    //         id: summary.id,
                    //         summary_id: summary.id,
                    //         language: summary.language
                    //     });
                    //     logger.info(`🚀 Redis Pub/Sub summary completed notification sent for video ${summary.video_id}`);
                    // } catch (notifyError) {
                    //     logger.error(`❌ Redis Pub/Sub summary notification failed: ${notifyError}`, {
                    //         videoId: summary.video_id,
                    //         summaryId: summary.id
                    //     });
                    //     // Bildirim gönderilemedi ama özet başarıyla işlendi, sadece log yazıyoruz
                    // }
                } else if (updates.status === 'failed' && summary.error) {
                    // Hata durumunda da bildirim gönder
                    // try {
                    //     await notifySummaryError(summary.video_id, summary.error);
                    //     logger.info(`🚀 Redis Pub/Sub summary error notification sent for video ${summary.video_id}`);
                    // } catch (notifyError) {
                    //     logger.error(`❌ Redis Pub/Sub summary error notification failed: ${notifyError}`, {
                    //         videoId: summary.video_id,
                    //         summaryId: summary.id
                    //     });
                    // }
                }
                
                // Check if a notification has already been sent for this summary
                const updateSentKey = `veciz:notification:summary_update_sent:${summaryId}`;
                const updateSent = await redis.get(updateSentKey);
                
                if (!updateSent) {
                    // Redis üzerinden bildirim gönder
                    // await notifySummaryStarted(summary.video_id);
                    
                    logger.info('Özet bildirim gönderildi', {
                        summaryId,
                        videoId: summary.video_id,
                        status: summary.status,
                        function: 'SummaryService.updateSummary'
                    });
                } else {
                    logger.info('Mükerrer bildirim önlendi (updateSummary)', {
                        summaryId,
                        videoId: summary.video_id,
                        function: 'SummaryService.updateSummary'
                    });
                }
            }
        } else if (updates.status === 'processing' && updates.video_id) {
            // Processing durumunda da bildirim gönder - for processing updates we don't need to prevent duplicates
            // since these are progress updates and users should see them
            // await notifySummaryStarted(updates.video_id);
            
            // YENİ: İşlem başladığında Redis Pub/Sub üzerinden bildirim gönder
            // try {
            //     await notifySummaryStarted(updates.video_id);
            //     logger.info(`🚀 Redis Pub/Sub summary started notification sent for video ${updates.video_id}`);
            // } catch (notifyError) {
            //     logger.error(`❌ Redis Pub/Sub summary started notification failed: ${notifyError}`, {
            //         videoId: updates.video_id,
            //         summaryId
            //     });
            // }
        }
    } catch (error) {
        logger.error('Özet güncelleme hatası', {
            error: error instanceof Error ? error.message : 'Unknown error',
            summaryId,
            updates,
            function: 'SummaryService.updateSummary'
        });
        throw error;
    }
  }
}

export default SummaryService; 