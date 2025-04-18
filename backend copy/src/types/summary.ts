export interface ChapterInfo {
  title: string;
  start_time: number;
  end_time: number;
  summary?: string;
}

export interface Summary {
  id: string;
  video_id: string;
  source: string;
  content: string;
  formatted_content?: string;
  language: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  created_at: Date;
  updated_at: Date;
  is_public: boolean;
}

export interface SummaryResponse {
  id: string;
  status: string;
  message: string;
}

export interface SummaryStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  content: string | null;
  video_title?: string;
  video_thumbnail?: string;
  channel_title?: string;
  video_url?: string;
}

export interface QueueTask {
  id: string;
  type: string;
  data: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: Date;
  updated_at: Date;
  error?: string;
}

export type ContentType = 
  | 'education'
  | 'history'
  | 'finance'
  | 'technology'
  | 'news'
  | 'science'
  | 'art'
  | 'sport'
  | 'health'
  | 'general'; 