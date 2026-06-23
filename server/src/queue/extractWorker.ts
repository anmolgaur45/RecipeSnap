import { resolveUrl } from '../services/platformResolver';
import { downloadVideo, cleanupDownload } from '../services/videoDownloader';
import { fetchCaptions } from '../services/captionFetcher';
import { transcribeAudio } from '../services/transcriber';
import { runOcrOnVideo } from '../services/ocrService';
import { structureRecipe, toRecipeRecord } from '../services/recipeStructurer';
import { calculateNutrition } from '../services/nutritionCalculator';
import { tagRecipe } from '../services/autoTagger';
import { persistThumbnail } from '../services/thumbnailStore';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { recipes, ingredients, steps } from '../db/schema.pg';
import { getJob, updateJob, addProgress, acquireSlot, releaseSlot } from './jobStore';
import type { ExtractionResult } from '../routes/extract';

/**
 * Runs the full extraction pipeline for a persisted job. Loads the job by id so
 * the same entry point serves both the Cloud Tasks worker request and the dev
 * inline path. Updates job state in Postgres as it progresses.
 */
export async function runExtractionJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return; // job expired or never existed

  await acquireSlot();
  await updateJob(job.id, { status: 'processing' });

  let tempDir: string | null = null;
  const startMs = Date.now();

  try {
    // Step 1: Resolve URL
    await addProgress(job.id, 'resolving', 'Resolving video URL...');
    const { platform, resolvedUrl } = await withTimeout(
      resolveUrl(job.url),
      15_000,
      'URL resolution timed out'
    );

    if (platform === 'unknown') {
      throw Object.assign(new Error('Unsupported platform. Please use Instagram, TikTok, or YouTube.'), { code: 'unsupported_platform' });
    }

    // Step 2: Download video + fetch captions in parallel
    await addProgress(job.id, 'downloading', 'Downloading video...');
    const [downloadSettled, captionEarlySettled] = await Promise.allSettled([
      withTimeout(downloadVideo(resolvedUrl), 90_000, 'Video download timed out'),
      withTimeout(fetchCaptions(resolvedUrl, ''), 20_000, 'Caption fetch timed out'),
    ]);

    if (downloadSettled.status === 'rejected') throw downloadSettled.reason as Error;
    const download = downloadSettled.value;
    tempDir = download.tempDir;

    // Step 3: Parallel extraction
    await addProgress(job.id, 'extracting_audio', 'Extracting audio and captions...');

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
          await addProgress(job.id, 'transcribing', 'Transcribing voiceover...');
          return transcribeAudio(download.audioPath);
        })(),
        90_000,
        'Transcription timed out'
      ),
      withTimeout(
        (async () => {
          await addProgress(job.id, 'running_ocr', 'Reading on-screen text...');
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
    await addProgress(job.id, 'structuring', 'Organising your recipe with AI...');

    const structured = await withTimeout(
      structureRecipe({
        caption: caption?.captionText ?? '',
        subtitle: caption?.subtitleText ?? '',
        transcript: transcript?.transcript ?? '',
        ocrText: ocr?.mergedText ?? '',
        videoTitle: download.metadata.title,
        videoDescription: download.metadata.description,
      }),
      60_000,
      'AI structuring timed out'
    );

    const baseRecipe = toRecipeRecord(structured, resolvedUrl, platform);

    // Persist the keyframe thumbnail so it survives temp-dir cleanup
    const thumbnailUrl = download.thumbnailPath
      ? await persistThumbnail(download.thumbnailPath, baseRecipe.id)
      : null;

    const recipe = { ...baseRecipe, thumbnailUrl };
    await saveRecipeToDb(recipe, job.userId);

    // Fire-and-forget nutrition calculation — doesn't block job completion
    void calculateNutrition({ title: recipe.title, servings: recipe.servings, ingredients: recipe.ingredients })
      .then(async (nutrition) => {
        await db
          .update(recipes)
          .set({
            caloriesPerServing: nutrition.caloriesPerServing,
            proteinGrams: nutrition.proteinGrams,
            carbsGrams: nutrition.carbsGrams,
            fatGrams: nutrition.fatGrams,
            fiberGrams: nutrition.fiberGrams,
            sugarGrams: nutrition.sugarGrams,
            sodiumMg: nutrition.sodiumMg,
            nutritionConfidence: nutrition.confidence,
            updatedAt: new Date(),
          })
          .where(eq(recipes.id, recipe.id));
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

    await updateJob(job.id, { status: 'done', result });
    await addProgress(job.id, 'complete', 'Recipe extracted!');
  } catch (err) {
    const message = (err as Error & { code?: string }).code === 'not_a_recipe'
      ? "This doesn't look like a recipe video. Try sharing a cooking video!"
      : err instanceof Error
      ? err.message
      : 'Extraction failed';

    await updateJob(job.id, { status: 'error', error: message });
    await addProgress(job.id, 'error', message);
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

async function saveRecipeToDb(
  recipe: ReturnType<typeof toRecipeRecord> & { thumbnailUrl?: string | null },
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(recipes).values({
      id: recipe.id,
      userId,
      title: recipe.title,
      description: recipe.description,
      servings: recipe.servings,
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      difficulty: recipe.difficulty,
      cuisine: recipe.cuisine,
      tags: JSON.stringify(recipe.tags),
      notes: recipe.notes,
      sourceUrl: recipe.sourceUrl,
      platform: recipe.platform,
      confidence: recipe.confidence,
      thumbnailUrl: recipe.thumbnailUrl ?? null,
    });

    if (recipe.ingredients.length > 0) {
      await tx.insert(ingredients).values(
        recipe.ingredients.map((ing) => ({
          id: ing.id,
          recipeId: recipe.id,
          item: ing.item,
          quantity: ing.quantity,
          category: ing.category,
          isOptional: ing.isOptional,
          sortOrder: ing.sortOrder,
        })),
      );
    }

    if (recipe.steps.length > 0) {
      await tx.insert(steps).values(
        recipe.steps.map((s) => ({
          recipeId: recipe.id,
          stepNumber: s.stepNumber,
          instruction: s.instruction,
          duration: s.duration,
          tip: s.tip,
        })),
      );
    }
  });
}
