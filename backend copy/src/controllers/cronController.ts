import { Request, Response } from 'express';
import { CronRepository } from '../repositories/cronRepository';
import logger from '../utils/logger';
import { CronService } from '../services/cron.service';

const cronRepository = new CronRepository();
const cronService = new CronService();

export const getVideosWithoutSummary = async (req: Request, res: Response) => {
  try {
    logger.info('CronController.getVideosWithoutSummary - İstek alındı');
    
    const videos = await cronRepository.getVideosWithoutSummary();
    
    res.json({
      success: true,
      data: videos
    });
  } catch (error) {
    logger.error('CronController.getVideosWithoutSummary - Hata:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
};

export const testLogCleanup = async (req: Request, res: Response) => {
  try {
    // @ts-ignore - private method'a erişim için
    await cronService.cleanupLogs();
    res.json({ success: true, message: 'Log cleanup test completed successfully' });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Log cleanup test failed', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}; 