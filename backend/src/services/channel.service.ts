import logger from '../utils/logger';
import { AppError } from '../utils/appError';
import { supabase, supabaseAdmin } from '../config/supabase';
import { YouTubeService } from './youtubeService';
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

interface DatabaseVideo {
  id: string;
  title: string;
  thumbnail_url: string;
  view_count: number;
  published_at: string;
}

interface ChannelVideo {
  id: string;
  video_id: string;
  channel_id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  published_at: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  duration: string;
  channel_title: string;
}

interface DatabaseChannel {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  subscriber_count: number;
  video_count: number;
  language: string;
  last_checked: string;
  created_at: string;
  updated_at: string;
}

interface UserChannelResponse {
  id: string;
  language: string;
  channels: DatabaseChannel;
}

interface DatabaseVideoDetails {
  id: string;
  title: string;
  thumbnail_url: string;
  view_count: number;
  published_at: string;
}

interface ChannelVideoResponse {
  video_id: string;
  videos: DatabaseVideoDetails;
}

interface Channel {
  id: string;
  title: string;
  url?: string;
  thumbnail_url?: string;
  description?: string;
  subscriber_count?: number;
  video_count?: number;
  language?: string;
  last_checked?: string;
  created_at: string;
  updated_at: string;
  channel_videos?: ChannelVideo[];
}

interface UserChannelData {
  channels: {
    id: string;
    title: string;
    description: string;
    thumbnail_url: string;
    subscriber_count: number;
    video_count: number;
    language: string;
    last_checked: string;
    created_at: string;
    updated_at: string;
  };
}

interface VideoQueryResult {
  id: string;
  video_id: string;
  channel_id: string;
  has_summary: boolean;
  videos: {
    title: string;
    description: string;
    thumbnail_url: string;
    published_at: string;
    view_count: number;
    like_count: number;
    comment_count: number;
    duration: string;
    channel_title: string;
  };
}

export class ChannelService {
  private youtubeService: YouTubeService;

  constructor() {
    const keyService = new YouTubeKeyService();
    this.youtubeService = new YouTubeService(keyService);
  }

  // Helper function to extract channel ID from URL
  private async extractChannelId(url: string): Promise<string | null> {
    try {
      // Remove @ if URL starts with it and decode URL
      const cleanUrl = url.startsWith('@') ? url.substring(1) : url;
      const decodedUrl = decodeURIComponent(cleanUrl);
      
      logger.info('Processing URL:', { 
        originalUrl: url,
        cleanUrl,
        decodedUrl
      });

      // If it's already a channel ID, return it
      if (url.startsWith('UC') && url.length > 20) {
        return url;
      }

      // Check if it's a video URL, not a channel URL
      if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
        logger.info('URL appears to be a video, not a channel:', { url });
        throw new AppError('INVALID_URL_TYPE', 'The URL is for a video, not a channel. Please provide a channel URL.');
      }

      // If it's a handle (with or without @), get channel ID from YouTube
      if (url.startsWith('@') || !url.includes('youtube.com')) {
        const handle = url.startsWith('@') ? url : `@${url}`;
        const channelId = await this.getChannelIdFromHandle(handle);
        if (channelId) {
          logger.info('Got channel ID from handle:', { handle, channelId });
          return channelId;
        }
      }

      // YouTube channel URL patterns
      const patterns = [
        /youtube\.com\/channel\/(UC[^/?]+)/i,
        /youtube\.com\/@([^/?]+)/i,
        /youtube\.com\/c\/([^/?]+)/i,
        /youtube\.com\/user\/([^/?]+)/i
      ];

      for (const pattern of patterns) {
        const match = decodedUrl.match(pattern);
        if (match) {
          const identifier = match[1];
          
          // If it's a direct channel ID, return it
          if (identifier.startsWith('UC')) {
            logger.info('Found channel ID in URL:', { identifier });
            return identifier;
          }
          
          // Otherwise, it's a handle/custom URL, get the real channel ID
          const handle = identifier.startsWith('@') ? identifier : `@${identifier}`;
          const channelId = await this.getChannelIdFromHandle(handle);
          if (channelId) {
            logger.info('Got channel ID from URL handle:', { handle, channelId });
            return channelId;
          }
        }
      }

      // If no pattern matched and it's not a handle, try as a handle anyway
      const channelId = await this.getChannelIdFromHandle(`@${cleanUrl}`);
      if (channelId) {
        logger.info('Got channel ID from fallback handle:', { handle: cleanUrl, channelId });
        return channelId;
      }

      logger.info('No channel ID found for URL:', { url });
      throw new AppError('CHANNEL_NOT_FOUND', 'Could not find a valid YouTube channel with the provided URL or handle.');
    } catch (error) {
      if (error instanceof AppError) {
        throw error; // Re-throw our own errors
      }
      
      logger.error('Error extracting channel ID:', { 
        url,
        error: error instanceof Error ? error.message : error
      });
      return null;
    }
  }

  public async getChannelIdFromHandle(handle: string): Promise<string | null> {
    try {
      logger.info('Getting channel ID from handle', { handle });

      // Get channel details from YouTube
      const channelDetails = await this.youtubeService.getChannelDetails(handle);
      if (!channelDetails) {
        logger.error('No channel found for handle', { handle });
        return null;
      }

      logger.info('Found channel ID', { handle, channelId: channelDetails.id });
      return channelDetails.id;

    } catch (error) {
      logger.error('Error getting channel ID from handle:', { 
        handle,
        error: error instanceof Error ? error.message : error
      });
      return null;
    }
  }

  public async getYouTubeChannelDetails(channelId: string) {
    try {
      const channelDetails = await this.youtubeService.getChannelDetails(channelId);
      if (!channelDetails) return null;

      // Transform field names to match database schema
      return {
        id: channelDetails.id,
        title: channelDetails.title,
        description: channelDetails.description,
        thumbnail_url: channelDetails.thumbnail_url,
        subscriber_count: channelDetails.subscriber_count,
        video_count: channelDetails.video_count,
        view_count: channelDetails.view_count,
        language: channelDetails.language
      };
    } catch (error) {
      logger.error('Error getting YouTube channel details:', { error });
      throw error;
    }
  }

  public async getYouTubeChannelVideos(channelId: string, limit: number = 5) {
    try {
      return await this.youtubeService.getChannelVideos(channelId, limit);
    } catch (error) {
      logger.error('Error getting YouTube channel videos:', { error });
      throw error;
    }
  }

  public async addChannel(userId: string, channelUrl: string, language: string = 'tr'): Promise<Channel> {
    try {
      logger.info('ChannelService.addChannel', { userId, channelUrl, language });

      // Extract channel ID from URL
      const youtubeChannelId = await this.extractChannelId(channelUrl);
      if (!youtubeChannelId) {
        throw AppError.badRequest('INVALID_URL', 'Invalid YouTube channel URL');
      }

      // Check if user already follows this channel
      const { data: existingUserChannel } = await supabaseAdmin
        .from('user_channels')
        .select('*')
        .eq('user_id', userId)
        .eq('channel_id', youtubeChannelId)
        .single();

      if (existingUserChannel) {
        throw AppError.badRequest('CHANNEL_EXISTS', 'Channel already exists for this user');
      }

      // Get channel details from YouTube API
      const channelDetails = await this.youtubeService.getChannelDetails(youtubeChannelId);
      logger.info('Got channel details from YouTube:', { channelDetails });

      // Check if channel exists in database
      const { data: existingChannel } = await supabaseAdmin
        .from('channels')
        .select('*')
        .eq('id', youtubeChannelId)
        .single();

      let channelData;

      if (existingChannel) {
        // Update existing channel with fresh YouTube data
        const { data: updatedChannel, error: updateError } = await supabaseAdmin
          .from('channels')
          .update({
            title: channelDetails.title,
            description: channelDetails.description,
            thumbnail_url: channelDetails.thumbnail_url,
            subscriber_count: channelDetails.subscriber_count,
            video_count: channelDetails.video_count,
            language: channelDetails.language,
            last_checked: new Date().toISOString()
          })
          .eq('id', youtubeChannelId)
          .select()
          .single();

        if (updateError) {
          logger.error('Error updating channel:', { error: updateError });
          throw updateError;
        }

        channelData = updatedChannel;
        logger.info('Updated existing channel', { channelId: youtubeChannelId });
      } else {
        // Create new channel with YouTube data
        const { data: newChannel, error: insertError } = await supabaseAdmin
          .from('channels')
          .insert([{
            id: youtubeChannelId,
            url: channelUrl,
            title: channelDetails.title,
            description: channelDetails.description,
            thumbnail_url: channelDetails.thumbnail_url,
            subscriber_count: channelDetails.subscriber_count,
            video_count: channelDetails.video_count,
            language: channelDetails.language,
            last_checked: new Date().toISOString()
          }])
          .select()
          .single();

        if (insertError) {
          logger.error('Error inserting channel:', { error: insertError });
          throw insertError;
        }

        channelData = newChannel;
        logger.info('Created new channel', { channelId: youtubeChannelId });
      }

      // Create user-channel relationship with language preference
      const { error: userChannelError } = await supabaseAdmin
        .from('user_channels')
        .insert([{
          user_id: userId,
          channel_id: youtubeChannelId,
          language: language // Kullanıcının dil tercihini kaydediyoruz
        }]);

      if (userChannelError) {
        logger.error('Error creating user-channel relationship:', { error: userChannelError });
        throw userChannelError;
      }

      // Fetch and save latest videos
      try {
        // Get latest videos from YouTube
        const videos = await this.youtubeService.getChannelVideos(youtubeChannelId, 2);
        
        if (videos && videos.length > 0) {
          // First, insert into videos table
          const videoData = videos.map(video => ({
            video_id: video.id,
            title: video.title,
            description: video.description,
            thumbnail_url: video.thumbnail_url,
            published_at: video.publishedAt,
            view_count: video.viewCount || 0,
            like_count: video.likeCount || 0,
            comment_count: video.commentCount || 0,
            duration: video.duration,
            channel_id: youtubeChannelId,
            channel_title: channelDetails.title
          }));

          // Upsert videos
          const { error: videoError } = await supabaseAdmin
            .from('videos')
            .upsert(videoData, {
              onConflict: 'video_id'
            });

          if (videoError) {
            logger.error('Error upserting videos:', { error: videoError });
          }

          // Then, create channel_videos relationships
          const channelVideoData = videos.map(video => ({
            channel_id: youtubeChannelId,
            video_id: video.id,
            // Dil seçimine göre ilgili dil flag'ini false olarak ayarla
            tr_has_summary: language === 'tr' ? false : null,
            en_has_summary: language === 'en' ? false : null
          }));

          // Upsert channel_videos relationships
          const { error: channelVideoError } = await supabaseAdmin
            .from('channel_videos')
            .upsert(channelVideoData, {
              onConflict: 'channel_id,video_id'
            });

          if (channelVideoError) {
            logger.error('Error upserting channel_videos:', { error: channelVideoError });
          }
          
          logger.info('Channel videos processed and flags set', { 
            channelId: youtubeChannelId, 
            videoCount: videos.length,
            selectedLanguage: language
          });

          // Add videos to the response
          channelData.channel_videos = videos.map(video => ({
            video_id: video.id,
            videos: {
              id: video.id,
              title: video.title,
              thumbnail_url: video.thumbnail_url,
              view_count: video.viewCount,
              published_at: video.publishedAt
            }
          }));
        }
      } catch (error) {
        logger.error('Error fetching/saving videos:', { error });
        // Continue even if video fetch fails
      }

      logger.info('Added channel for user successfully', { channelId: youtubeChannelId, userId });
      return channelData;
    } catch (error) {
      logger.error('Error in ChannelService.addChannel:', { error });
      throw error;
    }
  }

  public async getUserChannels(userId: string): Promise<Channel[]> {
    try {
      logger.info('ChannelService.getUserChannels', { userId });

      // user_channels tablosundan language bilgisini de çek
      const { data: userChannels, error } = await supabaseAdmin
        .from('user_channels')
        .select(`
          id,
          language,
          channels (
            id,
            title,
            description,
            thumbnail_url,
            subscriber_count,
            video_count,
            language,
            last_checked,
            created_at,
            updated_at
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching user channels:', { error });
        throw error;
      }

      if (!userChannels || userChannels.length === 0) {
        logger.info('No channels found for user', { userId });
        return [];
      }

      // Her kanal için videoları ayrı çek
      const channels = await Promise.all(
        (userChannels as unknown as UserChannelResponse[]).map(async (userChannel) => {
          const channel = userChannel.channels;
          
          // Kanalın videolarını çek
          const { data: channelVideos, error: videoError } = await supabaseAdmin
            .from('channel_videos')
            .select(`
              id,
              video_id,
              channel_id,
              videos (
                video_id,
                title,
                description,
                thumbnail_url,
                view_count,
                published_at,
                like_count,
                comment_count,
                duration,
                channel_title
              )
            `)
            .eq('channel_id', channel.id)
            .limit(4);

          if (videoError) {
            logger.error('Error fetching channel videos:', { error: videoError, channelId: channel.id });
            return {
              ...channel,
              channel_videos: [],
              language: userChannel.language
            };
          }

          // Video verilerini doğru formata dönüştür ve tarihe göre sırala
          const formattedVideos = (channelVideos || [])
            .map((cv: any) => ({
              id: cv.id,
              video_id: cv.video_id,
              channel_id: cv.channel_id,
              title: cv.videos.title,
              description: cv.videos.description,
              thumbnail_url: cv.videos.thumbnail_url,
              published_at: cv.videos.published_at,
              view_count: cv.videos.view_count,
              like_count: cv.videos.like_count,
              comment_count: cv.videos.comment_count,
              duration: cv.videos.duration,
              channel_title: cv.videos.channel_title
            }))
            .sort((a: any, b: any) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()); // Sort by published_at desc

          return {
            id: channel.id,
            title: channel.title,
            description: channel.description,
            thumbnail_url: channel.thumbnail_url,
            subscriber_count: channel.subscriber_count,
            video_count: channel.video_count,
            language: userChannel.language,
            last_checked: channel.last_checked,
            created_at: channel.created_at,
            updated_at: channel.updated_at,
            channel_videos: formattedVideos
          };
        })
      );

      return channels;
    } catch (error) {
      logger.error('Error in ChannelService.getUserChannels:', { error });
      throw error;
    }
  }

  public async removeChannel(userId: string, channelId: string): Promise<void> {
    try {
      logger.info('ChannelService.removeChannel', { userId, channelId });
      
      // Remove user-channel relationship
      const { error } = await supabaseAdmin
        .from('user_channels')
        .delete()
        .eq('user_id', userId)
        .eq('channel_id', channelId);

      if (error) {
        logger.error('Error removing channel:', { error });
        throw error;
      }

      logger.info('Removed channel for user successfully', { channelId, userId });
    } catch (error) {
      logger.error('Error in ChannelService.removeChannel:', { error });
      throw error;
    }
  }

  public async getChannelById(channelId: string): Promise<Channel | null> {
    try {
      logger.info('ChannelService.getChannelById', { channelId });

      // Get channel with videos
      const { data: channel, error } = await supabaseAdmin
        .from('channels')
        .select(`
          id,
          title,
          description,
          thumbnail_url,
          subscriber_count,
          video_count,
          view_count,
          language,
          last_checked,
          created_at,
          updated_at,
          channel_videos!inner (
            id,
            video_id,
            channel_id,
            videos!inner (
              title,
              description,
              thumbnail_url,
              published_at,
              view_count,
              like_count,
              comment_count,
              duration,
              channel_title
            )
          )
        `)
        .eq('id', channelId)
        .single();

      if (error) {
        logger.error('Error fetching channel:', { error });
        throw error;
      }

      if (!channel) {
        logger.info('Channel not found', { channelId });
        return null;
      }

      // Transform channel_videos data to match interface and sort by published_at
      const transformedChannel = {
        ...channel,
        channel_videos: channel.channel_videos
          .filter((cv: any) => cv.videos) // Filter out any null videos
          .map((cv: any) => ({
            id: cv.id,
            video_id: cv.video_id,
            channel_id: cv.channel_id,
            title: cv.videos.title,
            description: cv.videos.description,
            thumbnail_url: cv.videos.thumbnail_url,
            published_at: cv.videos.published_at,
            view_count: cv.videos.view_count,
            like_count: cv.videos.like_count,
            comment_count: cv.videos.comment_count,
            duration: cv.videos.duration,
            channel_title: cv.videos.channel_title
          }))
          .sort((a: any, b: any) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()) // Sort by published_at desc
      };

      // Get fresh data from YouTube and update videos
      try {
        // Update channel info from YouTube
        const youtubeData = await this.youtubeService.getChannelDetails(channelId);
        
        // Update channel with fresh data
        const { data: updatedChannel, error: updateError } = await supabaseAdmin
          .from('channels')
          .update({
            title: youtubeData.title,
            description: youtubeData.description,
            thumbnail_url: youtubeData.thumbnail_url,
            subscriber_count: youtubeData.subscriber_count,
            video_count: youtubeData.video_count,
            language: youtubeData.language,
            last_checked: new Date().toISOString()
          })
          .eq('id', channelId)
          .select(`
            id,
            title,
            description,
            thumbnail_url,
            subscriber_count,
            video_count,
            view_count,
            language,
            last_checked,
            created_at,
            updated_at
          `)
          .single();

        if (updateError) {
          logger.error('Error updating channel with fresh data:', { error: updateError });
          return transformedChannel; // Return old data if update fails
        }

        // Refresh videos in background
        this.refreshChannelVideos(channelId).catch(error => {
          logger.error('Error refreshing videos in background:', { error });
        });

        logger.info('Channel details updated:', {
          channelId,
          title: updatedChannel.title,
          subscriberCount: updatedChannel.subscriber_count,
          videoCount: updatedChannel.video_count,
          viewCount: updatedChannel.view_count
        });

        return {
          ...updatedChannel,
          channel_videos: transformedChannel.channel_videos
        };
      } catch (youtubeError) {
        logger.error('Error fetching fresh YouTube data:', { error: youtubeError });
        return transformedChannel; // Return old data if YouTube API fails
      }
    } catch (error) {
      logger.error('Error in ChannelService.getChannelById:', { error });
      throw error;
    }
  }

  public async getChannelVideos(channelId: string): Promise<ChannelVideo[]> {
    try {
      logger.info('Fetching videos for channel:', { channelId });
      
      const { data: results, error } = await supabase
        .from('channel_videos')
        .select(`
          id,
          video_id,
          channel_id,
          has_summary,
          videos!inner (
            title,
            description,
            thumbnail_url,
            published_at,
            view_count,
            like_count,
            comment_count,
            duration,
            channel_title
          )
        `)
        .eq('channel_id', channelId);

      if (error) {
        logger.error('Error fetching videos:', { error });
        throw error;
      }

      if (!results || results.length === 0) {
        logger.info('No videos found for channel:', { channelId });
        return [];
      }

      logger.info('Found videos for channel:', { channelId, count: results.length });

      const typedResults = results as unknown as VideoQueryResult[];
      return typedResults.map(result => ({
        id: result.id,
        video_id: result.video_id,
        channel_id: result.channel_id,
        title: result.videos.title,
        description: result.videos.description,
        thumbnail_url: result.videos.thumbnail_url,
        published_at: result.videos.published_at,
        view_count: result.videos.view_count,
        like_count: result.videos.like_count,
        comment_count: result.videos.comment_count,
        duration: result.videos.duration,
        channel_title: result.videos.channel_title
      }));

    } catch (error) {
      logger.error('Error in getChannelVideos:', { channelId, error });
      throw AppError.internal('FETCH_VIDEOS_ERROR', 'Failed to fetch channel videos');
    }
  }

  public async getChannelDetails(userId: string, channelId: string): Promise<Channel> {
    try {
      logger.info('ChannelService.getChannelDetails', { userId, channelId });

      // Check if user has access to this channel
      const { data: userChannel, error: userChannelError } = await supabaseAdmin
        .from('user_channels')
        .select('*')
        .eq('user_id', userId)
        .eq('channel_id', channelId)
        .single();

      if (userChannelError || !userChannel) {
        logger.error('User does not have access to this channel:', { channelId, userId });
        throw AppError.badRequest('UNAUTHORIZED', 'You do not have access to this channel');
      }

      // Get channel details from database with videos
      const { data: channel, error: channelError } = await supabaseAdmin
        .from('channels')
        .select(`
          *,
          channel_videos (
            video_id,
            videos (
              id,
              title,
              description,
              thumbnail_url,
              view_count,
              published_at
            )
          )
        `)
        .eq('id', channelId)
        .single();

      if (channelError || !channel) {
        logger.error('Channel not found:', { channelId });
        throw AppError.notFound('CHANNEL_NOT_FOUND', 'Channel not found');
      }

      // Get fresh data from YouTube
      try {
        const youtubeData = await this.youtubeService.getChannelDetails(channelId);

        // Update channel with fresh data
        const { data: updatedChannel, error: updateError } = await supabaseAdmin
          .from('channels')
          .update({
            title: youtubeData.title,
            description: youtubeData.description,
            thumbnail_url: youtubeData.thumbnail_url,
            subscriber_count: youtubeData.subscriber_count,
            video_count: youtubeData.video_count,
            language: youtubeData.language,
            last_checked: new Date().toISOString()
          })
          .eq('id', channelId)
          .select(`
            *,
            channel_videos (
              video_id,
              videos (
                id,
                title,
                description,
                thumbnail_url,
                view_count,
                published_at
              )
            )
          `)
          .single();

        if (updateError) {
          logger.error('Error updating channel with fresh data:', { error: updateError });
          return channel; // Return old data if update fails
        }

        logger.info('Channel details:', {
          channelId,
          title: updatedChannel.title,
          videoCount: updatedChannel.channel_videos?.length || 0
        });

        return updatedChannel;
      } catch (youtubeError) {
        logger.error('Error fetching fresh YouTube data:', { error: youtubeError });
        return channel; // Return old data if YouTube API fails
      }
    } catch (error) {
      logger.error('Error in ChannelService.getChannelDetails:', { error });
      throw error;
    }
  }

  public async refreshChannelVideos(channelId: string): Promise<void> {
    try {
      logger.info('Refreshing videos for channel:', { channelId });

      // Get channel details first
      const { data: channel } = await supabaseAdmin
        .from('channels')
        .select('title')
        .eq('id', channelId)
        .single();

      if (!channel) {
        throw new Error('Channel not found');
      }
      
      // Get user language preferences for this channel
      const { data: userChannels } = await supabaseAdmin
        .from('user_channels')
        .select('language')
        .eq('channel_id', channelId);
        
      // Kullanıcıların dil tercihleri
      const languagePreferences = userChannels?.map(uc => uc.language) || [];
      
      // Benzersiz dil tercihleri
      const uniqueLanguages = [...new Set(languagePreferences)];
      
      logger.info('Channel language preferences:', {
        channelId,
        languagePreferences: uniqueLanguages
      });

      // Get latest videos from YouTube
      const videos = await this.youtubeService.getChannelVideos(channelId, 2);
      
      if (videos && videos.length > 0) {
        // First, insert into videos table
        const videoData = videos.map(video => ({
          video_id: video.id,
          title: video.title,
          description: video.description,
          thumbnail_url: video.thumbnail_url,
          published_at: video.publishedAt,
          view_count: video.viewCount || 0,
          like_count: video.likeCount || 0,
          comment_count: video.commentCount || 0,
          duration: video.duration,
          channel_id: channelId,
          channel_title: channel.title
        }));

        logger.info('Upserting videos:', {
          channelId,
          videoCount: videoData.length,
          videoIds: videoData.map(v => v.video_id)
        });

        // Upsert videos
        const { error: videoError } = await supabaseAdmin
          .from('videos')
          .upsert(videoData, {
            onConflict: 'video_id'
          });

        if (videoError) {
          logger.error('Error upserting videos:', { error: videoError });
          throw videoError;
        }

        // Then, create channel_videos relationships
        const channelVideoData = videos.map(video => {
          const data: any = {
            channel_id: channelId,
            video_id: video.id
          };
          
          // Kullanıcıların tercih ettiği dillere göre flag'leri false olarak ayarla
          if (uniqueLanguages.includes('tr')) {
            data.tr_has_summary = false;
          }
          
          if (uniqueLanguages.includes('en')) {
            data.en_has_summary = false;
          }
          
          return data;
        });

        logger.info('Upserting channel_videos relationships:', {
          channelId,
          relationshipCount: channelVideoData.length,
          relationships: channelVideoData,
          languageFlags: {
            tr: uniqueLanguages.includes('tr'),
            en: uniqueLanguages.includes('en')
          }
        });

        // Upsert channel_videos relationships
        const { error: channelVideoError } = await supabaseAdmin
          .from('channel_videos')
          .upsert(channelVideoData, {
            onConflict: 'channel_id,video_id'
          });

        if (channelVideoError) {
          logger.error('Error upserting channel_videos:', { error: channelVideoError });
          throw channelVideoError;
        }

        logger.info('Successfully refreshed videos for channel:', { 
          channelId, 
          videoCount: videos.length,
          videoIds: videos.map(v => v.id)
        });
      } else {
        logger.warn('No videos found for channel:', { channelId });
      }
    } catch (error) {
      logger.error('Error refreshing channel videos:', { 
        error,
        channelId,
        errorDetails: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
} 