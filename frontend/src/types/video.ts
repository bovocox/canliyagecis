export interface TranscriptItem {
  time: string;
  text: string;
}

export interface VideoData {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  url: string;
  date: string;
  views: string;
  duration: string;
  transcript: string;
  transcriptPreview: string;
  summary: string;
  summaryPreview: string;
  formatted_text: string;
  loading: boolean | {
    transcript?: boolean;
    summary?: boolean;
    [key: string]: boolean | undefined;
  };
  error: string | null;
}

export interface VideoSummary {
  id: string;
  channelName: string;
  channelAvatar: string;
  videoTitle: string;
  videoThumbnail: string;
  summary: string;
  publishedAt: string;
  videoUrl: string;
  isRead: boolean;
  language: string;
} 