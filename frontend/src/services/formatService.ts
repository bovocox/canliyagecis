export class FormatService {
  static formatSummaryText(text: string): string {
    if (!text) return '';

    // Zaten HTML formatlaması içerip içermediğini kontrol et
    const containsHtmlFormatting = this.hasGeminiFormatting(text);

    if (containsHtmlFormatting) {
      // Metin zaten HTML formatlaması içeriyor - muhtemelen Gemini tarafından formatlanmış
      // Sadece geçersiz karakterleri temizle
      let cleanedText = this.cleanInvalidChars(text);
      
      // HTML formatlamasını olduğu gibi koru, sadece div ile sarmala
      return `<div class="summary-plain-text">${cleanedText}</div>`;
    } else {
      // Metin HTML formatlaması içermiyor - eski yöntemi uygula
      text = this.cleanInvalidChars(text);

      // HTML etiketlerini temizle
      text = text.replace(/<[^>]*>/g, '');

      // Gelişmiş formatlama yapılıyor
      text = this.analyzeSectionsAndFormat(text);
      
      return `<div class="summary-plain-text">${text}</div>`;
    }
  }
  
  // Gemini tarafından formatlanmış HTML içerip içermediğini kontrol et
  private static hasGeminiFormatting(text: string): boolean {
    // Gemini formatlamasının belirli işaretlerini ara:
    // 1. highlight-concept sınıfına sahip span etiketleri
    // 2. section-heading sınıfına sahip div etiketleri
    // 3. stat-highlight sınıfına sahip span etiketleri
    // 4. Diğer özel sınıflar
    
    const formatIndicators = [
      '<span class="highlight-concept">',
      '<div class="section-heading">',
      '<span class="stat-highlight">',
      '<span class="quote-highlight">',
      '<span class="highlight-warning">',
      '<span class="highlight-advice">',
      '<p class="content-paragraph">',
      '<p class="simple-bullet">'
    ];
    
    // Herhangi bir formatlamanın mevcut olup olmadığını kontrol et
    return formatIndicators.some(indicator => text.includes(indicator));
  }
  
  // Geçersiz karakterleri temizleme
  private static cleanInvalidChars(text: string): string {
    // Geçersiz Unicode karakterlerini ve kontrol karakterlerini temizle
    return text.replace(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
  
  // Bölüm analizi ve gelişmiş formatlama
  private static analyzeSectionsAndFormat(text: string): string {
    // Paragrafları ayır
    const paragraphs = text.split('\n').filter(line => line.trim());
    
    // Olası bölüm başlıkları için anahtar kelimeleri tanımla
    const sectionKeywords: Record<string, string> = {
      'giriş': '📝',
      'özet': '📋',
      'sonuç': '🎯',
      'öneriler': '💡',
      'tavsiyeler': '💡',
      'dikkat edilmesi gerekenler': '⚠️',
      'ana noktalar': '🔑',
      'key points': '🔑',
      'introduction': '📝',
      'summary': '📋',
      'conclusion': '🎯',
      'recommendations': '💡',
      'suggestions': '💡',
      'warnings': '⚠️',
      'main points': '🔑',
      'tarihçe': '📜',
      'history': '📜',
      'analysis': '🔍',
      'analiz': '🔍',
      'örnek': '🔍',
      'example': '🔍',
      'statistics': '📊',
      'istatistikler': '📊',
      'karşılaştırma': '⚖️',
      'comparison': '⚖️',
      'explanation': '📢',
      'açıklama': '📢'
    };
    
    // Bölümleri tespit edip oluştur
    let formattedContent = '';
    let currentSectionContent = '';
    let lastSectionTitle = '';
    
    // Her paragrafı işle
    paragraphs.forEach((paragraph, index) => {
      // Paragraf bir bölüm başlığı olabilir mi kontrol et
      let isSectionHeading = false;
      let sectionTitle = '';
      let sectionEmoji = '';
      
      // Anahtar kelimeleri kontrol et
      for (const [keyword, emoji] of Object.entries(sectionKeywords)) {
        // Eğer paragraf 3-25 kelime arasındaysa ve anahtar kelime içeriyorsa
        if (paragraph.length < 100 && paragraph.toLowerCase().includes(keyword.toLowerCase())) {
          isSectionHeading = true;
          sectionTitle = paragraph;
          sectionEmoji = emoji;
          break;
        }
      }
      
      // Eğer bölüm başlığı değilse, mevcut bölüme ekle
      if (!isSectionHeading) {
        currentSectionContent += paragraph + '<br><br>';
      } 
      // Bölüm başlığı bulundu, önceki bölümü bitir ve yeni bölüm başlat
      else {
        // Önceki bölüm içeriğini ekle (eğer varsa)
        if (currentSectionContent && lastSectionTitle) {
          formattedContent += this.formatSectionContent(currentSectionContent);
        } else if (currentSectionContent) {
          // İlk bölüm için otomatik başlık
          formattedContent += `<div class="section-heading">
              <div class="section-heading-text">
                <span class="section-emoji">📄</span>Özet
              </div>
            </div>`;
          formattedContent += this.formatSectionContent(currentSectionContent);
        }
        
        // Yeni bölüm başlığı ekle
        formattedContent += `<div class="section-heading">
            <div class="section-heading-text">
              <span class="section-emoji">${sectionEmoji}</span>${sectionTitle}
            </div>
          </div>`;
        
        // Bölüm içeriğini sıfırla
        currentSectionContent = '';
        lastSectionTitle = sectionTitle;
      }
      
      // Son paragraf için kontrol
      if (index === paragraphs.length - 1 && currentSectionContent) {
        formattedContent += this.formatSectionContent(currentSectionContent);
      }
    });
    
    // Eğer hiçbir bölüm başlığı bulunamadıysa, tüm içeriği tek bölüm olarak formatla
    if (!formattedContent) {
      formattedContent = `<div class="section-heading">
          <div class="section-heading-text">
            <span class="section-emoji">📄</span>Özet
          </div>
        </div>`;
      formattedContent += this.formatSectionContent(text);
    }
    
    return formattedContent;
  }

  // Bölüm içeriğini formatla
  private static formatSectionContent(content: string): string {
    return this.applyAdvancedFormatting(content);
  }

  // Gelişmiş metin formatlaması
  private static applyAdvancedFormatting(text: string): string {
    // Madde işaretlerini formatla
    let formattedText = text.replace(/^[-*•]\s+(.+)$/gm, '<p class="simple-bullet">$1</p>');
    
    // Önemli ifadeleri vurgula
    // Önemli kelimeler, kavramlar ve teknik terimler (bazı örnekler)
    const importantTerms = [
      'dikkat', 'önemli', 'kritik', 'anahtar', 'temel', 'esaslı', 'sonuç olarak', 'özetle',
      'attention', 'important', 'critical', 'key', 'fundamental', 'crucial', 'in conclusion', 'notably',
      'fascism', 'faşizm', 'diktatörlük', 'demokrasi', 'democracy', 'autocracy', 'totalitarianism',
      'dikkat çekici', 'not edilmeli', 'vurgulanmalı', 'özellikle', 'specifically', 'particularly',
      'ekonomi', 'economy', 'finance', 'politik', 'political', 'significant', 'önemli ölçüde',
      'ancak', 'fakat', 'lakin', 'bununla birlikte', 'however', 'nevertheless', 'nonetheless'
    ];
    
    // Önemli terimleri vurgula
    importantTerms.forEach(term => {
      const regex = new RegExp(`\\b(${term})\\b`, 'gi');
      formattedText = formattedText.replace(regex, '<span class="highlight-concept">$1</span>');
    });
    
    // İstatistikleri vurgula (yüzde, sayısal veriler)
    formattedText = formattedText.replace(/(\d+(?:[.,]\d+)?%|\d+(?:[.,]\d+)? (?:milyon|milyar|bin|million|billion|thousand))/g, '<span class="stat-highlight">$1</span>');
    
    // Alıntıları vurgula (tırnak içindeki metinler)
    formattedText = formattedText.replace(/"([^"]+)"/g, '<span class="quote-highlight">$1</span>');
    formattedText = formattedText.replace(/'([^']+)'/g, '<span class="quote-highlight">$1</span>');
    
    // Uyarı cümlelerini vurgula
    formattedText = formattedText.replace(/(?:Uyarı|Dikkat|Warning|Caution|Note|Not):\s*([^.,;!?]+[.,;!?])/gi, '<span class="highlight-warning">$&</span>');
    
    // Öneri/tavsiye cümlelerini vurgula
    formattedText = formattedText.replace(/(?:Öneri|Tavsiye|Suggestion|Advice|Recommendation|Tip):\s*([^.,;!?]+[.,;!?])/gi, '<span class="highlight-advice">$&</span>');

    // Kalın ifadeleri işle
    formattedText = formattedText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // URL'leri otomatik olarak bağlantıya çevir
    formattedText = formattedText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    
    return formattedText;
  }

  static formatTranscriptText(text: string): string {
    if (!text) return '';

    // Geçersiz karakterleri temizle
    text = this.cleanInvalidChars(text);

    // Transkript formatlaması için özel kurallar
    let formattedText = text;

    // Konuşmacı bölümlerini düzenle
    formattedText = formattedText.replace(/^(Speaker \d+|Konuşmacı \d+):/gm, '\n$1:\n');

    // Zaman damgalarını düzenle
    formattedText = formattedText.replace(/\[\d{2}:\d{2}\]/g, '\n$&\n');

    // Fazla boşlukları temizle
    formattedText = formattedText.replace(/\n{3,}/g, '\n\n');

    return formattedText.trim();
  }
} 