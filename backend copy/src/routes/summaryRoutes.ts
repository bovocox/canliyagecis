import express from 'express';
import SummaryController from '../controllers/summaryController';
import authMiddleware from '../middleware/authMiddleware';
import { Request, Response } from 'express';

const router = express.Router();
const summaryController = new SummaryController();

/**
 * @route GET /api/summaries/public
 * @desc Get a list of public summaries
 * @access Public
 */
router.get('/public', async (req, res) => {
  await summaryController.getPublicSummaries(req, res);
});

/**
 * @route POST /api/summaries/create
 * @desc Create a summary for a video
 * @access Public/Private (depending on implementation)
 */
router.post('/create', async (req, res) => {
  await summaryController.createSummary(req, res);
});

/**
 * @route POST /api/summaries/from-video
 * @desc Create a summary for a video (alternate endpoint)
 * @access Public/Private (depending on implementation)
 */
router.post('/from-video', async (req, res) => {
  await summaryController.createSummary(req, res);
});

/**
 * @route POST /api/summaries/status/:videoId
 * @desc Check the status of a summary
 * @access Public/Private (depending on implementation)
 */
router.post('/status/:videoId', async (req, res) => {
  await summaryController.getSummaryStatus(req, res);
});

/**
 * @route GET /api/summaries/status/:videoId
 * @desc Check the status of a summary (GET method)
 * @access Public/Private (depending on implementation)
 */
router.get('/status/:videoId', async (req, res) => {
  await summaryController.getSummaryStatus(req, res);
});

/**
 * @route GET /api/summaries/recent
 * @desc Get recent summaries (last 4)
 * @access Private
 */
router.get('/recent', async (req, res) => {
  await summaryController.getRecentSummaries(req, res);
});

/**
 * @route GET /api/summaries/:videoId
 * @desc Get a summary for a video
 * @access Public/Private (depending on implementation)
 */
router.get('/:videoId', async (req, res) => {
  await summaryController.getSummary(req, res);
});

/**
 * @route GET /api/summaries
 * @desc Get user's summaries
 * @access Private
 */
router.get('/', authMiddleware, async (req, res) => {
  await summaryController.getUserSummaries(req, res);
});

/**
 * @route GET /api/summaries/health/check
 * @desc Check health of Gemini API keys (admin only)
 * @access Admin
 */
router.get('/health/check', async (req, res) => {
  // This route would be protected by admin middleware
  // Admin middleware would be implemented separately
  res.status(200).json({ message: 'Health check endpoint would be implemented here' });
});

/**
 * @route PUT /api/summaries/:id/read
 * @desc Update summary read status
 * @access Private
 */
router.put('/:id/read', authMiddleware, (req: Request, res: Response) => summaryController.updateSummaryReadStatus(req, res));

/**
 * @route PUT /api/summaries/:id/feedback
 * @desc Add summary feedback
 * @access Private
 */
router.put('/:id/feedback', authMiddleware, (req: Request, res: Response) => summaryController.addSummaryFeedback(req, res));

/**
 * @route GET /api/summaries/:id/feedback
 * @desc Get summary feedback
 * @access Private
 */
router.get('/:id/feedback', authMiddleware, (req: Request, res: Response) => summaryController.getSummaryFeedback(req, res));

export default router; 