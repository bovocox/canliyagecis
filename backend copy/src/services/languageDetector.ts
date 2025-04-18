class LanguageDetector {
  private supportedLanguages: string[] = [
    'tr', 'en', 'de', 'fr', 'es', 'it', 'ru', 'ar', 'zh', 'ja', 'ko'
  ];

  /**
   * Metnin dilini tespit eder
   * @param text İncelenecek metin
   */
  async detectLanguage(text: string): Promise<string> {
    try {
      // Simplified implementation
      // In a real implementation, this would use a language detection library or API
      // Such as Google Cloud's Language Detection, or libraries like franc-min, etc.
      
      // For now, return a mock detection based on letter frequency
      const sample = text.slice(0, 1000).toLowerCase();
      
      // Simple heuristic based on common letters/words in languages
      if (this.containsCharacters(sample, 'çğıöşü')) {
        return 'tr'; // Turkish
      } else if (this.containsCharacters(sample, 'äöüß')) {
        return 'de'; // German
      } else if (this.containsCharacters(sample, 'éèêëàâçùûüÿ')) {
        return 'fr'; // French
      } else if (this.containsCharacters(sample, 'áéíóúüñ¿¡')) {
        return 'es'; // Spanish
      } else if (this.containsCharacters(sample, '的是不我')) {
        return 'zh'; // Chinese
      } else if (this.containsWords(sample, ['the', 'and', 'of', 'to', 'in'])) {
        return 'en'; // English
      }
      
      // Default to English if no other language is detected
      return 'en';
    } catch (error: any) {
      console.error(`Error detecting language: ${error.message}`);
      return 'en'; // Default to English on error
    }
  }

  /**
   * Metnin belirtilen dilde olup olmadığını doğrular
   * @param text İncelenecek metin
   * @param expectedLanguage Beklenen dil
   */
  async validateLanguage(text: string, expectedLanguage: string): Promise<boolean> {
    try {
      const normalizedExpectedLanguage = this.normalizeLanguageCode(expectedLanguage);
      
      // Check if the expected language is supported
      if (!this.supportedLanguages.includes(normalizedExpectedLanguage)) {
        console.warn(`Requested validation for unsupported language: ${expectedLanguage}`);
        return false;
      }
      
      // Detect the actual language
      const detectedLanguage = await this.detectLanguage(text);
      
      // Calculate confidence
      const confidence = await this.getLanguageConfidence(text, normalizedExpectedLanguage);
      
      // Return true if confident enough that this is the expected language
      return detectedLanguage === normalizedExpectedLanguage || confidence > 0.7;
    } catch (error: any) {
      console.error(`Error validating language: ${error.message}`);
      return false;
    }
  }

  /**
   * Dil tespitinin güven skorunu döndürür
   * @param text İncelenecek metin
   * @param language Kontrol edilecek dil
   */
  async getLanguageConfidence(text: string, language: string): Promise<number> {
    try {
      // This is a simplified implementation
      // In a real implementation, this would use language detection with confidence scores
      
      const normalizedLanguage = this.normalizeLanguageCode(language);
      const sample = text.slice(0, 1000).toLowerCase();
      
      // Simple confidence calculation
      let confidence = 0.5; // Base confidence
      
      switch (normalizedLanguage) {
        case 'tr':
          confidence += this.containsCharacters(sample, 'çğıöşü') ? 0.4 : -0.3;
          break;
        case 'de':
          confidence += this.containsCharacters(sample, 'äöüß') ? 0.4 : -0.3;
          break;
        case 'fr':
          confidence += this.containsCharacters(sample, 'éèêëàâçùûüÿ') ? 0.4 : -0.3;
          break;
        case 'es':
          confidence += this.containsCharacters(sample, 'áéíóúüñ¿¡') ? 0.4 : -0.3;
          break;
        case 'en':
          confidence += this.containsWords(sample, ['the', 'and', 'of', 'to', 'in']) ? 0.4 : -0.3;
          break;
        default:
          confidence = 0.3; // Lower confidence for unsupported languages
      }
      
      // Clamp confidence between 0 and 1
      return Math.max(0, Math.min(1, confidence));
    } catch (error: any) {
      console.error(`Error calculating language confidence: ${error.message}`);
      return 0.5; // Default neutral confidence on error
    }
  }

  /**
   * Desteklenen dilleri listeler
   */
  getSupportedLanguages(): string[] {
    return [...this.supportedLanguages];
  }

  /**
   * Dil kodunu ISO 639-1 formatına dönüştürür
   * @param languageCode Dil kodu
   */
  normalizeLanguageCode(languageCode: string): string {
    // Convert to lowercase and trim
    const normalized = languageCode.toLowerCase().trim();
    
    // Map common variants to standard codes
    const languageMap: { [key: string]: string } = {
      'turkish': 'tr',
      'türkçe': 'tr',
      'english': 'en',
      'german': 'de',
      'deutsch': 'de',
      'french': 'fr',
      'français': 'fr',
      'spanish': 'es',
      'español': 'es',
      'chinese': 'zh',
      'mandarin': 'zh',
      '中文': 'zh',
      'japanese': 'ja',
      '日本語': 'ja',
      'korean': 'ko',
      '한국어': 'ko',
      'russian': 'ru',
      'русский': 'ru',
      'arabic': 'ar',
      'العربية': 'ar',
      'italian': 'it',
      'italiano': 'it'
    };
    
    // If we have a mapping for this language name, use it
    if (languageMap[normalized]) {
      return languageMap[normalized];
    }
    
    // If it's already a 2-letter code and in our supported list, return as is
    if (normalized.length === 2 && this.supportedLanguages.includes(normalized)) {
      return normalized;
    }
    
    // Otherwise, return the original input or a default
    return normalized.length === 2 ? normalized : 'en';
  }

  /**
   * Checks if a text contains any of the specified characters
   * @param text Text to check
   * @param characters Characters to look for
   */
  private containsCharacters(text: string, characters: string): boolean {
    for (const char of characters) {
      if (text.includes(char)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if a text contains any of the specified words
   * @param text Text to check
   * @param words Words to look for
   */
  private containsWords(text: string, words: string[]): boolean {
    const textLower = text.toLowerCase();
    for (const word of words) {
      // Check for word with surrounding spaces or punctuation
      const regex = new RegExp(`[\\s.,;!?"']${word}[\\s.,;!?"']`, 'i');
      if (regex.test(` ${textLower} `)) {
        return true;
      }
    }
    return false;
  }
}

export default LanguageDetector; 