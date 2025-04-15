Bu işlem youtube-dl-exec kütüphanesi kullanılarak yapılıyor ve şu sırayla çağrılıyor:
TranscriptWorker içindeki processTask metodu çağrılıyor
processTask içinde AudioService.downloadAudio çağrılıyor
processTask metodu, TranscriptWorker sınıfının start() metodu içinde çağrılıyor. İşte tam sıralama:

h evet, haklısınız! Biz SubscriberTranscriptWorker'a geçmiştik. Bu worker Redis PubSub kullanıyor ve daha verimli.
SubscriberTranscriptWorker şu şekilde çalışıyor:
SubscriberWorker base class'ından extend ediliyor
Redis'e subscribe oluyor ve notification geldiğinde task'ı işliyor
Sürekli polling yapmak yerine, yeni bir task eklendiğinde Redis'ten notification alıyor
İşte SubscriberTranscriptWorker'ın processTask metodu çağrılma sırası:
Redis'e bir task eklendiğinde notification yayınlanıyor
SubscriberWorker bu notification'ı alıyor
Notification geldiğinde checkQueueForTasks metodu çalışıyor
4. Bu metod içinde task varsa processTask çağrılıyor
Yani doğru kod transcriptWorker.ts değil, subscriberTranscriptWorker.ts olmalı. Bu durumda:
Önce transcriptWorker.ts'yi kaldırmalıyız
subscriberTranscriptWorker.ts'yi kullanmalıyız
Worker başlatma kodunu da buna göre güncellemeliyiz



QueueService:
Redis'i queue olarak kullanıyor
Task'ları FIFO (First In First Out) sırasıyla işliyor
Lock mekanizması ile race condition'ları önlüyor
Processing listesi ile hangi task'ın işlendiğini takip ediyor
TranscriptController:
Frontend'den gelen istekleri karşılıyor
Mevcut transcript'i kontrol ediyor
Yeni transcript oluşturuyor
Queue'ya iş ekliyor
Hiç YouTube'a istek atmıyor
TranscriptWorker:
Queue'dan task alıyor
YouTube'dan transcript çekiyor
Supabase'e kaydediyor
Hata durumlarını yönetiyor
Rate limiting yapıyor (1 saniye aralıklarla)
Akış şu şekilde olacak:

Frontend transcript isteği yapar
Controller:
Cache'de var mı? -> Varsa dön
Supabase'de var mı? -> Varsa durumuna göre işlem yap
Yoksa -> Yeni kayıt oluştur -> Queue'ya ekle
Worker:
Queue'dan task al
YouTube'dan çek
Supabase'e kaydet
Task'ı tamamla








.bir istek geldiğinde bu video id ve dil için transkript tablosudna kayıt var mı kontrol et eger transkript dbdeki bi tabloda varsa task olusturma ve formatted texti homeview gönder ve göster. peki dbde transkript tablosunda kayıt yok ama task tablosunda bu video id ve dil için kayıt var processing failed ise bunu dondurup bu taskın tamamlanmasını beklicez kontrol ederek. olaki hem tranksript tablosunda kayıt yok hemde task yoksa once task tablosunda bir kayıt olusturacağız pending olarak sonra gideceğiz apiler aracılığı ile transkripti almaya basladıgımız anda hemen task tablosundaki pendingi processinge cekecez.transkript alındı ve transkript tablosunda completed oldugunda da hemen task tablosundaki o kaydın statusunude completed yapacağız 

 



 bir video url talebi geldi video id ve modaldan aldıgımı dil ile birlikte once redise baktık boyle bir transkript var mı varsa oradan dondurduk yoksa bunla ilgili devam eden task var mı rediste ona baktık varsa onun bitmesini bekledik bittikten sonra gidip bir daha transkript var mı die baktık .
 
 bunlar yok ise youtubedan transkript almayı denedik alırsak redise ve transkript talbosuna kaıyltrımızı attık o dil için ve gelen transkripti homeview buede gösterdik. 
 
 sistem bu sekilde genel mantıgı ve burada aynı video id ve dil için bir kayıt atmaya calişmaması lazım zaten bu kayıt db de varsa .Cunku en basta var mı yokmu die kontrol ediyoruz