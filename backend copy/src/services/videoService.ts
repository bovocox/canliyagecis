import logger from '../utils/logger';
import DatabaseService from './databaseService';

class VideoService {
  private databaseService: DatabaseService;

  constructor() {
    this.databaseService = new DatabaseService();
  }

  async getPopularVideos(): Promise<any[]> {
    try {
      logger.info('Popüler videolar getiriliyor', {
        function: 'VideoService.getPopularVideos'
      });

      const videos = await this.databaseService.getPopularVideos();

      logger.debug('Popüler videolar başarıyla getirildi', {
        videoCount: videos.length,
        function: 'VideoService.getPopularVideos'
      });

      return videos;
    } catch (error) {
      logger.error('Popüler videolar getirilirken hata oluştu', {
        error: error instanceof Error ? error.message : 'Unknown error',
        function: 'VideoService.getPopularVideos'
      });
      return [];
    }
  }
}

export default VideoService; 