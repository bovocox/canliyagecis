import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import ytDlp from 'youtube-dl-exec';
// @ts-ignore fluent-ffmpeg modülü için tip tanımlaması yok
import ffmpeg from 'fluent-ffmpeg';
import { systemLogger } from '../utils/logger';

const execAsync = promisify(exec);

interface VideoInfo {
  duration: number;
  title: string;
  id: string;
}

interface FFProbeMetadata {
  format: {
    duration?: number;
    format_name?: string;
    size?: number;
  };
}

export class AudioService {
  private readonly outputDir: string;

  constructor() {
    this.outputDir = path.join(process.cwd(), 'tmp', 'audio');
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  public async downloadAudio(videoId: string): Promise<string> {
    try {
      const outputPath = path.join(this.outputDir, `${videoId}.mp3`);
      systemLogger.audioService.download(videoId);

      if (fs.existsSync(outputPath)) {
        return outputPath;
      }

      const duration = await this.getVideoDuration(videoId);
      
      if (duration > 10800) {
        throw new Error('Video is too long (max 3 hours)');
      }
      
      await ytDlp(`https://www.youtube.com/watch?v=${videoId}`, {
        extractAudio: true,
        audioFormat: 'mp3',
        output: outputPath,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        audioQuality: 0
      });

      if (!fs.existsSync(outputPath)) {
        throw new Error('Failed to download audio file');
      }

      return outputPath;
    } catch (error) {
      throw error;
    }
  }

  public async splitAudio(inputPath: string, segmentDuration: number = 600): Promise<string[]> {
    try {
      const segmentsDir = path.join(this.outputDir, 'segments');
      if (!fs.existsSync(segmentsDir)) {
        fs.mkdirSync(segmentsDir, { recursive: true });
      }

      const duration = await this.getAudioDuration(inputPath);
      const segmentCount = Math.ceil(duration / segmentDuration);
      const videoId = path.basename(inputPath, '.mp3');
      
      systemLogger.audioService.split(videoId, segmentCount);

      const segmentPaths: string[] = [];
      const baseFileName = path.basename(inputPath, path.extname(inputPath));

      for (let i = 0; i < segmentCount; i++) {
        const start = i * segmentDuration;
        const outputPath = path.join(segmentsDir, `${baseFileName}_segment_${i}.mp3`);
        segmentPaths.push(outputPath);

        systemLogger.audioService.segmentCreating(i + 1, segmentCount, start, outputPath);

        await new Promise<void>((resolve, reject) => {
          ffmpeg(inputPath)
            .setStartTime(start)
            .setDuration(segmentDuration)
            .output(outputPath)
            .on('end', () => {
              systemLogger.audioService.segmentCreated(i + 1, outputPath);
              resolve();
            })
            .on('error', (err: Error) => {
              systemLogger.audioService.segmentCreationError(i + 1, err.message, outputPath);
              reject(err);
            })
            .run();
        });

        if (!fs.existsSync(outputPath)) {
          throw new Error(`Segment dosyası oluşturulamadı: ${outputPath}`);
        }

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
          throw new Error(`Segment dosyası boş: ${outputPath}`);
        }

        systemLogger.audioService.segmentChecked(i + 1, outputPath, stats.size);
      }

      systemLogger.audioService.allSegmentsCreated(segmentCount, segmentPaths);

      return segmentPaths;
    } catch (error) {
      systemLogger.audioService.splitError(error instanceof Error ? error.message : 'Unknown error', error instanceof Error ? error.stack : undefined, inputPath);
      throw error;
    }
  }

  public async cleanupAudio(videoId: string): Promise<void> {
    try {
      const filePath = path.join(this.outputDir, `${videoId}.mp3`);
      systemLogger.audioService.cleanup(videoId);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      throw error;
    }
  }

  public async cleanupSegments(segments: string[]): Promise<void> {
    try {
      for (const segmentPath of segments) {
        try {
          if (fs.existsSync(segmentPath)) {
            fs.unlinkSync(segmentPath);
          }
        } catch (err) {
          // Continue with other segments even if one fails
          continue;
        }
      }
    } catch (error) {
      throw error;
    }
  }

  private async getVideoDuration(videoId: string): Promise<number> {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      systemLogger.audioService.getDuration(videoId);
      
      const result = await ytDlp(videoUrl, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
      });

      const info = result as VideoInfo;
      systemLogger.audioService.durationRetrieved(videoId, info.duration || 0, info.title);
      
      return info.duration || 0;
    } catch (error) {
      systemLogger.audioService.errorGettingDuration(videoId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  private async getAudioDuration(filePath: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      systemLogger.audioService.getDuration(filePath);
      ffmpeg.ffprobe(filePath, (err: Error | null, metadata: FFProbeMetadata) => {
        if (err) {
          systemLogger.audioService.errorGettingDuration(filePath, err);
          return reject(err);
        }
        const duration = metadata.format.duration || 0;
        systemLogger.audioService.durationRetrieved(filePath, duration, metadata.format.format_name, metadata.format.size);
        resolve(duration);
      });
    });
  }
} 