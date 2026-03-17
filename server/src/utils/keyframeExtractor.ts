import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';
import os from 'os';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface KeyframeResult {
  framePaths: string[];
  outputDir: string;
}

/**
 * Extracts keyframes from a video file at a fixed interval.
 * @param videoPath  Absolute path to the input video file.
 * @param intervalSec  One frame every N seconds (default: 3).
 * @param maxFrames  Maximum number of frames to extract (default: 20).
 */
export async function extractKeyframes(
  videoPath: string,
  intervalSec = 3,
  maxFrames = 20
): Promise<KeyframeResult> {
  const outputDir = path.join(os.tmpdir(), `recipesnap-frames-${Date.now()}`);
  fs.mkdirSync(outputDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        `-vf fps=1/${intervalSec}`,
        `-frames:v ${maxFrames}`,
        '-q:v 3', // JPEG quality (lower = better, 1-31)
      ])
      .output(path.join(outputDir, 'frame-%03d.jpg'))
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`ffmpeg keyframe extraction failed: ${err.message}`)))
      .run();
  });

  const framePaths = fs
    .readdirSync(outputDir)
    .filter((f) => f.endsWith('.jpg'))
    .sort()
    .map((f) => path.join(outputDir, f));

  return { framePaths, outputDir };
}

/**
 * Cleans up a keyframe output directory.
 */
export function cleanupKeyframes(outputDir: string): void {
  try {
    fs.rmSync(outputDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}
