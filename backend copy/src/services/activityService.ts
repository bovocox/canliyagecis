import logger from '../utils/logger';
import DatabaseService from './databaseService';

class ActivityService {
  private databaseService: DatabaseService;

  constructor() {
    this.databaseService = new DatabaseService();
  }

  async getUserActivity(userId: string): Promise<any[]> {
    try {
      logger.info('Kullanıcı aktiviteleri getiriliyor', {
        userId,
        function: 'ActivityService.getUserActivity'
      });

      const activities = await this.databaseService.getUserActivities(userId);

      logger.debug('Kullanıcı aktiviteleri başarıyla getirildi', {
        userId,
        activityCount: activities.length,
        function: 'ActivityService.getUserActivity'
      });

      return activities;
    } catch (error) {
      logger.error('Kullanıcı aktiviteleri getirilirken hata oluştu', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        function: 'ActivityService.getUserActivity'
      });
      return [];
    }
  }
}

export default ActivityService; 