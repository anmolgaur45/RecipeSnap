# syntax=docker/dockerfile:1

# ---- builder: install all deps and compile typescript ----
FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
RUN npm run build

# ---- runtime: slim image with media tooling and prod deps only ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production

# yt-dlp_linux is the standalone PyInstaller build (bundles its own python, so
# the runtime needs no system python) + ffmpeg for media work
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      curl \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV YTDLP_PATH=/usr/local/bin/yt-dlp \
    FFMPEG_PATH=/usr/bin/ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

# run as an unprivileged user
RUN useradd --uid 10001 --create-home appuser && chown -R appuser /app
USER appuser

# Cloud Run injects PORT (default 8080); compose maps it explicitly
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

CMD ["node", "dist/index.js"]
