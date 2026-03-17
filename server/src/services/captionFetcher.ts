import YTDlpWrap from 'yt-dlp-wrap';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface CaptionResult {
  captionText: string;
  subtitleText: string;
  descriptionText: string;
}

const ytDlp = new YTDlpWrap(process.env.YTDLP_PATH ?? 'yt-dlp');

/**
 * Attempts to fetch available captions/subtitles for a video URL.
 * Also returns the video description as a primary text source.
 */
export async function fetchCaptions(
  url: string,
  description: string
): Promise<CaptionResult> {
  const tempDir = path.join(os.tmpdir(), `recipesnap-captions-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  let subtitleText = '';

  try {
    // Try to download auto-generated and manual subtitles
    await ytDlp.execPromise([
      url,
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs', 'en.*',
      '--sub-format', 'vtt/srt/best',
      '--skip-download',
      '-o', path.join(tempDir, 'subs'),
      '--no-playlist',
    ]);

    // Parse any downloaded subtitle files
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      if (file.endsWith('.vtt') || file.endsWith('.srt')) {
        const raw = fs.readFileSync(path.join(tempDir, file), 'utf-8');
        subtitleText += parseSubtitleFile(raw, file.endsWith('.vtt') ? 'vtt' : 'srt') + '\n';
      }
    }
  } catch {
    // Subtitles may not be available — that's fine
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  return {
    captionText: subtitleText.trim(),
    subtitleText: subtitleText.trim(),
    descriptionText: description,
  };
}

function parseSubtitleFile(content: string, format: 'vtt' | 'srt'): string {
  if (format === 'vtt') return parseVtt(content);
  return parseSrt(content);
}

function parseVtt(vtt: string): string {
  const lines = vtt.split('\n');
  const textLines: string[] = [];
  let inCue = false;

  for (const line of lines) {
    if (line.includes('-->')) {
      inCue = true;
      continue;
    }
    if (inCue && line.trim() === '') {
      inCue = false;
      continue;
    }
    if (inCue && line.trim()) {
      // Strip VTT tags like <c.colorname> and timestamps within cues
      const cleaned = line
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      if (cleaned) textLines.push(cleaned);
    }
  }

  // Deduplicate consecutive identical lines (VTT often has overlap)
  const deduped = textLines.filter((l, i) => l !== textLines[i - 1]);
  return deduped.join(' ');
}

function parseSrt(srt: string): string {
  const lines = srt.split('\n');
  const textLines: string[] = [];
  let skipNext = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      skipNext = false;
      continue;
    }
    // Skip sequence numbers
    if (/^\d+$/.test(trimmed)) {
      skipNext = true;
      continue;
    }
    // Skip timestamp lines
    if (trimmed.includes('-->')) {
      skipNext = false;
      continue;
    }
    if (!skipNext) {
      textLines.push(trimmed.replace(/<[^>]+>/g, ''));
    }
  }

  return textLines.filter((l, i) => l !== textLines[i - 1]).join(' ');
}
