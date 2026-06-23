import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { runExtractionJob } from '../queue/extractWorker';

export const workerRouter = Router();

const BodySchema = z.object({ jobId: z.string().uuid() });

// Google's public keys for verifying Cloud Tasks OIDC tokens.
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/**
 * Restrict the worker endpoint to the Cloud Tasks invoker service account.
 * Cloud Run IAM is the primary control (the worker service is deployed
 * no-allow-unauthenticated); this verifies the OIDC token as defence in depth.
 * Skipped when WORKER_INVOKER_SA is unset (local dev / inline dispatch).
 */
const requireCloudTasksCaller: RequestHandler = (req, res, next) => {
  const expectedSa = process.env.WORKER_INVOKER_SA;
  if (!expectedSa) {
    next();
    return;
  }

  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const audience = process.env.WORKER_URL;
  jwtVerify(token, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    ...(audience ? { audience } : {}),
  })
    .then(({ payload }) => {
      if (payload.email !== expectedSa || payload.email_verified !== true) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      next();
    })
    .catch(() => res.status(401).json({ error: 'Unauthorized' }));
};

/**
 * POST /worker/extract — invoked by Cloud Tasks with { jobId }.
 * Runs the full pipeline synchronously so Cloud Run keeps CPU allocated for the
 * job. Returns 200 once the job reaches a terminal state (success or a captured
 * extraction error); returns 500 only on unexpected infra failure so Cloud
 * Tasks retries.
 */
workerRouter.post('/extract', requireCloudTasksCaller, (req, res, next) => {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  runExtractionJob(parsed.data.jobId)
    .then(() => res.status(200).json({ ok: true }))
    .catch(next);
});
