import GeminiService from './geminiService';
import logger from '../utils/logger';

/**
 * TranslationService - Gemini API kullanarak çeviri işlemleri yapar
 */
class TranslationService {
  private geminiService: GeminiService;

  constructor() {
    this.geminiService = new GeminiService();
  }

  /**
   * Gemini yanıtından talimatları temizler
   * @param text Gemini'den dönen metin
   * @returns Temizlenmiş metin
   */
  private cleanInstructions(text: string): string {
    // İnstructşions kısmını kaldır
    if (text.includes('IMPORTANT INSTRUCTIONS:')) {
      // "IMPORTANT INSTRUCTIONS:" dan sonraki satırları tarat ve "TEXT TO TRANSLATE:" veya boş satıra kadar atla
      const lines = text.split('\n');
      let cleanedLines: string[] = [];
      let skipLines = false;
      let emptyLineFound = false;
      
      for (const line of lines) {
        if (line.includes('IMPORTANT INSTRUCTIONS:')) {
          skipLines = true;
          continue;
        }
        
        // Boş satır geldiğinde, talimatların bittiğini varsay
        if (skipLines && line.trim() === '') {
          emptyLineFound = true;
          skipLines = false;
          continue;
        }
        
        // Talimat içeren satırları atla
        if (skipLines) {
          continue;
        }
        
        cleanedLines.push(line);
      }
      
      return cleanedLines.join('\n').trim();
    }
    
    return text;
  }

  /**
   * Verilen metni hedef dile çevirir
   * @param text Çevrilecek metin
   * @param sourceLanguage Kaynak dil kodu (tr, en vb.)
   * @param targetLanguage Hedef dil kodu (tr, en vb.)
   * @returns Çevrilmiş metin
   */
  async translateText(text: string, sourceLanguage: string, targetLanguage: string): Promise<string> {
    try {
      logger.info('Çeviri işlemi başlatılıyor', {
        sourceLanguage,
        targetLanguage,
        textLength: text.length,
        function: 'TranslationService.translateText'
      });

      // Çeviri için Gemini promptu - İngilizce prompt kullan
      const prompt = `TRANSLATE the following text FROM ${sourceLanguage} TO ${targetLanguage}.

IMPORTANT INSTRUCTIONS:
- Your response must be ONLY in ${targetLanguage}
- Do NOT return the original text
- Do NOT add any explanations or notes
- Preserve paragraph structure and formatting
- Focus ONLY on accurate translation

TEXT TO TRANSLATE:`;

      // Gemini API ile çeviri yap
      const rawTranslatedText = await this.geminiService.generateSummary(
        prompt,
        text
      );

      // Talimatları temizle
      const translatedText = this.cleanInstructions(rawTranslatedText);

      logger.info('Çeviri işlemi tamamlandı', {
        sourceLanguage,
        targetLanguage,
        textLength: text.length,
        resultLength: translatedText.length,
        cleanedText: translatedText.substring(0, 100),
        function: 'TranslationService.translateText'
      });

      return translatedText;
    } catch (error) {
      logger.error('Çeviri işlemi başarısız oldu', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sourceLanguage,
        targetLanguage,
        function: 'TranslationService.translateText'
      });
      throw new Error(`Çeviri işlemi başarısız oldu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }

  /**
   * Verilen transkripti hedef dile çevirir
   * @param transcript Çevrilecek transkript
   * @param sourceLanguage Kaynak dil (tr, en vb.)
   * @param targetLanguage Hedef dil (tr, en vb.)
   * @returns Çevrilmiş transkript
   */
  async translateTranscript(transcript: string, sourceLanguage: string, targetLanguage: string): Promise<string> {
    logger.info('Transkript çeviri işlemi başlatılıyor', {
      sourceLanguage,
      targetLanguage,
      transcriptLength: transcript.length,
      function: 'TranslationService.translateTranscript',
      transcript_sample: transcript.substring(0, 100) // İlk 100 karakteri log'a yazdır
    });

    if (sourceLanguage === targetLanguage) {
      logger.info('Kaynak ve hedef dil aynı, çeviri yapılmayacak', {
        language: sourceLanguage,
        function: 'TranslationService.translateTranscript'
      });
      return transcript;
    }

    try {
      // Doğrudan çeviri yap
      const translatedText = await this.translateText(transcript, sourceLanguage, targetLanguage);

      logger.info('Transkript çeviri işlemi başarılı', {
        sourceLanguage,
        targetLanguage,
        inputLength: transcript.length,
        outputLength: translatedText.length,
        function: 'TranslationService.translateTranscript',
        translated_sample: translatedText.substring(0, 100) // İlk 100 karakteri log'a yazdır
      });

      return translatedText;
    } catch (error) {
      logger.error('Transkript çeviri işlemi başarısız', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sourceLanguage,
        targetLanguage,
        function: 'TranslationService.translateTranscript'
      });
      throw new Error(`Transkript çeviri işlemi başarısız oldu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

// Singleton nesne olarak ihraç et
export default new TranslationService(); 