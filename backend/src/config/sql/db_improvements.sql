-- VecizAI Veritabanı Yapısal İyileştirmeleri (Güncellenmiş)
-- Bu dosya veritabanı performansını artıracak iyileştirmeler içerir

-- Kontroller gösterdi ki:
-- 1. Unique constraint'ler zaten mevcut
-- 2. Duplicate veriler yok
-- 3. Bazı indeksler hiç kullanılmıyor
-- 4. Tam metin araması indeksleri eksik

-- pg_trgm extension'ının yüklü olduğundan emin olalım
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. UNIQUE CONSTRAINT EKLEMELERİ
-- Bu kısıtlamalar, aynı video_id ve language için birden fazla kayıt oluşturulmasını engeller
-- ve veri bütünlüğünü sağlar.

-- Transcripts tablosuna unique constraint ekle
DO $$
BEGIN
    -- Eğer constraint yoksa ekle
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_transcript_video_language'
    ) THEN
        BEGIN
            ALTER TABLE public.transcripts 
            ADD CONSTRAINT unique_transcript_video_language 
            UNIQUE (video_id, language);
            RAISE NOTICE 'Transcripts tablosuna unique constraint eklendi';
        EXCEPTION WHEN duplicate_table THEN
            RAISE NOTICE 'unique_transcript_video_language zaten var';
        END;
    END IF;
END $$;

-- Summaries tablosuna unique constraint ekle
DO $$
BEGIN
    -- Eğer constraint yoksa ekle
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_summary_video_language'
    ) THEN
        BEGIN
            ALTER TABLE public.summaries 
            ADD CONSTRAINT unique_summary_video_language 
            UNIQUE (video_id, language);
            RAISE NOTICE 'Summaries tablosuna unique constraint eklendi';
        EXCEPTION WHEN duplicate_table THEN
            RAISE NOTICE 'unique_summary_video_language zaten var';
        END;
    END IF;
END $$;

-- 2. TAM METİN ARAMASI İNDEKSLEMESİ
-- Transcripts tablosunda formatted_text sütunu için GIN indeksi
-- Bu, fuzzy metin aramaları için performansı önemli ölçüde artırır

-- Transcripts tablosunda formatted_text için GIN indeksi
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_transcripts_fulltext'
    ) THEN
        CREATE INDEX idx_transcripts_fulltext ON public.transcripts USING gin(formatted_text gin_trgm_ops);
        RAISE NOTICE 'Transcripts.formatted_text için tam metin araması indeksi oluşturuldu';
    ELSE
        RAISE NOTICE 'idx_transcripts_fulltext indeksi zaten var';
    END IF;
END $$;

-- Summaries tablosunda content sütunu için GIN indeksi
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_summaries_content_fulltext'
    ) THEN
        CREATE INDEX idx_summaries_content_fulltext ON public.summaries USING gin(content gin_trgm_ops);
        RAISE NOTICE 'Summaries.content için tam metin araması indeksi oluşturuldu';
    ELSE
        RAISE NOTICE 'idx_summaries_content_fulltext indeksi zaten var';
    END IF;
END $$;

-- 3. KULLANICI-VİDEO-ÖZET İLİŞKİSİ İÇİN BİLEŞİK İNDEKS
DO $$
BEGIN
    -- İndeks yoksa oluştur
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_user_summaries_user_summary'
    ) THEN
        CREATE INDEX idx_user_summaries_user_summary ON public.user_summaries(user_id, summary_id);
        RAISE NOTICE 'user_summaries için user_id ve summary_id bileşik indeksi oluşturuldu';
    ELSE
        RAISE NOTICE 'idx_user_summaries_user_summary indeksi zaten var';
    END IF;
END $$;

-- 4. GENEL PERFORMANS İYİLEŞTİRMELERİ
-- Tablo istatistiklerini güncelle
ANALYZE public.transcripts;
ANALYZE public.summaries;
ANALYZE public.user_summaries;

-- 5. KULLANILMAYAN İNDEKSLERİ KALDIRMA
-- İndeks kullanım istatistiklerine göre, bu indeksler hiç kullanılmamış
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transcripts_language') THEN
        DROP INDEX idx_transcripts_language;
        RAISE NOTICE 'idx_transcripts_language indeksi kaldırıldı';
    END IF;
END $$;

DO $$
BEGIN    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_summaries_language') THEN
        DROP INDEX idx_summaries_language;
        RAISE NOTICE 'idx_summaries_language indeksi kaldırıldı';
    END IF;
END $$;

DO $$
BEGIN    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transcripts_created_at') THEN
        DROP INDEX idx_transcripts_created_at;
        RAISE NOTICE 'idx_transcripts_created_at indeksi kaldırıldı';
    END IF;
END $$;
    
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_summaries_created_at') THEN
        DROP INDEX idx_summaries_created_at;
        RAISE NOTICE 'idx_summaries_created_at indeksi kaldırıldı';
    END IF;
END $$;
    
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transcripts_source') THEN
        DROP INDEX idx_transcripts_source;
        RAISE NOTICE 'idx_transcripts_source indeksi kaldırıldı';
    END IF;
END $$;
    
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transcripts_video_language') THEN
        DROP INDEX idx_transcripts_video_language;
        RAISE NOTICE 'idx_transcripts_video_language indeksi kaldırıldı';
    END IF;
END $$;

-- NOT: VACUUM komutları bir transaction bloğu içinde çalıştırılamaz.
-- Aşağıdaki komutları ayrı ayrı çalıştırmalısınız:
-- VACUUM ANALYZE public.transcripts;
-- VACUUM ANALYZE public.summaries;
-- VACUUM ANALYZE public.user_summaries; 