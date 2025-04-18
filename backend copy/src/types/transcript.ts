export enum TranscriptStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface Transcript {
  id: number;
  video_id: string;
  language: string;
  status: TranscriptStatus;
  formatted_text?: string;
  error?: string;
  task_id?: string;
  created_at: string;
  updated_at: string;
  source?: string;
}

export interface TranscriptCreateData {
  video_id: string;
  language: string;
  status: TranscriptStatus;
  source?: string;
  formatted_text?: string;
}

export class TranscriptError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = 'TranscriptError';
  }
}
