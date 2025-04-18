export interface TranscriptItem {
  time: string;
  text: string;
}

export interface DetailedSummary {
  context: string;
  analysis: string;
  conclusion: string;
}

export interface Video {
  video_id: string;
  published_at: string;
  available_languages: any[];
  view_count: number | null;
  title: string;
  channel_id: string;
  channel_title: string;
  description: string | null;
  thumbnail_url: string | null;
  updated_at?: string;
  created_at?: string;
  comment_count: number | null;
  like_count: number | null;
  duration: string | null;
  status?: string;
}

export type VideoInsert = Omit<Video, 'updated_at' | 'created_at'>;
export type VideoUpdate = Partial<VideoInsert>;

 

 

 

 