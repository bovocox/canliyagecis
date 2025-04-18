import translationService from './services/translationService';
import logger from './utils/logger';

// Test metni - Basit ve açık bir metin kullanalım
const sourceText = `Hello my name is Luke.`;

// Test fonksiyonu
async function testTranslation() {
  try {
    console.log('-------------------------------------------------------------');
    console.log('TRANSLATION TEST STARTING');
    console.log('-------------------------------------------------------------');
    console.log('\nSource text (English):');
    console.log('-'.repeat(50));
    console.log(sourceText);
    console.log('-'.repeat(50));
    
    // İngilizce'den Türkçe'ye çeviri yapıyoruz
    console.log('\nTRANSLATING FROM ENGLISH TO TURKISH...');
    const turkishTranslation = await translationService.translateText(
      sourceText,
      'en',
      'tr'
    );
    
    console.log('\nTURKISH TRANSLATION RESULT:');
    console.log('-'.repeat(50));
    console.log(turkishTranslation);
    console.log('-'.repeat(50));
    
    // Çeviri başarılı mı diye kontrol et - bazı Türkçe kelimeler içeriyor mu?
    const turkishWords = ['merhaba', 'adım', 'ben', 'ismim'];
    let foundTurkishWords = 0;
    
    turkishWords.forEach(word => {
      if (turkishTranslation.toLowerCase().includes(word.toLowerCase())) {
        console.log(`Türkçe kelime bulundu: "${word}"`);
        foundTurkishWords++;
      }
    });
    
    console.log(`\nTürkçe kelime kontrolü: ${foundTurkishWords}/${turkishWords.length} kelime bulundu`);
    console.log(`Çeviri ${foundTurkishWords > 2 ? 'başarılı gibi görünüyor' : 'başarısız olmuş olabilir'}`);
    
    // Eğer ilk çeviri başarılıysa, ters çeviri yap
    if (foundTurkishWords > 2) {
      console.log('\nTRANSLATING BACK FROM TURKISH TO ENGLISH...');
      const backToEnglish = await translationService.translateText(
        turkishTranslation,
        'tr',
        'en'
      );
      
      console.log('\nBACK TO ENGLISH RESULT:');
      console.log('-'.repeat(50));
      console.log(backToEnglish);
      console.log('-'.repeat(50));
    }
    
    console.log('\nTRANSLATION TEST COMPLETED!');
    console.log('-------------------------------------------------------------');
  } catch (error) {
    console.error('Translation test failed:', error);
  }
}

// Testi çalıştır
testTranslation(); 