import { AsyncLocalStorage } from 'node:async_hooks';

// Per-extraction cost metering. AI calls happen deep in the pipeline
// (generateStructured, OCR, Whisper); rather than thread usage through every
// signature, we collect it via an AsyncLocalStorage context that the worker
// opens for the duration of a job. recordUsage() is a no-op outside a context,
// so non-job callers (e.g. the adapt route) are unaffected.

export interface UsageEvent {
  provider: 'gemini' | 'claude' | 'whisper';
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
}

interface UsageContext {
  events: UsageEvent[];
}

const storage = new AsyncLocalStorage<UsageContext>();

/** Runs fn with a usage-collection context active; returns its result + events. */
export async function withUsageTracking<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; events: UsageEvent[] }> {
  const ctx: UsageContext = { events: [] };
  const result = await storage.run(ctx, fn);
  return { result, events: ctx.events };
}

/** Records a model-usage event into the active context (no-op outside one). */
export function recordUsage(event: UsageEvent): void {
  storage.getStore()?.events.push(event);
}

// Per-token / per-second prices (USD) for cost ESTIMATES — visibility and quota
// math, not billing. Defaults track gemini 3.5 flash + claude haiku 4.5 + whisper.
const PRICE = {
  gemini: { input: 0.5 / 1_000_000, output: 3 / 1_000_000 },
  claude: { input: 1 / 1_000_000, output: 5 / 1_000_000 },
  whisperPerSecond: 0.006 / 60,
};

export interface UsageTotals {
  geminiInputTokens: number;
  geminiOutputTokens: number;
  claudeInputTokens: number;
  claudeOutputTokens: number;
  whisperSeconds: number;
  estimatedCostUsd: number;
}

export function summarizeUsage(events: UsageEvent[]): UsageTotals {
  const t: UsageTotals = {
    geminiInputTokens: 0,
    geminiOutputTokens: 0,
    claudeInputTokens: 0,
    claudeOutputTokens: 0,
    whisperSeconds: 0,
    estimatedCostUsd: 0,
  };

  for (const e of events) {
    if (e.provider === 'gemini') {
      t.geminiInputTokens += e.inputTokens ?? 0;
      t.geminiOutputTokens += e.outputTokens ?? 0;
    } else if (e.provider === 'claude') {
      t.claudeInputTokens += e.inputTokens ?? 0;
      t.claudeOutputTokens += e.outputTokens ?? 0;
    } else {
      t.whisperSeconds += e.audioSeconds ?? 0;
    }
  }

  t.estimatedCostUsd =
    t.geminiInputTokens * PRICE.gemini.input +
    t.geminiOutputTokens * PRICE.gemini.output +
    t.claudeInputTokens * PRICE.claude.input +
    t.claudeOutputTokens * PRICE.claude.output +
    t.whisperSeconds * PRICE.whisperPerSecond;

  return t;
}
