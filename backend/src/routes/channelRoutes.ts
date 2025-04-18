import express from 'express';
import { getChannels, getChannelById, addChannel, deleteChannel, refreshChannelVideos, updateChannelLanguage } from '../controllers/channelController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get all channels
router.get('/', getChannels);

// Get a channel by ID
router.get('/:channelId', getChannelById);

// Add a new channel
router.post('/', addChannel);

// Update channel language preference
router.put('/:channelId/language', updateChannelLanguage);

// Delete a channel
router.delete('/:channelId', deleteChannel);

// Refresh channel videos
router.post('/:channelId/refresh', refreshChannelVideos);

export default router; 