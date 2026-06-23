import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// These SDK versions bundle node-fetch, which drops long-running response
// connections on Cloud Run egress (ERR_STREAM_PREMATURE_CLOSE at the response
// body / gunzip stream) — both compressed JSON and SSE. Node's native fetch
// (undici) does not have this problem. Route every AI client through it.
//
// undici (native fetch) requires `duplex: 'half'` when the request body is a
// stream — e.g. the OpenAI Whisper multipart upload. node-fetch never needed it.
// Add it only for non-string bodies so the Anthropic JSON path is untouched.
const nativeFetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  if (init?.body != null && typeof init.body !== 'string' && !('duplex' in init)) {
    init = { ...init, duplex: 'half' } as RequestInit;
  }
  return globalThis.fetch(input, init);
}) as typeof globalThis.fetch;

export function anthropicClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 3,
    // node-fetch vs undici Fetch typings differ; the call shape is compatible.
    fetch: nativeFetch as unknown as Anthropic['fetch'],
  });
}

export function openaiClient(opts: ConstructorParameters<typeof OpenAI>[0] = {}): OpenAI {
  return new OpenAI({
    maxRetries: 3,
    fetch: nativeFetch as unknown as OpenAI['fetch'],
    ...opts,
  });
}
