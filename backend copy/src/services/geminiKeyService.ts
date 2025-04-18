import { GeminiKeyInfo } from '../types/gemini';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

class GeminiKeyService {
  private keys: GeminiKeyInfo[] = [];
  private currentKeyIndex: number = 0;
  private lastKeyUseTimes: { [key: string]: Date[] } = {};
  private keyRotationInterval: number = 5000; // 5 seconds
  private apiKeysFilePath: string;

  constructor() {
    // Path to the API keys file
    this.apiKeysFilePath = path.resolve(process.cwd(), 'src/config/api_keys.json');
    
    // Initialize with keys from JSON file
    this.loadApiKeys();
    
    // Start key reactivation task
    setInterval(() => this.reactivateKeys(), 21600000); // Check every 6 hours
  }

  /**
   * Load API keys from JSON file
   */
  private loadApiKeys(): void {
    try {
      // Read the API keys file
      const apiKeysData = JSON.parse(fs.readFileSync(this.apiKeysFilePath, 'utf8'));
      
      if (!apiKeysData.gemini || !apiKeysData.gemini.keys || !Array.isArray(apiKeysData.gemini.keys)) {
        console.error('Invalid API keys file format or missing Gemini keys');
        return;
      }
      
      // Update current index if it exists in the file
      if (typeof apiKeysData.gemini.current_index === 'number') {
        this.currentKeyIndex = apiKeysData.gemini.current_index;
      }
      
      // Map the keys to our internal format
      this.keys = apiKeysData.gemini.keys.map((key: any) => ({
        key: key.key,
        is_active: key.is_active !== false, // Default to true if not specified
        error_count: key.error_count || 0,
        last_error: key.last_error || null,
        rate_limit_minute: key.rate_limit_minute || 60, // Default limit
        last_checked: key.last_checked || null,
        quota_used: key.quota_used || 0
      }));

      console.log(`Loaded ${this.keys.length} Gemini API keys from ${this.apiKeysFilePath}`);
    } catch (error: any) {
      console.error('Error loading API keys from file:', error);
      this.keys = []; // Reset to empty array on error
    }
  }

  /**
   * Save API keys to JSON file
   */
  private saveApiKeys(): void {
    try {
      // Read the current file to update only the Gemini section
      const apiKeysData = JSON.parse(fs.readFileSync(this.apiKeysFilePath, 'utf8'));
      
      // Update the Gemini section
      apiKeysData.gemini = {
        ...apiKeysData.gemini,
        keys: this.keys,
        current_index: this.currentKeyIndex
      };
      
      // Write back to file
      fs.writeFileSync(
        this.apiKeysFilePath, 
        JSON.stringify(apiKeysData, null, 2),
        'utf8'
      );
    } catch (error: any) {
      console.error('Error saving API keys to file:', error);
    }
  }

  /**
   * Kullanılabilir durumdaki bir API anahtarını döndürür
   */
  async getActiveKey(): Promise<string> {
    if (this.keys.length === 0) {
      throw new Error('No API keys available');
    }

    // Find the next active key
    let startIndex = this.currentKeyIndex;
    let keysChecked = 0;

    while (keysChecked < this.keys.length) {
      const keyInfo = this.keys[this.currentKeyIndex];
      
      // Move to the next key for next time
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
      keysChecked++;
      
      if (keyInfo.is_active) {
        // Save the updated current index
        this.saveApiKeys();
        return keyInfo.key;
      }
    }

    // If we get here, no active keys were found
    throw new Error('All API keys are currently disabled');
  }

  /**
   * Bir API anahtarının kullanımını kaydeder
   * @param key API anahtarı
   */
  async recordKeyUse(key: string): Promise<void> {
    const now = new Date();
    
    // Initialize array for this key if it doesn't exist
    if (!this.lastKeyUseTimes[key]) {
      this.lastKeyUseTimes[key] = [];
    }
    
    // Add current time to the usage history
    this.lastKeyUseTimes[key].push(now);
    
    // Clean up old records (older than 1 minute)
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    this.lastKeyUseTimes[key] = this.lastKeyUseTimes[key].filter(
      time => time > oneMinuteAgo
    );
    
    // Update key info
    const keyInfo = this.keys.find(k => k.key === key);
    if (keyInfo) {
      keyInfo.quota_used = (keyInfo.quota_used || 0) + 1;
      keyInfo.last_checked = now.toISOString();
      
      // Check if we've exceeded the rate limit
      if (this.lastKeyUseTimes[key].length >= keyInfo.rate_limit_minute) {
        keyInfo.is_active = false;
        keyInfo.last_error = 'RATE_LIMIT_EXCEEDED';
        console.warn(`API key ${key.substring(0, 5)}... has reached its rate limit and has been temporarily disabled`);
      }
      
      // Save changes to file
      this.saveApiKeys();
    }
  }

  /**
   * Bir API anahtarında oluşan hatayı kaydeder
   * @param key API anahtarı
   * @param errorType Hata türü
   */
  async markKeyError(key: string, errorType: string): Promise<void> {
    const keyInfo = this.keys.find(k => k.key === key);
    
    if (keyInfo) {
      keyInfo.error_count++;
      keyInfo.last_error = errorType;
      keyInfo.last_checked = new Date().toISOString();
      
      // Disable key for certain error types
      if (
        errorType === 'INVALID_KEY' || 
        errorType === 'QUOTA_EXCEEDED' ||
        errorType === 'RATE_LIMIT_EXCEEDED' ||
        errorType === 'FORBIDDEN' ||
        keyInfo.error_count >= 5 // Disable after 5 consecutive errors
      ) {
        keyInfo.is_active = false;
        console.warn(`API key ${key.substring(0, 5)}... has been disabled due to error: ${errorType}`);
      }
      
      // Save changes to file
      this.saveApiKeys();
    }
  }

  /**
   * Devre dışı kalmış anahtarları yeniden aktifleştirir
   */
  async reactivateKeys(): Promise<void> {
    let hasChanges = false;
    const now = new Date();
    
    for (const keyInfo of this.keys) {
      // Skip already active keys
      if (keyInfo.is_active) continue;
      
      // Check if the key was disabled due to rate limits
      if (keyInfo.last_error === 'RATE_LIMIT_EXCEEDED') {
        // Check if we have usage data for this key
        const keyUsage = this.lastKeyUseTimes[keyInfo.key] || [];
        
        // If usage in the last minute is below the limit, reactivate
        if (keyUsage.length < keyInfo.rate_limit_minute) {
          keyInfo.is_active = true;
          keyInfo.error_count = 0;
          keyInfo.last_error = null;
          keyInfo.last_checked = now.toISOString();
          hasChanges = true;
          console.log(`API key ${keyInfo.key.substring(0, 5)}... has been reactivated after rate limit cooling period`);
        }
      } 
      // For other error types, reactivate after some time
      else if (keyInfo.last_error && keyInfo.last_error !== 'INVALID_KEY' && keyInfo.last_error !== 'QUOTA_EXCEEDED') {
        // Reactivate errors except for invalid keys or quota exceeded after 5 minutes
        const lastErrorTime = keyInfo.last_checked ? new Date(keyInfo.last_checked) : new Date(0);
        if ((now.getTime() - lastErrorTime.getTime()) > 5 * 60 * 1000) {
          keyInfo.is_active = true;
          keyInfo.error_count = 0;
          keyInfo.last_error = null;
          keyInfo.last_checked = now.toISOString();
          hasChanges = true;
          console.log(`API key ${keyInfo.key.substring(0, 5)}... has been reactivated after error cooling period`);
        }
      }
    }
    
    // Save changes if any keys were reactivated
    if (hasChanges) {
      this.saveApiKeys();
    }
    
    // Log summary of active keys only if there was a change
    if (hasChanges) {
      const activeKeyCount = this.keys.filter(k => k.is_active).length;
      logger.debug(`${activeKeyCount}/${this.keys.length} API keys are currently active`);
    }
  }

  /**
   * Bir API anahtarının durumunu rapor eder
   * @param key API anahtarı
   */
  async getKeyStatus(key: string): Promise<GeminiKeyInfo> {
    const keyInfo = this.keys.find(k => k.key === key);
    
    if (!keyInfo) {
      throw new Error(`API key not found: ${key.substring(0, 5)}...`);
    }
    
    return { ...keyInfo };
  }

  /**
   * Tüm API anahtarlarının durumunu rapor eder
   */
  async getAllKeysStatus(): Promise<GeminiKeyInfo[]> {
    return this.keys.map(keyInfo => ({
      ...keyInfo,
      key: `${keyInfo.key.substring(0, 5)}...${keyInfo.key.substring(keyInfo.key.length - 3)}` // Mask the key for security
    }));
  }
}

export default GeminiKeyService; 