export interface Task {
  id?: string;
  video_id: string;
  type: 'transcript';
  process_type: 'transcript';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  source: string;
  language: string;
  data?: Record<string, any>;
  error?: string;
  result?: Record<string, any>;
  locked_by?: string | null;
  locked_at?: string | null;
  lock_expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type TaskInsert = Omit<Task, 'id' | 'created_at' | 'updated_at'>;
export type TaskUpdate = Partial<TaskInsert>;
