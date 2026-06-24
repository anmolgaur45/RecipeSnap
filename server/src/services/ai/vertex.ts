import { GoogleGenAI } from '@google/genai';

// Vertex AI client (Application Default Credentials). On Cloud Run the runtime
// service account supplies credentials automatically; locally it uses
// `gcloud auth application-default login`. We target the `global` endpoint so a
// model's availability does not depend on the Cloud Run region (asia-south1).
let client: GoogleGenAI | null = null;

export function getVertexAI(): GoogleGenAI {
  if (client) return client;

  const project = process.env.GCP_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) {
    throw new Error(
      'Vertex AI needs GCP_PROJECT (or GOOGLE_CLOUD_PROJECT) set, plus ADC credentials.',
    );
  }

  client = new GoogleGenAI({
    vertexai: true,
    project,
    location: process.env.VERTEX_LOCATION ?? 'global',
  });
  return client;
}
