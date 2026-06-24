import fs from 'fs';
import { extractKeyframes, cleanupKeyframes } from '../utils/keyframeExtractor';
import { generateStructuredFromParts, type ImagePart } from './ai/generateStructured';
import { RecipeOutputSchema, type RecipeOutput } from './recipeStructurer';

// Last-resort extraction for videos with no usable caption, narration, or
// on-screen text. Samples frames and has Gemini understand the cooking visually
// (ingredients shown, actions, sequence) rather than just reading text off them.
// Returns null when the frames are not a recipe or the call fails, so the worker
// can decide whether to surface a "not a recipe" error.

const FRAME_INTERVAL_SEC = 2;
const MAX_FRAMES = 12;

const VISION_SYSTEM_PROMPT = `You are a recipe extraction AI analysing ordered FRAMES sampled from a short cooking video that has no usable caption, narration, or on-screen text. Infer the recipe from what you SEE across the frames: the ingredients shown, visible quantities and packaging, the cooking actions and techniques, the equipment, and the order things happen.

Rules:
- Set isRecipe false (with a short notRecipeReason) if the frames are not a cooking video.
- Identify ingredients from what is visibly used. When a quantity is not visible, estimate a sensible amount and set confidence to "medium" or "low".
- Build the steps from the sequence of actions across the frames, in order.
- Categorize each ingredient (produce, dairy, protein, spices, pantry, other).
- Be honest about uncertainty: this is inferred from visuals alone, so prefer "low" or "medium" confidence.
- sourceQuality: set ocrUseful true only if readable on-screen text helped; captionUseful and transcriptUseful are false here.`;

export async function extractRecipeFromVideo(videoPath: string): Promise<RecipeOutput | null> {
  const { framePaths, outputDir } = await extractKeyframes(videoPath, FRAME_INTERVAL_SEC, MAX_FRAMES);

  if (framePaths.length === 0) {
    cleanupKeyframes(outputDir);
    return null;
  }

  try {
    const images: ImagePart[] = framePaths.map((p) => ({
      mimeType: 'image/jpeg',
      data: fs.readFileSync(p).toString('base64'),
    }));

    const result = await generateStructuredFromParts({
      schema: RecipeOutputSchema,
      schemaName: 'recipe',
      schemaDescription: 'A structured cooking recipe inferred from video frames.',
      system: VISION_SYSTEM_PROMPT,
      text: `These are ${images.length} frames sampled in order (about one every ${FRAME_INTERVAL_SEC}s) from a cooking video. Extract the recipe.`,
      images,
    });

    return result.isRecipe ? result : null;
  } catch (err) {
    console.warn('[visualExtractor] frame-based extraction failed:', err);
    return null;
  } finally {
    cleanupKeyframes(outputDir);
  }
}
