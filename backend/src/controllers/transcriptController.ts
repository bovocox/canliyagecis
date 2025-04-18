import { Request, Response } from 'express';
import logger from '../utils/logger';
import transcriptService from '../services/transcriptService';

/**
 * Helper function to handle API errors
 */
function handleApiError(res: Response, error: any, message: string) {
  logger.error(message, { 
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
  res.status(500).json({ error: message });
}

/**
 * getTranscriptForVideo - Video ID ve dil için transcript döndürür veya yeni task oluşturur
 */
export async function getTranscriptForVideo(req: Request, res: Response) {
  try {
    const { videoId } = req.params;
    const language = String(req.query.language || 'tr');
    const forceRestart = req.query.forceRestart === 'true';

    logger.info('Transkript isteği başlatıldı', { 
      videoId, 
      language,
      function: 'TranscriptController.getTranscriptForVideo'
    });

    if (!videoId || !language) {
      logger.warn('Eksik parametreler', { 
        videoId, 
        language,
        function: 'TranscriptController.getTranscriptForVideo'
      });
      return res.status(400).json({ message: 'Video ID and language are required' });
    }

    const result = await transcriptService.getOrCreateTranscript(videoId, language, forceRestart);
    return res.status(result.status === 'pending' ? 202 : 200).json(result);

  } catch (error) {
    return handleApiError(res, error, 'Error getting transcript');
  }
}

/**
 * getTranscriptStatus - Transcript'in detaylı durumunu kontrol eder
 */
export const getTranscriptStatus = async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;
    const language = String(req.query.language || 'tr');

    if (!videoId || !language) {
      return res.status(400).json({ message: 'Video ID and language are required' });
    }

    // Önce durumu kontrol et
    const status = await transcriptService.getTranscriptStatus(videoId, language);

    // Eğer transkript bulunamadıysa, yeni bir transkript oluştur
    if (status.status === 'not_found') {
      logger.info('Transkript bulunamadı, yeni transkript oluşturuluyor', {
        videoId,
        language,
        function: 'TranscriptController.getTranscriptStatus'
      });
      
      const result = await transcriptService.getOrCreateTranscript(videoId, language, false);
      return res.status(202).json(result);
    }

    return res.json(status);

  } catch (error) {
    return handleApiError(res, error, 'Error checking transcript status');
  }
};

/**
 * updateTranscript - Mevcut bir transcript'i günceller
 */
export const updateTranscript = async (req: Request, res: Response) => {
  try {
    const transcriptData = req.body;
    const { videoId } = req.params;
    const language = String(req.query.language || 'tr');

    logger.info('Transkript güncelleme başlatıldı', {
      videoId,
      language,
      function: 'TranscriptController.updateTranscript'
    });

    const updatedTranscript = await transcriptService.updateTranscript(videoId, language, transcriptData);
    res.json(updatedTranscript);
  } catch (error) {
    return handleApiError(res, error, 'Error updating transcript');
  }
};

/**
 * deleteTranscript - Transcript'i siler
 */
export const deleteTranscript = async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;
    const language = String(req.query.language || 'tr');

    logger.info('Transkript silme başlatıldı', {
      videoId,
      language,
      function: 'TranscriptController.deleteTranscript'
    });

    await transcriptService.deleteTranscript(videoId, language);
    res.json({ message: 'Transcript deleted successfully' });
  } catch (error) {
    return handleApiError(res, error, 'Error deleting transcript');
  }
};

/**
 * createTranscriptFromVideo - Video URL'sinden transcript oluşturur
 */
export const createTranscriptFromVideo = async (req: Request, res: Response) => {
  try {
    const { videoId, language, useWhisper = false } = req.body;

    logger.info('Transkript oluşturma isteği alındı', {
      videoId,
      language,
      useWhisper,
      function: 'TranscriptController.createTranscriptFromVideo'
    });

    if (!videoId || !language) {
      logger.warn('Eksik parametreler', {
        videoId,
        language,
        function: 'TranscriptController.createTranscriptFromVideo'
      });
      return res.status(400).json({ message: 'Video ID and language are required' });
    }

    logger.info('Transkript oluşturma işlemi başlatıldı', {
      videoId,
      language,
      useWhisper,
      function: 'TranscriptController.createTranscriptFromVideo'
    });

    // İlk önce istenen dilde getOrCreateTranscript'i deneyelim
    const result = await transcriptService.getOrCreateTranscript(videoId, language, false);

    logger.info('Transkript oluşturma işlemi tamamlandı', {
      videoId,
      language,
      result,
      function: 'TranscriptController.createTranscriptFromVideo'
    });

    return res.status(result.status === 'pending' ? 202 : 200).json(result);

  } catch (error) {
    logger.error('Transkript oluşturma hatası', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      function: 'TranscriptController.createTranscriptFromVideo'
    });
    return handleApiError(res, error, 'Error creating transcript from video');
  }
};

/**
 * testSubtitleLanguages - Video için mevcut altyazı dillerini test eder
 */
export const testSubtitleLanguages = async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;
    
    if (!videoId) {
      logger.warn('Video ID eksik', {
        videoId: req.params.videoId,
        function: 'TranscriptController.testSubtitleLanguages'
      });
      return res.status(400).json({ message: 'Video ID is required' });
    }

    const results = await transcriptService.testSubtitleLanguages(videoId);
    
    if (results.allAvailableLanguages.length > 0) {
      return res.json(results);
    }

    return res.status(404).json({ 
      message: 'No transcripts found for common languages',
      videoId,
      triedLanguages: results.allAvailableLanguages
    });
    
  } catch (error) {
    return handleApiError(res, error, 'Error checking subtitle languages');
  }
};