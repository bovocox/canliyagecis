import { YoutubeTranscript } from 'youtube-transcript';
import translationService from './services/translationService';
import logger from './utils/logger';
import { supabase } from './config/supabase';
import { redis } from './config/redis';
import { v4 as uuidv4 } from 'uuid';

/**
 * Test script to fetch and translate transcripts
 */

// Video ID to test
const videoId = 'hnaF-o9z6yE';
const targetLanguage = 'en'; // İstenen dil
const alternativeLanguages = ['tr', 'en'].filter(lang => lang !== targetLanguage);

/**
 * Get transcript from YouTube
 */
async function getYoutubeTranscript(videoId: string, language: string): Promise<any[]> {
  try {
    console.log(`Fetching transcript for ${videoId} in ${language}...`);
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: language });
    console.log(`Successfully got transcript in ${language}!`);
    console.log(`Transcript length: ${transcript.length} segments`);
    console.log('First 3 segments:', transcript.slice(0, 3));
    return transcript;
  } catch (error: any) {
    console.error(`Error fetching transcript in ${language}:`, error.message);
    throw error;
  }
}

/**
 * Format transcript into readable text
 */
function formatTranscript(transcript: any[]): string {
  return transcript
    .map(item => item.text)
    .join(' ')
    .replace(/\s+/g, ' ');
}

/**
 * Save transcript to database
 */
async function saveTranscriptToDB(transcriptId: string, videoId: string, language: string, transcript: any[], source: string) {
  try {
    console.log(`Saving ${language} transcript to database with ID ${transcriptId}...`);
    
    const formattedText = formatTranscript(transcript);
    const segments = transcript.map(item => ({
      text: item.text,
      start: item.offset,
      duration: item.duration
    }));
    
    const { error } = await supabase
      .from('transcripts')
      .insert({
        id: transcriptId,
        video_id: videoId,
        language: language,
        status: 'completed',
        source: source,
        formatted_text: formattedText,
        text: formattedText,
        segments: segments,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
    if (error) {
      throw error;
    }
    
    console.log(`Successfully saved ${language} transcript to database!`);
    return formattedText;
  } catch (error: any) {
    console.error(`Error saving transcript to database:`, error.message);
    throw error;
  }
}

/**
 * Main test function
 */
async function testTranscriptTranslation() {
  console.log('========================================================');
  console.log(`TRANSCRIPT TRANSLATION TEST for video: ${videoId}`);
  console.log(`Target language: ${targetLanguage}`);
  console.log('========================================================');
  
  try {
    // Step 1: Try to get transcript in target language directly
    console.log(`\n1. Attempting to get transcript in ${targetLanguage} directly...`);
    let transcript;
    let sourceLanguage = targetLanguage;
    let needsTranslation = false;
    
    try {
      transcript = await getYoutubeTranscript(videoId, targetLanguage);
      console.log(`Great! Found transcript in ${targetLanguage} directly.`);
    } catch (error) {
      console.log(`Could not find transcript in ${targetLanguage}, will try alternative languages.`);
      
      // Step 2: Try alternative languages
      console.log(`\n2. Trying alternative languages: ${alternativeLanguages.join(', ')}...`);
      
      for (const altLang of alternativeLanguages) {
        try {
          console.log(`Trying to get transcript in ${altLang}...`);
          transcript = await getYoutubeTranscript(videoId, altLang);
          sourceLanguage = altLang;
          needsTranslation = true;
          console.log(`Found transcript in ${altLang}!`);
          break;
        } catch (altError) {
          console.log(`Could not find transcript in ${altLang}, trying next language...`);
        }
      }
    }
    
    if (!transcript) {
      throw new Error('Could not find transcript in any language.');
    }
    
    // Step 3: Save original transcript
    console.log(`\n3. Saving transcript in ${sourceLanguage}...`);
    const originalTranscriptId = uuidv4();
    const originalText = await saveTranscriptToDB(originalTranscriptId, videoId, sourceLanguage, transcript, 'youtube');
    
    // Step 4: Translate if needed
    if (needsTranslation) {
      console.log(`\n4. Translating transcript from ${sourceLanguage} to ${targetLanguage}...`);
      try {
        console.log('Original text sample:');
        console.log(originalText.substring(0, 200) + '...');
        
        const translatedText = await translationService.translateTranscript(
          originalText,
          sourceLanguage,
          targetLanguage
        );
        
        console.log(`Translation successful!`);
        console.log('Translated text sample:');
        console.log(translatedText.substring(0, 200) + '...');
        
        // Step 5: Save translated transcript
        console.log(`\n5. Saving translated transcript in ${targetLanguage}...`);
        const translatedTranscriptId = uuidv4();
        await supabase
          .from('transcripts')
          .insert({
            id: translatedTranscriptId,
            video_id: videoId,
            language: targetLanguage,
            status: 'completed',
            source: sourceLanguage,
            formatted_text: translatedText,
            text: translatedText,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          
        console.log(`Successfully saved translated transcript to database!`);
        
      } catch (translationError: any) {
        console.error('Translation error:', translationError.message);
      }
    } else {
      console.log(`\n4. No translation needed as transcript is already in ${targetLanguage}.`);
    }
    
    console.log('\nTEST COMPLETED SUCCESSFULLY!');
    
  } catch (error: any) {
    console.error('Test failed:', error.message);
  } finally {
    // Cleanup
    await redis.quit();
    await supabase.auth.signOut();
    
    console.log('\nCleanup completed. Test finished.');
  }
}

// Run the test
testTranscriptTranslation(); 