import express from 'express';
import testController from '../controllers/testController';

const router = express.Router();

// Basic ping test
router.get('/ping', testController.ping);

// Redis notification tests
router.get('/test-redis/:message', testController.testRedisMessage);
router.get('/test-redis-video/:videoId', testController.testRedisVideoMessage);

// Transcript and summary update tests
router.get('/test-transcript/:videoId/:status', testController.testTranscriptUpdate);
router.get('/test-summary/:videoId/:status', testController.testSummaryUpdate);

// Test with query parameters
router.get('/test-transcript', testController.testTranscript);
router.get('/test-summary', testController.testSummary);

// BullMQ routes
router.get('/queue-stats', testController.getBullQueueStats);
router.get('/queue-jobs', testController.getQueuedJobs);
router.get('/add-job', testController.addTestJobToBullQueue);

export default router; 