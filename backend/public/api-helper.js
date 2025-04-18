/**
 * Veciz AI API yardımcı fonksiyonları
 * Bu dosya, frontend ile API arasındaki iletişimi sağlayan fonksiyonları içerir.
 */

// API endpoint'leri
const API_ENDPOINTS = {
  QUEUE_STATS: '/api/test/queue-stats',
  QUEUE_JOBS: '/api/test/queue-jobs',
  ADD_JOB: '/api/test/add-job',
  // Diğer API endpoint'leri buraya eklenebilir
};

/**
 * API isteği yapar
 * @param {string} url - API endpoint URL'si
 * @param {object} options - fetch API için opsiyonlar
 * @returns {Promise<object>} - API yanıtı
 */
async function apiRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`API hatası: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`API isteği başarısız: ${error.message}`);
    throw error;
  }
}

/**
 * Kuyruk istatistiklerini getirir
 * @returns {Promise<object>} - Kuyruk istatistikleri
 */
async function getQueueStats() {
  return apiRequest(API_ENDPOINTS.QUEUE_STATS);
}

/**
 * Kuyruk işlerini getirir
 * @param {string} type - İş tipi ('transcript' veya 'summary')
 * @returns {Promise<object>} - Kuyruk işleri
 */
async function getQueueJobs(type = 'transcript') {
  return apiRequest(`${API_ENDPOINTS.QUEUE_JOBS}?type=${type}`);
}

/**
 * Kuyruğa yeni bir iş ekler
 * @param {string} type - İş tipi ('transcript' veya 'summary')
 * @param {string} videoId - YouTube video ID'si
 * @returns {Promise<object>} - Eklenen iş bilgisi
 */
async function addJob(type, videoId) {
  return apiRequest(`${API_ENDPOINTS.ADD_JOB}?type=${type}&videoId=${videoId}`);
}

/**
 * İş durumunu kontrol eder (polling)
 * @param {string} type - İş tipi ('transcript' veya 'summary')
 * @param {string} jobId - İş ID'si
 * @param {Function} onUpdate - İş güncellendiğinde çağrılacak fonksiyon
 * @param {number} interval - Kontrol aralığı (ms)
 * @param {number} timeout - Maksimum bekleme süresi (ms)
 * @returns {Promise<object>} - İşin son durumu
 */
async function pollJobStatus(type, jobId, onUpdate, interval = 2000, timeout = 300000) {
  const startTime = Date.now();
  let lastStatus = null;
  
  return new Promise((resolve, reject) => {
    const checkStatus = async () => {
      try {
        // Tüm kuyruk işlerini al
        const jobsData = await getQueueJobs(type);
        
        // İlgili işi bul
        let currentJob = null;
        let currentStatus = 'unknown';
        
        // Bekleyen, aktif, tamamlanan ve başarısız işlerde ara
        ['waiting', 'active', 'completed', 'failed'].forEach(status => {
          const jobs = jobsData.queueDetails[status].jobs;
          const foundJob = jobs.find(job => job.id === jobId);
          
          if (foundJob) {
            currentJob = foundJob;
            currentStatus = status;
          }
        });
        
        // İş durumu değiştiyse callback'i çağır
        if (currentStatus !== lastStatus) {
          lastStatus = currentStatus;
          onUpdate(currentStatus, currentJob);
        }
        
        // İş tamamlandı veya başarısız oldu ise sonlandır
        if (currentStatus === 'completed' || currentStatus === 'failed') {
          return resolve({ status: currentStatus, job: currentJob });
        }
        
        // Timeout kontrolü
        if (Date.now() - startTime > timeout) {
          return reject(new Error('İş durumu kontrol zaman aşımı'));
        }
        
        // Bir sonraki kontrolü planla
        setTimeout(checkStatus, interval);
      } catch (error) {
        console.error('İş durumu kontrol hatası:', error);
        // Hata durumunda da devam et (bağlantı hataları olabilir)
        setTimeout(checkStatus, interval);
      }
    };
    
    // İlk kontrolü başlat
    checkStatus();
  });
}

// Dışa aktarılan fonksiyonlar
export {
  getQueueStats,
  getQueueJobs,
  addJob,
  pollJobStatus
}; 