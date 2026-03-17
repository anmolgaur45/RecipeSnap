import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import { extractKeyframes, cleanupKeyframes } from '../utils/keyframeExtractor';

export interface OcrResult {
  ocrTexts: string[];
  mergedText: string;
}

/**
 * Runs OCR on keyframes extracted from the video using Claude Vision.
 * Returns deduplicated text found across all frames.
 */
export async function runOcrOnVideo(videoPath: string): Promise<OcrResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ocrTexts: [], mergedText: '' };
  }

  const { framePaths, outputDir } = await extractKeyframes(videoPath, 3, 20);

  if (framePaths.length === 0) {
    return { ocrTexts: [], mergedText: '' };
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const ocrTexts: string[] = [];

    for (const framePath of framePaths) {
      try {
        const imageData = fs.readFileSync(framePath).toString('base64');

        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: 'image/jpeg', data: imageData },
                },
                {
                  type: 'text',
                  text: 'Extract all visible text from this image exactly as it appears. Output only the raw text, no commentary.',
                },
              ],
            },
          ],
        });

        const text = response.content[0]?.type === 'text'
          ? response.content[0].text.trim()
          : '';

        if (text && text.length > 3) {
          ocrTexts.push(text);
        }
      } catch {
        // Skip frames that fail OCR
      }
    }

    const mergedText = deduplicateOcrTexts(ocrTexts);
    return { ocrTexts, mergedText };
  } finally {
    cleanupKeyframes(outputDir);
  }
}

/**
 * Merges OCR texts from multiple frames, removing near-duplicate lines.
 */
function deduplicateOcrTexts(texts: string[]): string {
  const seenLines = new Set<string>();
  const result: string[] = [];

  for (const block of texts) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const normalised = line.toLowerCase().replace(/\s+/g, ' ');
      if (!seenLines.has(normalised)) {
        seenLines.add(normalised);
        result.push(line);
      }
    }
  }

  return result.join('\n');
}
