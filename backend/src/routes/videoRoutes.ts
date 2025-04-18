import express from 'express';
import {
  createVideo,
  getVideo,
  getAllVideos,
  updateVideo,
  deleteVideo,
  getVideoFromUrl
} from '../controllers/videoController';

const router = express.Router();

// Process video from URL
router.post('/from-url', getVideoFromUrl);

// Create a new video
router.post('/', createVideo);

// Get all videos
router.get('/', getAllVideos);

// Get a specific video
router.get('/:videoId', getVideo);

// Update a video
router.put('/:videoId', updateVideo);

// Delete a video
router.delete('/:videoId', deleteVideo);

export default router; 