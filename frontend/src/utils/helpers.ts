/**
 * Ortak kullanılan yardımcı fonksiyonları barındıran yardımcı modül
 */

/**
 * Video ID'lerini normalize eder, farklı formatların eşleşmesini kolaylaştırır
 * Frontend ve backend arasında format uyumsuzluğuna karşı
 * 
 * @param videoId Video ID
 * @returns Normalize edilmiş video ID
 */
export function normalizeVideoId(videoId?: string): string {
  if (!videoId) return '';
  // Tüm boşlukları, tireleri ve alt çizgileri kaldır
  return videoId.replace(/[\s\-_]/g, '').toLowerCase();
}

/**
 * Metin önizlemesi oluşturma
 * 
 * @param text Orijinal metin
 * @param maxLength Maksimum karakter sayısı
 * @returns Kısaltılmış metin
 */
export function getTextPreview(text: string, maxLength: number = 250): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * İki video ID'sinin normalize edilmiş hallerini karşılaştırır
 * 
 * @param id1 Birinci video ID
 * @param id2 İkinci video ID
 * @returns Eğer ID'ler eşleşiyorsa true, aksi halde false
 */
export function videoIdsMatch(id1?: string, id2?: string): boolean {
  return normalizeVideoId(id1) === normalizeVideoId(id2);
}

/**
 * Hata mesajı formatını standartlaştırır
 * 
 * @param error Hata objesi veya mesajı
 * @returns Formatlı hata mesajı
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Bilinmeyen hata oluştu';
} 