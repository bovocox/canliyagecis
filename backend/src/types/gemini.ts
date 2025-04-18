export interface GeminiKeyInfo {
  key: string;
  is_active: boolean;
  error_count: number;
  last_error: string | null;
  rate_limit_minute: number;
  last_checked: string | null;
  quota_used?: number;
}

export interface HealthCheckResult {
  key: string;
  isHealthy: boolean;
  responseTime: number;
  error?: string;
  checkedAt: string;
  quotaUsed: number;
  quotaLimit: number;
  quotaRemaining: number;
  rateLimitInfo?: {
    remaining: number;
    limit: number;
    reset: string;
  };
}

export type GeminiErrorType = 
  | 'RATE_LIMIT_EXCEEDED'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_KEY'
  | 'BAD_REQUEST'
  | 'FORBIDDEN'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR'; 