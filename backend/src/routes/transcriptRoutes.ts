import { Router } from 'express';
import {
  getTranscriptForVideo,
  getTranscriptStatus,
  updateTranscript,
  deleteTranscript,
  createTranscriptFromVideo,
  testSubtitleLanguages
} from '../controllers/transcriptController';

const router = Router();

// Test available subtitle languages
router.get('/test-languages/:videoId', testSubtitleLanguages);

// Get transcript for video - Alternate URL format
router.get('/:videoId', getTranscriptForVideo);

// Get transcript for video
router.get('/video/:videoId', getTranscriptForVideo);

// Create transcript from video URL
router.post('/from-video', createTranscriptFromVideo);

// Get transcript status
router.get('/status/:videoId', getTranscriptStatus);

// Update transcript
router.put('/video/:videoId', updateTranscript);

// Delete transcript
router.delete('/video/:videoId', deleteTranscript);

export default router;