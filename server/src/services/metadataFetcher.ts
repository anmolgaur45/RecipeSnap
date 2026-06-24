import YTDlpWrap from 'yt-dlp-wrap';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface MetadataResult {
  title: string;
  description: string;
  uploader: string;
  duration: number;
  thumbnailUrl?: string;
  /** Parsed caption/subtitle text (auto or manual), empty if none. */
  subtitleText: string;
}

const ytDlp = new YTDlpWrap(process.env.YTDLP_PATH ?? 'yt-dlp');

/**
 * Stage 1 of caption-first extraction: pull metadata + captions WITHOUT
 * downloading the video. One yt-dlp call does both — `--dump-json` for the info
 * JSON (title/description/thumbnail) and `--write-subs/--write-auto-subs` for the
 * subtitle files — under `--skip-download`, so no video bytes cross the wire.
 * For Instagram/TikTok this usually carries the whole recipe in the caption.
 */
export async function fetchMetadataAndCaptions(url: string): Promise<MetadataResult> {
  const tempDir = path.join(os.tmpdir(), `recipesnap-meta-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const rawOutput = await ytDlp.execPromise([
      url,
      '--skip-download',
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs', 'en.*',
      '--sub-format', 'vtt/srt/best',
      '--dump-json',
      '-o', path.join(tempDir, 'subs'),
      '--no-playlist',
      '--socket-timeout', '30',
    ]);

    const meta = parseInfoJson(rawOutput);

    return {
      title: meta.title ?? 'Untitled',
      description: meta.description ?? '',
      uploader: meta.uploader ?? 'Unknown',
      duration: meta.duration ?? 0,
      thumbnailUrl: meta.thumbnail,
      subtitleText: parseSubtitlesFromDir(tempDir),
    };
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

interface InfoJson {
  title?: string;
  description?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
}

/**
 * yt-dlp prints `[info]` lines plus the JSON object to stdout. Pick the JSON by
 * scanning for a line that parses as an object (last one wins).
 */
function parseInfoJson(rawOutput: string): InfoJson {
  let parsed: InfoJson = {};
  for (const line of rawOutput.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      parsed = JSON.parse(trimmed) as InfoJson;
    } catch {
      // not the JSON line
    }
  }
  return parsed;
}

/** Reads every .vtt/.srt file in a dir and returns the combined caption text. */
export function parseSubtitlesFromDir(dir: string): string {
  let text = '';
  try {
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.vtt')) {
        text += parseVtt(fs.readFileSync(path.join(dir, file), 'utf-8')) + '\n';
      } else if (file.endsWith('.srt')) {
        text += parseSrt(fs.readFileSync(path.join(dir, file), 'utf-8')) + '\n';
      }
    }
  } catch {
    // subtitles may not exist — that's fine
  }
  return text.trim();
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
      const cleaned = line
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      if (cleaned) textLines.push(cleaned);
    }
  }

  // Deduplicate consecutive identical lines (VTT often overlaps).
  return textLines.filter((l, i) => l !== textLines[i - 1]).join(' ');
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
    if (/^\d+$/.test(trimmed)) {
      skipNext = true;
      continue;
    }
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
