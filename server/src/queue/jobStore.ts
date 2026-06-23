import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { extractionJobs, type DbExtractionJob } from '../db/schema.pg';
import type { ExtractionResult } from '../routes/extract';

export type JobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface JobProgress {
  stage: string;
  message: string;
  ts: number;
}

export interface Job {
  id: string;
  url: string;
  userId: string;
  status: JobStatus;
  progress: JobProgress[];
  result?: ExtractionResult;
  error?: string;
  createdAt: number;
}

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_JOBS ?? '2', 10);
let activeJobs = 0;
const waitQueue: Array<() => void> = [];

function rowToJob(row: DbExtractionJob): Job {
  return {
    id: row.id,
    url: row.url,
    userId: row.userId,
    status: row.status as JobStatus,
    progress: row.progress ?? [],
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt.getTime(),
  };
}

/** Create a new queued job and persist it. */
export async function createJob(url: string, userId: string): Promise<Job> {
  const [row] = await db
    .insert(extractionJobs)
    .values({ url, userId, status: 'queued', progress: [] })
    .returning();
  return rowToJob(row);
}

export async function getJob(id: string): Promise<Job | undefined> {
  const [row] = await db.select().from(extractionJobs).where(eq(extractionJobs.id, id)).limit(1);
  return row ? rowToJob(row) : undefined;
}

export async function updateJob(
  id: string,
  partial: Partial<Pick<Job, 'status' | 'result' | 'error'>>,
): Promise<void> {
  await db
    .update(extractionJobs)
    .set({
      ...(partial.status !== undefined ? { status: partial.status } : {}),
      ...(partial.result !== undefined ? { result: partial.result } : {}),
      ...(partial.error !== undefined ? { error: partial.error } : {}),
      updatedAt: new Date(),
    })
    .where(eq(extractionJobs.id, id));
}

/** Append a progress event atomically (jsonb concat — safe for the single worker). */
export async function addProgress(id: string, stage: string, message: string): Promise<void> {
  const event: JobProgress = { stage, message, ts: Date.now() };
  await db
    .update(extractionJobs)
    .set({
      progress: sql`${extractionJobs.progress} || ${JSON.stringify([event])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(extractionJobs.id, id));
}

/**
 * Acquire a concurrency slot. Resolves immediately if a slot is free,
 * otherwise waits until one becomes available. Per-instance — caps heavy
 * yt-dlp/ffmpeg work on a single Cloud Run node; Cloud Tasks rate limits
 * govern fleet-wide concurrency.
 */
export function acquireSlot(): Promise<void> {
  if (activeJobs < MAX_CONCURRENT) {
    activeJobs++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(resolve);
  });
}

/** Release a concurrency slot and wake the next waiter if any. */
export function releaseSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    next(); // pass slot directly to the next waiter
  } else {
    activeJobs--;
  }
}
