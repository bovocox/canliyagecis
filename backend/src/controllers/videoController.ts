import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { Video, VideoInsert, VideoUpdate } from '../models/Video';
import youtubeDl from 'youtube-dl-exec';
import { YoutubeTranscript } from 'youtube-transcript';

// Helper function to format YouTube date
function formatYouTubeDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  
  // YouTube date format is typically YYYYMMDD
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  
  return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
}

interface VideoInfo {
  id: string;
  title: string;
  view_count: number;
  channel_id: string;
  channel_title: string;
  description: string;
  thumbnail: string;
  upload_date: string;
  duration: string;
  comment_count: number;
  like_count: number;
}

// Helper function to extract video ID from URL
function extractVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    let videoId: string | null = null;

    if (urlObj.hostname === 'youtu.be') {
      videoId = urlObj.pathname.slice(1);
    } else if (urlObj.hostname.includes('youtube.com')) {
      videoId = urlObj.searchParams.get('v');
    }

    return videoId;
  } catch {
    return null;
  }
}

// Interface for youtube-dl-exec response
interface YouTubeVideoInfo {
  id: string;
  upload_date: string;
  view_count: number;
  title: string;
  channel_id: string;
  channel: string;
  description: string;
  thumbnail: string;
  comment_count: number;
  like_count: number;
  duration: string;
}

export const createVideo = async (req: Request, res: Response) => {
  try {
    const videoData: VideoInsert = req.body;
    const { data, error } = await supabase
      .from('videos')
      .insert([videoData])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating video:', error);
    res.status(400).json({ message: 'Error creating video', error });
  }
};

export const getVideo = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('video_id', req.params.videoId)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ message: 'Video not found' });
    }
    res.json(data);
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).json({ message: 'Error fetching video', error });
  }
};

export const getAllVideos = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ message: 'Error fetching videos', error });
  }
};

export const updateVideo = async (req: Request, res: Response) => {
  try {
    const videoData: VideoUpdate = req.body;
    const { data, error } = await supabase
      .from('videos')
      .update(videoData)
      .eq('video_id', req.params.videoId)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ message: 'Video not found' });
    }
    res.json(data);
  } catch (error) {
    console.error('Error updating video:', error);
    res.status(400).json({ message: 'Error updating video', error });
  }
};

export const deleteVideo = async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from('videos')
      .delete()
      .eq('video_id', req.params.videoId);

    if (error) throw error;
    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({ message: 'Error deleting video', error });
  }
};

export const getVideoFromUrl = async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ message: 'URL is required' });
    }

    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ message: 'Invalid YouTube URL' });
    }

    // Get video info using youtube-dl
    const rawVideoInfo = await youtubeDl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true
    });

    // Type assertion after validation
    const videoInfo = rawVideoInfo as unknown as YouTubeVideoInfo;

    // Format video data according to our schema
    const videoData: VideoInsert = {
      video_id: videoId,
      published_at: formatYouTubeDate(videoInfo.upload_date),
      available_languages: [],
      view_count: videoInfo.view_count || null,
      title: videoInfo.title || '',
      channel_id: videoInfo.channel_id || '',
      channel_title: videoInfo.channel || '',
      description: videoInfo.description || null,
      thumbnail_url: videoInfo.thumbnail || null,
      comment_count: videoInfo.comment_count || null,
      like_count: videoInfo.like_count || null,
      duration: videoInfo.duration || null,
      status: 'processing'
    };

    // Save video info to database
    const { data: savedVideo, error: saveError } = await supabase
      .from('videos')
      .upsert([videoData])
      .select()
      .single();

    if (saveError) throw saveError;

    // Return immediately with video info
    return res.status(201).json({
      data: {
        data: savedVideo,
        message: 'Video processed successfully'
      }
    });

  } catch (error) {
    console.error('Error processing video:', error);
    res.status(500).json({ message: 'Error processing video', error });
  }
}; 