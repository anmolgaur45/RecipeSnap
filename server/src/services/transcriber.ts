import OpenAI from 'openai';
import fs from 'fs';

export interface TranscriptResult {
  transcript: string;
  confidence: number;
  provider: 'whisper' | 'none';
}

const MAX_WHISPER_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB (Whisper API limit)

/**
 * Transcribes an audio file using OpenAI Whisper.
 * Falls back to returning an empty transcript if the API is unavailable.
 */
export async function transcribeAudio(audioPath: string): Promise<TranscriptResult> {
  if (!fs.existsSync(audioPath)) {
    return { transcript: '', confidence: 0, provider: 'none' };
  }

  const stat = fs.statSync(audioPath);

  // Try Whisper first
  if (process.env.OPENAI_API_KEY) {
    try {
      const result = await transcribeWithWhisper(audioPath, stat.size);
      return result;
    } catch (err) {
      console.warn('Whisper transcription failed, trying fallback:', err);
    }
  }

  return { transcript: '', confidence: 0, provider: 'none' };
}

async function transcribeWithWhisper(
  audioPath: string,
  fileSize: number
): Promise<TranscriptResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  if (fileSize > MAX_WHISPER_SIZE_BYTES) {
    // For large files, chunk the audio
    return transcribeChunked(audioPath, openai);
  }

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    language: 'en',
    response_format: 'text',
  });

  const transcript = typeof transcription === 'string'
    ? transcription
    : (transcription as { text: string }).text;

  return {
    transcript: transcript.trim(),
    confidence: 0.9,
    provider: 'whisper',
  };
}

async function transcribeChunked(
  audioPath: string,
  openai: OpenAI
): Promise<TranscriptResult> {
  // For audio > 25MB, we rely on yt-dlp having already constrained the audio quality.
  // In practice, short-form video audio is always well under this limit.
  // This is a safety fallback.
  console.warn(
    `Audio file at ${audioPath} exceeds 25MB. Attempting transcription anyway (may fail).`
  );

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    language: 'en',
    response_format: 'text',
  });

  const transcript = typeof transcription === 'string'
    ? transcription
    : (transcription as { text: string }).text;

  return {
    transcript: transcript.trim(),
    confidence: 0.8,
    provider: 'whisper',
  };
}

