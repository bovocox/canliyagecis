import logger from '../utils/logger';
import { AppError } from '../utils/appError';
import apiKeys from '../config/api_keys.json';
import fs from 'fs';
import path from 'path';

interface YouTubeKey {
  key: string;
  quota_used: number;
  last_reset: string;
  quota_limit: number;
  error_count: number;
  last_error: string | null;
  is_active: boolean;
  last_checked: string;
}

interface YouTubeConfig {
  youtube: {
    keys: YouTubeKey[];
    current_index: number;
    quota_reset_time: string;
    daily_quota_limit: number;
  }
}

export class YouTubeKeyService {
  private configPath: string;
  private config: YouTubeConfig;

  constructor() {
    this.configPath = path.join(__dirname, '../config/api_keys.json');
    this.config = apiKeys as YouTubeConfig;
    this.validateConfig();
  }

  private validateConfig(): void {
    const { youtube } = this.config;
    if (!youtube || !youtube.keys || youtube.keys.length === 0) {
      throw new Error('No YouTube API keys found in api_keys.json');
    }
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      logger.info('Updated API keys configuration');
    } catch (error) {
      logger.error('Failed to save API keys config:', error);
      throw new AppError('CONFIG_ERROR', 'Failed to update API keys configuration');
    }
  }

  public async getActiveKey(): Promise<string> {
    const { youtube } = this.config;
    let currentIndex = youtube.current_index;
    const startIndex = currentIndex;

    do {
      const keyInfo = youtube.keys[currentIndex];
      
      if (keyInfo.is_active && keyInfo.quota_used < keyInfo.quota_limit) {
        logger.info('Found active key', {
          keyPrefix: keyInfo.key.substring(0, 8),
          quotaUsed: keyInfo.quota_used,
          quotaLimit: keyInfo.quota_limit
        });
        return keyInfo.key;
      }

      // Try next key
      currentIndex = (currentIndex + 1) % youtube.keys.length;
      youtube.current_index = currentIndex;
      this.saveConfig();

      // If we've checked all keys and came back to start
      if (currentIndex === startIndex) {
        logger.error('No active YouTube API keys available');
        throw new AppError('API_KEY_ERROR', 'No active YouTube API keys available');
      }
    } while (true);
  }

  public recordKeyUse(apiKey: string, quotaCost: number = 1): void {
    const keyInfo = this.config.youtube.keys.find(k => k.key === apiKey);
    if (keyInfo) {
      keyInfo.quota_used += quotaCost;
      keyInfo.last_checked = new Date().toISOString();
      this.saveConfig();
      logger.info('Recorded key usage', {
        keyPrefix: apiKey.substring(0, 8),
        quotaUsed: keyInfo.quota_used,
        quotaCost
      });
    }
  }

  public markKeyError(apiKey: string, error: string): void {
    const keyInfo = this.config.youtube.keys.find(k => k.key === apiKey);
    if (keyInfo) {
      keyInfo.error_count = (keyInfo.error_count || 0) + 1;
      keyInfo.last_error = error;
      keyInfo.last_checked = new Date().toISOString();

      // Disable key if too many errors
      if (keyInfo.error_count >= 3) {
        keyInfo.is_active = false;
        logger.error('Disabling YouTube API key due to errors', {
          keyPrefix: apiKey.substring(0, 8),
          errorCount: keyInfo.error_count
        });
      }

      this.saveConfig();
    }
  }

  public resetQuotas(): void {
    for (const keyInfo of this.config.youtube.keys) {
      keyInfo.quota_used = 0;
      keyInfo.error_count = 0;
      keyInfo.last_error = null;
      keyInfo.is_active = true;
      keyInfo.last_reset = new Date().toISOString();
      keyInfo.last_checked = new Date().toISOString();
    }
    this.saveConfig();
    logger.info('Reset all YouTube API key quotas');
  }
} 