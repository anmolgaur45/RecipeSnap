import { v4 as uuid } from 'uuid';
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
  status: JobStatus;
  progress: JobProgress[];
  result?: ExtractionResult;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, Job>();

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_JOBS ?? '2', 10);
let activeJobs = 0;
const waitQueue: Array<() => void> = [];

/** Create a new queued job and register it in the store. */
export function createJob(url: string): Job {
  const job: Job = {
    id: uuid(),
    url,
    status: 'queued',
    progress: [],
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, partial: Partial<Job>): void {
  const job = jobs.get(id);
  if (job) Object.assign(job, partial);
}

/** Append a progress event to a job's log. */
export function addProgress(id: string, stage: string, message: string): void {
  const job = jobs.get(id);
  if (job) job.progress.push({ stage, message, ts: Date.now() });
}

/**
 * Acquire a concurrency slot. Resolves immediately if a slot is free,
 * otherwise waits until one becomes available.
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

// Clean up jobs older than 1 hour to prevent memory leaks.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000).unref(); // .unref() so this timer doesn't keep the process alive
