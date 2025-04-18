import logger from '../utils/logger';
import { AppError } from '../utils/appError';
import { google } from 'googleapis';
import { YouTubeKeyService } from './youtubeKeyService';

interface Video {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  publishedAt: string;
  viewCount: number;
  likeCount?: number;
  commentCount?: number;
  duration?: string;
}

interface YouTubePlaylistItem {
  contentDetails: {
    videoId: string;
  };
}

interface YouTubeVideo {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
      maxres?: { url: string };
    };
    publishedAt: string;
  };
  statistics: {
    viewCount: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails: {
    duration: string;
  };
}

export class YouTubeService {
  private youtube: any;
  private keyService: YouTubeKeyService;

  constructor(keyService: YouTubeKeyService) {
    this.keyService = keyService;
    this.initializeYouTubeAPI();
  }

  private async initializeYouTubeAPI() {
    try {
      const apiKey = await this.keyService.getActiveKey();
      this.youtube = google.youtube({
        version: 'v3',
        auth: apiKey
      });
      
      logger.info('YouTube API initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize YouTube API:', error);
      throw error;
    }
  }

  async getChannelDetails(channelIdOrHandle: string) {
    try {
      // API anahtarını yenile
      await this.initializeYouTubeAPI();

      let channelId = channelIdOrHandle;

      // If it's a handle, search for the channel first
      if (channelIdOrHandle.includes('@') || !channelIdOrHandle.match(/^[A-Za-z0-9_-]{24}$/)) {
        const searchResponse = await this.youtube.search.list({
          part: ['snippet'],
          q: channelIdOrHandle.replace('@', ''),
          type: ['channel'],
          maxResults: 1
        });

        if (!searchResponse.data.items?.length) {
          logger.error('Channel not found on YouTube', { channelIdOrHandle });
          throw new Error('Channel not found');
        }

        channelId = searchResponse.data.items[0].id.channelId;
      }

      const response = await this.youtube.channels.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        id: [channelId]
      });

      if (!response.data.items?.length) {
        logger.error('Channel not found on YouTube', { channelId });
        throw new Error('Channel not found');
      }

      const channel = response.data.items[0];
      const snippet = channel.snippet;
      const statistics = channel.statistics;

      return {
        id: channel.id,
        title: snippet.title,
        description: snippet.description,
        thumbnail_url: snippet.thumbnails?.default?.url,
        subscriber_count: parseInt(statistics.subscriberCount) || 0,
        video_count: parseInt(statistics.videoCount) || 0,
        view_count: parseInt(statistics.viewCount) || 0,
        language: snippet.defaultLanguage || snippet.defaultAudioLanguage
      };
    } catch (error) {
      logger.error('Error getting channel details:', { 
        error,
        channelIdOrHandle,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getChannelVideos(channelId: string, maxResults: number = 3): Promise<Video[]> {
    try {
      // Get channel's uploads playlist ID
      const { data: channelData } = await this.youtube.channels.list({
        part: ['contentDetails'],
        id: [channelId],
      });

      if (!channelData.items?.length) {
        throw new Error('Channel not found');
      }

      const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;

      // Get playlist items (videos)
      const { data: playlistData } = await this.youtube.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId: uploadsPlaylistId,
        maxResults: maxResults * 2, // Get more to ensure we have enough non-shorts videos
      });

      if (!playlistData.items?.length) {
        return [];
      }

      // Get video IDs
      const videoIds = playlistData.items.map((item: any) => item.contentDetails.videoId);

      // Get detailed video information
      const { data: videosData } = await this.youtube.videos.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        id: videoIds,
      });

      if (!videosData.items?.length) {
        return [];
      }

      // Filter out shorts and map to our interface
      const filteredVideos = videosData.items
        .filter((video: any) => {
          const duration = video.contentDetails.duration;
          const durationInSeconds = this.parseDuration(duration);
          return durationInSeconds >= 60; // Filter out videos shorter than 1 minute (likely shorts)
        })
        .map((video: any) => ({
          id: video.id,
          title: video.snippet.title,
          description: video.snippet.description,
          thumbnail_url: video.snippet.thumbnails.maxres?.url || 
                    video.snippet.thumbnails.high?.url || 
                    video.snippet.thumbnails.medium?.url || 
                    video.snippet.thumbnails.default?.url,
          publishedAt: video.snippet.publishedAt,
          viewCount: parseInt(video.statistics.viewCount) || 0,
          likeCount: parseInt(video.statistics.likeCount || '0'),
          commentCount: parseInt(video.statistics.commentCount || '0'),
          duration: video.contentDetails.duration
        }))
        .slice(0, maxResults);

      logger.info('Retrieved videos from YouTube:', {
        channelId,
        requestedCount: maxResults,
        retrievedCount: filteredVideos.length,
        videoIds: filteredVideos.map((v: Video) => v.id)
      });

      return filteredVideos;
    } catch (error) {
      logger.error('Error getting channel videos:', { 
        error,
        channelId,
        errorDetails: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  async getTranscript(videoId: string, language: string): Promise<{ transcript: any[], foundLanguage: string }> {
    try {
      logger.info('Fetching transcript using YouTube Data API', { videoId, language });

      // Get video captions
      const response = await this.youtube.captions.list({
        part: ['snippet'],
        videoId: videoId
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('No captions found for video');
      }

      // Find the best matching caption track
      const captionTrack = this.findBestCaptionTrack(response.data.items, language);
      
      if (!captionTrack) {
        throw new Error('No suitable caption track found');
      }

      // Download the caption track
      const captionResponse = await this.youtube.captions.download({
        id: captionTrack.id,
        tfmt: 'ttml' // or 'srt' based on preference
      });

      // Parse the caption content
      const transcript = this.parseCaptionContent(captionResponse.data);
      const foundLanguage = captionTrack.snippet.language;

      logger.info('Successfully got transcript using YouTube Data API', { 
        videoId, 
        length: transcript.length,
        language: foundLanguage 
      });

      return { transcript, foundLanguage };
    } catch (error: any) {
      logger.error('Error fetching transcript using YouTube Data API', { error, videoId, language });
      throw error;
    }
  }

  private findBestCaptionTrack(captionTracks: any[], preferredLanguage: string): any {
    // First try exact language match
    const exactMatch = captionTracks.find(track => 
      track.snippet.language === preferredLanguage
    );
    if (exactMatch) return exactMatch;

    // Then try auto-generated in preferred language
    const autoGenerated = captionTracks.find(track => 
      track.snippet.language === preferredLanguage && 
      track.snippet.trackKind === 'asr'
    );
    if (autoGenerated) return autoGenerated;

    // Then try English
    const englishTrack = captionTracks.find(track => 
      track.snippet.language === 'en'
    );
    if (englishTrack) return englishTrack;

    // Finally try Turkish
    const turkishTrack = captionTracks.find(track => 
      track.snippet.language === 'tr'
    );
    if (turkishTrack) return turkishTrack;

    // If nothing found, return the first available track
    return captionTracks[0];
  }

  private parseCaptionContent(content: string): any[] {
    // Implementation depends on the format (ttml or srt)
    // This is a simplified example
    const transcript: any[] = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        transcript.push({
          text: line,
          start: 0, // You'll need to parse actual timestamps
          duration: 0
        });
      }
    }

    return transcript;
  }
} 