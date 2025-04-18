// Script to fix channel IDs in the database
// This will:
// 1. For each channel in the channels table
// 2. Generate a new UUID
// 3. Update related tables to use the new UUID
// 4. Update the channel record to use UUID for id and move the YouTube ID to youtube_id field

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Connect to Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:3000';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'your-service-key';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixChannelIds() {
  console.log('Starting channel ID fix script...');
  
  try {
    // Get all channels
    const { data: channels, error } = await supabase
      .from('channels')
      .select('*');
    
    if (error) {
      throw error;
    }
    
    console.log(`Found ${channels.length} channels to process`);
    
    // Process each channel
    for (const channel of channels) {
      console.log(`Processing channel: ${channel.id} (${channel.title || 'No title'})`);
      
      // If youtube_id already has a value and id is a UUID, skip
      if (channel.youtube_id && isUUID(channel.id)) {
        console.log(`Channel ${channel.id} already has correct format, skipping`);
        continue;
      }
      
      // Generate new UUID
      const newUUID = crypto.randomUUID();
      
      // Save original ID as it contains the YouTube channel ID
      const youtubeId = channel.id;
      
      console.log(`Updating channel ${channel.id} to UUID ${newUUID}, youtube_id=${youtubeId}`);
      
      // Begin transaction for the update
      // 1. Update user_channels references
      const { error: userChannelError } = await supabase
        .from('user_channels')
        .update({ channel_id: newUUID })
        .eq('channel_id', channel.id);
      
      if (userChannelError) {
        console.error(`Error updating user_channels for channel ${channel.id}:`, userChannelError);
        continue;
      }
      
      // 2. Update channel_videos references
      const { error: channelVideoError } = await supabase
        .from('channel_videos')
        .update({ channel_id: newUUID })
        .eq('channel_id', channel.id);
      
      if (channelVideoError) {
        console.error(`Error updating channel_videos for channel ${channel.id}:`, channelVideoError);
        continue;
      }
      
      // 3. Update videos references
      const { error: videoError } = await supabase
        .from('videos')
        .update({ channel_id: newUUID })
        .eq('channel_id', channel.id);
      
      if (videoError) {
        console.error(`Error updating videos for channel ${channel.id}:`, videoError);
        continue;
      }
      
      // 4. Update the channel record itself
      const { error: channelError } = await supabase
        .from('channels')
        .update({ 
          id: newUUID,
          youtube_id: youtubeId
        })
        .eq('id', channel.id);
      
      if (channelError) {
        console.error(`Error updating channel ${channel.id}:`, channelError);
        continue;
      }
      
      console.log(`Successfully updated channel ${youtubeId} to use UUID ${newUUID}`);
    }
    
    console.log('Channel ID fix script completed successfully!');
    
  } catch (error) {
    console.error('Error in fix script:', error);
  }
}

// Helper function to check if a string is a UUID
function isUUID(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Run the script
fixChannelIds(); 