# Transkript İşleme Akışı

Aşağıdaki akış diyagramı, transkript işleme sürecini göstermektedir:

```mermaid
flowchart TD
    A[Video ID ve Dil Talebi] --> B{Transkript DB'de var mı?}
    B -->|Evet| C[Hemen Formatted Text'i Göster]
    B -->|Hayır| D{Task tablosunda kayıt var mı?}
    D -->|Evet| E{Task durumu?}
    E -->|Processing| F[İşleniyor durumunu göster ve bekle]
    E -->|Failed| G[Hatayı göster]
    E -->|Completed| H[Transkript'i göster]
    E -->|Pending| I[Bekliyor durumunu göster ve tekrar kontrol et]
    D -->|Hayır| J[Yeni Task oluştur - Pending]
    J --> K[API'den Transkript almaya başla]
    K --> L[Task durumunu Processing'e güncelle]
    L --> M{Transkript alındı mı?}
    M -->|Evet| N[Transkript'i kaydet ve Task'ı Completed yap]
    M -->|Hayır| O[Task'ı Failed olarak işaretle]
```

## İşlem Adımları

1. **Frontend**: Kullanıcı bir video ID ve dil seçerek transkript talep eder. 

2. **Backend**: Transkript tablosunda bu ID ve dil için bir kayıt var mı kontrol edilir:
   - Kayıt varsa: Formatted text hemen döndürülür.
   - Kayıt yoksa: Task tablosuna bakılır.

3. **Backend**: Task tablosunda ID ve dil için bir kayıt var mı kontrol edilir:
   - Task varsa: Durumuna (pending, processing, completed, failed) göre uygun yanıt döndürülür.
   - Task yoksa: Yeni bir task oluşturulur (pending).

4. **Worker**: Pending durumundaki task'ları bulur ve işlemeye başlar:
   - Task'ı Processing durumuna günceller
   - YouTube'dan transkript almaya çalışır
   - Transkript alınırsa: Transkript tablosuna kaydedilir ve task Completed olarak işaretlenir
   - Hata olursa: Task Failed olarak işaretlenir

5. **Frontend**: Polling ile task durumunu kontrol eder:
   - Transcript tamamlanmışsa: Kullanıcıya gösterilir
   - İşlem devam ediyorsa: Status mesajları ile kullanıcı bilgilendirilir
   - Hata durumunda: Kullanıcıya hata gösterilir

## Durum Kodları

- **pending**: Task oluşturuldu, henüz işleme alınmadı
- **processing**: Worker task'ı işliyor
- **completed**: İşlem başarıyla tamamlandı
- **failed**: İşlem sırasında hata oluştu

Bu akış, verimli ve sağlam bir transkript işleme sistemi sağlar. Başarısızlık durumlarını yönetir ve kullanıcıya süreç hakkında şeffaf bilgiler sunar.
