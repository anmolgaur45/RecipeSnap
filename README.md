# RecipeSnap

Extract structured recipes from Instagram Reels, TikTok videos, and YouTube Shorts — directly into your phone.

Paste or share a video URL → the app downloads the video, transcribes the audio, runs OCR on frames, and uses AI to structure everything into a clean, searchable recipe with ingredients, steps, nutritional info, and smart ingredient substitutions.

---

## Features

- **Video-to-recipe extraction** — Instagram Reels, TikTok, YouTube Shorts
- **Multi-source AI pipeline** — audio transcription (Whisper) + frame OCR (Claude Vision) + captions, all merged for the best result
- **Serving size scaler** — real-time scaling with smart fraction rounding
- **AI recipe adaptation** — one-tap conversion to vegan, vegetarian, gluten-free, dairy-free, keto, halal, or nut-free
- **Nutritional breakdown** — USDA FoodData Central database with SQLite caching (no AI cost per lookup)
- **Ingredient substitution** — recipe-aware swap suggestions with flavor/texture impact notes
- **Grocery list builder** — add recipes to a shopping list, subtract pantry items
- **Library** — searchable, filterable saved recipe collection
- **Share intent** — share a video directly from Instagram/TikTok to RecipeSnap (requires native build)
- **Offline-first** — Zustand + AsyncStorage persistence, syncs from server on mount

---

## Architecture

```
RecipeSnap/
├── src/          ← Expo (React Native) frontend
└── server/       ← Express API backend
```

### Frontend (`src/`)

- **Expo SDK 54** + Expo Router (file-based routing)
- **NativeWind** (Tailwind CSS for React Native)
- **Zustand** + AsyncStorage for state persistence
- **Screens:** Home, Add, Library, Recipe Detail

### Backend (`server/`)

- **Express** + TypeScript
- **better-sqlite3** for persistence
- **Job queue** — `POST /api/extract` returns a `jobId` immediately; client polls `GET /api/extract/jobs/:id` every 2s
- **Extraction pipeline:** URL resolution → video download + captions (parallel) → Whisper transcription + Claude Vision OCR → AI recipe structuring → SQLite

---

## Getting started

### Prerequisites

- Node.js 18+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) on your PATH (or set `YTDLP_PATH`)
- Anthropic API key (required)
- OpenAI API key (optional — for Whisper transcription)
- USDA FoodData Central API key (optional — free at [api.data.gov](https://api.data.gov))

### 1. Install dependencies

```bash
# Frontend
npm install

# Backend
cd server && npm install
```

### 2. Configure environment variables

```bash
# Frontend (.env in project root)
cp .env.example .env

# Backend
cp server/.env.example server/.env
# Edit server/.env and add your ANTHROPIC_API_KEY
```

### 3. Run

```bash
# Terminal 1 — backend
cd server
npx tsx watch src/index.ts

# Terminal 2 — frontend
npx expo start
```

Scan the QR code with Expo Go (iOS/Android) or press `a` for Android emulator.

---

## Production (Docker)

```bash
docker-compose up --build
```

The API runs on port 3001. Point `EXPO_PUBLIC_API_URL` at your server.

---

## API reference

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/extract` | Enqueue extraction job → `{ jobId }` |
| `GET` | `/api/extract/jobs/:id` | Poll job status/progress/result |
| `GET` | `/api/recipes` | List all saved recipes |
| `GET` | `/api/recipes/:id` | Get a single recipe |
| `DELETE` | `/api/recipes/:id` | Delete a recipe |
| `POST` | `/api/recipes/:id/scale` | Scale ingredients (ephemeral) |
| `PATCH` | `/api/recipes/:id/servings` | Permanently update serving size |
| `POST` | `/api/recipes/:id/nutrition` | Calculate/recalculate nutrition |
| `POST` | `/api/recipes/:id/adapt` | AI-adapt recipe (vegan, keto, etc.) |
| `POST` | `/api/recipes/:id/substitute` | Suggest ingredient substitutions |
| `GET` | `/health` | Health check |

---

## Environment variables

See [`server/.env.example`](server/.env.example) for all backend variables.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key (OCR + structuring + substitution) |
| `OPENAI_API_KEY` | No | — | OpenAI key for Whisper transcription |
| `USDA_API_KEY` | No | `DEMO_KEY` | USDA FoodData Central (free at api.data.gov) |
| `YTDLP_PATH` | No | `yt-dlp` | Path to yt-dlp binary |
| `PORT` | No | `3001` | Server port |
| `DB_PATH` | No | `./data/recipesnap.db` | SQLite database path |
| `MAX_CONCURRENT_JOBS` | No | `2` | Extraction concurrency limit |

---

## License

MIT
