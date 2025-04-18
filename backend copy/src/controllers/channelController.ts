import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import logger from '../utils/logger';
import { CustomRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { google } from 'googleapis';
// Import existing services
import { ChannelService } from '../services/channel.service';
import { AppError } from '../utils/appError';

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

// Create an instance of the service
const channelService = new ChannelService();

const handleError = (error: any, res: Response) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  return res.status(500).json({ message: 'Internal server error' });
};

export const getChannels = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Use the channel service to get user channels
    const channels = await channelService.getUserChannels(userId);
    res.json(channels);
  } catch (error) {
    logger.error('Error fetching channels:', error);
    res.status(500).json({ message: 'Error fetching channels' });
  }
};

export const getChannelById = async (req: CustomRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const userId = req.user?.id;

    logger.info('Getting channel by ID:', { channelId, userId });

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!channelId) {
      throw AppError.badRequest('MISSING_CHANNEL_ID', 'Channel ID is required');
    }

    // First check if this is a handle and get the actual channel ID
    let actualChannelId = channelId;
    
    // If it's not a YouTube channel ID format (UC...), treat it as a handle
    if (!channelId.startsWith('UC')) {
      const handle = channelId.startsWith('@') ? channelId : `@${channelId}`;
      const channelIdFromHandle = await channelService.getChannelIdFromHandle(handle);
      if (!channelIdFromHandle) {
        throw AppError.notFound('CHANNEL_NOT_FOUND', 'Channel not found');
      }
      actualChannelId = channelIdFromHandle;
      logger.info('Converted handle to channel ID:', { handle, actualChannelId });
    }

    try {
      // Check if user has access to this channel
      const { data: userChannel, error: userChannelError } = await supabaseAdmin
        .from('user_channels')
        .select('*')
        .eq('user_id', userId)
        .eq('channel_id', actualChannelId)
        .single();

      if (userChannelError) {
        logger.error('Error checking user channel access:', { error: userChannelError });
        return res.status(500).json({ message: 'Error checking channel access' });
      }

      if (!userChannel) {
        return res.status(403).json({ message: 'You do not have access to this channel' });
      }

      // Get channel details
      const channelDetails = await channelService.getChannelById(actualChannelId);
      if (!channelDetails) {
        throw AppError.notFound('CHANNEL_NOT_FOUND', 'Channel not found');
      }

      logger.info('Channel details retrieved:', { 
        channelId: actualChannelId,
        title: channelDetails.title,
        videoCount: channelDetails.channel_videos?.length || 0
      });

      // Then refresh videos in the background
      channelService.refreshChannelVideos(actualChannelId)
        .catch(error => {
          logger.error('Error refreshing channel videos:', { error, channelId: actualChannelId });
        });

      return res.json(channelDetails);
    } catch (innerError) {
      logger.error('Error in channel operations:', { 
        error: innerError,
        channelId: actualChannelId,
        errorDetails: innerError instanceof Error ? innerError.message : 'Unknown error'
      });
      throw innerError;
    }
  } catch (error) {
    logger.error('Error in getChannelById:', { 
      error,
      channelId: req.params.channelId,
      errorDetails: error instanceof Error ? error.message : 'Unknown error'
    });
    return handleError(error, res);
  }
};

export const addChannel = async (req: CustomRequest, res: Response) => {
  try {
    const { channelUrl, language } = req.body;
    const userId = req.user?.id;

    logger.info('Adding new channel:', { channelUrl, language, userId });

    if (!userId) {
      logger.error('Unauthorized: No user ID found');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!channelUrl) {
      logger.error('Bad request: No channel URL provided');
      return res.status(400).json({ message: 'Channel URL is required' });
    }

    // Varsayılan dil (kullanıcı bir dil belirtmediyse)
    const userLanguage = language || 'tr';

    // URL basit bir handle olabilir (@ ile başlayan)
    if (!channelUrl.startsWith('@') && !channelUrl.startsWith('http')) {
      // Bu bir tam URL değil, bu yüzden @ ile başlayan bir handle olduğunu varsayalım
      try {
        // Use the channel service to add the channel with @ prefix
        const channel = await channelService.addChannel(userId, `@${channelUrl}`, userLanguage);
        logger.info('Channel added successfully:', { channelId: channel.id, language: userLanguage });
        return res.status(201).json(channel);
      } catch (error: any) {
        // Handle specific errors for handles
        if (error instanceof AppError) {
          return res.status(error.statusCode).json({ message: error.message });
        }
        throw error; // Re-throw for general error handling
      }
    }

    // Handle for regular URLs
    try {
      if (!channelUrl.startsWith('@')) {
        // Validate URL format for non-handle inputs
        try {
          new URL(channelUrl);
        } catch (error) {
          logger.error('Invalid URL format:', { channelUrl, error });
          return res.status(400).json({ message: 'Invalid channel URL format' });
        }
      }

      // Use the channel service to add the channel with specified language
      const channel = await channelService.addChannel(userId, channelUrl, userLanguage);
      logger.info('Channel added successfully:', { channelId: channel.id, language: userLanguage });
      return res.status(201).json(channel);
    } catch (error: any) {
      if (error instanceof AppError) {
        logger.error('AppError occurred while adding channel:', { 
          error: error.message, 
          code: error.code,
          statusCode: error.statusCode
        });
        return res.status(error.statusCode).json({ message: error.message, code: error.code });
      }
      
      // Type assertion for legacy error handling (if any)
      const serviceError = error as Error;
      
      if (serviceError.message === 'INVALID_URL') {
        logger.error('Invalid YouTube channel URL:', { channelUrl });
        return res.status(400).json({ message: 'Invalid YouTube channel URL' });
      }
      
      if (serviceError.message === 'CHANNEL_EXISTS') {
        logger.error('Channel already exists for this user:', { channelUrl, userId });
        return res.status(409).json({ message: 'You already follow this channel' });
      }
      
      if (serviceError.message === 'CHANNEL_NOT_FOUND') {
        logger.error('Channel not found:', { channelUrl });
        return res.status(404).json({ message: 'Channel not found with the provided URL' });
      }
      
      if (serviceError.message === 'INVALID_URL_TYPE') {
        logger.error('Invalid URL type (not a channel):', { channelUrl });
        return res.status(400).json({ message: 'The URL is for a video, not a channel. Please provide a channel URL.' });
      }
      
      // Re-throw other errors to be caught by the outer try-catch
      throw serviceError;
    }
  } catch (error) {
    logger.error('Error adding channel:', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({ message: 'Error adding channel' });
  }
};

export const deleteChannel = async (req: CustomRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Use the channel service to remove the channel
    await channelService.removeChannel(userId, channelId);
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting channel:', error);
    res.status(500).json({ message: 'Error deleting channel' });
  }
};

export const refreshChannelVideos = async (req: CustomRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user has access to this channel
    const { data: userChannel, error: userChannelError } = await supabaseAdmin
      .from('user_channels')
      .select('*')
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .single();

    if (userChannelError || !userChannel) {
      return res.status(403).json({ message: 'You do not have access to this channel' });
    }

    await channelService.refreshChannelVideos(channelId);
    
    // Get updated channel data
    const updatedChannel = await channelService.getChannelById(channelId);
    res.json(updatedChannel);
  } catch (error) {
    logger.error('Error refreshing channel videos:', { error });
    res.status(500).json({ message: 'Error refreshing channel videos' });
  }
};

export const updateChannelLanguage = async (req: CustomRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const { language } = req.body;
    const userId = req.user?.id;

    logger.info('Updating channel language preference:', { channelId, language, userId });

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!channelId) {
      throw AppError.badRequest('MISSING_CHANNEL_ID', 'Channel ID is required');
    }

    if (!language || !['tr', 'en'].includes(language)) {
      throw AppError.badRequest('INVALID_LANGUAGE', 'Valid language code is required (tr or en)');
    }

    // Check if user has access to this channel
    const { data: userChannel, error: userChannelError } = await supabaseAdmin
      .from('user_channels')
      .select('*')
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .single();

    if (userChannelError) {
      logger.error('Error checking user channel access:', { error: userChannelError });
      return res.status(500).json({ message: 'Error checking channel access' });
    }

    if (!userChannel) {
      return res.status(403).json({ message: 'You do not have access to this channel' });
    }

    // Update language preference
    const { error: updateError } = await supabaseAdmin
      .from('user_channels')
      .update({ language })
      .eq('user_id', userId)
      .eq('channel_id', channelId);

    if (updateError) {
      logger.error('Error updating channel language:', { error: updateError });
      return res.status(500).json({ message: 'Error updating channel language preference' });
    }

    logger.info('Channel language preference updated successfully:', { channelId, language });
    return res.json({ 
      message: 'Channel language preference updated successfully',
      language
    });
  } catch (error) {
    logger.error('Error in updateChannelLanguage:', { 
      error,
      channelId: req.params.channelId,
      errorDetails: error instanceof Error ? error.message : 'Unknown error'
    });
    return handleError(error, res);
  }
}; 