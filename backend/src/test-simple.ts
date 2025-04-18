import { YoutubeTranscript } from 'youtube-transcript';
import translationService from './services/translationService';
import logger from './utils/logger';

/**
 * Basit test: YouTube'dan transkript alıp çevirme
 */

// Video ID to test
const videoId = 'hnaF-o9z6yE';
const targetLanguage = 'en'; // İstenen dil
const sourceLanguage = 'tr'; // Bilinen kaynak dil

async function runTest() {
  console.log('========================================================');
  console.log(`BASİT ÇEVİRİ TESTİ`);
  console.log(`Video ID: ${videoId}`);
  console.log(`Kaynak Dil: ${sourceLanguage} -> Hedef Dil: ${targetLanguage}`);
  console.log('========================================================');
  
  try {
    // 1. YouTube'dan transkript al
    console.log(`\n1. YouTube'dan ${sourceLanguage} dilinde transkript alınıyor...`);
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: sourceLanguage });
    
    console.log(`Transkript alındı! ${transcript.length} segment bulundu.`);
    console.log('İlk 3 segment:');
    console.log(transcript.slice(0, 3));
    
    // 2. Transkripti formatlı metne dönüştür
    console.log(`\n2. Transkript formatlı metne dönüştürülüyor...`);
    const formattedText = transcript
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ');
    
    console.log(`Formatlı metin oluşturuldu (${formattedText.length} karakter)`);
    console.log('İlk 200 karakter:');
    console.log(formattedText.substring(0, 200) + '...');
    
    // 3. Çeviri yap
    console.log(`\n3. Transkript çevirisi yapılıyor (${sourceLanguage} -> ${targetLanguage})...`);
    const translatedText = await translationService.translateTranscript(
      formattedText,
      sourceLanguage,
      targetLanguage
    );
    
    console.log(`Çeviri başarılı! (${translatedText.length} karakter)`);
    console.log('\nÇevrilen metnin ilk 500 karakteri:');
    console.log('----------------------------------------');
    console.log(translatedText.substring(0, 500));
    console.log('----------------------------------------');
    
    console.log('\nTEST BAŞARIYLA TAMAMLANDI!');
    
  } catch (error) {
    console.error('Test başarısız oldu:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Hata stack:', error.stack);
    }
  }
}

// Run the test
runTest(); 