// OCR extraction is handled server-side via Google Cloud Vision on keyframes.
// This module is a client-side placeholder for type consistency.

export interface OcrResult {
  ocrTexts: string[];
  mergedText: string;
}

// No-op on client — actual OCR runs on the Express server.
export async function extractOcrText(_url: string): Promise<OcrResult> {
  throw new Error('OCR extraction must be called via the backend API.');
}
