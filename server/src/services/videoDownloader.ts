import YTDlpWrap from 'yt-dlp-wrap';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import os from 'os';

const FFMPEG_PATH = ffmpegInstaller.path;
ffmpeg.setFfmpegPath(FFMPEG_PATH);

export interface VideoMetadata {
  title: string;
  description: string;
  uploader: string;
  duration: number;
  thumbnailUrl?: string;
}

export interface DownloadResult {
  videoPath: string;
  audioPath: string;
  thumbnailPath: string | null;
  metadata: VideoMetadata;
  tempDir: string;
}

const ytDlp = new YTDlpWrap(process.env.YTDLP_PATH ?? 'yt-dlp');

/**
 * Downloads a video at 480p (sufficient for OCR keyframes) and extracts audio
 * from the downloaded file via ffmpeg — no second network download needed.
 */
export async function downloadVideo(url: string): Promise<DownloadResult> {
  const tempDir = path.join(
    process.env.TEMP_DIR ?? os.tmpdir(),
    `recipesnap-${Date.now()}`
  );
  fs.mkdirSync(tempDir, { recursive: true });

  const videoPath = path.join(tempDir, 'video.mp4');
  const audioPath = path.join(tempDir, 'audio.mp3');

  // Download video + embedded metadata in one call.
  // 480p is enough for keyframe OCR and is ~4x faster to download than 1080p.
  // --print-json emits the metadata JSON to stdout before downloading.
  const rawOutput = await ytDlp.execPromise([
    url,
    '-f', 'bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]/best',
    '--merge-output-format', 'mp4',
    '--ffmpeg-location', FFMPEG_PATH,
    '-o', videoPath,
    '--no-playlist',
    '--socket-timeout', '30',
    '--print-json',           // emit metadata JSON after download
  ]);

  // --print-json may emit multiple lines; the last non-empty line is the JSON
  const jsonLine = rawOutput.trim().split('\n').filter(Boolean).pop() ?? '{}';
  const meta = JSON.parse(jsonLine) as {
    title?: string;
    description?: string;
    uploader?: string;
    duration?: number;
    thumbnail?: string;
  };

  const metadata: VideoMetadata = {
    title: meta.title ?? 'Untitled',
    description: meta.description ?? '',
    uploader: meta.uploader ?? 'Unknown',
    duration: meta.duration ?? 0,
    thumbnailUrl: meta.thumbnail,
  };

  const thumbnailPath = path.join(tempDir, 'thumbnail.jpg');

  // Extract audio and a keyframe thumbnail in parallel — no extra network requests.
  const [, thumbResult] = await Promise.allSettled([
    extractAudioFromVideo(videoPath, audioPath),
    extractKeyframeThumbnail(videoPath, thumbnailPath),
  ]);

  return {
    videoPath,
    audioPath,
    thumbnailPath: thumbResult.status === 'fulfilled' ? thumbnailPath : null,
    metadata,
    tempDir,
  };
}

/**
 * Extracts a single keyframe at t=1s as a JPEG thumbnail.
 * Falls back to t=0 if the video is shorter than 1s.
 */
function extractKeyframeThumbnail(videoPath: string, thumbnailPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(1)
      .frames(1)
      .output(thumbnailPath)
      .on('end', () => resolve())
      .on('error', () => {
        // Retry at t=0 (very short clips)
        ffmpeg(videoPath)
          .seekInput(0)
          .frames(1)
          .output(thumbnailPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(new Error(`Thumbnail extraction failed: ${err.message}`)))
          .run();
      })
      .run();
  });
}

/** Uses ffmpeg to strip audio from an existing video file into an mp3. */
function extractAudioFromVideo(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioQuality(0)
      .output(audioPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`Audio extraction failed: ${err.message}`)))
      .run();
  });
}

/**
 * Removes a temp directory created by downloadVideo.
 */
export function cleanupDownload(tempDir: string): void {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}
