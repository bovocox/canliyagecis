import axios from 'axios';
import GeminiKeyService from './geminiKeyService';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { HealthCheckResult } from '../types/gemini';
import logger from '../utils/logger';
import { HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

class GeminiHealthService {
  private apiKeyService: GeminiKeyService;
  private model = 'gemini-1.5-flash-8b';
  
  constructor() {
    this.apiKeyService = new GeminiKeyService();
  }

  /**
   * API anahtarlarının sağlık durumunu kontrol eder
   */
  async checkAllKeys(): Promise<HealthCheckResult[]> {
    try {
      const keys = await this.apiKeyService.getAllKeysStatus();
      const healthResults: HealthCheckResult[] = [];
      
      for (const keyInfo of keys) {
        const result = await this.checkKey(keyInfo.key);
        healthResults.push(result);
      }
      
      return healthResults;
    } catch (error: any) {
      console.error(`Error checking all keys: ${error.message}`);
      return [];
    }
  }

  /**
   * Belirli bir API anahtarının sağlık durumunu kontrol eder
   * @param key API anahtarı
   */
  async checkKey(key: string): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const maskedKey = this.maskKey(key);
    
    try {
      logger.info('Gemini API anahtarı kontrol ediliyor', { apiKey: maskedKey });
      
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({
        model: this.model,
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
        ],
      });

      // Basit ve tarafsız bir test mesajı
      const result = await model.generateContent("Lütfen sadece 'OK' yazarak yanıt verin. Bu bir API bağlantı testidir.");
      const response = await result.response;
      const responseText = response.text();
      const endTime = Date.now();
      const duration = endTime - startTime;

      logger.info('Gemini API anahtarı kontrolü tamamlandı', { 
        apiKey: maskedKey, 
        duration: `${duration}ms`,
        response: responseText.substring(0, 20) // Cevabın ilk 20 karakterini logla
      });

      return {
        key,
        isHealthy: responseText.includes('OK'),
        responseTime: duration,
        checkedAt: new Date().toISOString(),
        quotaUsed: 0,
        quotaLimit: 60,
        quotaRemaining: 60,
        rateLimitInfo: {
          remaining: 60,
          limit: 60,
          reset: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 saat sonra
        }
      };
    } catch (error: any) {
      const endTime = Date.now();
      const errorMessage = error.message || 'Unknown error';
      
      logger.warn(`API anahtarı sağlık kontrolü başarısız: ${maskedKey}`, { 
        error: errorMessage,
        responseTime: endTime - startTime
      });
      
      const isRateLimit = errorMessage.includes('429') || 
                         errorMessage.includes('RATE_LIMITED') ||
                         errorMessage.includes('quota exceeded');
      
      const quotaMatch = errorMessage.match(/Quota remaining: (\d+)/i);
      const quotaRemaining = quotaMatch ? parseInt(quotaMatch[1]) : 0;

      return {
        key: key,
        isHealthy: false,
        responseTime: endTime - startTime,
        error: errorMessage,
        checkedAt: new Date().toISOString(),
        quotaUsed: isRateLimit ? 60 : 0,
        quotaLimit: 60,
        quotaRemaining: isRateLimit ? 0 : quotaRemaining,
        rateLimitInfo: isRateLimit ? {
          remaining: 0,
          limit: 60,
          reset: new Date(Date.now() + 60000).toISOString()
        } : undefined
      };
    }
  }

  /**
   * Sağlık durumu özeti oluşturur
   */
  getHealthSummary(): string {
    return "This method would return a health summary of the Gemini API keys";
  }

  /**
   * API anahtarlarının kullanım istatistiklerini rapor eder
   */
  async getUsageStats(): Promise<any> {
    try {
      const keys = await this.apiKeyService.getAllKeysStatus();
      
      // Calculate total usage
      const totalKeys = keys.length;
      const activeKeys = keys.filter(k => k.is_active).length;
      const totalErrors = keys.reduce((sum, key) => sum + key.error_count, 0);
      const totalUsage = keys.reduce((sum, key) => sum + (key.quota_used || 0), 0);
      
      // Group errors by type
      const errorTypes: { [key: string]: number } = {};
      for (const key of keys) {
        if (key.last_error) {
          errorTypes[key.last_error] = (errorTypes[key.last_error] || 0) + 1;
        }
      }
      
      return {
        totalKeys,
        activeKeys,
        disabledKeys: totalKeys - activeKeys,
        totalErrors,
        totalUsage,
        errorTypes,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error(`Error getting usage stats: ${error.message}`);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * API anahtarı problemlerini tespit eder
   */
  async detectKeyIssues(): Promise<any> {
    try {
      const keys = await this.apiKeyService.getAllKeysStatus();
      const healthChecks = await this.checkAllKeys();
      
      // Match health checks with key info
      const keyIssues = [];
      
      for (const keyInfo of keys) {
        const healthCheck = healthChecks.find(h => h.key === this.maskKey(keyInfo.key));
        
        if (!keyInfo.is_active || (healthCheck && !healthCheck.isHealthy)) {
          keyIssues.push({
            key: this.maskKey(keyInfo.key),
            is_active: keyInfo.is_active,
            error_count: keyInfo.error_count,
            last_error: keyInfo.last_error,
            health_status: healthCheck ? 
              (healthCheck.isHealthy ? 'healthy' : 'unhealthy') : 
              'unknown',
            response_time: healthCheck?.responseTime,
            quota_remaining: healthCheck?.quotaRemaining,
            issue_severity: this.calculateIssueSeverity(keyInfo, healthCheck)
          });
        }
      }
      
      return {
        total_issues: keyIssues.length,
        issues: keyIssues,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error(`Error detecting key issues: ${error.message}`);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Mask API key for security reasons
   * @param key API key
   */
  private maskKey(key: string): string {
    if (!key || key.length < 8) return key;
    return `${key.substring(0, 5)}...${key.substring(key.length - 3)}`;
  }

  /**
   * Calculate issue severity based on key info and health check
   */
  private calculateIssueSeverity(keyInfo: any, healthCheck?: HealthCheckResult): 'low' | 'medium' | 'high' | 'critical' {
    if (!keyInfo.is_active && (keyInfo.last_error === 'INVALID_KEY' || keyInfo.last_error === 'QUOTA_EXCEEDED')) {
      return 'critical';
    }
    
    if (!keyInfo.is_active) {
      return 'high';
    }
    
    if (healthCheck && !healthCheck.isHealthy) {
      return 'medium';
    }
    
    if (keyInfo.error_count > 0) {
      return 'low';
    }
    
    return 'low';
  }
}

export default GeminiHealthService; 