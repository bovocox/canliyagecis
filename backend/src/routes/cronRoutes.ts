import express from 'express';
import { getVideosWithoutSummary, testLogCleanup } from '../controllers/cronController';

const router = express.Router();

// Admin routes - TODO: Add auth middleware later
router.get('/videos-without-summary', getVideosWithoutSummary);

// Test routes - sadece development ortamında erişilebilir
if (process.env.NODE_ENV !== 'production') {
  router.post('/test-log-cleanup', testLogCleanup);
}

export default router; 