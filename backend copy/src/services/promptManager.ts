import { ContentType } from '../types/summary';

class PromptManager {
  /**
   * İçerik türü ve dile göre uygun promptu seçer
   * @param language Özet dili
   * @param contentType İçerik türü (opsiyonel)
   */
  async getPrompt(language: string, contentType?: string): Promise<string> {
    try {
      // Get the template for the content type
      const template = this.getPromptTemplate(contentType as ContentType || 'general');
      
      // Fill the template with language-specific parameters
      return this.fillPromptTemplate(template, { language });
    } catch (error: any) {
      console.error(`Error getting prompt: ${error.message}`);
      
      // Fall back to a generic prompt
      return this.getGenericPrompt(language);
    }
  }

  /**
   * Transkript metnini analiz ederek içerik türünü belirler
   * @param transcript Transkript metni
   */
  async categorizeContent(transcript: string): Promise<ContentType> {
    try {
      // This is a simplified implementation
      // In a real implementation, this would use NLP techniques or ML models
      
      const text = transcript.toLowerCase();
      
      // Create a map of content types and their associated keywords
      const contentTypeKeywords: Record<ContentType, string[]> = {
        education: ['learn', 'course', 'study', 'lesson', 'concept', 'theory', 'professor', 'student', 'class', 'teach'],
        history: ['history', 'ancient', 'century', 'era', 'period', 'king', 'queen', 'war', 'empire', 'civilization'],
        finance: ['money', 'finance', 'investment', 'stock', 'market', 'economy', 'financial', 'bank', 'profit', 'business'],
        technology: ['tech', 'technology', 'software', 'hardware', 'device', 'digital', 'internet', 'app', 'computer', 'code'],
        news: ['news', 'report', 'journalist', 'media', 'recent', 'today', 'yesterday', 'latest', 'breaking', 'headline'],
        science: ['science', 'research', 'experiment', 'theory', 'scientific', 'discovery', 'biology', 'physics', 'chemistry', 'lab'],
        art: ['art', 'artist', 'painting', 'music', 'film', 'movie', 'literature', 'creative', 'design', 'culture'],
        sport: ['sport', 'game', 'team', 'player', 'championship', 'competition', 'match', 'tournament', 'athlete', 'win'],
        health: ['health', 'medical', 'doctor', 'disease', 'treatment', 'patient', 'hospital', 'symptom', 'medicine', 'diet'],
        general: []
      };
      
      // Count keyword occurrences for each content type
      const scores: Record<ContentType, number> = {
        education: 0,
        history: 0,
        finance: 0,
        technology: 0,
        news: 0,
        science: 0,
        art: 0,
        sport: 0,
        health: 0,
        general: 0
      };
      
      // Calculate scores for each content type
      for (const [contentType, keywords] of Object.entries(contentTypeKeywords)) {
        for (const keyword of keywords) {
          // Count occurrences of the keyword
          const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
          const matches = text.match(regex);
          if (matches) {
            scores[contentType as ContentType] += matches.length;
          }
        }
      }
      
      // Find the content type with the highest score
      let maxScore = 0;
      let detectedType: ContentType = 'general';
      
      for (const [contentType, score] of Object.entries(scores)) {
        if (score > maxScore) {
          maxScore = score;
          detectedType = contentType as ContentType;
        }
      }
      
      // If the score is too low, default to general
      if (maxScore < 3) {
        detectedType = 'general';
      }
      
      return detectedType;
    } catch (error: any) {
      console.error(`Error categorizing content: ${error.message}`);
      return 'general'; // Default to general content type
    }
  }

  /**
   * Özel prompt şablonunu doldurur
   * @param template Prompt şablonu
   * @param params Şablon parametreleri
   */
  private fillPromptTemplate(template: string, params: any): string {
    let filledTemplate = template;
    
    // Replace each placeholder with its value
    for (const [key, value] of Object.entries(params)) {
      const placeholder = `{${key}}`;
      filledTemplate = filledTemplate.replaceAll(placeholder, value as string);
    }
    
    return filledTemplate;
  }

  /**
   * İçerik türüne göre prompt şablonunu getirir
   * @param contentType İçerik türü
   */
  private getPromptTemplate(contentType: ContentType): string {
    switch (contentType) {
      case 'education':
        return `Aşağıdaki eğitim videosu transkriptini {language} dilinde detaylı bir şekilde özetleyin:

{transcript}

Lütfen özeti aşağıdaki yapıda oluşturun:

1. DERS GENEL BAKIŞI (2-3 cümle)
   - Dersin ana konusu ve öğrenme hedefleri
   - Hedef kitle ve ön gereksinimler
   - Eğitmenin uzmanlık alanı ve deneyimi

2. TEMEL KAVRAMLAR VE TANIMLAR
   - Her kavramın açık ve net tanımı
   - Kavramlar arası ilişkiler
   - Örnekler ve kullanım alanları

3. KONU ANLATIMI VE METODLAR
   - Ana başlıklar ve alt konular
   - Adım adım açıklamalar
   - Kullanılan yöntem ve teknikler
   - Görsel/işitsel öğeler ve diyagramlar (anlatıldıysa)

4. ÖRNEKLER VE UYGULAMALAR
   - Detaylı örnek çözümleri
   - Pratik uygulamalar
   - Gerçek hayat senaryoları
   - Alıştırmalar ve ödevler (varsa)

5. ÖNEMLİ NOTLAR VE İPUÇLARI
   - Sık yapılan hatalar ve çözümleri
   - Önemli formüller veya kurallar
   - Ezberlenmesi/dikkat edilmesi gereken noktalar
   - Püf noktaları ve kısa yollar

6. DEĞERLENDİRME VE ÖZET
   - Ana öğrenme çıktıları
   - Konunun diğer konularla ilişkisi
   - İleri seviye için öneriler
   - Öz-değerlendirme soruları

NOT:
- Akademik dil kullanın ancak anlaşılır olun
- Karmaşık kavramları basitten zora doğru açıklayın
- Öğrenmeyi kolaylaştırıcı ipuçları ekleyin
- Konuyu pekiştirici örnekler kullanın`;

      case 'history':
        return `Aşağıdaki tarih konulu video transkriptini {language} dilinde özetleyin:

{transcript}

Özet şu yapıda olsun:
1. Ana Konu (1-2 cümle)
2. Kronolojik Sıralama (önemli olayları tarihleriyle listeleyin)
3. Önemli Kişiler ve Rolleri
4. Tarihi Olayların Etkileri veya Sonuçları
5. Anlatıcının varsa temel argümanları veya bakış açısı`;

      case 'finance':
        return `Aşağıdaki finans konulu video transkriptini {language} dilinde detaylı bir şekilde özetleyin:

{transcript}

Lütfen özeti aşağıdaki yapıda oluşturun:

1. FİNANSAL KONU GENEL BAKIŞI (2-3 cümle)
   - Konunun önemi ve güncel bağlamı
   - Hedef yatırımcı profili
   - Piyasa koşulları ve ekonomik ortam

2. TEMEL FİNANSAL VERİLER
   - Önemli finansal göstergeler
   - Piyasa değerleri ve oranlar
   - Trend analizleri ve grafikler
   - Karşılaştırmalı performans verileri

3. RİSK ANALİZİ VE YÖNETİMİ
   - Potansiyel risk faktörleri
   - Risk yönetim stratejileri
   - Sigorta ve koruma yöntemleri
   - Yasal düzenlemeler ve uyum gereksinimleri

4. YATIRIM STRATEJİLERİ
   - Portföy çeşitlendirme önerileri
   - Zamanlama stratejileri
   - Varlık dağılımı tavsiyeleri
   - Vergi optimizasyonu

5. UZMAN GÖRÜŞLERİ
   - Piyasa uzmanlarının tahminleri
   - Analist raporları ve değerlendirmeler
   - Başarılı yatırımcıların stratejileri
   - Sektör liderlerinin görüşleri

6. SONUÇ VE AKSİYON PLANI
   - Kısa vadeli öneriler
   - Orta-uzun vadeli stratejiler
   - İzlenmesi gereken göstergeler
   - Düzenli gözden geçirme tavsiyeleri

NOT:
- Finansal verilerin güncelliğini belirtin
- Risk uyarılarını vurgulayın
- Yasal sorumluluk reddi ekleyin
- Kişisel finansal duruma göre danışman önerisi alınması gerektiğini belirtin`;

      case 'technology':
        return `Aşağıdaki teknoloji konulu video transkriptini {language} dilinde detaylı bir şekilde özetleyin:

{transcript}

Lütfen özeti aşağıdaki yapıda oluşturun:

1. TEKNOLOJİ GENEL BAKIŞI (2-3 cümle)
   - Teknolojinin adı ve amacı
   - Hangi sorunu çözüyor veya hangi ihtiyacı karşılıyor
   - Hedef kullanıcı kitlesi ve kullanım alanları

2. TEKNİK ÖZELLİKLER VE KABİLİYETLER
   - Donanım/yazılım gereksinimleri
   - Performans metrikleri ve benchmark sonuçları
   - Desteklenen platformlar ve sistemler
   - API ve entegrasyon özellikleri

3. UYGULAMA ALANLARI VE KULLANIM SENARYOLARI
   - Endüstriyel uygulamalar
   - Tüketici uygulamaları
   - Başarı hikayeleri ve vaka çalışmaları
   - Potansiyel kullanım alanları

4. AVANTAJLAR VE DEZAVANTAJLAR
   - Güçlü yönler ve sunduğu fırsatlar
   - Zayıf yönler ve sınırlamalar
   - Rakip teknolojilerle karşılaştırma
   - Maliyet-fayda analizi

5. KURULUM VE KULLANIM
   - Kurulum gereksinimleri ve adımları
   - Temel kullanım kılavuzu
   - En iyi uygulama örnekleri
   - Güvenlik önlemleri ve uyarılar

6. GELECEK PERSPEKTİFİ
   - Gelecek sürüm planları
   - Beklenen geliştirmeler
   - Sektöre muhtemel etkileri
   - Yatırım ve adaptasyon önerileri

NOT:
- Teknik detayları doğru ve güncel tutun
- Karmaşık terimleri açıklayın
- Pratik örnekler ve kullanım senaryoları ekleyin
- Güvenlik ve risk faktörlerini belirtin`;

      case 'news':
        return `Aşağıdaki haber içerikli video transkriptini {language} dilinde özetleyin:

{transcript}

Özet şu yapıda olsun:
1. Başlık (1 cümle)
2. Kim, Ne, Nerede, Ne Zaman, Neden, Nasıl sorularının cevapları
3. Önemli Açıklamalar veya Alıntılar
4. Olayın Arka Planı
5. Olası Sonuçlar veya Gelişmeler`;

      case 'science':
        return `Aşağıdaki bilim konulu video transkriptini {language} dilinde özetleyin:

{transcript}

Özet şu yapıda olsun:
1. Bilimsel Konu (1-2 cümle)
2. Araştırma veya Keşif Detayları
3. Metodoloji veya Teknikler
4. Bulgular ve Sonuçlar
5. Bilimsel Önemi ve Potansiyel Uygulamalar`;

      case 'art':
        return `Aşağıdaki sanat/kültür konulu video transkriptini {language} dilinde özetleyin:

{transcript}

Özet şu yapıda olsun:
1. Sanat Eseri/Akımı/Sanatçı (1-2 cümle)
2. Tarihsel ve Kültürel Bağlam
3. Sanatsal Özellikler ve Teknikler
4. Eser Analizi veya Yorumları
5. Kültürel veya Sanatsal Önemi`;

      case 'sport':
        return `Aşağıdaki spor konulu video transkriptini {language} dilinde özetleyin:

{transcript}

Özet şu yapıda olsun:
1. Spor Olayı/Maçı (1-2 cümle)
2. Önemli Anlar ve Skorlar
3. Sporcuların/Takımların Performansı
4. Antrenör/Teknik Direktör Kararları veya Stratejileri
5. Sonuçların Etkisi veya Önemi`;

      case 'health':
        return `Aşağıdaki sağlık konulu video transkriptini {language} dilinde özetleyin:

{transcript}

Özet şu yapıda olsun:
1. Sağlık Konusu (1-2 cümle)
2. Sağlık Durumu/Hastalık Belirtileri
3. Tedavi veya Önleme Yöntemleri
4. Uzman Önerileri
5. Dikkat Edilmesi Gereken Noktalar`;

      case 'general':
      default:
        return this.getGenericPrompt('{language}');
    }
  }

  /**
   * Generic prompt - İçerik türü belirlenemediyse veya belirlenemeyen içerikler için kullanılır
   * @param language Hedef dil
   */
  private getGenericPrompt(language: string): string {
    return `This is a video transcript. Please summarize this transcript in ${language} language.

{transcript}

Follow these guidelines for creating the summary, but DO NOT include these instructions or section titles in your output:

1. OVERVIEW (1-2 paragraphs)
   • Main topic and core message of the video
   • Speaker's key arguments
   • Target audience and purpose

2. CONTENT FLOW
   • Follow the order of topics as presented
   • Summarize each main section in 1-2 sentences
   • Highlight important transitions and connections
   • Emphasize relationships between topics
   • Show how the conclusion was reached

3. KEY POINTS
   • List the 3-5 most important main ideas in bullet points
   • Explain each point in 1-2 sentences
   • Quote important statements exactly in quotation marks

4. NUMERICAL DATA AND FACTS
   • Relay all numerical data as presented
   • Preserve dates and time information
   • Highlight statistics and comparative data

5. ACTION STEPS AND RECOMMENDATIONS
   • List the instructions and recommendations given
   • Emphasize warnings and points to note
   • Highlight practical tips and solutions

6. FORMATTING INSTRUCTIONS (IMPORTANT)
   • Format important concepts and terms as: <span class="highlight-concept">concept</span>
   • Format statistics and numerical data as: <span class="stat-highlight">statistic</span>
   • Format quotes and citations as: <span class="quote-highlight">quote</span>
   • Format warnings and cautions as: <span class="highlight-warning">warning</span>
   • Format advice and recommendations as: <span class="highlight-advice">advice</span>
   • For section headings use: <div class="section-heading"><div class="section-heading-text"><span class="section-emoji">📝</span>Heading</div></div>
   • Structure paragraphs as: <p class="content-paragraph">paragraph content</p>
   • Use appropriate emojis for section headings:
     - Introduction/Overview: 📝
     - Key Points: 🔑
     - Data/Facts: 📊
     - Conclusions: 🎯
     - Recommendations: 💡
     - Warnings: ⚠️

TERMS TO ALWAYS HIGHLIGHT (if they appear in the content):
• Important concepts: mathematics, physics, theory, discovery, philosophy, plato, newton, gravity, universe, finance, economy, politics, democracy, fascism, dictatorship, etc.
• Key indicators: attention, important, critical, fundamental, crucial, notably, etc.

SUMMARIZATION RULES:
1. Use objective and neutral language
2. Preserve technical terms as they are
3. Quote important statements exactly in quotation marks
4. Do not alter numerical data
5. Do not add your own interpretation, just summarize the content
6. Avoid ambiguous expressions, be clear
7. Write the summary according to the natural flow of the ${language} language
8. Ensure all HTML formatting is properly applied and balanced (start and end tags match)

IMPORTANT: 
- THE FINAL SUMMARY MUST BE WRITTEN COMPLETELY IN ${language.toUpperCase()} LANGUAGE
- BEGIN YOUR RESPONSE DIRECTLY WITH THE SUMMARY CONTENT WITHOUT SECTION TITLES
- ENSURE ALL HTML TAGS ARE PROPERLY CLOSED AND FORMATTED`;
  }

  /**
   * Bölünmüş metnin ilk parçası için prompt oluşturur
   * @param language Özet dili
   * @param contentType İçerik türü
   */
  async getChunkPrompt(language: string, contentType?: string, isFirstChunk: boolean = false): Promise<string> {
    return `This text is a part of a larger transcript. Please analyze this part and summarize it in ${language} language.

{transcript}

Follow these guidelines for structure, but DO NOT include these instructions or section titles in your output:

1. MAIN IDEAS OF THIS SECTION (2-3 bullet points)
   • List the main ideas and arguments as bullet points
   • Each point should be brief and concise
   • Quote important views directly as "..."

2. NUMERICAL DATA AND CONCRETE INFORMATION
   • Relay all numerical data exactly (e.g., "gold fell by 15%")
   • Preserve date and time information (e.g., "on January 15")
   • Indicate price, rate, and percentage information (e.g., "Bitcoin rose to $50,000")
   • Relay comparative data exactly (e.g., "20% increase compared to last year")
   • Provide predictions with their source (e.g., "Analyst X predicts oil will rise to $100")

3. EXPERT OPINIONS AND CRITICAL STATEMENTS
   • Quote important views exactly in quotation marks
   • Specify the name/title of the opinion holder
   • Especially emphasize warnings and risks
   • Include opposing views
   • Directly relay advice and recommendations

4. PRACTICAL INFORMATION AND CONCRETE RECOMMENDATIONS
   • Provide step-by-step instructions numerically
   • Relay specified tips exactly
   • Especially emphasize risk warnings
   • Mark points to be noted with "ATTENTION:"
   • List solution suggestions concretely

5. SPECIAL NOTES
   • Emphasize recurring important numerical data
   • Restate critical warnings
   • Mark data related to other sections
   • Summarize important time/date information

6. FORMATTING INSTRUCTIONS (IMPORTANT)
   • Format important concepts and terms as: <span class="highlight-concept">concept</span>
   • Format statistics and numerical data as: <span class="stat-highlight">statistic</span>
   • Format quotes and citations as: <span class="quote-highlight">quote</span>
   • Format warnings and cautions as: <span class="highlight-warning">warning</span>
   • Format advice and recommendations as: <span class="highlight-advice">advice</span>
   • Structure paragraphs as: <p class="content-paragraph">paragraph content</p>
   • For bullet points use: <p class="simple-bullet">bullet point content</p>

TERMS TO ALWAYS HIGHLIGHT (if they appear in the content):
• Important concepts: mathematics, physics, theory, discovery, philosophy, plato, newton, gravity, universe, finance, economy, politics, democracy, fascism, dictatorship, etc.
• Key indicators: attention, important, critical, fundamental, crucial, notably, etc.

NOTE:
- Relay numerical data and quotes EXACTLY, do not round
- Always put important views in quotation marks
- Especially emphasize risks and warnings
- Indicate predictions and forecasts with their source
- Provide each piece of data with date/time information whenever possible
- Write according to the natural flow of the ${language} language
- Ensure all HTML formatting is properly applied and balanced (start and end tags match)

IMPORTANT: 
- THE FINAL SUMMARY MUST BE WRITTEN COMPLETELY IN ${language.toUpperCase()} LANGUAGE
- BEGIN YOUR RESPONSE DIRECTLY WITH THE SUMMARY CONTENT WITHOUT SECTION TITLES
- ENSURE ALL HTML TAGS ARE PROPERLY CLOSED AND FORMATTED`;
  }

  /**
   * Birleştirilmiş özetler için final prompt oluşturur
   * @param language Özet dili
   */
  async getFinalPrompt(language: string): Promise<string> {
    return `These summaries are from different parts of the same video. Please combine these part summaries into a coherent whole in ${language} language.

{transcript}

Follow these guidelines for creating the final summary, but DO NOT include these instructions or section titles in your output:

1. INTRODUCTION (1-2 paragraphs)
   • Provide an overview of the main topic
   • Mention the key speakers or presenters
   • State the purpose and target audience of the content

2. MAIN CONTENT SUMMARY (3-5 paragraphs)
   • Follow the logical progression of ideas
   • Connect related concepts across different parts
   • Highlight significant transitions and developments
   • Maintain the original reasoning and argumentation

3. KEY TAKEAWAYS (4-6 bullet points)
   • List the most important points across all parts
   • Highlight recurring themes and emphasized ideas
   • Include essential numerical data and statistics
   • Quote particularly significant statements

4. CONCLUSION (1-2 paragraphs)
   • Summarize the main conclusions of the content
   • Note any final recommendations or calls to action
   • Mention the significance or implications of the information

5. FORMATTING INSTRUCTIONS (IMPORTANT)
   • Format important concepts and terms as: <span class="highlight-concept">concept</span>
   • Format statistics and numerical data as: <span class="stat-highlight">statistic</span>
   • Format quotes and citations as: <span class="quote-highlight">quote</span>
   • Format warnings and cautions as: <span class="highlight-warning">warning</span>
   • Format advice and recommendations as: <span class="highlight-advice">advice</span>
   • For section headings use: <div class="section-heading"><div class="section-heading-text"><span class="section-emoji">📝</span>Heading</div></div>
   • Structure paragraphs as: <p class="content-paragraph">paragraph content</p>
   • For bullet points use: <p class="simple-bullet">bullet point content</p>
   • Use appropriate emojis for section headings:
     - Introduction/Overview: 📝
     - Key Points: 🔑
     - Data/Facts: 📊
     - Conclusions: 🎯
     - Recommendations: 💡
     - Warnings: ⚠️

TERMS TO ALWAYS HIGHLIGHT (if they appear in the content):
• Important concepts: mathematics, physics, theory, discovery, philosophy, plato, newton, gravity, universe, finance, economy, politics, democracy, fascism, dictatorship, etc.
• Key indicators: attention, important, critical, fundamental, crucial, notably, etc.

GUIDELINES:
• Ensure a smooth, natural flow between sections
• Eliminate redundancies while preserving all important information
• Maintain an objective, neutral tone
• Keep all factual information, statistics, and quotes accurate
• Ensure the summary stands on its own as a complete overview of the content
• Ensure all HTML formatting is properly applied and balanced (start and end tags match)

IMPORTANT: 
- THE FINAL SUMMARY MUST BE WRITTEN COMPLETELY IN ${language.toUpperCase()} LANGUAGE
- BEGIN YOUR RESPONSE DIRECTLY WITH THE SUMMARY CONTENT WITHOUT SECTION TITLES
- ENSURE ALL HTML TAGS ARE PROPERLY CLOSED AND FORMATTED`;
  }
}

export default PromptManager; 