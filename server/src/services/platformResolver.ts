import fetch from 'node-fetch';

export type Platform = 'instagram_reel' | 'tiktok' | 'youtube_short' | 'unknown';

export interface ResolvedUrl {
  platform: Platform;
  resolvedUrl: string;
  videoId: string | null;
}

const SHORT_URL_HOSTS = new Set([
  'vm.tiktok.com',
  'vt.tiktok.com',
  'youtu.be',
  'yt.be',
  'instagram.com', // IG sometimes uses short links internally
]);

/**
 * Expands a potentially shortened URL by following redirects.
 */
async function expandUrl(url: string): Promise<string> {
  try {
    const parsed = new URL(url);
    if (!SHORT_URL_HOSTS.has(parsed.hostname)) return url;

    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    return response.url || url;
  } catch {
    return url;
  }
}

function detectPlatform(url: string): Platform {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname.includes('instagram.com')) return 'instagram_reel';
    if (hostname.includes('tiktok.com')) return 'tiktok';
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      // Distinguish YouTube Shorts from regular videos
      if (pathname.includes('/shorts/') || pathname.includes('/short/')) return 'youtube_short';
      return 'youtube_short'; // Treat all YT videos the same for extraction
    }
  } catch {
    // Invalid URL
  }
  return 'unknown';
}

function extractVideoId(url: string, platform: Platform): string | null {
  try {
    const { hostname, pathname, searchParams } = new URL(url);
    switch (platform) {
      case 'youtube_short': {
        if (hostname === 'youtu.be') return pathname.slice(1);
        const shortsMatch = pathname.match(/\/shorts\/([A-Za-z0-9_-]+)/);
        if (shortsMatch) return shortsMatch[1];
        return searchParams.get('v');
      }
      case 'tiktok': {
        const match = pathname.match(/\/video\/(\d+)/);
        return match?.[1] ?? null;
      }
      case 'instagram_reel': {
        const match = pathname.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/);
        return match?.[2] ?? null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function resolveUrl(rawUrl: string): Promise<ResolvedUrl> {
  const resolvedUrl = await expandUrl(rawUrl);
  const platform = detectPlatform(resolvedUrl);
  const videoId = extractVideoId(resolvedUrl, platform);

  return { platform, resolvedUrl, videoId };
}
