import translationService from './services/translationService';

/**
 * Basit mini çeviri testi - Sadece kısa bir cümle
 */

const testText = "Merhaba dünya, bu bir test cümlesidir.";
const sourceLanguage = "tr";
const targetLanguage = "en";

async function runMiniTest() {
  console.log('===========================================');
  console.log('MİNİ ÇEVİRİ TESTİ');
  console.log('===========================================');
  console.log(`Orijinal metin (${sourceLanguage}): "${testText}"`);
  
  try {
    console.log(`\nÇeviri yapılıyor: ${sourceLanguage} -> ${targetLanguage}...`);
    
    const translatedText = await translationService.translateText(
      testText,
      sourceLanguage,
      targetLanguage
    );
    
    console.log(`\nÇeviri sonucu (${targetLanguage}):`);
    console.log(`"${translatedText}"`);
    
    // Çeviri başarılı mı kontrolü (basit)
    const englishWords = ['hello', 'world', 'this', 'test', 'sentence'];
    let foundCount = 0;
    
    englishWords.forEach(word => {
      if (translatedText.toLowerCase().includes(word.toLowerCase())) {
        console.log(`İngilizce kelime bulundu: "${word}"`);
        foundCount++;
      }
    });
    
    if (foundCount >= 3) {
      console.log(`\nSonuç: Çeviri başarıyla yapıldı (${foundCount}/${englishWords.length} İngilizce kelime bulundu)`);
    } else {
      console.log(`\nSonuç: Çeviri yapılmamış olabilir (${foundCount}/${englishWords.length} İngilizce kelime bulundu)`);
    }
    
  } catch (error) {
    console.error('Çeviri hatası:', error instanceof Error ? error.message : String(error));
  }
}

// Testi çalıştır
runMiniTest(); 