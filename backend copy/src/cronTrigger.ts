import { CronService } from './services/cron.service';
import { logCron } from './utils/logger';

const runCronJobs = async () => {
  logCron('scheduler', 'info', '🔄 Manual cron job execution started via Heroku Scheduler');
  
  try {
    // CronService instance oluştur
    const cronService = new CronService();
    
    // İşlemleri sırayla çalıştır
    logCron('scheduler', 'info', 'Running processVideosWithoutSummary');
    await cronService.processVideosWithoutSummary();
    
    logCron('scheduler', 'info', 'Running updateUserSummaryRelations');
    await cronService.updateUserSummaryRelations();
    
    logCron('scheduler', 'info', 'Running createUserSummaryRelations');
    await cronService.createUserSummaryRelations();
    
    logCron('scheduler', 'info', '✅ All cron jobs completed successfully');
    process.exit(0);
  } catch (error) {
    logCron('scheduler', 'error', '❌ Error running cron jobs', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    process.exit(1);
  }
};

// Çalıştır
runCronJobs(); 