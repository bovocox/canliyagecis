cd backend && npm run test:redis once bunu caliştir bi bak redis ok mi
sonra backedni caliştirabilirsin.


tüm bu bilgilere göre artık analizimi yapabilirim.
Bir HomeView'da URL girdiğinizde çağrılan ilk fonksiyon handleSearch fonksiyonu oluyor. İşte süreç şu şekilde ilerliyor:
Kullanıcı URL'yi input kısmına giriyor ve arama butonuna tıklıyor veya "Enter" tuşuna basıyor.
handleSearch fonksiyonu çağrılıyor:
}
3. Bu fonksiyon içinde videoProcessingService.handleSearch(searchQuery.value) çağrılıyor. Bu çağrı, verilen URL'den YouTube video ID'sini çıkarmak için kullanılıyor.
4. videoProcessingService.handleSearch metodu şu işlemleri yapıyor:
URL'den video ID'yi çıkarmak için getVideoId yardımcı fonksiyonunu çağırıyor
Video ID'yi doğrulayıp, video verilerini hazırlıyor
Loading durumunu aktifleştiriyor
Video ID'yi geri döndürüyor
Video ID başarıyla çıkarıldıktan sonra, videoStore.setVideoData ve videoStore.setVideoId ile veriler saklama alanına kaydediliyor.
Daha sonra pendingVideoUrl.value = searchQuery.value ile URL bir değişkene kaydediliyor.
Son olarak showLanguageModal.value = true ile dil seçim modalı gösteriliyor.
Kullanıcı modalda dil seçtikten sonra, processVideoWithLanguage fonksiyonu çağrılıyor:
;
9. videoProcessingService.handleVideoProcess metodu, backend API'ye istek atarak video transkriptini ve özetini oluşturmaya başlıyor.
Backend tarafında, transcriptController.createTranscriptFromVideo endpoint'i çağrılıyor ve transcriptService.getOrCreateTranscript metodu kullanılarak video transkripti oluşturuluyor.
Özetlersek, bir URL girdikten sonra çağrılan fonksiyon zinciri şu şekildedir:
handleSearch
2. videoProcessingService.handleSearch
getVideoId (URL'den video ID çıkarma)
videoStore.setVideoData ve videoStore.setVideoId (verileri saklama)
showLanguageModal (dil seçim modalını gösterme)
processVideoWithLanguage (dil seçildikten sonra)
videoProcessingService.handleVideoProcess (backend API çağrısı)
Backend: transcriptController.createTranscriptFromVideo
Backend: transcriptService.getOrCreateTranscript
Bu süreçte, URL girildikten sonra ilk çağrılan asıl fonksiyon handleSearch fonksiyonudur.

API Çağrısı Yapılıyor: Frontend'den backend'e transcriptController.createTranscriptFromVideo endpointi çağrılıyor
3. Queue'ya İş Ekleniyor: Backend'de transcriptService.getOrCreateTranscript metodu çağrılıyor
BullMQ, backend'de şu noktada devreye giriyor:
// transcriptController içinde
export const createTranscriptFromVideo = async (req: Request, res: Response) => {
  try {
    const { videoId, language, useWhisper = false } = req.body;
    // ...
    const result = await transcriptService.getOrCreateTranscript(videoId, language, false);
    // ...
  } catch (error) {
    // ...
  }
};
transcriptService.getOrCreateTranscript metodu içinde, eğer transkript mevcut değilse, kuyruğa iş ekleniyor:

// transcriptService içinde bir yerde (tam kodu göremiyoruz ama şuna benzer bir kod olmalı)
async getOrCreateTranscript(videoId: string, language: string, forceRestart: boolean) {
  // Eğer transcript yoksa veya forceRestart true ise
  
  // BullMQ kuyruğuna iş ekleniyor
  const taskId = await queueService.addToQueue({
    type: 'transcript',
    data: {
      videoId: videoId,
      language: language,
      useWhisper: false,
      isPublic: false
    }
  });
  
  // İşin ID'si ile bir "pending" durum döndürülüyor
  return {
    status: 'pending',
    task_id: taskId
  };
}
İşin içeriği:
1. queueService.addToQueue: Bu fonksiyon BullMQ kuyruğuna bir iş ekliyor.
2. transcript.worker.ts: Bu worker, BullMQ kuyruğunu dinliyor ve içindeki işleri işliyor.
Sistemin ana mantığı şöyle:
Kullanıcı İsteği → API (Controller) → Service → Queue Service (BullMQ'ya iş ekler) → 
BullMQ Queue → Worker (kuyruktaki işi alır ve işler) → İşlemin sonucu veritabanına kaydedilir

4. Worker'ın Sorumluluğu
Transcript worker'ın asıl görevi kuyruktaki işleri işlemek. API controller'dan gelen isteği kuyruğa eklemek değil. İşin kuyruğa eklenmesi queueService ile yapılıyor.
Transcript worker, kuyruğu sürekli dinleyip içindeki işleri işliyor:
Bu sistemde:
Controller (createTranscriptFromVideo) kullanıcı isteğini alır
Service (getOrCreateTranscript) işi kuyruğa ekler
Queue Service (addToQueue) BullMQ kuyruğuna iş ekler
Worker (transcript.worker.ts) kuyruğu dinler ve işleri işler



Şimdi sırayla açıklayayım süreçleri:
Transkript worker işlemi (transcript.worker.ts)
2. Özet'e geçiş
Summary worker işlemi (summary.worker.ts)
TranscriptWorker içindeki processJob metodu şu adımlarla ilerliyor:
YouTube'dan transkript çekiliyor
Transkript veritabanına kaydediliyor (this.transcriptService.markTranscriptCompleted)
İş tamamlandı olarak işaretleniyor (queueService.markTaskComplete)
Ardından özet işlemi başlatılıyor (this.summaryService.generateSummary)
SummaryService.generateSummary fonksiyonu:
Veritabanında özet kaydı oluşturuyor
Kuyruğa özet işi ekliyor (queueService.addToQueue)
Sonra SummaryWorker bu işi alıyor:
Kuyruktaki özet işini alıyor
summaryService.processSummary fonksiyonunu çağırıyor
Bu, özeti oluşturup veritabanına kaydediyor


slında bu iki metod farklı işler yapıyor:
handleTranscriptCompletion:
Transkript tamamlandığında çağrılıyor
Özet kaydı oluşturuyor
Bu özet işini queue'ya ekliyor
Asıl özet oluşturma işini yapmıyor
processSummary:
Queue worker tarafından çağrılıyor
Gemini API kullanarak asıl özet oluşturma işini yapıyor
Özet içeriğini döndürüyor
Yani:
handleTranscriptCompletion -> "Özet oluşturma işini başlat"
processSummary -> "Özeti gerçekten oluştur"