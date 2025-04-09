interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'ERROR' | 'WARN' | 'DEBUG';
  message: string;
  data?: any;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;

  constructor() {
    // Load existing logs from localStorage
    const savedLogs = localStorage.getItem('app_logs');
    if (savedLogs) {
      try {
        this.logs = JSON.parse(savedLogs);
      } catch (e) {
        console.error('Failed to load logs from localStorage:', e);
        this.logs = [];
      }
    }
  }

  private formatMessage(level: LogEntry['level'], message: string, data?: any): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
  }

  private addLog(log: LogEntry) {
    this.logs.push(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    try {
      localStorage.setItem('app_logs', JSON.stringify(this.logs));
    } catch (e) {
      console.error('Failed to save logs to localStorage:', e);
    }
  }

  info(message: string, data?: any) {
    const log = this.formatMessage('INFO', message, data);
    console.log(`%c[${log.timestamp}] [INFO] ${message}`, 'color: #2196F3', data || '');
    this.addLog(log);
  }

  error(message: string, data?: any) {
    const log = this.formatMessage('ERROR', message, data);
    console.error(`%c[${log.timestamp}] [ERROR] ${message}`, 'color: #f44336', data || '');
    this.addLog(log);
  }

  warn(message: string, data?: any) {
    const log = this.formatMessage('WARN', message, data);
    console.warn(`%c[${log.timestamp}] [WARN] ${message}`, 'color: #ff9800', data || '');
    this.addLog(log);
  }

  debug(message: string, data?: any) {
    const log = this.formatMessage('DEBUG', message, data);
    console.debug(`%c[${log.timestamp}] [DEBUG] ${message}`, 'color: #4CAF50', data || '');
    this.addLog(log);
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    localStorage.removeItem('app_logs');
  }
}

export const logger = new Logger(); 