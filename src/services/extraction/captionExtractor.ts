// Caption extraction is handled server-side via yt-dlp.
// This module is a client-side placeholder for type consistency.

export interface CaptionResult {
  captionText: string;
  subtitleText: string;
  descriptionText: string;
}

// No-op on client — actual extraction runs on the Express server.
export async function extractCaptions(_url: string): Promise<CaptionResult> {
  throw new Error('Caption extraction must be called via the backend API.');
}
