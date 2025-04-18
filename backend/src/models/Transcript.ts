export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  id?: string;
  video_id: string;
  language: string;
  source: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  formatted_text?: string;
  text?: string;
  segments: Segment[];
  created_at?: string;
  updated_at?: string;
  is_manual?: boolean;
}

export type TranscriptInsert = Omit<Transcript, 'id' | 'updated_at' | 'created_at'>;
export type TranscriptUpdate = Partial<TranscriptInsert>; 