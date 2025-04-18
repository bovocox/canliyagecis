/**
 * API Service for VecizAI Application
 * This service handles all API calls to the backend
 */

// Types for API responses
export interface ApiResponse<T = any> {
  data?: T;
  status?: string;
  message?: string;
  error?: string;
}

export interface VideoInfo {
  id?: string;
  url?: string;
  title?: string;
  thumbnail?: string;
  channelName?: string;
  channelAvatar?: string;
  publishedAt?: string;
  video_id?: string;
  description?: string;
  duration?: string;
}

export interface TranscriptResponse {
  status: 'completed' | 'processing' | 'pending' | 'failed' | 'error';
  task_id?: string;
  formatted_text?: string;
  error?: string;
  message?: string;
  id?: string;
  transcript_id?: string;
}

export interface SummaryResponse {
  status: 'completed' | 'processing' | 'pending' | 'failed' | 'error';
  task_id?: string;
  content?: string;
  error?: string;
  waitingForTranscript?: boolean;
}

export interface ProcessingStatus {
  status: 'completed' | 'processing' | 'pending' | 'failed' | 'error' | 'not_found';
  task_id?: string;
  error?: string;
  formatted_text?: string;
  content?: string;
}

export class ApiService {
  private baseUrl: string;
  private authToken?: string;

  constructor(customApiBaseUrl?: string) {
    this.baseUrl = customApiBaseUrl || import.meta.env.VITE_API_URL || '';
  }

  /**
   * Set auth token for authenticated requests
   */
  setAuthToken(token: string) {
    this.authToken = token;
  }

  /**
   * Clear auth token
   */
  clearAuthToken() {
    this.authToken = undefined;
  }

  /**
   * Get default headers for requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Handle API errors
   */
  private async handleApiError(response: Response): Promise<never> {
    let errorMessage = `API Error: ${response.status} ${response.statusText}`;
    
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        if (errorData) {
          if (typeof errorData === 'string') {
            errorMessage = errorData;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.details) {
            errorMessage = errorData.details;
          } else if (errorData.code) {
            errorMessage = `Error code: ${errorData.code}`;
          } else {
            errorMessage = 'Video bilgileri alınamadı';
          }
        }
      } else {
        // If not JSON, try to get text content
        const textContent = await response.text();
        console.error('Non-JSON error response:', textContent);
        if (textContent) {
          errorMessage = textContent;
        }
      }
    } catch (e) {
      console.error('Error parsing API error response', e);
      errorMessage = 'Video bilgileri alınamadı';
    }

    // Add status code and more context to error
    const error = new Error(errorMessage);
    (error as any).statusCode = response.status;
    (error as any).originalResponse = response;
    
    // Log detailed error information
    console.error('API Error Details:', {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      message: errorMessage
    });
    
    throw error;
  }

  // TRANSCRIPT ENDPOINTS

  /**
   * Get transcript status
   */
  async getTranscriptStatus(videoId: string, language: string = 'en'): Promise<ProcessingStatus> {
    const response = await fetch(`${this.baseUrl}/api/transcripts/status/${videoId}?language=${language}`, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Create transcript from video
   */
  async createTranscriptFromVideo(params: { videoId: string, language?: string }): Promise<TranscriptResponse> {
    const response = await fetch(`${this.baseUrl}/api/transcripts/from-video`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Get transcript content
   */
  async getTranscript(videoId: string, language: string = 'en'): Promise<TranscriptResponse> {
    const response = await fetch(`${this.baseUrl}/api/transcripts/${videoId}?language=${language}`, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Poll for transcript status and handle creation if not found
   */
  async pollForTranscript(videoId: string, language: string = 'en'): Promise<TranscriptResponse> {
    try {
      // Check transcript status
      const statusData = await this.getTranscriptStatus(videoId, language);

      // Handle different status cases
      switch (statusData.status) {
        case 'completed':
          return {
            status: 'completed',
            formatted_text: statusData.formatted_text
          };

        case 'processing':
        case 'pending':
          return {
            status: statusData.status,
            task_id: statusData.task_id
          };

        case 'failed':
        case 'error':
          throw new Error(statusData.error || 'Transkript işleme sırasında bir hata oluştu.');

        case 'not_found':
          // Create new transcript if not found
          const createData = await this.createTranscriptFromVideo({ videoId, language });
          return {
            status: 'pending',
            task_id: createData.task_id
          };

        default:
          throw new Error(`Bilinmeyen transkript durumu: ${statusData.status}`);
      }
    } catch (error) {
      if (error instanceof Response && error.status === 404) {
        // Create new transcript if not found
        const createData = await this.createTranscriptFromVideo({ videoId, language });
        return {
          status: 'pending',
          task_id: createData.task_id
        };
      }
      throw error;
    }
  }

  // SUMMARY ENDPOINTS

  /**
   * Get summary status
   */
  async getSummaryStatus(videoId: string, language: string = 'en'): Promise<ProcessingStatus> {
    const response = await fetch(`${this.baseUrl}/api/summaries/status/${videoId}?language=${language}`, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Create summary from video
   */
  async createSummaryFromVideo(params: { videoId: string, language?: string, url?: string, transcript_id?: string }): Promise<SummaryResponse> {
    const response = await fetch(`${this.baseUrl}/api/summaries/from-video`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Get summary content
   */
  async getSummary(videoId: string, language: string = 'en'): Promise<SummaryResponse> {
    const response = await fetch(`${this.baseUrl}/api/summaries/${videoId}?language=${language}`, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Poll for summary status and handle creation if not found
   */
  async pollForSummary(videoId: string, language: string = 'en'): Promise<SummaryResponse> {
    try {
      // Check summary status
      const statusData = await this.getSummaryStatus(videoId, language);

      // Handle different status cases
      switch (statusData.status) {
        case 'completed':
          if (statusData.content) {
            return {
              status: 'completed',
              content: statusData.content
            };
          }
          // If no content in status, fetch full summary
          return await this.getSummary(videoId, language);

        case 'processing':
        case 'pending':
          return {
            status: statusData.status,
            task_id: statusData.task_id
          };

        case 'failed':
        case 'error':
          throw new Error(statusData.error || 'Özet oluşturma başarısız oldu.');

        case 'not_found':
          // Check if transcript exists and is completed
          const transcriptStatus = await this.getTranscriptStatus(videoId, language);
          if (transcriptStatus.status !== 'completed') {
            return {
              status: 'pending',
              waitingForTranscript: true
            };
          }
          // Create new summary if transcript is ready
          const createData = await this.createSummaryFromVideo({ videoId, language });
          return {
            status: 'pending',
            task_id: createData.task_id
          };

        default:
          throw new Error(`Bilinmeyen özet durumu: ${statusData.status}`);
      }
    } catch (error) {
      if (error instanceof Response && error.status === 404) {
        // Check transcript first
        const transcriptStatus = await this.getTranscriptStatus(videoId, language);
        if (transcriptStatus.status !== 'completed') {
          return {
            status: 'pending',
            waitingForTranscript: true
          };
        }
        // Create new summary if transcript is ready
        const createData = await this.createSummaryFromVideo({ videoId, language });
        return {
          status: 'pending',
          task_id: createData.task_id
        };
      }
      throw error;
    }
  }

  /**
   * Get available summaries
   */
  async getAvailableSummaries(params: { language?: string, limit?: number } = {}): Promise<SummaryResponse[]> {
    const queryParams = new URLSearchParams();
    
    if (params.language) {
      queryParams.append('language', params.language);
    }
    
    if (params.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    
    const response = await fetch(`${this.baseUrl}/api/summaries/public${queryString}`, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  // VIDEO ENDPOINTS

  /**
   * Get video info from URL
   */
  async getVideoFromUrl(url: string): Promise<VideoInfo> {
    try {
      const response = await fetch(`${this.baseUrl}/api/videos/from-url`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        return this.handleApiError(response);
      }

      const data = await response.json();
      if (!data) {
        throw new Error('Video bilgileri alınamadı');
      }

      return data;
    } catch (err) {
      console.error('Error in getVideoFromUrl:', err);
      if (err instanceof Error) {
        throw err;
      }
      throw new Error('Video bilgileri alınamadı');
    }
  }

  /**
   * Get video info by ID
   */
  async getVideo(videoId: string): Promise<VideoInfo> {
    const response = await fetch(`${this.baseUrl}/api/videos/${videoId}`, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      return this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Check if API is reachable
   */
  async checkApiConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      
      return response.ok;
    } catch (error) {
      console.error('API connection check failed', error);
      return false;
    }
  }

  async getRecentSummaries(limit: number = 4): Promise<ApiResponse<any[]>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/summaries/recent?limit=${limit}`, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        await this.handleApiError(response);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching recent summaries:', error);
      throw error;
    }
  }
}

// Export default instance
export default new ApiService(); 