// Audio transcription is handled server-side via Whisper / Google STT.
// This module is a client-side placeholder for type consistency.

export interface AudioTranscriptResult {
  transcript: string;
  confidence: number;
  provider: 'whisper' | 'google_stt';
}

// No-op on client — actual transcription runs on the Express server.
export async function extractAudioTranscript(_url: string): Promise<AudioTranscriptResult> {
  throw new Error('Audio transcription must be called via the backend API.');
}
