import { supabase } from '../config/supabase';
import { Transcript, TranscriptCreateData, TranscriptError } from '../types/transcript';
import logger from '../utils/logger';

export class TranscriptRepository {
  async findByVideoAndLanguage(videoId: string, language: string): Promise<Transcript | null> {
    const { data, error } = await supabase
      .from('transcripts')
      .select('*')
      .eq('video_id', videoId)
      .eq('language', language)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new TranscriptError('Error fetching transcript', error.code, error);
    }

    return data;
  }

  async create(data: TranscriptCreateData): Promise<Transcript> {
    const { data: transcript, error } = await supabase
      .from('transcripts')
      .insert(data)
      .select()
      .single();

    if (error) {
      if (error.code === '23505' && error.details?.includes('transcripts_video_id_language_key')) {
        throw new TranscriptError('Duplicate transcript', 'DUPLICATE_KEY', error);
      }
      throw new TranscriptError('Error creating transcript', error.code, error);
    }

    return transcript;
  }

  async update(id: string, data: Partial<Transcript>): Promise<Transcript> {
    const { data: transcript, error } = await supabase
      .from('transcripts')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new TranscriptError('Error updating transcript', error.code, error);
    }

    return transcript;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('transcripts')
      .delete()
      .eq('id', id);

    if (error) {
      throw new TranscriptError('Error deleting transcript', error.code, error);
    }
  }

  async findById(id: string): Promise<Transcript | null> {
    const { data, error } = await supabase
      .from('transcripts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new TranscriptError('Error fetching transcript', error.code, error);
    }

    return data;
  }
}

export const transcriptRepository = new TranscriptRepository();
