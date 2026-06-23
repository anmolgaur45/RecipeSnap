# RecipeSnap

Extract structured recipes from short cooking videos.

Paste or share an Instagram Reel, TikTok, or YouTube Short. RecipeSnap downloads the video, transcribes the audio, runs OCR on key frames, and uses AI to produce a recipe with ingredients, steps, timings, and nutrition. Data is stored on device and synced with the server on launch.

---

## Features

### Extraction pipeline
- Multi-source fusion: audio transcription (Whisper), frame OCR (Claude vision), and native captions are merged into a single result.
- Async job queue: extraction runs in the background; the app polls for progress and animates each stage.
- Supported platforms: Instagram Reels, TikTok, YouTube Shorts.
- Share intent: share a video from Instagram or TikTok directly to RecipeSnap without copy-paste (requires a native build).

### Recipe management
- Library: full-text search across titles, descriptions, and ingredients; filter by difficulty, cuisine, diet, and cooking method.
- Collections: group recipes into named folders and filter the library by collection.
- Tags: recipes are auto-tagged on extraction (cuisine, diet, method, time category); tags drive the filter chips.

### Cooking tools
- Serving scaler: rescale every ingredient with fraction rounding (1/3 or 1/2 cup rather than 0.333).
- Recipe adaptation: convert to vegan, vegetarian, gluten-free, dairy-free, keto, halal, or nut-free; shows changed ingredients with reasons.
- Ingredient substitution: recipe-aware swaps with flavor impact, texture notes, and confidence scores.
- Nutrition: USDA FoodData Central lookup with SQLite caching; AI estimation fallback for ingredients not in the database.

### Lists and shopping
- Grocery list builder: select recipes and generate a consolidated list with merged quantities and converted units; pantry items are subtracted automatically.
- Aisle grouping: items sorted by supermarket section (produce, dairy, meat, and so on).
- Share: export a grocery list as formatted text.

### App
- Offline-first: Zustand and AsyncStorage persist the library locally; the app syncs with the server on mount.
- Skeleton loading states on every list.

---

## Architecture

```
RecipeSnap/
├── src/          Expo (React Native) frontend
├── server/       Express API backend
├── app.json      Expo config (intent filters, deep link scheme)
└── docker-compose.yml
```

### Frontend (`src/`)

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54 + Expo Router (file-based) |
| Styling | NativeWind (Tailwind CSS for React Native) |
| State | Zustand + AsyncStorage persistence |
| Navigation | Tabs: Home, Plan, Grocery, Library |

**Screens:** Home (recent recipes), Add (URL input + live progress), Library (search/filter/collections + pantry), Recipe Detail (full recipe + tools), Plan (weekly meal plan), Grocery (shopping list), Cook Mode, Recommendations.

### Backend (`server/`)

| Layer | Technology |
|-------|-----------|
| Server | Express + TypeScript |
| Database | better-sqlite3 (WAL mode) |
| Job queue | In-memory map with concurrency gate + TTL cleanup |
| AI | Anthropic Claude (structuring, OCR, adaptation, substitution, tagging) |
| Transcription | OpenAI Whisper (optional) |
| Nutrition | USDA FoodData Central API + SQLite cache |
| Video | yt-dlp + ffmpeg |

**Extraction pipeline:**
```
URL → platform detection → video download + caption fetch (parallel)
    → audio transcription + frame OCR (parallel)
    → AI recipe structuring (Claude primary, Gemini fallback)
    → SQLite save → auto-tag + nutrition calc (background)
```

---

## Getting started

### Prerequisites

- Node.js 18+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed and on your PATH (or set `YTDLP_PATH`)
- Anthropic API key, required for OCR, recipe structuring, and AI features
- OpenAI API key, optional, enables Whisper audio transcription
- USDA FoodData Central API key, optional, free at [api.data.gov](https://api.data.gov); defaults to `DEMO_KEY` (30 req/hr)

### 1. Install dependencies

```bash
# Frontend
npm install

# Backend
cd server && npm install
```

### 2. Configure environment

```bash
# Frontend (.env in project root)
cp .env.example .env
# Set EXPO_PUBLIC_API_URL=http://<your-local-ip>:3001

# Backend
cp server/.env.example server/.env
# Fill in ANTHROPIC_API_KEY at minimum
```

### 3. Run

```bash
# Terminal 1, backend (watch mode)
cd server
npx tsx watch src/index.ts

# Terminal 2, frontend
npx expo start
```

Scan the QR code with Expo Go on your phone, or press `a` for an Android emulator.

> Note: the phone and computer must be on the same Wi-Fi network. Use your machine's LAN IP in `EXPO_PUBLIC_API_URL`, not `localhost`.

### 4. Contributor setup

```bash
bash scripts/setup-git-hooks.sh
```

This activates the versioned git hooks (`core.hooksPath=.githooks`) and pins the commit identity. The hooks block forbidden paths and stray attribution before commit and push; `scripts/check-hygiene.sh` runs the same scan over the tracked tree and also runs in CI.

---

## Production (Docker)

```bash
docker-compose up --build
```

The API starts on port 3001. Set `EXPO_PUBLIC_API_URL` to point at your server, then build the app with EAS.

---

## API reference

### Extraction

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/extract` | Enqueue an extraction job, returns `{ jobId }` |
| `GET` | `/api/extract/jobs/:id` | Poll job status, progress events, and result |

### Recipes

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/recipes` | List all saved recipes |
| `GET` | `/api/recipes/search` | Search + filter (`q`, `cuisine`, `diet`, `difficulty`, `collectionId`, `sort`) |
| `GET` | `/api/recipes/:id` | Get a single recipe |
| `DELETE` | `/api/recipes/:id` | Delete recipe (cascades to ingredients, steps, tags, collections) |
| `POST` | `/api/recipes/:id/scale` | Return scaled ingredient list (ephemeral, no DB write) |
| `PATCH` | `/api/recipes/:id/servings` | Persist a new default serving size |
| `GET` | `/api/recipes/:id/nutrition` | Get stored nutrition info |
| `POST` | `/api/recipes/:id/nutrition` | Calculate or recalculate nutrition |
| `POST` | `/api/recipes/:id/adapt` | AI-adapt recipe (vegan, keto, gluten-free, and so on) |
| `GET` | `/api/recipes/:id/adaptations` | List all adaptations of a recipe |
| `POST` | `/api/recipes/:id/substitute` | Suggest ingredient substitutions |

### Collections and tags

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/collections` | List collections (with recipe count + IDs) |
| `POST` | `/api/collections` | Create a collection |
| `POST` | `/api/collections/:id/recipes` | Add a recipe to a collection |
| `DELETE` | `/api/collections/:id/recipes/:recipeId` | Remove a recipe from a collection |
| `DELETE` | `/api/collections/:id` | Delete a collection |
| `GET` | `/api/tags` | Get all tags grouped by type |

### Grocery

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/grocery-lists` | List grocery lists |
| `POST` | `/api/grocery-lists` | Generate a consolidated list from recipe IDs |
| `GET` | `/api/grocery-lists/:id` | Get list with items grouped by aisle |
| `POST` | `/api/grocery-lists/:id/items` | Add a manual item |
| `PATCH` | `/api/grocery-lists/:id/items/:itemId` | Toggle checked or update item |
| `DELETE` | `/api/grocery-lists/:id/items/:itemId` | Remove an item |
| `PATCH` | `/api/grocery-lists/:id/archive` | Mark list as done |
| `POST` | `/api/grocery-lists/:id/share` | Generate shareable text |
| `DELETE` | `/api/grocery-lists/:id` | Delete a list |

### Other

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/health` | Health check |

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | (none) | Claude API (OCR, structuring, adaptation, tags, substitution) |
| `OPENAI_API_KEY` | No | (none) | Whisper audio transcription |
| `USDA_API_KEY` | No | `DEMO_KEY` | USDA FoodData Central (free at api.data.gov, 1,000 req/hr with registration) |
| `YTDLP_PATH` | No | `yt-dlp` | Full path to yt-dlp binary |
| `PORT` | No | `3001` | API server port |
| `DB_PATH` | No | `./data/recipesnap.db` | SQLite database file location |
| `MAX_CONCURRENT_JOBS` | No | `2` | Max simultaneous extraction jobs |
| `CORS_ORIGIN` | No | `*` | Restrict CORS to a specific origin |

Frontend (`.env` in project root):

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_URL` | Yes | Full URL of the backend, for example `http://192.168.1.10:3001` |

---

## License

MIT
