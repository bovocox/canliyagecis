-- Veritabanı indeksleri oluşturma scripti

-- VecizAI Database Performance Optimization Indexes
-- Bu indeksler en sık ve en yavaş sorguları optimize etmek için tasarlanmıştır

-- Önce gerekli eklentileri yükle (extension)
-- Video analitik sorgularını iyileştirmek için gerekli extension (fuzzy search için)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- transcripts tablosu indeksleri
-- video_id ve language en çok sorgulanan alanlar
CREATE INDEX IF NOT EXISTS idx_transcripts_video_language ON public.transcripts(video_id, language);
-- status alanına göre filtreleme
CREATE INDEX IF NOT EXISTS idx_transcripts_status ON public.transcripts(status);
-- created_at için sıralama indeksi
CREATE INDEX IF NOT EXISTS idx_transcripts_created_at ON public.transcripts(created_at DESC);
-- source indeksi
CREATE INDEX IF NOT EXISTS idx_transcripts_source ON public.transcripts(source);

-- tasks tablosu indeksleri
-- status NULL olmayan locked_by için composite index
CREATE INDEX IF NOT EXISTS idx_tasks_status_locked ON public.tasks(status) WHERE locked_by IS NULL;
-- created_at için sıralama indeksi (task_status ile birlikte)
CREATE INDEX IF NOT EXISTS idx_tasks_status_created_at ON public.tasks(status, created_at ASC);
-- locked_by için indeks
CREATE INDEX IF NOT EXISTS idx_tasks_locked_by ON public.tasks(locked_by) WHERE locked_by IS NOT NULL;
-- video_id için indeks 
CREATE INDEX IF NOT EXISTS idx_tasks_video_id ON public.tasks(video_id);

-- summaries tablosu indeksleri
-- video_id ve language için composite index
CREATE INDEX IF NOT EXISTS idx_summaries_video_language ON public.summaries(video_id, language);
-- status için indeks
CREATE INDEX IF NOT EXISTS idx_summaries_status ON public.summaries(status);
-- created_at için sıralama indeksi
CREATE INDEX IF NOT EXISTS idx_summaries_created_at ON public.summaries(created_at DESC);

-- videos tablosu indeksleri
-- video_id için indeks
CREATE INDEX IF NOT EXISTS idx_videos_video_id ON public.videos(video_id);
-- channel_id için indeks
CREATE INDEX IF NOT EXISTS idx_videos_channel_id ON public.videos(channel_id);
-- title için GIN indeks (fuzzy searching için)
CREATE INDEX IF NOT EXISTS idx_videos_title_gist ON public.videos USING gin(title gin_trgm_ops);

-- whisper_tasks tablosu indeksleri
CREATE INDEX IF NOT EXISTS idx_whisper_tasks_status ON public.whisper_tasks(status);
CREATE INDEX IF NOT EXISTS idx_whisper_tasks_created_at ON public.whisper_tasks(created_at ASC);

-- İstatistikleri güncelleme
ANALYZE public.transcripts;
ANALYZE public.tasks;
ANALYZE public.summaries;
ANALYZE public.videos;
ANALYZE public.whisper_tasks;
