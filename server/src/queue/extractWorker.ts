import { v4 as uuid } from 'uuid';
import { resolveUrl } from '../services/platformResolver';
import { downloadVideo, cleanupDownload } from '../services/videoDownloader';
import { fetchCaptions } from '../services/captionFetcher';
import { transcribeAudio } from '../services/transcriber';
import { runOcrOnVideo } from '../services/ocrService';
import { structureRecipe, toRecipeRecord } from '../services/recipeStructurer';
import { calculateNutrition } from '../services/nutritionCalculator';
import { tagRecipe } from '../services/autoTagger';
import { db } from '../db/schema';
import { type Job, updateJob, addProgress, acquireSlot, releaseSlot } from './jobStore';
import type { ExtractionResult } from '../routes/extract';

/**
 * Runs the full extraction pipeline for a job in the background.
 * Call without await — it updates job state as it progresses.
 */
export async function runExtractionJob(job: Job): Promise<void> {
  await acquireSlot();
  updateJob(job.id, { status: 'processing' });

  let tempDir: string | null = null;
  const startMs = Date.now();

  try {
    // Step 1: Resolve URL
    addProgress(job.id, 'resolving', 'Resolving video URL...');
    const { platform, resolvedUrl } = await withTimeout(
      resolveUrl(job.url),
      15_000,
      'URL resolution timed out'
    );

    if (platform === 'unknown') {
      throw Object.assign(new Error('Unsupported platform. Please use Instagram, TikTok, or YouTube.'), { code: 'unsupported_platform' });
    }

    // Step 2: Download video + fetch captions in parallel
    addProgress(job.id, 'downloading', 'Downloading video...');
    const [downloadSettled, captionEarlySettled] = await Promise.allSettled([
      withTimeout(downloadVideo(resolvedUrl), 90_000, 'Video download timed out'),
      withTimeout(fetchCaptions(resolvedUrl, ''), 20_000, 'Caption fetch timed out'),
    ]);

    if (downloadSettled.status === 'rejected') throw downloadSettled.reason as Error;
    const download = downloadSettled.value;
    tempDir = download.tempDir;

    // Step 3: Parallel extraction
    addProgress(job.id, 'extracting_audio', 'Extracting audio and captions...');

    const [captionResult, transcriptResult, ocrResult] = await Promise.allSettled([
      captionEarlySettled.status === 'fulfilled'
        ? Promise.resolve(captionEarlySettled.value)
        : withTimeout(
            fetchCaptions(resolvedUrl, download.metadata.description),
            20_000,
            'Caption fetch timed out'
          ),
      withTimeout(
        (async () => {
          addProgress(job.id, 'transcribing', 'Transcribing voiceover...');
          return transcribeAudio(download.audioPath);
        })(),
        90_000,
        'Transcription timed out'
      ),
      withTimeout(
        (async () => {
          addProgress(job.id, 'running_ocr', 'Reading on-screen text...');
          return runOcrOnVideo(download.videoPath);
        })(),
        60_000,
        'OCR timed out'
      ),
    ]);

    const caption = captionResult.status === 'fulfilled' ? captionResult.value : null;
    const transcript = transcriptResult.status === 'fulfilled' ? transcriptResult.value : null;
    const ocr = ocrResult.status === 'fulfilled' ? ocrResult.value : null;

    if (captionResult.status === 'rejected') console.warn('[worker] Caption fetch failed:', captionResult.reason);
    if (transcriptResult.status === 'rejected') console.warn('[worker] Transcription failed:', transcriptResult.reason);
    if (ocrResult.status === 'rejected') console.warn('[worker] OCR failed:', ocrResult.reason);

    // Step 4: Structure recipe with AI
    addProgress(job.id, 'structuring', 'Organising your recipe with AI...');

    const structured = await withTimeout(
      structureRecipe({
        caption: caption?.captionText ?? '',
        subtitle: caption?.subtitleText ?? '',
        transcript: transcript?.transcript ?? '',
        ocrText: ocr?.mergedText ?? '',
        videoTitle: download.metadata.title,
        videoDescription: download.metadata.description,
      }),
      30_000,
      'AI structuring timed out'
    );

    const recipe = toRecipeRecord(structured, resolvedUrl, platform);
    saveRecipeToDb(recipe);

    // Fire-and-forget nutrition calculation — doesn't block job completion
    void calculateNutrition({ title: recipe.title, servings: recipe.servings, ingredients: recipe.ingredients })
      .then((nutrition) => {
        db.prepare(`
          UPDATE recipes
          SET caloriesPerServing = ?, proteinGrams = ?, carbsGrams = ?, fatGrams = ?,
              fiberGrams = ?, sugarGrams = ?, sodiumMg = ?, nutritionConfidence = ?
          WHERE id = ?
        `).run(
          nutrition.caloriesPerServing, nutrition.proteinGrams, nutrition.carbsGrams,
          nutrition.fatGrams, nutrition.fiberGrams, nutrition.sugarGrams, nutrition.sodiumMg,
          nutrition.confidence, recipe.id,
        );
        console.log(`[worker] Nutrition cached for ${recipe.id}`);
      })
      .catch((e: unknown) => {
        console.warn('[worker] Nutrition calculation failed (non-fatal):', e);
      });

    // Fire-and-forget auto-tagging
    void tagRecipe(recipe.id).catch((e: unknown) => {
      console.warn('[worker] Auto-tagging failed (non-fatal):', e);
    });

    const result: ExtractionResult = {
      recipe,
      processingMeta: {
        durationMs: Date.now() - startMs,
        sourcesUsed: [
          caption?.captionText ? 'captions' : null,
          transcript?.transcript ? 'transcript' : null,
          ocr?.mergedText ? 'ocr' : null,
        ].filter((s): s is string => s !== null),
      },
    };

    updateJob(job.id, { status: 'done', result });
    addProgress(job.id, 'complete', 'Recipe extracted!');
  } catch (err) {
    const message = (err as Error & { code?: string }).code === 'not_a_recipe'
      ? "This doesn't look like a recipe video. Try sharing a cooking video!"
      : err instanceof Error
      ? err.message
      : 'Extraction failed';

    updateJob(job.id, { status: 'error', error: message });
    addProgress(job.id, 'error', message);
  } finally {
    if (tempDir) cleanupDownload(tempDir);
    releaseSlot();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

function saveRecipeToDb(recipe: ReturnType<typeof toRecipeRecord>): void {
  const insertRecipe = db.prepare(`
    INSERT OR REPLACE INTO recipes
      (id, title, description, servings, prepTime, cookTime, difficulty, cuisine,
       tags, notes, sourceUrl, platform, confidence, createdAt, updatedAt)
    VALUES
      (@id, @title, @description, @servings, @prepTime, @cookTime, @difficulty, @cuisine,
       @tags, @notes, @sourceUrl, @platform, @confidence, @createdAt, @updatedAt)
  `);

  const insertIngredient = db.prepare(`
    INSERT INTO ingredients
      (id, recipeId, item, quantity, category, isOptional, sortOrder)
    VALUES (@id, @recipeId, @item, @quantity, @category, @isOptional, @sortOrder)
  `);

  const insertStep = db.prepare(`
    INSERT INTO steps
      (id, recipeId, stepNumber, instruction, duration, tip)
    VALUES (@id, @recipeId, @stepNumber, @instruction, @duration, @tip)
  `);

  const transaction = db.transaction(() => {
    insertRecipe.run({ ...recipe, tags: JSON.stringify(recipe.tags) });
    for (const ing of recipe.ingredients) {
      insertIngredient.run({ ...ing, recipeId: recipe.id, isOptional: ing.isOptional ? 1 : 0 });
    }
    for (const step of recipe.steps) {
      insertStep.run({ id: uuid(), recipeId: recipe.id, ...step });
    }
  });

  transaction();
}
