import { runExtractionJob } from './extractWorker';

/**
 * Hands a queued extraction job to a worker.
 *
 * Prod (Cloud Run): enqueues a Cloud Task that POSTs to the worker service with
 * an OIDC token. Cloud Tasks gives durability, retries, and a dead-letter path,
 * and the worker request keeps CPU allocated for the whole pipeline (a plain
 * fire-and-forget would be throttled once the /api/extract response returns).
 *
 * Dev (no Cloud Tasks env): runs the pipeline inline in the same long-lived
 * process, matching the previous behaviour with zero GCP dependencies.
 */
export async function dispatchExtraction(jobId: string): Promise<void> {
  const queue = process.env.CLOUD_TASKS_QUEUE;
  const workerUrl = process.env.WORKER_URL;
  const invokerSa = process.env.WORKER_INVOKER_SA;

  if (queue && workerUrl && invokerSa) {
    await enqueueCloudTask(jobId, queue, workerUrl, invokerSa);
    return;
  }

  // Dev fallback — process in-band.
  void runExtractionJob(jobId);
}

async function enqueueCloudTask(
  jobId: string,
  queue: string,
  workerUrl: string,
  invokerSa: string,
): Promise<void> {
  // Lazy-load so the GCP client is never required in local dev.
  const { CloudTasksClient } = await import('@google-cloud/tasks');
  const client = new CloudTasksClient();

  const project = process.env.GCP_PROJECT!;
  const location = process.env.GCP_LOCATION ?? 'us-central1';
  const parent = client.queuePath(project, location, queue);
  const url = `${workerUrl.replace(/\/$/, '')}/worker/extract`;

  await client.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
        oidcToken: { serviceAccountEmail: invokerSa, audience: workerUrl },
      },
      dispatchDeadline: { seconds: 1800 }, // long enough for the full fallback pipeline
    },
  });
}
