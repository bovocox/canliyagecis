import { GoogleGenerativeAI } from '@google/generative-ai';
import GeminiKeyService from './geminiKeyService';
import logger from '../utils/logger';
import { HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

class GeminiService {
  private apiKeyService: GeminiKeyService;
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;
  private currentKey: string | null = null;

  constructor() {
    this.apiKeyService = new GeminiKeyService();
  }

  /**
   * Gemini modeli için API istemcisini başlatır
   * @param apiKey Kullanılacak API anahtarı
   */
  private async initializeModel(apiKey?: string): Promise<void> {
    try {
      // Eğer API anahtarı verilmişse onu kullan, yoksa aktif bir anahtar al
      const key = apiKey || await this.apiKeyService.getActiveKey();
      
      // Maskelenmiş API anahtarı
      const maskedKey = this.maskApiKey(key);
      
      // Daha önce geçersiz olduğu belirlenen bir API anahtarı mı?
      if (!key) {
        throw new Error('API anahtarı bulunamadı');
      }
      
      if (this.genAI && this.currentKey === key) {
        logger.debug('Gemini modeli zaten başlatılmış', { apiKey: maskedKey });
        return;
      }
      
      logger.info('Gemini modeli başlatılıyor...', { apiKey: maskedKey });
      
      // Google Generative AI client'ını oluştur
      this.genAI = new GoogleGenerativeAI(key);
      this.currentKey = key;
      
      // Modeli oluştur - gemini-pro yerine gemini-1.5-flash-8b kullanıyoruz
      // Güvenlik ayarları daha esnek hale getirildi
      this.model = this.genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash-8b",
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH, // Daha esnek ayar
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH, // Daha esnek ayar
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH, // Daha esnek ayar
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH, // Daha esnek ayar
          },
        ],
        generationConfig: {
          temperature: 0.6, // Daha düşük temperature daha güvenli çıktılar üretir
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
      });
      
      logger.info('Gemini modeli başarıyla başlatıldı', { 
        apiKey: maskedKey, 
        model: "gemini-1.5-flash-8b" 
      });
      
    } catch (error: any) {
      logger.error('Gemini modeli başlatılamadı', { 
        error: error.message, 
        stack: error.stack 
      });
      throw new Error(`Gemini modeli başlatılamadı: ${error.message}`);
    }
  }

  /**
   * Gemini API'ye istek gönderir
   * @param prompt Kullanılacak prompt
   * @param transcript İşlenecek transkript
   * @param apiKey API anahtarı
   */
  async generateSummary(prompt: string, transcript: string, apiKey?: string): Promise<string> {
    try {
      // Model başlatılmamışsa veya farklı bir API anahtarı kullanılacaksa modeli başlat
      if (!this.model || !this.currentKey || (apiKey && apiKey !== this.currentKey)) {
        await this.initializeModel(apiKey);
      }
      
      // Kullanılan API anahtarını logla (maskelenmiş haliyle)
      const maskedKey = this.maskApiKey(this.currentKey!);
      logger.info(`Gemini API isteği başlatılıyor`, { 
        promptLength: prompt.length, 
        transcriptLength: transcript.length,
        apiKey: maskedKey 
      });
      
      // API anahtarı kullanımını kaydet
      await this.apiKeyService.recordKeyUse(this.currentKey!);
      logger.debug(`API anahtarı kullanımı kaydedildi`, { apiKey: maskedKey });
      
      // İstek boyutunu logla
      const fullPrompt = `${prompt}\n\n${transcript}`;
      logger.debug(`Gemini isteği oluşturuldu`, { 
        promptLength: fullPrompt.length 
      });
      
      // API çağrısını yap
      const startTime = Date.now();
      logger.info(`Gemini API çağrısı yapılıyor...`);
      
      const result = await this.model.generateContent({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.4,
          topK: 32,
          topP: 0.95,
          maxOutputTokens: 4096,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_ONLY_HIGH"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_ONLY_HIGH"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_ONLY_HIGH"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_ONLY_HIGH"
          }
        ]
      });
      
      const elapsedTime = Date.now() - startTime;
      logger.info(`Gemini API yanıtı alındı`, { 
        elapsedTimeMs: elapsedTime
      });
      
      // Yanıtı işle
      const response = await result.response;
      const resultText = response.text();
      
      logger.info(`Gemini yanıtı işlendi`, { 
        resultLength: resultText.length,
        apiKey: maskedKey
      });
      
      return resultText;
    } catch (error: any) {
      logger.error(`Gemini API hatası`, {
        errorMessage: error.message,
        apiKey: this.currentKey ? this.maskApiKey(this.currentKey) : 'undefined'
      });
      
      // Hata yönetimini yap
      if (this.currentKey) {
        this.handleGeminiError(error, this.currentKey);
      }
      
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  /**
   * API hatalarını yönetir
   * @param error Hata bilgisi
   * @param apiKey Kullanılan API anahtarı
   */
  private handleGeminiError(error: any, apiKey: string): void {
    if (!apiKey) return;
    
    const errorMessage = error.message || 'Unknown error';
    const maskedKey = this.maskApiKey(apiKey);
    
    logger.error('Gemini API hatası yönetiliyor', {
      errorMessage,
      apiKey: maskedKey
    });
    
    // 404 hatası - model bulunamadı
    if (errorMessage.includes('not found') || errorMessage.includes('404')) {
      logger.warn('Gemini API model bulunamadı hatası', { apiKey: maskedKey });
      this.apiKeyService.markKeyError(apiKey, 'MODEL_NOT_FOUND');
    }
    // Limit aşıldı hatası
    else if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
      logger.warn('Gemini API rate limit aşıldı', { apiKey: maskedKey });
      this.apiKeyService.markKeyError(apiKey, 'RATE_LIMIT_EXCEEDED');
    }
    // Geçersiz istek hatası
    else if (errorMessage.includes('400') || errorMessage.includes('invalid')) {
      logger.warn('Gemini API isteği hatalı', { apiKey: maskedKey });
      this.apiKeyService.markKeyError(apiKey, 'BAD_REQUEST');
    }
    // Kimlik doğrulama hatası
    else if (errorMessage.includes('401') || errorMessage.includes('auth')) {
      logger.warn('Gemini API anahtarı geçersiz', { apiKey: maskedKey });
      this.apiKeyService.markKeyError(apiKey, 'INVALID_KEY');
    }
    // Erişim engellendi hatası
    else if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
      logger.warn('Gemini API erişimi yasak', { apiKey: maskedKey });
      this.apiKeyService.markKeyError(apiKey, 'FORBIDDEN');
    }
    // Güvenlik filtreleri hatası
    else if (errorMessage.includes('SAFETY') || errorMessage.includes('safety')) {
      logger.warn('Gemini API güvenlik filtresi engeli', { apiKey: maskedKey });
      this.apiKeyService.markKeyError(apiKey, 'SAFETY_ERROR');
    }
    // Diğer hatalar
    else {
      logger.warn('Gemini API bilinmeyen hata', { 
        apiKey: maskedKey,
        errorMessage
      });
      this.apiKeyService.markKeyError(apiKey, 'UNKNOWN_ERROR');
    }
  }
  
  /**
   * API anahtarını maskeler (güvenlik için)
   * @param key API anahtarı
   * @returns Maskelenmiş API anahtarı
   */
  private maskApiKey(key: string): string {
    if (!key || key.length < 8) return '***';
    return key.substring(0, 4) + '...' + key.substring(key.length - 4);
  }
}

export default GeminiService; 