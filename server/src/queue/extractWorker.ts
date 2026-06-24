import { resolveUrl } from '../services/platformResolver';
import { downloadVideo, cleanupDownload, type DownloadResult } from '../services/videoDownloader';
import { fetchMetadataAndCaptions } from '../services/metadataFetcher';
import { transcribeAudio } from '../services/transcriber';
import { runOcrOnVideo } from '../services/ocrService';
import { extractRecipeFromVideo } from '../services/visualExtractor';
import { structureRecipe, toRecipeRecord, type RecipeOutput } from '../services/recipeStructurer';
import { calculateNutrition } from '../services/nutritionCalculator';
import { tagRecipe } from '../services/autoTagger';
import { persistThumbnail, persistThumbnailFromUrl } from '../services/thumbnailStore';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { recipes, ingredients, steps } from '../db/schema.pg';
import { getJob, updateJob, addProgress, acquireSlot, releaseSlot } from './jobStore';
import type { ExtractionResult } from '../routes/extract';

/**
 * Caption-first extraction pipeline.
 *
 * Stage 1: fetch metadata + captions without downloading the video and try to
 * structure a recipe from that text alone. Instagram/TikTok usually carry the
 * full recipe in the caption, so this is the cheap, reliable, bot-block-free
 * path for the common case.
 *
 * Stage 2 (fallback): only when captions are missing or insufficient do we
 * download the video and run Whisper + OCR, then structure on every source.
 */
export async function runExtractionJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return; // job expired or never existed

  await acquireSlot();
  await updateJob(job.id, { status: 'processing' });

  let tempDir: string | null = null;
  const startMs = Date.now();

  try {
    // Stage 1a: resolve URL
    await addProgress(job.id, 'resolving', 'Resolving video URL...');
    const { platform, resolvedUrl } = await withTimeout(
      resolveUrl(job.url),
      15_000,
      'URL resolution timed out'
    );

    if (platform === 'unknown') {
      throw Object.assign(new Error('Unsupported platform. Please use Instagram, TikTok, or YouTube.'), { code: 'unsupported_platform' });
    }

    // Stage 1b: metadata + captions, no video bytes
    await addProgress(job.id, 'reading_captions', 'Reading captions...');
    const meta = await withTimeout(
      fetchMetadataAndCaptions(resolvedUrl),
      30_000,
      'Metadata fetch timed out'
    ).catch((e: unknown) => {
      console.warn('[worker] metadata/caption fetch failed:', e);
      return null;
    });

    let structured: RecipeOutput | null = null;
    let download: DownloadResult | null = null;
    const sourcesUsed: string[] = [];

    // Stage 1c: caption-first structuring when the text looks recipe-like
    if (meta && hasRecipeSignal(`${meta.title}\n${meta.description}\n${meta.subtitleText}`)) {
      await addProgress(job.id, 'structuring', 'Organising your recipe with AI...');
      try {
        const r = await withTimeout(
          structureRecipe({
            caption: meta.description,
            subtitle: meta.subtitleText,
            transcript: '',
            ocrText: '',
            videoTitle: meta.title,
            videoDescription: meta.description,
          }),
          60_000,
          'AI structuring timed out'
        );
        if (isStrongRecipe(r)) {
          structured = r;
          sourcesUsed.push('captions');
        }
      } catch (e: unknown) {
        // not_a_recipe or a transient failure here is NOT terminal — captions
        // alone may be sparse on a real recipe video. Fall back to Stage 2.
        console.warn('[worker] caption-first insufficient, falling back to full pipeline:', e);
      }
    }

    // Stage 2 (fallback): download + transcribe + OCR, then structure on everything
    if (!structured) {
      await addProgress(job.id, 'downloading', 'Downloading video...');
      const dl = await withTimeout(downloadVideo(resolvedUrl), 90_000, 'Video download timed out');
      download = dl;
      tempDir = dl.tempDir;

      await addProgress(job.id, 'extracting_audio', 'Extracting audio and reading the video...');
      const [transcriptResult, ocrResult] = await Promise.allSettled([
        withTimeout(
          (async () => {
            await addProgress(job.id, 'transcribing', 'Transcribing voiceover...');
            return transcribeAudio(dl.audioPath);
          })(),
          90_000,
          'Transcription timed out'
        ),
        withTimeout(
          (async () => {
            await addProgress(job.id, 'running_ocr', 'Reading on-screen text...');
            return runOcrOnVideo(dl.videoPath);
          })(),
          60_000,
          'OCR timed out'
        ),
      ]);

      const transcript = transcriptResult.status === 'fulfilled' ? transcriptResult.value : null;
      const ocr = ocrResult.status === 'fulfilled' ? ocrResult.value : null;
      if (transcriptResult.status === 'rejected') console.warn('[worker] Transcription failed:', transcriptResult.reason);
      if (ocrResult.status === 'rejected') console.warn('[worker] OCR failed:', ocrResult.reason);

      const textSources = {
        caption: meta?.subtitleText ?? '',
        subtitle: meta?.subtitleText ?? '',
        transcript: transcript?.transcript ?? '',
        ocrText: ocr?.mergedText ?? '',
        videoTitle: meta?.title ?? dl.metadata.title,
        videoDescription: meta?.description ?? dl.metadata.description,
      };
      const textLen = (
        textSources.transcript + textSources.ocrText + textSources.subtitle + textSources.videoDescription
      ).replace(/\s+/g, '').length;

      await addProgress(job.id, 'structuring', 'Organising your recipe with AI...');
      if (textLen >= 40) {
        try {
          structured = await withTimeout(structureRecipe(textSources), 60_000, 'AI structuring timed out');
          if (meta?.subtitleText) sourcesUsed.push('captions');
          if (transcript?.transcript) sourcesUsed.push('transcript');
          if (ocr?.mergedText) sourcesUsed.push('ocr');
        } catch (e: unknown) {
          // A real failure (e.g. Vertex down) is terminal; only "not a recipe"
          // from the text gets a second look from the frames themselves.
          if ((e as Error & { code?: string }).code !== 'not_a_recipe') throw e;
          structured = await runVisualFallback(dl.videoPath, job.id);
          if (!structured) throw e;
          sourcesUsed.push('vision');
        }
      } else {
        // No usable caption / narration / on-screen text: understand the frames.
        structured = await runVisualFallback(dl.videoPath, job.id);
        if (!structured) {
          throw Object.assign(
            new Error("This doesn't look like a recipe video. Try sharing a cooking video!"),
            { code: 'not_a_recipe' },
          );
        }
        sourcesUsed.push('vision');
      }
    }

    const baseRecipe = toRecipeRecord(structured, resolvedUrl, platform);

    // Thumbnail: a downloaded keyframe (Stage 2) is preferred; otherwise persist
    // the platform thumbnail URL from metadata (caption-first path).
    let thumbnailUrl: string | null = null;
    if (download?.thumbnailPath) {
      thumbnailUrl = await persistThumbnail(download.thumbnailPath, baseRecipe.id);
    }
    if (!thumbnailUrl && meta?.thumbnailUrl) {
      thumbnailUrl = await persistThumbnailFromUrl(meta.thumbnailUrl, baseRecipe.id);
    }

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
        sourcesUsed,
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

/**
 * Cheap pre-filter: does this text look like it might contain a recipe? Gates the
 * caption-first AI call so we don't spend a model call on an empty/irrelevant
 * caption (e.g. a YouTube title only). Requires some length plus a couple of
 * measurement and cooking-verb signals.
 */
function hasRecipeSignal(text: string): boolean {
  if (text.trim().length < 120) return false;
  const t = text.toLowerCase();
  const unitHits = (t.match(/\b(cups?|tbsp|tsp|tablespoons?|teaspoons?|grams?|kg|ml|oz|ounces?|pounds?|lbs?|cloves?|pinch|slices?|handful)\b/g) ?? []).length;
  const verbHits = (t.match(/\b(mix|stir|add|bake|fry|boil|simmer|chop|saut[ée]|whisk|blend|grill|roast|knead|marinate|season|preheat|cook|combine|pour|heat|drizzle|garnish)\b/g) ?? []).length;
  return unitHits >= 2 && verbHits >= 2;
}

/**
 * Is a caption-first result strong enough to skip the full pipeline? Requires a
 * real recipe with enough substance and non-low confidence; otherwise we fall
 * back to download + transcription + OCR for a richer extraction.
 */
function isStrongRecipe(r: RecipeOutput): boolean {
  return r.isRecipe && r.ingredients.length >= 3 && r.steps.length >= 2 && r.confidence !== 'low';
}

/**
 * Last-resort visual understanding: have the model watch the downloaded video's
 * frames. Non-fatal — returns null on failure so the caller decides terminality.
 */
async function runVisualFallback(videoPath: string, jobId: string): Promise<RecipeOutput | null> {
  await addProgress(jobId, 'analyzing_video', 'Watching the video to read the recipe...');
  return withTimeout(extractRecipeFromVideo(videoPath), 90_000, 'Visual analysis timed out').catch(
    (err: unknown) => {
      console.warn('[worker] visual extraction failed:', err);
      return null;
    },
  );
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
