import { spawn } from 'child_process';
import { systemLogger } from '../utils/logger';
import logger from '../utils/logger';
import path from 'path';
import fs from 'fs';

interface WhisperSegment {
  text: string;
  start: number;
  end: number;
}

interface WhisperApiResponse {
  text: string;
  segments: WhisperSegment[];
  language: string;
}

export class WhisperService {
  private readonly tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'tmp', 'whisper');
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  public async transcribeVideo(audioSegments: string[]): Promise<WhisperApiResponse> {
    try {
      logger.info('Transkript işlemi başlatılıyor', { segmentCount: audioSegments.length });

      // Process each segment
      const results = await Promise.all(
        audioSegments.map(async (segmentPath, index) => {
          logger.info('Segment işleniyor', { 
            segmentPath,
            segmentIndex: index + 1, 
            totalSegments: audioSegments.length 
          });
          
          try {
            const result = await this.transcribeSegment(segmentPath, index * 600);
            logger.info('Segment başarıyla işlendi', { 
              segmentIndex: index + 1,
              textLength: result.text.length
            });
            return result;
          } catch (error) {
            logger.error('Segment işlenirken hata oluştu', {
              segmentPath,
              segmentIndex: index + 1,
              error: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
          }
        })
      );

      logger.info('Tüm segmentler işlendi, sonuçlar birleştiriliyor');
      const mergedResult = this.mergeResults(results);
      logger.info('Sonuçlar başarıyla birleştirildi', {
        totalText: mergedResult.text.length,
        totalSegments: mergedResult.segments.length
      });
      
      return mergedResult;
    } catch (error) {
      logger.error('Transkript işlemi sırasında hata oluştu', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        segmentCount: audioSegments.length
      });
      throw error;
    }
  }

  public async transcribeSegment(audioPath: string, timeOffset: number): Promise<WhisperApiResponse> {
    try {
      const segmentIndex = Math.floor(timeOffset / 600) + 1;
      systemLogger.whisperService.segment(segmentIndex, 1);

      logger.info('Whisper komutu çalıştırılıyor', { audioPath });
      
      const result = await this.runWhisperCommand(audioPath);
      
      // Zaman damgalarını düzelt
      result.segments = result.segments.map((segment: WhisperSegment) => ({
        ...segment,
        start: segment.start + timeOffset,
        end: segment.end + timeOffset
      }));

      systemLogger.whisperService.segmentCompleted(audioPath);

      return {
        text: result.text,
        segments: result.segments,
        language: 'tr'
      };
    } catch (error) {
      logger.error('Segment işlenirken hata oluştu', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        audioPath,
        timeOffset
      });
      throw error;
    }
  }

  private async runWhisperCommand(audioPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        logger.info('Whisper komutu başlatılıyor', {
          command: 'whisper',
          args: [
            audioPath,
            '--model', 'base',
            '--output_dir', this.tempDir,
            '--output_format', 'vtt',
            '--device', 'cpu',
            '--verbose', 'True'
          ]
        });

        const whisperProcess = spawn('whisper', [
          audioPath,
          '--model', 'base',
          '--output_dir', this.tempDir,
          '--output_format', 'vtt',
          '--device', 'cpu',
          '--verbose', 'True'
        ]);

        let stdout = '';
        let stderr = '';

        whisperProcess.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          logger.info('Whisper çıktısı:', { output });
        });

        whisperProcess.stderr.on('data', (data) => {
          const progress = data.toString();
          stderr += progress;
          logger.info('Whisper ilerleme:', { progress });
        });

        whisperProcess.on('close', (code) => {
          if (code !== 0) {
            logger.error('Whisper işlemi başarısız:', { code, stderr });
            reject(new Error(`Whisper işlemi ${code} koduyla başarısız oldu: ${stderr}`));
            return;
          }

          try {
            const files = fs.readdirSync(this.tempDir);
            const vttFile = files.find(f => f.endsWith('.vtt'));
            if (!vttFile) {
              reject(new Error('VTT dosyası bulunamadı'));
              return;
            }

            const vttPath = path.join(this.tempDir, vttFile);
            const vttContent = fs.readFileSync(vttPath, 'utf8');
            fs.unlinkSync(vttPath); // Temizlik

            const segments = this.parseVTT(vttContent);
            resolve({
              text: segments.map(s => s.text).join(' '),
              segments: segments
            });
          } catch (error) {
            logger.error('VTT işleme hatası:', error);
            reject(error);
          }
        });

        whisperProcess.on('error', (error) => {
          logger.error('Whisper işlem hatası:', error);
          reject(error);
        });
      } catch (error) {
        logger.error('Whisper komut hatası:', error);
        reject(error);
      }
    });
  }

  private parseVTT(vttContent: string): Array<{text: string; start: number; end: number}> {
    const lines = vttContent.split('\n');
    const segments: Array<{text: string; start: number; end: number}> = [];
    let currentSegment: {text: string; start: number; end: number} | null = null;

    for (const line of lines) {
      if (line.includes('-->')) {
        const [start, end] = line.split('-->').map(timeStr => {
          const [minutes, seconds] = timeStr.trim().split(':').map(Number);
          return minutes * 60 + seconds;
        });
        currentSegment = { text: '', start, end };
      } else if (line.trim() && currentSegment) {
        currentSegment.text = line.trim();
        segments.push(currentSegment);
        currentSegment = null;
      }
    }

    return segments;
  }

  private mergeResults(results: WhisperApiResponse[]): WhisperApiResponse {
    const mergedSegments = results.flatMap(result => result.segments);
    const mergedText = mergedSegments.map(segment => segment.text.trim()).join(' ');

    return {
      text: mergedText,
      segments: mergedSegments.sort((a, b) => a.start - b.start),
      language: 'tr'
    };
  }
} 